// EUR ⇄ SGD conversion with a live rate (exchangerate.host), session cache,
// and a hardcoded fallback if the API fails.
const FALLBACK_EUR_SGD = 1.45 // approximate; shown with a warning banner
const CACHE_KEY = 'tml26_eursgd_rate'

let memo = null // { rate, fallback, fetchedAt }

export function getCachedRate() {
  if (memo) return memo
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (raw) { memo = JSON.parse(raw); return memo }
  } catch {}
  return null
}

export async function fetchRate(force = false) {
  if (!force) {
    const c = getCachedRate()
    if (c) return c
  }
  const key = import.meta.env.VITE_EXCHANGERATE_API_KEY
  try {
    const url = `https://api.exchangerate.host/convert?from=EUR&to=SGD&amount=1${key ? `&access_key=${key}` : ''}`
    const r = await fetch(url)
    const j = await r.json()
    const rate = Number(j?.result ?? j?.info?.rate)
    if (!rate || !isFinite(rate)) throw new Error('bad rate payload')
    memo = { rate, fallback: false, fetchedAt: Date.now() }
  } catch {
    memo = { rate: FALLBACK_EUR_SGD, fallback: true, fetchedAt: Date.now() }
  }
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(memo)) } catch {}
  return memo
}

export function toSGD(amount, currency, rate) {
  const a = Number(amount) || 0
  return currency === 'SGD' ? a : a * rate
}

export function fmt(amount, currency = 'SGD') {
  const n = Number(amount) || 0
  return `${currency === 'EUR' ? '€' : 'S$'}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
