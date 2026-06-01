import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { DAYS, dayShort, hhmm } from '../../lib/festival'

// Loads lineup from Supabase; if the table isn't seeded yet, falls back to the
// bundled public/lineup_seed.json so the tab is never empty.
function useLineup() {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    let alive = true
    const load = async () => {
      let data = []
      if (supabase) {
        const res = await supabase.from('lineup').select('*')
        data = res.data ?? []
      }
      if (!data.length) {
        try {
          const seed = await fetch('/lineup_seed.json').then(r => r.json())
          data = seed.map((s, i) => ({ id: 'seed-' + i, ...s }))
        } catch {}
      }
      if (alive) setRows(data)
    }
    load()
    if (!supabase) return
    const ch = supabase.channel('lineup-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lineup' }, load)
      .subscribe()
    return () => { alive = false; supabase.removeChannel(ch) }
  }, [])
  return rows
}

export default function LineupTab({ me, onShare, goItinerary, showToast }) {
  const rows = useLineup()
  const [day, setDay] = useState('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('artist') // artist | stage
  const [mine, setMine] = useState(new Set()) // lineup row keys already in itinerary by me

  // Track which sets I've already added (to flip the affordance).
  useEffect(() => {
    if (!supabase || !me) return
    const load = async () => {
      const { data } = await supabase.from('itinerary_items').select('day,artist_name,stage_name').eq('added_by', me.id)
      setMine(new Set((data ?? []).map(d => `${d.day}|${d.artist_name}|${d.stage_name}`)))
    }
    load()
    const ch = supabase.channel('lineup-itin-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'itinerary_items' }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [me])

  const filtered = useMemo(() => {
    if (!rows) return []
    const needle = q.trim().toLowerCase()
    let r = rows.filter(x =>
      (day === 'all' || x.day === day) &&
      (!needle || x.artist_name.toLowerCase().includes(needle) || x.stage_name.toLowerCase().includes(needle))
    )
    r.sort((a, b) => {
      if (sort === 'stage') return a.stage_name.localeCompare(b.stage_name) || a.artist_name.localeCompare(b.artist_name) || a.day.localeCompare(b.day)
      return a.artist_name.localeCompare(b.artist_name) || a.day.localeCompare(b.day)
    })
    return r
  }, [rows, day, q, sort])

  async function addToItinerary(row) {
    if (!supabase || !me) return
    const key = `${row.day}|${row.artist_name}|${row.stage_name}`
    const { error } = await supabase.from('itinerary_items').insert({
      day: row.day, artist_name: row.artist_name, stage_name: row.stage_name,
      start_time: row.start_time ?? null, end_time: row.end_time ?? null, added_by: me.id,
    })
    if (!error) { setMine(prev => new Set(prev).add(key)); showToast(`Added ${row.artist_name} ✦`) }
    else showToast('Could not add')
  }

  return (
    <div className="screen fade-in">
      <div className="screen-head">
        <div>
          <h1 className="screen-title">Lineup</h1>
          <p className="screen-sub">{rows ? `${rows.length} sets · Weekend 2` : 'Loading…'}</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onShare}>🔗 Share</button>
      </div>

      <input className="field" placeholder="Search artist or stage…" value={q} onChange={e => setQ(e.target.value)} />

      <div className="between" style={{ margin: '12px 0' }}>
        <div className="chips">
          <button className={'chip' + (day === 'all' ? ' on' : '')} onClick={() => setDay('all')}>All</button>
          {DAYS.map(d => (
            <button key={d.date} className={'chip' + (day === d.date ? ' on' : '')} onClick={() => setDay(d.date)}>
              {d.label} {d.date.slice(8)}
            </button>
          ))}
        </div>
        <button className="chip" onClick={() => setSort(s => s === 'artist' ? 'stage' : 'artist')}>
          ⇅ {sort === 'artist' ? 'Artist' : 'Stage'}
        </button>
      </div>

      {!rows && <div className="spinner" />}
      {rows && !filtered.length && <div className="empty">No sets match “{q}”.</div>}

      <div className="lineup-list">
        {filtered.map(row => {
          const key = `${row.day}|${row.artist_name}|${row.stage_name}`
          const added = mine.has(key)
          const t = hhmm(row.start_time)
          return (
            <div className="lineup-row card" key={row.id ?? key}>
              <div className="lr-day">{dayShort(row.day)}<span>{row.day.slice(8)}</span></div>
              <div className="lr-main">
                <div className="lr-artist">{row.artist_name}</div>
                <div className="lr-stage">{row.stage_name}</div>
              </div>
              <div className="lr-right">
                {t ? <span className="badge-time">{t}</span> : <span className="tba">TBA</span>}
                <button
                  className={'add-btn' + (added ? ' added' : '')}
                  onClick={() => !added && addToItinerary(row)}
                  title={added ? 'In your itinerary' : 'Add to itinerary'}
                >{added ? '✓' : '➕'}</button>
              </div>
            </div>
          )
        })}
      </div>

      <style>{`
        .lineup-list{display:flex;flex-direction:column;gap:8px;margin-top:4px}
        .lineup-row{display:grid;grid-template-columns:42px 1fr auto;align-items:center;gap:10px;padding:11px 12px}
        .lr-day{display:flex;flex-direction:column;align-items:center;justify-content:center;
          font-family:'Cinzel',serif;font-weight:800;font-size:.82rem;color:var(--violet);line-height:1}
        .lr-day span{font-size:.72rem;color:var(--ink-faint);font-family:'Sora';font-weight:600;margin-top:2px}
        .lr-main{min-width:0}
        .lr-artist{font-weight:700;font-size:.98rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .lr-stage{font-size:.76rem;color:var(--ink-faint);text-transform:uppercase;letter-spacing:.04em;
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
        .lr-right{display:flex;align-items:center;gap:8px}
        .add-btn{width:34px;height:34px;border-radius:11px;background:rgba(155,92,255,.14);
          border:1px solid var(--line);font-size:.95rem;display:grid;place-items:center;transition:.15s}
        .add-btn:active{transform:scale(.9)}
        .add-btn.added{background:var(--grad-btn);border-color:transparent;box-shadow:var(--glow)}
      `}</style>
    </div>
  )
}
