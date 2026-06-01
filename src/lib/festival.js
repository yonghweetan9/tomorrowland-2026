// Festival-wide constants shared across tabs.
export const FESTIVAL = {
  name: 'Tomorrowland 2026 · Weekend 2',
  theme: 'Consciencia',
  venue: 'De Schorre, Boom, Belgium',
  lat: 51.0894,
  lng: 4.3781,
}

export const DAYS = [
  { date: '2026-07-24', label: 'Fri', long: 'Friday 24 Jul' },
  { date: '2026-07-25', label: 'Sat', long: 'Saturday 25 Jul' },
  { date: '2026-07-26', label: 'Sun', long: 'Sunday 26 Jul' },
]

export const dayLabel = d => DAYS.find(x => x.date === d)?.long ?? d
export const dayShort = d => DAYS.find(x => x.date === d)?.label ?? d

// Format an ISO timestamp to HH:MM (festival local time, Europe/Brussels +02).
export function hhmm(iso) {
  if (!iso) return null
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Brussels' })
  } catch { return null }
}
