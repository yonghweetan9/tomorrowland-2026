// Pure helpers for expense math: per-member shares, net balances (SGD),
// and minimum-transaction debt simplification.

export const CATEGORIES = ['Tickets', 'Travel', 'Accommodation', 'Food & Drink', 'Merch', 'Other']

// Returns { memberId: shareSGD } for one expense.
export function sharesFor(exp, members) {
  const amt = Number(exp.amount_sgd) || 0
  const detail = exp.split_detail || {}
  if (exp.split_type === 'own') return {} // record-only, no settlement
  if (exp.split_type === 'settlement') {
    // settlement: payer (from) pays `to` the amount. Modeled as: to has the share.
    return detail.to ? { [detail.to]: amt } : {}
  }
  if (exp.split_type === 'custom') {
    const out = {}
    for (const [id, v] of Object.entries(detail.amounts || {})) {
      const n = Number(v) || 0
      if (n > 0) out[id] = n
    }
    return out
  }
  if (exp.split_type === 'unit') {
    const units = detail.units || {}
    const total = Object.values(units).reduce((s, u) => s + (Number(u) || 0), 0)
    if (!total) return {}
    const out = {}
    for (const [id, u] of Object.entries(units)) {
      const n = Number(u) || 0
      if (n > 0) out[id] = amt * (n / total)
    }
    return out
  }
  // equal: split among listed participants (default: everyone)
  const parts = (detail.participants && detail.participants.length)
    ? detail.participants
    : members.map(m => m.id)
  if (!parts.length) return {}
  const each = amt / parts.length
  return Object.fromEntries(parts.map(id => [id, each]))
}

// Net balance per member (SGD). Positive = owed money; negative = owes.
export function netBalances(expenses, members) {
  const bal = Object.fromEntries(members.map(m => [m.id, 0]))
  for (const exp of expenses) {
    if (exp.split_type === 'own') continue
    const shares = sharesFor(exp, members)
    const payer = exp.paid_by
    if (payer != null && bal[payer] != null) bal[payer] += Number(exp.amount_sgd) || 0
    for (const [id, sh] of Object.entries(shares)) {
      if (bal[id] != null) bal[id] -= sh
    }
  }
  // round to cents
  for (const k of Object.keys(bal)) bal[k] = Math.round(bal[k] * 100) / 100
  return bal
}

// Greedy minimum-transaction settlement. Returns [{from,to,amount}].
export function simplifyDebts(balances) {
  const creditors = [], debtors = []
  for (const [id, v] of Object.entries(balances)) {
    if (v > 0.009) creditors.push({ id, amt: v })
    else if (v < -0.009) debtors.push({ id, amt: -v })
  }
  creditors.sort((a, b) => b.amt - a.amt)
  debtors.sort((a, b) => b.amt - a.amt)
  const tx = []
  let i = 0, j = 0
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amt, creditors[j].amt)
    tx.push({ from: debtors[i].id, to: creditors[j].id, amount: Math.round(pay * 100) / 100 })
    debtors[i].amt -= pay; creditors[j].amt -= pay
    if (debtors[i].amt < 0.01) i++
    if (creditors[j].amt < 0.01) j++
  }
  return tx
}
