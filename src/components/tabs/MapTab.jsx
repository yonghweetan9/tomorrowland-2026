import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { supabase } from '../../supabaseClient'
import { FESTIVAL } from '../../lib/festival'
import { initials } from '../../lib/colors'

// Fix Leaflet's default icon paths (not used for our custom markers, but safe).
delete L.Icon.Default.prototype._getIconUrl

const BG_PING_MS = 20 * 60 * 1000 // 20 min background heartbeat
const LIVE_THROTTLE_MS = 20 * 1000 // don't write more than once / 20s while watching

function agoLabel(iso) {
  if (!iso) return 'never'
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min${mins > 1 ? 's' : ''} ago`
  const h = Math.round(mins / 60)
  return `${h} hr${h > 1 ? 's' : ''} ago`
}

function memberIcon(member, isMe) {
  const html = `
    <div class="mk ${isMe ? 'me' : ''}" style="--c:${member.color}">
      <span class="mk-dot"></span>
      <span class="mk-name">${member.display_name}${isMe ? ' (you)' : ''}</span>
    </div>`
  return L.divIcon({ html, className: 'mk-wrap', iconSize: [0, 0], iconAnchor: [0, 0] })
}

export default function MapTab({ me, members, showToast }) {
  const mapRef = useRef(null)
  const mapEl = useRef(null)
  const markers = useRef({}) // member_id -> L.marker
  const [locations, setLocations] = useState([])
  const [sharing, setSharing] = useState(true)
  const sharingRef = useRef(true)
  const lastWrite = useRef(0)
  const watchId = useRef(null)
  const worker = useRef(null)
  const myPosRef = useRef(null)   // latest known own coords
  const didCenter = useRef(false) // have we auto-centered on me yet
  const [perm, setPerm] = useState('unknown')
  const [showCrew, setShowCrew] = useState(false)

  useEffect(() => { sharingRef.current = sharing }, [sharing])

  // init map
  useEffect(() => {
    if (mapRef.current || !mapEl.current) return
    const map = L.map(mapEl.current, { zoomControl: true, attributionControl: true })
      .setView([FESTIVAL.lat, FESTIVAL.lng], 15)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© OpenStreetMap',
    }).addTo(map)
    // festival marker
    L.marker([FESTIVAL.lat, FESTIVAL.lng], {
      icon: L.divIcon({ className: 'fest-wrap', html: `<div class="fest"><span>✦</span><b>De Schorre</b></div>`, iconSize: [0, 0] }),
    }).addTo(map)
    mapRef.current = map
    // ensure Leaflet measures the real container size (dynamic viewport height)
    const fix = () => map.invalidateSize()
    const t = setTimeout(fix, 120)
    window.addEventListener('resize', fix)
    window.addEventListener('orientationchange', fix)
    return () => {
      clearTimeout(t)
      window.removeEventListener('resize', fix)
      window.removeEventListener('orientationchange', fix)
      map.remove(); mapRef.current = null
    }
  }, [])

  // live locations
  useEffect(() => {
    if (!supabase) return
    const load = async () => {
      const { data } = await supabase.from('locations').select('*')
      setLocations(data ?? [])
    }
    load()
    const ch = supabase.channel('loc-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  // render member markers
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const byId = Object.fromEntries(members.map(m => [m.id, m]))
    const present = new Set()
    for (const loc of locations) {
      const m = byId[loc.member_id]
      if (!m) continue
      present.add(loc.member_id)
      const isMe = m.id === me.id
      const pop = `<b>${m.display_name}</b><br/>Last seen ${agoLabel(loc.updated_at)}`
      if (markers.current[loc.member_id]) {
        markers.current[loc.member_id].setLatLng([loc.lat, loc.lng]).setPopupContent(pop)
      } else {
        const mk = L.marker([loc.lat, loc.lng], { icon: memberIcon(m, isMe) }).addTo(map).bindPopup(pop)
        markers.current[loc.member_id] = mk
      }
    }
    // remove stale
    for (const id of Object.keys(markers.current)) {
      if (!present.has(id)) { map.removeLayer(markers.current[id]); delete markers.current[id] }
    }
  }, [locations, members, me])

  // recenter the map on my current location (used on first fix + the button)
  function centerOn(lat, lng, zoom = 16) {
    myPosRef.current = { lat, lng }
    if (mapRef.current) mapRef.current.setView([lat, lng], zoom)
  }
  function recenterMe() {
    if (myPosRef.current) { centerOn(myPosRef.current.lat, myPosRef.current.lng); return }
    if (!('geolocation' in navigator)) { showToast('Location unavailable'); return }
    navigator.geolocation.getCurrentPosition(
      p => centerOn(p.coords.latitude, p.coords.longitude),
      () => showToast('Location unavailable — check permissions'),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 }
    )
  }

  // write my position
  async function pushPosition(pos, force) {
    const { latitude: lat, longitude: lng } = pos.coords
    myPosRef.current = { lat, lng }
    // first time we know where you are, snap the map to you
    if (!didCenter.current && mapRef.current) { mapRef.current.setView([lat, lng], 16); didCenter.current = true }
    if (!supabase || !me || !sharingRef.current) return
    const now = Date.now()
    if (!force && now - lastWrite.current < LIVE_THROTTLE_MS) return
    lastWrite.current = now
    await supabase.from('locations').upsert(
      { member_id: me.id, lat, lng, updated_at: new Date().toISOString() },
      { onConflict: 'member_id' }
    )
  }

  // geolocation watch + background worker heartbeat
  useEffect(() => {
    if (!sharing) {
      if (watchId.current != null) { navigator.geolocation.clearWatch(watchId.current); watchId.current = null }
      worker.current?.postMessage({ type: 'stop' })
      return
    }
    if (!('geolocation' in navigator)) { setPerm('denied'); return }

    const startWatch = () => {
      if (watchId.current != null) return
      watchId.current = navigator.geolocation.watchPosition(
        pos => { setPerm('granted'); pushPosition(pos) },
        err => { if (err.code === 1) setPerm('denied') },
        { enableHighAccuracy: false, maximumAge: 60000, timeout: 30000 }
      )
    }
    const stopWatch = () => {
      if (watchId.current != null) { navigator.geolocation.clearWatch(watchId.current); watchId.current = null }
    }

    // background heartbeat via worker (keeps firing when tab hidden)
    worker.current = new Worker(new URL('../../worker/locationWorker.js', import.meta.url), { type: 'module' })
    worker.current.onmessage = (e) => {
      if (e.data?.type === 'tick') {
        navigator.geolocation.getCurrentPosition(
          p => pushPosition(p, true), () => {}, { enableHighAccuracy: false, maximumAge: 0, timeout: 30000 }
        )
      }
    }
    worker.current.postMessage({ type: 'start', interval: BG_PING_MS })

    const onVis = () => { document.hidden ? stopWatch() : startWatch() }
    document.addEventListener('visibilitychange', onVis)
    if (!document.hidden) startWatch()

    return () => {
      document.removeEventListener('visibilitychange', onVis)
      stopWatch()
      worker.current?.postMessage({ type: 'stop' })
      worker.current?.terminate()
      worker.current = null
    }
  }, [sharing])

  const myLoc = locations.find(l => l.member_id === me.id)

  return (
    <div className="screen fade-in" style={{ paddingBottom: 0 }}>
      <div className="screen-head">
        <div>
          <h1 className="screen-title">Map</h1>
          <p className="screen-sub">{FESTIVAL.venue}</p>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowCrew(true)}>👥 Crew</button>
          <button
            className={'btn btn-sm ' + (sharing ? '' : 'btn-ghost')}
            onClick={() => { setSharing(s => !s); showToast(sharing ? 'Location paused' : 'Sharing location ✦') }}
          >{sharing ? '📍 On' : '⏸ Off'}</button>
        </div>
      </div>

      <div className="map-card">
        <div ref={mapEl} className="map" />
        <button className="recenter-btn" onClick={recenterMe} title="Center on my location" aria-label="Center on my location">◎</button>
      </div>

      <div className="map-foot glass">
        <span className="muted" style={{ fontSize: '.78rem' }}>
          {perm === 'denied'
            ? '⚠ Location blocked — enable it in your browser to appear on the map.'
            : '💡 Keep this tab open for live updates.'}
        </span>
        <span className="muted" style={{ fontSize: '.74rem' }}>
          {myLoc ? `You: ${agoLabel(myLoc.updated_at)}` : sharing ? 'Locating…' : 'Paused'}
        </span>
      </div>

      {showCrew && (
        <ManageCrew me={me} members={members} locations={locations}
          onClose={() => setShowCrew(false)} showToast={showToast} />
      )}

      <style>{`
        .map-card{position:relative;border-radius:var(--radius);overflow:hidden;border:1px solid var(--line);
          box-shadow:0 10px 50px rgba(0,0,0,.5)}
        .recenter-btn{position:absolute;right:12px;bottom:42px;z-index:1001;width:44px;height:44px;border-radius:50%;
          background:rgba(13,8,32,.92);border:1px solid var(--line);color:var(--teal);font-size:1.35rem;line-height:1;
          display:grid;place-items:center;box-shadow:0 4px 18px rgba(0,0,0,.55),var(--glow);backdrop-filter:blur(6px)}
        .recenter-btn:active{transform:scale(.92)}
        .map{height:calc(100dvh - 240px);min-height:300px;background:#0b0a16}
        .leaflet-container{background:#0b0a16}
        .map-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;
          padding:10px 12px;margin-top:10px}
        .mk-wrap,.fest-wrap{background:none;border:none}
        .mk{display:flex;align-items:center;gap:5px;transform:translate(-7px,-7px)}
        .mk-dot{width:15px;height:15px;border-radius:50%;background:var(--c);
          border:2px solid #fff;box-shadow:0 0 0 2px var(--c),0 0 14px var(--c);flex:0 0 auto}
        .mk.me .mk-dot{animation:pulse 1.8s ease-out infinite}
        @keyframes pulse{0%{box-shadow:0 0 0 2px var(--c),0 0 0 0 var(--c)}70%{box-shadow:0 0 0 2px var(--c),0 0 0 12px transparent}100%{box-shadow:0 0 0 2px var(--c),0 0 0 0 transparent}}
        .mk-name{font-size:.68rem;font-weight:700;color:#fff;white-space:nowrap;
          background:rgba(7,4,17,.78);padding:1px 6px;border-radius:6px;border:1px solid var(--line)}
        .fest{display:flex;align-items:center;gap:5px;transform:translate(-50%,-50%);white-space:nowrap}
        .fest span{font-size:1.1rem;color:var(--gold);filter:drop-shadow(0 0 6px var(--gold))}
        .fest b{font-size:.7rem;color:#fff;background:rgba(7,4,17,.8);padding:2px 7px;border-radius:7px;border:1px solid var(--line)}
      `}</style>
    </div>
  )
}

// ── Manage crew: list members, detect & remove duplicate accounts ──
function ManageCrew({ me, members, locations, onClose, showToast }) {
  const [confirm, setConfirm] = useState(null) // member pending manual removal
  const lastSeen = Object.fromEntries(locations.map(l => [l.member_id, l.updated_at]))

  // group by normalized name to detect duplicates
  const norm = s => (s || '').trim().toLowerCase()
  const groups = {}
  for (const m of members) (groups[norm(m.display_name)] ||= []).push(m)
  // members safe to auto-remove as duplicates: in a group of >1, keep the
  // earliest-created (or "me" if present), mark the rest — but never mark me.
  const dupIds = []
  for (const list of Object.values(groups)) {
    if (list.length < 2) continue
    const sorted = [...list].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    const keep = sorted.find(x => x.id === me.id) || sorted[0]
    for (const x of sorted) if (x.id !== keep.id && x.id !== me.id) dupIds.push(x.id)
  }

  async function removeMembers(ids, label) {
    if (!supabase || !ids.length) return
    const { error } = await supabase.from('members').delete().in('id', ids)
    showToast(error ? 'Could not remove' : label)
    setConfirm(null)
  }

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <button className="sheet-x" onClick={onClose} aria-label="Close">✕</button>
        <div className="sheet-grab" />
        <h3 style={{ marginTop: 0 }}>👥 Manage crew</h3>
        <p className="muted" style={{ marginTop: -6, fontSize: '.82rem' }}>{members.length} member{members.length !== 1 ? 's' : ''} joined via the link.</p>

        {dupIds.length > 0 && (
          <div className="dup-banner">
            <span style={{ fontSize: '.84rem' }}>⚠ {dupIds.length} possible duplicate account{dupIds.length !== 1 ? 's' : ''} detected.</span>
            <button className="btn btn-sm btn-gold" onClick={() => removeMembers(dupIds, 'Duplicates removed ✦')}>Remove duplicates</button>
          </div>
        )}

        <div className="crew-list">
          {members.map(m => {
            const isMe = m.id === me.id
            const isDup = dupIds.includes(m.id)
            return (
              <div key={m.id} className={'crew-row' + (isDup ? ' dup' : '')}>
                <div className="row" style={{ gap: 10, minWidth: 0 }}>
                  <span className="avatar" style={{ background: m.color }}>{initials(m.display_name)}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="crew-name">{m.display_name}{isMe && <span className="you-badge">you</span>}{isDup && <span className="dup-badge">duplicate</span>}</div>
                    <div className="muted" style={{ fontSize: '.7rem' }}>{lastSeen[m.id] ? `seen ${agoLabel(lastSeen[m.id])}` : 'no location yet'}</div>
                  </div>
                </div>
                {isMe
                  ? <span className="muted" style={{ fontSize: '.72rem' }}>—</span>
                  : <button className="mini-x" onClick={() => setConfirm(m)} title="Remove">🗑</button>}
              </div>
            )
          })}
        </div>

        {confirm && (
          <div className="confirm-inline">
            <span style={{ fontSize: '.84rem' }}>Remove <b>{confirm.display_name}</b>? This also clears their itinerary additions, location and unpays their expenses.</span>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn btn-ghost btn-sm btn-block" onClick={() => setConfirm(null)}>Cancel</button>
              <button className="btn btn-sm btn-block" style={{ background: 'linear-gradient(120deg,#ff3d6e,#ff7a3d)' }} onClick={() => removeMembers([confirm.id], 'Removed')}>Remove</button>
            </div>
          </div>
        )}

        <style>{`
          .dup-banner{display:flex;align-items:center;justify-content:space-between;gap:10px;
            background:rgba(255,160,60,.12);border:1px solid rgba(255,160,60,.3);border-radius:12px;padding:10px 12px;margin:6px 0 12px}
          .crew-list{display:flex;flex-direction:column;gap:7px}
          .crew-row{display:flex;align-items:center;justify-content:space-between;gap:10px;
            background:rgba(29,23,64,.5);border:1px solid var(--line);border-radius:12px;padding:9px 11px}
          .crew-row.dup{border-color:rgba(255,160,60,.4)}
          .crew-name{font-weight:700;font-size:.9rem;display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
          .you-badge{font-size:.62rem;font-weight:700;color:var(--teal);background:rgba(57,230,208,.14);padding:1px 6px;border-radius:6px;text-transform:uppercase;letter-spacing:.04em}
          .dup-badge{font-size:.62rem;font-weight:700;color:var(--ember);background:rgba(255,122,61,.14);padding:1px 6px;border-radius:6px;text-transform:uppercase;letter-spacing:.04em}
          .mini-x{width:32px;height:32px;border-radius:9px;background:rgba(255,61,110,.14);border:1px solid var(--line);font-size:.82rem;flex:0 0 auto}
          .confirm-inline{margin-top:12px;background:rgba(7,4,17,.5);border:1px solid var(--line);border-radius:12px;padding:12px}
        `}</style>
      </div>
    </div>
  )
}
