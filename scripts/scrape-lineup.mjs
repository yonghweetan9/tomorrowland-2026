// ════════════════════════════════════════════════════════════════════
//  scrape-lineup.mjs
//  Pulls the OFFICIAL Tomorrowland Weekend 2 (2026) line-up and writes
//  scripts/lineup_seed.json + public/lineup_seed.json.
//
//  HOW THE OFFICIAL SITE WORKS (reverse-engineered):
//    The line-up page (belgium.tomorrowland.com/en/line-up) is a Next.js
//    page that renders a <tml-live-lineup> web component. That component
//    fetches static JSON from an S3-backed CDN:
//
//      config : https://artist-lineup-cdn.tomorrowland.com/config-<EVENT>-<UUID>.json
//      stages : https://artist-lineup-cdn.tomorrowland.com/stages-<EVENT>-<UUID>.json
//      week   : https://artist-lineup-cdn.tomorrowland.com/<EVENT>-<WEEKEND>-<UUID>.json
//
//    EVENT = "TL26BE", UUID = the line-up block uuid embedded in the page's
//    __NEXT_DATA__. We scrape the page once to discover EVENT + UUID
//    (so this keeps working if they rotate the uuid), then hit the CDN.
//
//  No headless browser required — the CDN JSON is the same data the
//  component renders. If the page markup ever changes, set EVENT/UUID by
//  hand via env: TML_EVENT=... TML_UUID=... node scripts/scrape-lineup.mjs
//
//  Run:  npm run scrape
// ════════════════════════════════════════════════════════════════════
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const WEEKEND = 'W2'
const W2_DAYS = new Set(['2026-07-24', '2026-07-25', '2026-07-26']) // Fri / Sat / Sun
const PAGE = 'https://belgium.tomorrowland.com/en/line-up/?page=stages&day=2026-07-24'
const CDN = 'https://artist-lineup-cdn.tomorrowland.com'
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

async function getJson(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json,*/*' } })
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`)
  return r.json()
}

async function discoverEventAndUuid() {
  if (process.env.TML_EVENT && process.env.TML_UUID) {
    return { event: process.env.TML_EVENT, uuid: process.env.TML_UUID }
  }
  const html = await fetch(PAGE, { headers: { 'user-agent': UA } }).then(r => r.text())
  const m = html.match(/__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (!m) throw new Error('Could not find __NEXT_DATA__ on the line-up page')
  const data = JSON.parse(m[1])
  const blocks = data?.props?.pageProps?.doc?.blocks ?? []
  const lu = blocks.find(b => b?.type === 'line-up' && b?.event && b?.uuid)
  if (!lu) throw new Error('No line-up block (event+uuid) found in page data')
  return { event: lu.event, uuid: lu.uuid }
}

// A Tomorrowland day runs ~12:00 to ~01:00, so a set starting 00:00–06:59 belongs
// to the PREVIOUS calendar day's session (which is how the official tabs group them).
function festivalDayFor(rawDate, startTime) {
  if (!rawDate || !startTime) return rawDate
  const hh = parseInt(String(startTime).slice(11, 13), 10)
  if (Number.isNaN(hh) || hh >= 7) return rawDate
  const d = new Date(`${rawDate}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

async function main() {
  console.log('→ Discovering EVENT / UUID from official page…')
  const { event, uuid } = await discoverEventAndUuid()
  console.log(`  EVENT=${event}  UUID=${uuid}`)

  const config = await getJson(`${CDN}/config-${event}-${uuid}.json`)
  const withTimetable = !!config?.config?.withTimetable
  console.log(`→ config OK — withTimetable=${withTimetable} (false ⇒ all set times TBA)`)

  console.log(`→ Fetching ${WEEKEND} performances…`)
  const week = await getJson(`${CDN}/${event}-${WEEKEND}-${uuid}.json`)
  const performances = week?.performances ?? []
  console.log(`  ${performances.length} raw performances`)

  const seen = new Set()
  const rows = []
  for (const p of performances) {
    const artist_name = p?.name?.trim()
    const stage_name = p?.stage?.name?.trim()
    if (!artist_name || !stage_name) continue
    // Times are only real when withTimetable is true; otherwise store null.
    const real = withTimetable && p?.startTime && p?.endTime &&
      !(p.startTime.includes('12:00:00') && p.endTime.includes('12:01:00'))
    const start_time = real ? p.startTime : null
    const end_time = real ? p.endTime : null
    // Group by festival day, not the raw calendar date of the start time.
    const day = festivalDayFor(p?.date, start_time)
    if (!W2_DAYS.has(day)) continue
    const key = `${day}|${artist_name}|${stage_name}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({ day, artist_name, stage_name, start_time, end_time, genre: null })
  }

  // Drop stale "More to be announced" placeholders when a real act now fills the
  // same stage + start slot (the CDN keeps both until the slot is fully replaced).
  const occupied = new Set(rows
    .filter(r => r.start_time && r.artist_name.toLowerCase() !== 'more to be announced')
    .map(r => `${r.day}|${r.stage_name}|${r.start_time}`))
  const deduped = rows.filter(r => !(
    r.artist_name.toLowerCase() === 'more to be announced' &&
    r.start_time && occupied.has(`${r.day}|${r.stage_name}|${r.start_time}`)))

  deduped.sort((a, b) => a.day.localeCompare(b.day) || a.stage_name.localeCompare(b.stage_name) || a.artist_name.localeCompare(b.artist_name))

  const byDay = deduped.reduce((o, r) => ((o[r.day] = (o[r.day] || 0) + 1), o), {})
  console.log(`→ ${deduped.length} unique W2 rows:`, byDay)

  const out = JSON.stringify(deduped, null, 1)
  writeFileSync(join(ROOT, 'scripts', 'lineup_seed.json'), out)
  writeFileSync(join(ROOT, 'public', 'lineup_seed.json'), out)
  console.log('✓ Wrote scripts/lineup_seed.json and public/lineup_seed.json')
  console.log('  Next: npm run seed   (upserts into Supabase)')
}

main().catch(e => { console.error('✗ Scrape failed:', e.message); process.exit(1) })
