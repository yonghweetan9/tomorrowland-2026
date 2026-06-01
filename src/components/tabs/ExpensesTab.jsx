import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { fetchRate, toSGD, fmt } from '../../lib/currency'
import { CATEGORIES, sharesFor, netBalances, simplifyDebts } from '../../lib/expenses'
import { DAYS, dayShort } from '../../lib/festival'
import { initials } from '../../lib/colors'

const SPLIT_TYPES = [
  { id: 'equal', label: 'Equal' },
  { id: 'custom', label: 'Custom' },
  { id: 'unit', label: 'By Unit' },
  { id: 'own', label: 'Everyone paid own' },
]

export default function ExpensesTab({ me, members, showToast }) {
  const [expenses, setExpenses] = useState([])
  const [rate, setRate] = useState({ rate: 1.45, fallback: true })
  const [cur, setCur] = useState('SGD')          // display currency
  const [view, setView] = useState('list')       // list | settle
  const [sheet, setSheet] = useState(null)        // add/edit expense
  const [report, setReport] = useState(false)
  const memberById = useMemo(() => Object.fromEntries(members.map(m => [m.id, m])), [members])

  useEffect(() => { fetchRate().then(setRate) }, [])
  useEffect(() => {
    if (!supabase) return
    const load = async () => {
      const { data } = await supabase.from('expenses').select('*').order('created_at', { ascending: false })
      setExpenses(data ?? [])
    }
    load()
    const ch = supabase.channel('exp-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  const r = rate.rate
  // display a SGD amount in the chosen currency
  const disp = (sgd) => cur === 'SGD' ? fmt(sgd, 'SGD') : fmt((Number(sgd) || 0) / r, 'EUR')

  const active = expenses.filter(e => e.split_type !== 'settlement')
  const total = active.reduce((s, e) => s + (Number(e.amount_sgd) || 0), 0)
  const balances = useMemo(() => netBalances(expenses, members), [expenses, members])
  const debts = useMemo(() => simplifyDebts(balances), [balances])

  async function refreshRate() {
    const fresh = await fetchRate(true); setRate(fresh)
    showToast(fresh.fallback ? 'Using fallback rate' : `Rate ${fresh.rate.toFixed(3)} ✦`)
  }

  async function settleDebt(d) {
    await supabase.from('expenses').insert({
      title: `Settle: ${memberById[d.from]?.display_name} → ${memberById[d.to]?.display_name}`,
      amount: d.amount, currency: 'SGD', amount_sgd: d.amount,
      paid_by: d.from, split_type: 'settlement',
      split_detail: { settlement: true, from: d.from, to: d.to },
      category: 'Settlement', spent_on: null, settled: true,
    })
    showToast('Marked as settled ✦')
  }

  async function removeExpense(id) {
    await supabase.from('expenses').delete().eq('id', id)
    showToast('Deleted')
  }

  return (
    <div className="screen fade-in">
      <div className="screen-head">
        <div>
          <h1 className="screen-title">Expenses</h1>
          <p className="screen-sub">Trip total · {disp(total)}</p>
        </div>
        <div className="cur-toggle">
          {['SGD', 'EUR'].map(c => (
            <button key={c} className={'cur-b' + (cur === c ? ' on' : '')} onClick={() => setCur(c)}>{c}</button>
          ))}
        </div>
      </div>

      <div className="rate-bar glass">
        <span className="muted" style={{ fontSize: '.76rem' }}>
          1 EUR = {r.toFixed(4)} SGD {rate.fallback && <span style={{ color: 'var(--ember)' }}>· ⚠ fallback</span>}
        </span>
        <button className="chip btn-sm" onClick={refreshRate}>↻ Refresh rate</button>
      </div>

      <div className="seg">
        <button className={'seg-b' + (view === 'list' ? ' on' : '')} onClick={() => setView('list')}>Expenses</button>
        <button className={'seg-b' + (view === 'settle' ? ' on' : '')} onClick={() => setView('settle')}>Settle up</button>
      </div>

      {view === 'list' && (
        <>
          {!active.length && <div className="empty">No expenses yet. Tap ＋ to add the first one.</div>}
          <div className="exp-list">
            {active.map(e => (
              <ExpenseRow key={e.id} exp={e} disp={disp} memberById={memberById} members={members}
                onEdit={() => setSheet(e)} onDelete={() => removeExpense(e.id)} />
            ))}
          </div>
        </>
      )}

      {view === 'settle' && (
        <SettleView balances={balances} debts={debts} memberById={memberById} disp={disp}
          onSettle={settleDebt} history={expenses.filter(e => e.split_type === 'settlement')} />
      )}

      <div className="exp-actions">
        <button className="btn btn-ghost" onClick={() => setReport(true)}>📊 Report</button>
        <button className="btn" onClick={() => setSheet({ _new: true })}>＋ Add expense</button>
      </div>

      {sheet && (
        <ExpenseSheet exp={sheet._new ? null : sheet} me={me} members={members} rate={r}
          onClose={() => setSheet(null)}
          onSaved={() => { setSheet(null); showToast('Saved ✦') }} />
      )}
      {report && (
        <ReportModal expenses={active} members={members} memberById={memberById} disp={disp}
          total={total} cur={cur} rate={r} onClose={() => setReport(false)} />
      )}

      <style>{`
        .cur-toggle{display:flex;background:rgba(7,4,17,.5);border:1px solid var(--line);border-radius:11px;overflow:hidden}
        .cur-b{padding:7px 12px;font-size:.8rem;font-weight:700;background:none;color:var(--ink-faint)}
        .cur-b.on{background:var(--grad-btn);color:#fff}
        .rate-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px;margin-bottom:12px}
        .seg{display:flex;gap:6px;background:rgba(7,4,17,.4);padding:4px;border-radius:13px;margin-bottom:12px}
        .seg-b{flex:1;padding:9px;border-radius:10px;font-weight:700;font-size:.86rem;background:none;color:var(--ink-faint)}
        .seg-b.on{background:var(--grad-btn);color:#fff;box-shadow:var(--glow)}
        .exp-list{display:flex;flex-direction:column;gap:8px;margin-bottom:90px}
        .exp-actions{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(var(--nav-h) + var(--safe-b) + 10px);
          width:100%;max-width:520px;padding:0 16px;display:flex;gap:10px;z-index:40}
        .exp-actions .btn{flex:1}
      `}</style>
    </div>
  )
}

function ExpenseRow({ exp, disp, memberById, members, onEdit, onDelete }) {
  const [open, setOpen] = useState(false)
  const payer = memberById[exp.paid_by]
  const shares = sharesFor(exp, members)
  const splitLabel = { equal: 'Equal', custom: 'Custom', unit: 'By unit', own: 'Paid own' }[exp.split_type] || exp.split_type
  return (
    <div className="card exp-row">
      <div className="between" onClick={() => setOpen(o => !o)} style={{ cursor: 'pointer' }}>
        <div className="row" style={{ gap: 10, minWidth: 0 }}>
          {payer && <div className="avatar" style={{ background: payer.color }}>{initials(payer.display_name)}</div>}
          <div style={{ minWidth: 0 }}>
            <div className="exp-title">{exp.title}</div>
            <div className="exp-meta muted">
              {payer?.display_name || '—'} · {exp.category}{exp.spent_on ? ` · ${dayShort(exp.spent_on)}` : ''} · {splitLabel}
            </div>
          </div>
        </div>
        <div className="exp-amt">{disp(exp.amount_sgd)}</div>
      </div>
      {open && (
        <div className="exp-detail">
          {exp.split_type === 'own'
            ? <p className="muted" style={{ margin: '8px 0 0' }}>Everyone paid for themselves — not settled.</p>
            : <div className="shares">
                {Object.entries(shares).map(([id, sh]) => (
                  <div key={id} className="share-row">
                    <span className="row" style={{ gap: 7 }}>
                      <span className="avatar" style={{ background: memberById[id]?.color, width: 20, height: 20, fontSize: '.6rem' }}>{initials(memberById[id]?.display_name || '?')}</span>
                      {memberById[id]?.display_name || 'Unknown'}
                    </span>
                    <span className="dim">{disp(sh)}</span>
                  </div>
                ))}
              </div>}
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn btn-ghost btn-sm" onClick={onEdit}>✎ Edit</button>
            <button className="btn btn-sm" style={{ background: 'rgba(255,61,110,.18)', color: '#ff9bb0', boxShadow: 'none' }} onClick={onDelete}>🗑 Delete</button>
          </div>
        </div>
      )}
      <style>{`
        .exp-row{padding:12px}
        .exp-title{font-weight:700;font-size:.94rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .exp-meta{font-size:.72rem;margin-top:2px}
        .exp-amt{font-weight:800;font-size:1rem;white-space:nowrap}
        .exp-detail{border-top:1px solid var(--line);margin-top:10px;padding-top:8px}
        .shares{display:flex;flex-direction:column;gap:6px}
        .share-row{display:flex;align-items:center;justify-content:space-between;font-size:.84rem}
      `}</style>
    </div>
  )
}

function SettleView({ balances, debts, memberById, disp, onSettle, history }) {
  const someBalances = Object.entries(balances).filter(([, v]) => Math.abs(v) > 0.009)
  return (
    <div style={{ marginBottom: 90 }}>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="lab">Net balance</div>
        {!someBalances.length && <p className="muted" style={{ margin: '6px 0 0' }}>All square. 🎉</p>}
        {someBalances.map(([id, v]) => (
          <div key={id} className="bal-row">
            <span className="row" style={{ gap: 8 }}>
              <span className="avatar" style={{ background: memberById[id]?.color }}>{initials(memberById[id]?.display_name || '?')}</span>
              {memberById[id]?.display_name}
            </span>
            <span style={{ fontWeight: 700, color: v >= 0 ? 'var(--teal)' : '#ff9bb0' }}>
              {v >= 0 ? 'gets back ' : 'owes '}{disp(Math.abs(v))}
            </span>
          </div>
        ))}
      </div>

      <div className="lab" style={{ margin: '0 2px 8px' }}>Who pays whom</div>
      {!debts.length && <p className="muted" style={{ margin: '0 2px' }}>Nothing to settle.</p>}
      <div className="exp-list">
        {debts.map((d, i) => (
          <div key={i} className="card debt-card">
            <div className="row" style={{ gap: 8, minWidth: 0 }}>
              <span className="avatar" style={{ background: memberById[d.from]?.color }}>{initials(memberById[d.from]?.display_name || '?')}</span>
              <span style={{ fontSize: '.9rem' }}><b>{memberById[d.from]?.display_name}</b> owes <b>{memberById[d.to]?.display_name}</b></span>
            </div>
            <div className="row" style={{ gap: 10 }}>
              <span style={{ fontWeight: 800 }}>{disp(d.amount)}</span>
              <button className="btn btn-gold btn-sm" onClick={() => onSettle(d)}>Settle</button>
            </div>
          </div>
        ))}
      </div>

      {!!history.length && (
        <>
          <div className="lab" style={{ margin: '14px 2px 8px' }}>Settled history</div>
          <div className="exp-list">
            {history.map(h => (
              <div key={h.id} className="card" style={{ padding: 11, opacity: .7 }}>
                <div className="between"><span style={{ fontSize: '.84rem' }}>✓ {h.title}</span><span className="dim">{disp(h.amount_sgd)}</span></div>
              </div>
            ))}
          </div>
        </>
      )}
      <style>{`
        .bal-row,.debt-card{display:flex;align-items:center;justify-content:space-between;gap:10px}
        .bal-row{padding:7px 0}.bal-row:not(:last-child){border-bottom:1px solid var(--line)}
        .debt-card{padding:11px 12px}
      `}</style>
    </div>
  )
}

function ExpenseSheet({ exp, me, members, rate, onClose, onSaved }) {
  const [title, setTitle] = useState(exp?.title || '')
  const [amount, setAmount] = useState(exp ? String(exp.amount) : '')
  const [currency, setCurrency] = useState(exp?.currency || 'EUR')
  const [category, setCategory] = useState(exp?.category || 'Other')
  const [spentOn, setSpentOn] = useState(exp?.spent_on || '')
  const [paidBy, setPaidBy] = useState(exp?.paid_by || me.id)
  const [splitType, setSplitType] = useState(exp?.split_type || 'equal')
  const [participants, setParticipants] = useState(
    exp?.split_detail?.participants || members.map(m => m.id))
  const [customAmts, setCustomAmts] = useState(() => {
    const o = {}; members.forEach(m => o[m.id] = exp?.split_detail?.amounts?.[m.id] ?? '')
    // amounts stored in SGD; show back in the expense currency
    if (exp?.split_type === 'custom') members.forEach(m => {
      const v = exp.split_detail?.amounts?.[m.id]
      o[m.id] = v != null ? (exp.currency === 'EUR' ? (v / rate).toFixed(2) : String(v)) : ''
    })
    return o
  })
  const [units, setUnits] = useState(() => {
    const o = {}; members.forEach(m => o[m.id] = exp?.split_detail?.units?.[m.id] ?? '')
    return o
  })
  const [busy, setBusy] = useState(false)

  const toggleParticipant = id =>
    setParticipants(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])

  async function save() {
    if (!title.trim() || !amount || busy) return
    setBusy(true)
    const amt = Number(amount) || 0
    const amount_sgd = toSGD(amt, currency, rate)
    let split_detail = {}
    if (splitType === 'equal') split_detail = { participants }
    else if (splitType === 'custom') {
      const amounts = {}
      for (const m of members) {
        const v = Number(customAmts[m.id]) || 0
        if (v > 0) amounts[m.id] = currency === 'EUR' ? v * rate : v // store SGD
      }
      split_detail = { amounts }
    } else if (splitType === 'unit') {
      const u = {}
      for (const m of members) { const v = Number(units[m.id]) || 0; if (v > 0) u[m.id] = v }
      split_detail = { units: u }
    }
    const payload = {
      title: title.trim(), amount: amt, currency, amount_sgd,
      paid_by: splitType === 'own' ? paidBy : paidBy,
      split_type: splitType, split_detail, category, spent_on: spentOn || null,
    }
    const res = exp
      ? await supabase.from('expenses').update(payload).eq('id', exp.id)
      : await supabase.from('expenses').insert(payload)
    setBusy(false)
    if (!res.error) onSaved()
  }

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-grab" />
        <h3 style={{ marginTop: 0 }}>{exp ? 'Edit expense' : 'Add expense'}</h3>

        <label className="lab">Title</label>
        <input className="field" placeholder="e.g. Locker rental" value={title} onChange={e => setTitle(e.target.value)} />

        <div className="row" style={{ marginTop: 12 }}>
          <div style={{ flex: 1 }}>
            <label className="lab">Amount</label>
            <input className="field" type="number" inputMode="decimal" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="lab">Currency</label>
            <div className="cur-toggle" style={{ height: 48 }}>
              {['EUR', 'SGD'].map(c => <button key={c} className={'cur-b' + (currency === c ? ' on' : '')} onClick={() => setCurrency(c)}>{c}</button>)}
            </div>
          </div>
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <div style={{ flex: 1 }}>
            <label className="lab">Category</label>
            <select className="field" value={category} onChange={e => setCategory(e.target.value)}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label className="lab">Day</label>
            <select className="field" value={spentOn} onChange={e => setSpentOn(e.target.value)}>
              <option value="">—</option>
              {DAYS.map(d => <option key={d.date} value={d.date}>{d.label} {d.date.slice(8)}</option>)}
            </select>
          </div>
        </div>

        <label className="lab" style={{ marginTop: 12 }}>Paid by</label>
        <select className="field" value={paidBy} onChange={e => setPaidBy(e.target.value)}>
          {members.map(m => <option key={m.id} value={m.id}>{m.display_name}{m.id === me.id ? ' (you)' : ''}</option>)}
        </select>

        <label className="lab" style={{ marginTop: 12 }}>Split</label>
        <div className="chips">
          {SPLIT_TYPES.map(s => (
            <button key={s.id} className={'chip' + (splitType === s.id ? ' on' : '')} onClick={() => setSplitType(s.id)}>{s.label}</button>
          ))}
        </div>

        {splitType === 'equal' && (
          <div className="split-edit">
            <p className="muted" style={{ fontSize: '.76rem' }}>Split equally between:</p>
            {members.map(m => (
              <label key={m.id} className="check-row">
                <span className="row" style={{ gap: 8 }}>
                  <span className="avatar" style={{ background: m.color, width: 22, height: 22, fontSize: '.62rem' }}>{initials(m.display_name)}</span>
                  {m.display_name}
                </span>
                <input type="checkbox" checked={participants.includes(m.id)} onChange={() => toggleParticipant(m.id)} />
              </label>
            ))}
          </div>
        )}
        {splitType === 'custom' && (
          <div className="split-edit">
            <p className="muted" style={{ fontSize: '.76rem' }}>Amount per person ({currency}) — leave 0 to exclude:</p>
            {members.map(m => (
              <div key={m.id} className="amt-row">
                <span className="row" style={{ gap: 8 }}><span className="avatar" style={{ background: m.color, width: 22, height: 22, fontSize: '.62rem' }}>{initials(m.display_name)}</span>{m.display_name}</span>
                <input className="field amt-in" type="number" inputMode="decimal" placeholder="0" value={customAmts[m.id]} onChange={e => setCustomAmts({ ...customAmts, [m.id]: e.target.value })} />
              </div>
            ))}
          </div>
        )}
        {splitType === 'unit' && (
          <div className="split-edit">
            <p className="muted" style={{ fontSize: '.76rem' }}>Units per person (e.g. drinks, nights):</p>
            {members.map(m => (
              <div key={m.id} className="amt-row">
                <span className="row" style={{ gap: 8 }}><span className="avatar" style={{ background: m.color, width: 22, height: 22, fontSize: '.62rem' }}>{initials(m.display_name)}</span>{m.display_name}</span>
                <input className="field amt-in" type="number" inputMode="numeric" placeholder="0" value={units[m.id]} onChange={e => setUnits({ ...units, [m.id]: e.target.value })} />
              </div>
            ))}
          </div>
        )}
        {splitType === 'own' && <p className="muted" style={{ fontSize: '.8rem', marginTop: 10 }}>Recorded only — not included in settlement.</p>}

        <button className="btn btn-block" style={{ marginTop: 16 }} disabled={!title.trim() || !amount || busy} onClick={save}>
          {busy ? 'Saving…' : exp ? 'Save changes' : 'Add expense'}
        </button>
        <style>{`
          .split-edit{margin-top:10px;display:flex;flex-direction:column;gap:7px}
          .check-row,.amt-row{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:.88rem}
          .check-row input{width:20px;height:20px;accent-color:var(--violet)}
          .amt-in{width:110px;padding:8px 10px}
          select.field{appearance:none}
        `}</style>
      </div>
    </div>
  )
}

function ReportModal({ expenses, members, memberById, disp, total, cur, rate, onClose }) {
  // spend by category
  const byCat = {}
  const byDayCat = {}
  const paidPer = Object.fromEntries(members.map(m => [m.id, 0]))
  for (const e of expenses) {
    const a = Number(e.amount_sgd) || 0
    byCat[e.category] = (byCat[e.category] || 0) + a
    const d = e.spent_on || 'Unassigned'
    byDayCat[d] = byDayCat[d] || {}
    byDayCat[d][e.category] = (byDayCat[d][e.category] || 0) + a
    if (e.paid_by != null && paidPer[e.paid_by] != null) paidPer[e.paid_by] += a
  }

  function exportReport() {
    const v = (sgd) => cur === 'SGD' ? `S$${sgd.toFixed(2)}` : `€${(sgd / rate).toFixed(2)}`
    const rows = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1])
      .map(([k, val]) => `<tr><td>${k}</td><td style="text-align:right">${v(val)}</td></tr>`).join('')
    const dayBlocks = Object.entries(byDayCat).map(([d, cats]) =>
      `<h3>${d}</h3><table>${rows(cats)}</table>`).join('')
    const html = `<!doctype html><html><head><meta charset="utf8"><title>Tomorrowland 2026 — Expense Report</title>
      <style>body{font-family:system-ui,sans-serif;max-width:640px;margin:24px auto;padding:0 16px;color:#1a1130}
      h1{font-size:22px}h2{margin-top:26px;border-bottom:2px solid #9b5cff;padding-bottom:4px}h3{margin:14px 0 4px;color:#6b3fb0}
      table{width:100%;border-collapse:collapse;margin:6px 0}td{padding:5px 0;border-bottom:1px solid #eee;font-size:14px}
      .tot{font-size:20px;font-weight:800;color:#9b5cff}</style></head><body>
      <h1>✦ Tomorrowland 2026 · Weekend 2 — Expense Report</h1>
      <p class="tot">Total: ${v(total)}</p>
      <h2>Spend by category</h2><table>${rows(byCat)}</table>
      <h2>Total paid per person</h2><table>${members.map(m => `<tr><td>${m.display_name}</td><td style="text-align:right">${v(paidPer[m.id] || 0)}</td></tr>`).join('')}</table>
      <h2>By day &amp; category</h2>${dayBlocks}
      <p style="margin-top:30px;color:#999;font-size:12px">Generated ${new Date().toLocaleString()} · amounts shown in ${cur}</p>
      <script>setTimeout(()=>window.print(),400)</script></body></html>`
    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close() }
  }

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="between"><h3 style={{ margin: 0 }}>📊 Analytics</h3><span className="tot-amt">{disp(total)}</span></div>

        <div className="lab" style={{ marginTop: 14 }}>Spend by category</div>
        <BarList data={byCat} max={Math.max(1, ...Object.values(byCat))} disp={disp} />

        <div className="lab" style={{ marginTop: 14 }}>Total paid per person</div>
        {members.map(m => (
          <div key={m.id} className="bal-row" style={{ padding: '6px 0' }}>
            <span className="row" style={{ gap: 8 }}><span className="avatar" style={{ background: m.color }}>{initials(m.display_name)}</span>{m.display_name}</span>
            <b>{disp(paidPer[m.id] || 0)}</b>
          </div>
        ))}

        <div className="lab" style={{ marginTop: 14 }}>By day &amp; category</div>
        {Object.entries(byDayCat).map(([d, cats]) => (
          <div key={d} className="card" style={{ padding: 11, marginBottom: 8 }}>
            <div style={{ fontWeight: 700, fontSize: '.86rem', marginBottom: 6 }}>{DAYS.find(x => x.date === d)?.long || d}</div>
            {Object.entries(cats).map(([c, v]) => (
              <div key={c} className="between" style={{ fontSize: '.82rem', padding: '3px 0' }}><span className="dim">{c}</span><span>{disp(v)}</span></div>
            ))}
          </div>
        ))}

        <button className="btn btn-gold btn-block" style={{ marginTop: 14 }} onClick={exportReport}>⬇ Export / Print (PDF)</button>
        <style>{`.tot-amt{font-weight:800;font-size:1.1rem;color:var(--violet)}`}</style>
      </div>
    </div>
  )
}

function BarList({ data, max, disp }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1])
  if (!entries.length) return <p className="muted" style={{ fontSize: '.82rem' }}>No data.</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {entries.map(([k, v]) => (
        <div key={k}>
          <div className="between" style={{ fontSize: '.8rem', marginBottom: 3 }}><span className="dim">{k}</span><span>{disp(v)}</span></div>
          <div style={{ height: 7, borderRadius: 5, background: 'rgba(155,92,255,.12)', overflow: 'hidden' }}>
            <div style={{ width: `${(v / max) * 100}%`, height: '100%', background: 'var(--grad-btn)' }} />
          </div>
        </div>
      ))}
    </div>
  )
}
