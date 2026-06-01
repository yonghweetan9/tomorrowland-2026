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
  const [perm, setPerm] = useState('unknown')

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
    return () => { map.remove(); mapRef.current = null }
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

  // write my position
  async function pushPosition(pos, force) {
    if (!supabase || !me || !sharingRef.current) return
    const now = Date.now()
    if (!force && now - lastWrite.current < LIVE_THROTTLE_MS) return
    lastWrite.current = now
    const { latitude: lat, longitude: lng } = pos.coords
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
        <button
          className={'btn btn-sm ' + (sharing ? '' : 'btn-ghost')}
          onClick={() => { setSharing(s => !s); showToast(sharing ? 'Location paused' : 'Sharing location ✦') }}
        >{sharing ? '📍 Sharing' : '⏸ Paused'}</button>
      </div>

      <div className="map-card">
        <div ref={mapEl} className="map" />
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

      <style>{`
        .map-card{border-radius:var(--radius);overflow:hidden;border:1px solid var(--line);
          box-shadow:0 10px 50px rgba(0,0,0,.5)}
        .map{height:62vh;min-height:380px;background:#0b0a16}
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
