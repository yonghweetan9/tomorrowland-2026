// Web Worker that keeps a steady heartbeat even when the tab is backgrounded.
// Browsers throttle setInterval on hidden main threads, but a dedicated worker
// keeps firing — so we use it to drive background location pings.
//
// Messages in:  { type:'start', interval } | { type:'stop' }
// Messages out: { type:'tick' }
let timer = null

self.onmessage = (e) => {
  const { type, interval } = e.data || {}
  if (type === 'start') {
    if (timer) clearInterval(timer)
    // interval is ms (caller passes 15–30 min). Battery-conscious heartbeat.
    timer = setInterval(() => self.postMessage({ type: 'tick' }), interval || 20 * 60 * 1000)
  } else if (type === 'stop') {
    if (timer) clearInterval(timer)
    timer = null
  }
}
