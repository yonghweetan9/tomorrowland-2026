// ════════════════════════════════════════════════════════════════════
//  seed-lineup.mjs
//  Upserts scripts/lineup_seed.json into the Supabase `lineup` table.
//  Idempotent: upserts on (day, artist_name, stage_name) so re-running
//  never creates duplicates. Run this whenever you re-scrape, or when
//  Yong Hwee feeds in updated data (e.g. once set times are published).
//
//  Requires (read from .env):
//    VITE_SUPABASE_URL
//    SUPABASE_SERVICE_ROLE_KEY   ← secret, server-side only
//
//  Run:  npm run seed
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// minimal .env loader (no extra dependency)
function loadEnv() {
  try {
    const txt = readFileSync(join(ROOT, '.env'), 'utf8')
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* no .env — rely on real env */ }
}
loadEnv()

const URL = process.env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('✗ Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const supabase = createClient(URL, KEY, { auth: { persistSession: false } })

async function main() {
  const rows = JSON.parse(readFileSync(join(ROOT, 'scripts', 'lineup_seed.json'), 'utf8'))
    .map(r => ({ ...r, last_scraped_at: new Date().toISOString() }))
  console.log(`→ Upserting ${rows.length} lineup rows…`)

  // batch to stay well under payload limits
  const CHUNK = 200
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK)
    const { error } = await supabase
      .from('lineup')
      .upsert(batch, { onConflict: 'day,artist_name,stage_name' })
    if (error) { console.error('✗ Upsert error:', error.message); process.exit(1) }
    console.log(`  ✓ ${Math.min(i + CHUNK, rows.length)}/${rows.length}`)
  }
  const { count } = await supabase.from('lineup').select('*', { count: 'exact', head: true })
  console.log(`✓ Done. lineup table now has ${count} rows.`)
}

main().catch(e => { console.error('✗ Seed failed:', e.message); process.exit(1) })
