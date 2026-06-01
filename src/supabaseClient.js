import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

// If env vars are missing we still export a client-shaped object so the app
// renders a helpful message instead of crashing.
export const supabaseReady = Boolean(url && anon)

export const supabase = supabaseReady
  ? createClient(url, anon, { realtime: { params: { eventsPerSecond: 5 } } })
  : null
