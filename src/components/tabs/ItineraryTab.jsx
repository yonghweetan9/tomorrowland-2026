import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../supabaseClient'
import { DAYS, hhmm } from '../../lib/festival'
import { initials } from '../../lib/colors'

const HOUR_PX = 62
const START_HOUR = 12 // festival timeline starts at noon, wraps through the night

// minutes since 12:00 (noon) for an ISO time, wrapping past midnight (0..1440)
function minsFromNoon(iso) {
  const hm = hhmm(iso)
  if (!hm) return null
  const [h, m] = hm.split(':').map(Number)
  return (((h - START_HOUR + 24) % 24) * 60) + m
}

// group identical sets (same artist|stage|day|start|end) → one block w/ many adders
function buildBlocks(items, day) {
  const map = new Map()
  for (const it of items) {
    if (it.day !== day) continue
    const k = `${it.artist_name}|${it.stage_name}|${it.start_time ?? 'TBA'}|${it.end_time ?? ''}`
    if (!map.has(k)) map.set(k, { key: k, artist_name: it.artist_name, stage_name: it.stage_name, start_time: it.start_time, end_time: it.end_time, rows: [] })
    map.get(k).rows.push(it)
  }
  return [...map.values()]
}

// greedy column assignment so overlapping scheduled blocks render side-by-side
function layoutColumns(blocks) {
  const ev = blocks.map(b => {
    const s = minsFromNoon(b.start_time)
    let e = minsFromNoon(b.end_time)
    if (e == null) e = s == null ? null : s + 60
    if (e != null && s != null && e <= s) e += 1440
    return { ...b, s, e }
  }).sort((a, b) => a.s - b.s)
  const cols = [] // last end per column
  for (const x of ev) {
    let placed = false
    for (let i = 0; i < cols.length; i++) {
      if (x.s >= cols[i]) { x.col = i; cols[i] = x.e; placed = true; break }
    }
    if (!placed) { x.col = cols.length; cols.push(x.e) }
  }
  const nCols = Math.max(1, cols.length)
  return { ev, nCols }
}

export default function ItineraryTab({ me, members, showToast }) {
  const [day, setDay] = useState(DAYS[0].date)
  const [items, setItems] = useState([])
  const [lineup, setLineup] = useState([])
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState(null) // block being time-edited
  const [confirmDel, setConfirmDel] = useState(null)
  const memberById = useMemo(() => Object.fromEntries(members.map(m => [m.id, m])), [members])

  // live itinerary
  useEffect(() => {
    if (!supabase) return
    const load = async () => {
      const { data } = await supabase.from('itinerary_items').select('*')
      setItems(data ?? [])
    }
    load()
    const ch = supabase.channel('itin-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'itinerary_items' }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  // lineup for the add-search
  useEffect(() => {
    const load = async () => {
      let data = []
      if (supabase) data = (await supabase.from('lineup').select('*')).data ?? []
      if (!data.length) { try { data = await fetch('/lineup_seed.json').then(r => r.json()) } catch {} }
      setLineup(data)
    }
    load()
  }, [])

  const blocks = useMemo(() => buildBlocks(items, day), [items, day])
  const tray = blocks.filter(b => !b.start_time)
  const scheduled = blocks.filter(b => b.start_time)
  const { ev, nCols } = useMemo(() => layoutColumns(scheduled), [scheduled])

  const searchResults = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return []
    return lineup.filter(l => l.day === day && (l.artist_name.toLowerCase().includes(needle) || l.stage_name.toLowerCase().includes(needle))).slice(0, 8)
  }, [q, lineup, day])

  async function addSet(l) {
    if (!supabase || !me) return
    await supabase.from('itinerary_items').insert({
      day: l.day, artist_name: l.artist_name, stage_name: l.stage_name,
      start_time: l.start_time ?? null, end_time: l.end_time ?? null, added_by: me.id,
    })
    setQ(''); showToast(`Added ${l.artist_name} ✦`)
  }

  async function deleteBlock(block) {
    if (!supabase) return
    const ids = block.rows.map(r => r.id)
    await supabase.from('itinerary_items').delete().in('id', ids)
    setConfirmDel(null); showToast('Removed')
  }

  async function saveTime(block, start, end) {
    if (!supabase) return
    const toIso = t => t ? `${day}T${t}:00+02:00` : null
    const ids = block.rows.map(r => r.id)
    await supabase.from('itinerary_items').update({ start_time: toIso(start), end_time: toIso(end) }).in('id', ids)
    setEditing(null); showToast('Time updated')
  }

  const hours = Array.from({ length: 25 }, (_, i) => (START_HOUR + i) % 24)

  return (
    <div className="screen fade-in">
      <div className="screen-head">
        <div>
          <h1 className="screen-title">Itinerary</h1>
          <p className="screen-sub">Shared · tap a set to add</p>
        </div>
      </div>

      <div className="chips" style={{ marginBottom: 10 }}>
        {DAYS.map(d => (
          <button key={d.date} className={'chip' + (day === d.date ? ' on' : '')} onClick={() => setDay(d.date)}>
            {d.label} {d.date.slice(8)}
          </button>
        ))}
      </div>

      <div className="add-search">
        <input className="field" placeholder="Search a DJ to add…" value={q} onChange={e => setQ(e.target.value)} />
        {!!searchResults.length && (
          <div className="search-pop glass">
            {searchResults.map((l, i) => (
              <button key={i} className="search-item" onClick={() => addSet(l)}>
                <span><b>{l.artist_name}</b><em>{l.stage_name}</em></span>
                <span className="plus">➕</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* TBA tray */}
      <div className="tray">
        <div className="tray-head"><span className="tba">TIME TBA</span><span className="muted">{tray.length} set{tray.length !== 1 ? 's' : ''} · tap ✎ to schedule</span></div>
        {!tray.length && <div className="tray-empty muted">Nothing unscheduled — add sets from the Lineup tab or search above.</div>}
        <div className="tray-list">
          {tray.map(b => (
            <BlockCard key={b.key} block={b} me={me} memberById={memberById}
              onEdit={() => setEditing(b)} onDelete={() => setConfirmDel(b)} compact />
          ))}
        </div>
      </div>

      {/* 24h timeline */}
      <div className="tl-wrap">
        <div className="timeline" style={{ height: 24 * HOUR_PX }}>
          {hours.slice(0, 24).map((h, i) => (
            <div key={i} className="tl-hour" style={{ top: i * HOUR_PX }}>
              <span>{String(h).padStart(2, '0')}:00</span>
            </div>
          ))}
          <div className="tl-events">
            {ev.map(x => {
              const top = (x.s / 60) * HOUR_PX
              const height = Math.max(34, ((x.e - x.s) / 60) * HOUR_PX - 4)
              const w = `calc((100% - 4px) / ${nCols})`
              const left = `calc(${x.col} * (100% - 4px) / ${nCols})`
              return (
                <div key={x.key} className="tl-ev" style={{ top, height, width: w, left }}>
                  <BlockCard block={x} me={me} memberById={memberById}
                    onEdit={() => setEditing(x)} onDelete={() => setConfirmDel(x)} inGrid />
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {editing && <TimeSheet block={editing} onClose={() => setEditing(null)} onSave={saveTime} />}
      {confirmDel && createPortal(
        <div className="sheet-bg" onClick={() => setConfirmDel(null)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-grab" />
            <h3 style={{ marginTop: 0 }}>Remove “{confirmDel.artist_name}”?</h3>
            <p className="muted">This removes it for everyone who added it on this day.</p>
            <div className="row" style={{ marginTop: 14 }}>
              <button className="btn btn-ghost btn-block" onClick={() => setConfirmDel(null)}>Cancel</button>
              <button className="btn btn-block" style={{ background: 'linear-gradient(120deg,#ff3d6e,#ff7a3d)' }} onClick={() => deleteBlock(confirmDel)}>Remove</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <style>{`
        .add-search{position:relative;margin-bottom:14px}
        .search-pop{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:30;padding:6px;display:flex;flex-direction:column;gap:2px}
        .search-item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:11px;background:none;text-align:left}
        .search-item:active{background:rgba(155,92,255,.12)}
        .search-item b{font-size:.92rem}.search-item em{display:block;font-style:normal;font-size:.72rem;color:var(--ink-faint);text-transform:uppercase;letter-spacing:.04em}
        .search-item .plus{color:var(--violet)}
        .tray{margin-bottom:16px}
        .tray-head{display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:.78rem}
        .tray-empty{font-size:.84rem;padding:10px 2px}
        .tray-list{display:flex;flex-direction:column;gap:8px}
        .tl-wrap{position:relative}
        .timeline{position:relative;border-top:1px solid var(--line);margin-top:4px}
        .tl-hour{position:absolute;left:0;right:0;height:${HOUR_PX}px;border-top:1px dashed rgba(176,150,255,.10);padding-left:46px}
        .tl-hour span{position:absolute;left:0;top:-7px;font-size:.66rem;color:var(--ink-faint);font-variant-numeric:tabular-nums;width:42px}
        .tl-events{position:absolute;left:46px;right:0;top:0;bottom:0}
        .tl-ev{position:absolute}
      `}</style>
    </div>
  )
}

function BlockCard({ block, me, memberById, onEdit, onDelete, compact, inGrid }) {
  const adders = block.rows.map(r => memberById[r.added_by]).filter(Boolean)
  const t = hhmm(block.start_time)
  const te = hhmm(block.end_time)
  return (
    <div className={'block-card card' + (inGrid ? ' in-grid' : '')}>
      <div className="bc-top">
        <div className="bc-main">
          <div className="bc-artist">{block.artist_name}</div>
          <div className="bc-stage">{block.stage_name}</div>
        </div>
        <div className="bc-actions">
          <button className="mini" onClick={onEdit} title="Set / edit time">✎</button>
          <button className="mini" onClick={onDelete} title="Remove">🗑</button>
        </div>
      </div>
      <div className="bc-bot">
        {t ? <span className="badge-time">{t}{te ? `–${te}` : ''}</span> : <span className="tba">TBA</span>}
        <div className="avatar-stack">
          {adders.slice(0, 5).map(m => (
            <div key={m.id} className="avatar" style={{ background: m.color }} title={m.display_name}>{initials(m.display_name)}</div>
          ))}
          {adders.length > 5 && <div className="avatar" style={{ background: '#333' }}>+{adders.length - 5}</div>}
        </div>
      </div>
      <style>{`
        .block-card{padding:10px 11px}
        .block-card.in-grid{height:100%;overflow:hidden}
        .bc-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
        .bc-artist{font-weight:700;font-size:.92rem;line-height:1.15}
        .bc-stage{font-size:.7rem;color:var(--ink-faint);text-transform:uppercase;letter-spacing:.04em;margin-top:2px}
        .bc-actions{display:flex;gap:4px;flex:0 0 auto}
        .mini{width:26px;height:26px;border-radius:8px;background:rgba(155,92,255,.12);border:1px solid var(--line);font-size:.74rem;display:grid;place-items:center}
        .bc-bot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px}
      `}</style>
    </div>
  )
}

function TimeSheet({ block, onClose, onSave }) {
  const [start, setStart] = useState(hhmm(block.start_time) ?? '')
  const [end, setEnd] = useState(hhmm(block.end_time) ?? '')
  return createPortal(
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <button className="sheet-x" onClick={onClose} aria-label="Close">✕</button>
        <div className="sheet-grab" />
        <h3 style={{ marginTop: 0 }}>{block.artist_name}</h3>
        <p className="muted" style={{ marginTop: -6 }}>{block.stage_name}</p>
        <label className="lab">Start time</label>
        <input className="field" type="time" value={start} onChange={e => setStart(e.target.value)} />
        <label className="lab" style={{ marginTop: 12 }}>End time</label>
        <input className="field" type="time" value={end} onChange={e => setEnd(e.target.value)} />
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn btn-ghost btn-block" onClick={() => onSave(block, '', '')}>Clear (→ TBA)</button>
          <button className="btn btn-block" onClick={() => onSave(block, start, end)} disabled={!start}>Save</button>
        </div>
      </div>
    </div>,
    document.body
  )
}
