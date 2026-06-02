import { useEffect, useState, useCallback } from 'react'
import { supabase, supabaseReady } from './supabaseClient'
import { restoreMember } from './lib/identity'
import Landing from './components/Landing'
import BottomNav from './components/BottomNav'
import LineupTab from './components/tabs/LineupTab'
import ItineraryTab from './components/tabs/ItineraryTab'
import MapTab from './components/tabs/MapTab'
import ExpensesTab from './components/tabs/ExpensesTab'

export default function App() {
  const [me, setMe] = useState(null)
  const [members, setMembers] = useState([])
  const [tab, setTab] = useState('lineup')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')

  const showToast = useCallback((msg) => {
    setToast(msg); setTimeout(() => setToast(''), 1900)
  }, [])

  // Restore identity on load.
  useEffect(() => {
    if (!supabaseReady) { setLoading(false); return }
    restoreMember().then(m => { if (m) setMe(m); setLoading(false) })
  }, [])

  // Live members list (avatars, colors) — realtime.
  useEffect(() => {
    if (!me || !supabase) return
    const load = async () => {
      const { data } = await supabase.from('members').select('*').order('created_at')
      setMembers(data ?? [])
    }
    load()
    const ch = supabase.channel('members-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [me])

  const shareLink = async () => {
    const url = window.location.href.split('#')[0]
    try { await navigator.clipboard.writeText(url); showToast('Link copied — send it to your crew ✦') }
    catch { showToast(url) }
  }

  if (!supabaseReady) return <NeedsConfig />
  if (loading) return <div className="app"><div className="spinner" /></div>
  if (!me) return <Landing onReady={m => { setMe(m); showToast(`Welcome, ${m.display_name} ✦`) }} />

  const tabProps = { me, members, showToast }

  return (
    <div className="app">
      <main className="app-main">
        {tab === 'lineup'    && <LineupTab    {...tabProps} onShare={shareLink} goItinerary={() => setTab('itinerary')} />}
        {tab === 'itinerary' && <ItineraryTab {...tabProps} />}
        {tab === 'map'       && <MapTab       {...tabProps} />}
        {tab === 'expenses'  && <ExpensesTab  {...tabProps} />}
      </main>
      <BottomNav tab={tab} setTab={setTab} />
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function NeedsConfig() {
  return (
    <div className="app">
      <div className="screen">
        <h1 className="screen-title">Almost there</h1>
        <div className="card" style={{ marginTop: 16, lineHeight: 1.6 }}>
          <p className="dim">This app needs its Supabase keys before it can sync.</p>
          <p className="muted" style={{ fontSize: '.86rem' }}>
            Create a <code>.env</code> file (copy <code>.env.example</code>) and set{' '}
            <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>, then restart{' '}
            <code>npm run dev</code> — or add them in the Vercel dashboard. See the README.
          </p>
        </div>
      </div>
    </div>
  )
}
