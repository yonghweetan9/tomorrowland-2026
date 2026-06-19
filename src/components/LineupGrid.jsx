import { useMemo, useState } from 'react'
import { DAYS, hhmm } from '../lib/festival'

// Official-style stage order (Mainstage first), matching the festival map flow.
const STAGE_ORDER = [
  'MAINSTAGE', 'FREEDOM BY BUD', 'THE ROSE GARDEN', 'ELIXIR', 'CAGE', 'THE RAVE CAVE',
  'PLANAXIS', 'MELODIA BY CORONA', 'CELESTIA BY KUCOIN', 'ATMOSPHERE', 'CORE',
  'CRYSTAL GARDEN', 'THE GREAT LIBRARY', 'MOOSE BAR', 'HOUSE OF FORTUNE BY JBL',
]
const COLORS = ['#e0457b', '#7b3ff2', '#1f9e8f', '#c0468f', '#e07a3f', '#3f7bf2',
  '#9b4fd0', '#2f9e5f', '#d04f9b', '#5f7bd0', '#e05a5a', '#3f9ed0', '#b07a2f', '#6f9e3f', '#d0457b']

const PPM = 2                              // pixels per minute
const HOURS = [...Array(12).keys()].map(h => h + 12).concat([0, 1]) // 12:00 → 01:00
const TOTAL = 780 * PPM                    // 13h window width
const LABEL_W = 116

// Minutes since 12:00, treating after-midnight (00:00–06:59) as the night's tail.
const toMin = t => {
  const h = +t.slice(0, 2), m = +t.slice(3, 5)
  return ((h < 7 ? h + 24 : h) * 60 + m) - 720
}

export default function LineupGrid({ rows, onClose }) {
  const [day, setDay] = useState(DAYS[0].date)

  const byStage = useMemo(() => {
    const map = {}
    for (const r of rows || []) {
      if (r.day !== day) continue
      const s = hhmm(r.start_time), e = hhmm(r.end_time)
      if (!s || !e) continue
      ;(map[r.stage_name] ||= []).push({ s, e, a: r.artist_name })
    }
    for (const k in map) map[k].sort((x, y) => toMin(x.s) - toMin(y.s))
    return map
  }, [rows, day])

  const stages = STAGE_ORDER.filter(s => byStage[s]?.length)
  const count = stages.reduce((n, s) => n + byStage[s].length, 0)

  return (
    <div className="grid-overlay">
      <div className="grid-bar">
        <div className="grid-titles">
          <span className="grid-title">Grid View</span>
          <span className="grid-count">{count} sets</span>
        </div>
        <div className="grid-days">
          {DAYS.map(d => (
            <button key={d.date} className={'gchip' + (day === d.date ? ' on' : '')} onClick={() => setDay(d.date)}>
              {d.label} {d.date.slice(8)}
            </button>
          ))}
        </div>
        <button className="grid-close" onClick={onClose} aria-label="Close grid view">✕</button>
      </div>

      <div className="grid-scroll">
        <div className="grid-inner" style={{ width: TOTAL + LABEL_W }}>
          <div className="grid-head">
            <div className="grid-corner">Stage</div>
            <div className="grid-ticks" style={{ width: TOTAL }}>
              {HOURS.map((h, i) => (
                <div key={i} className="grid-tick" style={{ left: i * 60 * PPM }}>
                  {String(h).padStart(2, '0')}:00
                </div>
              ))}
            </div>
          </div>

          {stages.map((stg, idx) => {
            const color = COLORS[idx % COLORS.length]
            return (
              <div className="grid-row" key={stg}>
                <div className="grid-stage">{stg}</div>
                <div className="grid-track" style={{ width: TOTAL }}>
                  {HOURS.map((_, i) => <div key={i} className="grid-gl" style={{ left: i * 60 * PPM }} />)}
                  {byStage[stg].map((b, i) => {
                    const left = toMin(b.s) * PPM
                    const width = Math.max((toMin(b.e) - toMin(b.s)) * PPM, 26)
                    return (
                      <div key={i} className="grid-blk" style={{ left, width, background: color }}
                           title={`${b.a} · ${b.s}–${b.e}`}>
                        <span className="gb-name">{b.a}</span>
                        <span className="gb-time">{b.s}–{b.e}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <style>{`
        .grid-overlay{position:fixed;inset:0;z-index:3000;display:flex;flex-direction:column;
          height:100dvh;background:linear-gradient(180deg,var(--bg-1),var(--bg-0));animation:gfade .18s ease}
        @keyframes gfade{from{opacity:0}to{opacity:1}}
        .grid-bar{flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:14px 14px 10px;
          padding-top:calc(14px + env(safe-area-inset-top,0px));border-bottom:1px solid var(--line);
          background:rgba(9,6,20,.7);backdrop-filter:blur(12px)}
        .grid-titles{display:flex;flex-direction:column;line-height:1.1}
        .grid-title{font-family:'Cinzel',serif;font-weight:800;font-size:1rem;
          background:var(--grad-hero);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
        .grid-count{font-size:.7rem;color:var(--ink-faint);font-weight:600;margin-top:2px}
        .grid-days{display:flex;gap:6px;margin-left:auto;flex-wrap:wrap;justify-content:flex-end}
        .gchip{padding:6px 12px;border-radius:999px;font-size:.78rem;font-weight:700;
          background:rgba(155,92,255,.12);border:1px solid var(--line);color:var(--ink-dim);transition:.15s}
        .gchip.on{background:var(--grad-btn);color:#fff;border-color:transparent;box-shadow:var(--glow)}
        .grid-close{flex:0 0 auto;width:34px;height:34px;border-radius:11px;font-size:.95rem;
          background:rgba(155,92,255,.14);border:1px solid var(--line);color:var(--ink);display:grid;place-items:center}
        .grid-close:active{transform:scale(.92)}
        .grid-scroll{flex:1 1 auto;min-height:0;overflow:auto;-webkit-overflow-scrolling:touch}
        .grid-inner{position:relative}
        .grid-head{display:flex;position:sticky;top:0;z-index:5;background:var(--bg-1);border-bottom:1px solid var(--line)}
        .grid-corner{flex:0 0 ${LABEL_W}px;position:sticky;left:0;z-index:6;background:var(--bg-1);
          padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--ink-faint);
          border-right:1px solid var(--line)}
        .grid-ticks{position:relative;height:32px}
        .grid-tick{position:absolute;top:8px;font-size:10px;color:var(--ink-faint);transform:translateX(-2px)}
        .grid-row{display:flex;border-bottom:1px solid rgba(176,150,255,.08)}
        .grid-row:last-child{border-bottom:none}
        .grid-stage{flex:0 0 ${LABEL_W}px;position:sticky;left:0;z-index:4;background:var(--bg-1);
          border-right:1px solid var(--line);padding:0 9px;display:flex;align-items:center;
          font-size:10px;font-weight:700;letter-spacing:.02em;color:var(--ink-dim);min-height:50px;line-height:1.15}
        .grid-track{position:relative;min-height:50px;flex:0 0 auto}
        .grid-gl{position:absolute;top:0;bottom:0;width:1px;background:rgba(176,150,255,.07)}
        .grid-blk{position:absolute;top:6px;height:38px;border-radius:7px;padding:4px 7px;overflow:hidden;
          box-shadow:0 1px 3px rgba(0,0,0,.4);display:flex;flex-direction:column;justify-content:center}
        .grid-blk:active{filter:brightness(1.15)}
        .gb-name{font-size:10.5px;font-weight:800;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.15}
        .gb-time{font-size:9px;color:rgba(255,255,255,.82);white-space:nowrap}
      `}</style>
    </div>
  )
}
