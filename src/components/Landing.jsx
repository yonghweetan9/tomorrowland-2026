import { useState } from 'react'
import { createMember } from '../lib/identity'

// Six Consciencia emotions — used as ambient worldbuilding on the landing.
const EMOTIONS = ['Wonder', 'Love', 'Anger', 'Joy', 'Desire', 'Sadness']

export default function Landing({ onReady }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function enter() {
    if (!name.trim() || busy) return
    setBusy(true); setErr('')
    try {
      const m = await createMember(name)
      onReady(m)
    } catch (e) {
      setErr(e.message || 'Could not create your profile')
      setBusy(false)
    }
  }

  return (
    <div className="landing">
      <div className="landing-aura" />
      <div className="landing-grain" />

      <div className="landing-inner fade-in">
        <div className="emotions">
          {EMOTIONS.map((e, i) => (
            <span key={e} style={{ '--i': i }}>{e}</span>
          ))}
        </div>

        <p className="kicker">Tomorrowland 2026 · Weekend 2</p>
        <h1 className="hero-title">CONSCIENCIA</h1>
        <p className="hero-sub">
          Fri 24 — Sun 26 July · De Schorre, Boom<br />
          One link. Your crew. The whole weekend, together.
        </p>

        <div className="enter-card glass">
          <label className="lab">What should the crew call you?</label>
          <input
            className="field"
            placeholder="Your name"
            value={name}
            maxLength={24}
            autoFocus
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && enter()}
          />
          {err && <p className="err">{err}</p>}
          <button className="btn btn-block enter-btn" disabled={!name.trim() || busy} onClick={enter}>
            {busy ? 'Entering…' : 'Enter the People of Tomorrow ✦'}
          </button>
          <p className="fineprint">
            You'll get a colour of your own. Everyone who opens this link joins the same shared world.
          </p>
        </div>
      </div>

      <style>{`
        .landing{position:fixed;inset:0;overflow:hidden;display:flex;align-items:center;justify-content:center;padding:24px}
        .landing-aura{position:absolute;inset:-20% -20% auto -20%;height:80%;
          background:
            radial-gradient(60% 60% at 30% 30%, rgba(255,61,240,.5), transparent 60%),
            radial-gradient(55% 55% at 75% 25%, rgba(91,107,255,.5), transparent 60%),
            radial-gradient(50% 60% at 55% 75%, rgba(57,230,208,.35), transparent 60%);
          filter:blur(60px);animation:drift 14s ease-in-out infinite alternate;opacity:.85}
        @keyframes drift{from{transform:translateY(-4%) scale(1)}to{transform:translateY(6%) scale(1.08)}}
        .landing-grain{position:absolute;inset:0;opacity:.06;pointer-events:none;
          background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")}
        .landing-inner{position:relative;z-index:2;width:100%;max-width:440px;text-align:center}
        .emotions{display:flex;flex-wrap:wrap;gap:6px 10px;justify-content:center;margin-bottom:22px}
        .emotions span{font-family:'Cinzel',serif;font-size:.72rem;letter-spacing:.22em;text-transform:uppercase;
          color:var(--ink-faint);opacity:0;animation:emoIn .6s ease forwards;animation-delay:calc(var(--i)*.12s + .2s)}
        @keyframes emoIn{to{opacity:.9}}
        .kicker{font-size:.74rem;letter-spacing:.34em;text-transform:uppercase;color:var(--ink-dim);margin:0 0 8px}
        .hero-title{font-size:clamp(1.8rem,9vw,3.2rem);line-height:.96;margin:0 0 14px;font-weight:900;
          letter-spacing:.005em;max-width:100%;overflow-wrap:break-word;
          background:var(--grad-hero);-webkit-background-clip:text;background-clip:text;color:transparent;
          filter:drop-shadow(0 4px 30px rgba(255,61,240,.45))}
        .hero-sub{color:var(--ink-dim);font-size:.92rem;line-height:1.5;margin:0 0 28px}
        .enter-card{padding:20px 18px;text-align:left}
        .enter-btn{margin-top:14px;font-size:1rem;padding:14px}
        .fineprint{color:var(--ink-faint);font-size:.74rem;line-height:1.4;margin:12px 2px 0;text-align:center}
        .err{color:#ff6b8a;font-size:.82rem;margin:8px 2px 0}
      `}</style>
    </div>
  )
}
