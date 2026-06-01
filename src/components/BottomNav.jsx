const TABS = [
  { id: 'lineup', icon: '🎵', label: 'Lineup' },
  { id: 'itinerary', icon: '🗓️', label: 'Itinerary' },
  { id: 'map', icon: '🗺️', label: 'Map' },
  { id: 'expenses', icon: '💰', label: 'Expenses' },
]

export default function BottomNav({ tab, setTab }) {
  return (
    <nav className="bottom-nav">
      {TABS.map(t => (
        <button
          key={t.id}
          className={'nav-item' + (tab === t.id ? ' on' : '')}
          onClick={() => setTab(t.id)}
        >
          <span className="ic">{t.icon}</span>
          {t.label}
        </button>
      ))}
    </nav>
  )
}
