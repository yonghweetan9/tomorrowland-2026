// Distinct, bright, well-spaced palette. Picked by farthest-hue from the
// colors already used so no two members get near-identical colors.
export const PALETTE = [
  '#ff3df0', // magenta
  '#39e6d0', // teal
  '#ffce5c', // gold
  '#9b5cff', // violet
  '#ff7a3d', // ember
  '#5b9bff', // sky
  '#ff5c7a', // rose
  '#7CFF6B', // lime
  '#c77dff', // lilac
  '#ffd23d', // amber
  '#3df0c0', // mint
  '#ff8fd6', // pink
  '#6be3ff', // cyan
  '#ffa14d', // orange
  '#b6ff5c', // chartreuse
  '#ff5cc8', // hot pink
]

function hexToHue(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  if (!d) return 0
  let h
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return (h * 60 + 360) % 360
}
const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d }

// Choose the palette color whose hue is farthest from all taken colors.
export function pickColor(takenColors = []) {
  const available = PALETTE.filter(c => !takenColors.includes(c))
  const pool = available.length ? available : PALETTE
  if (!takenColors.length) return pool[Math.floor(Math.random() * pool.length)]
  const takenHues = takenColors.map(hexToHue)
  let best = pool[0], bestScore = -1
  for (const c of pool) {
    const h = hexToHue(c)
    const score = Math.min(...takenHues.map(t => hueDist(h, t)))
    if (score > bestScore) { bestScore = score; best = c }
  }
  return best
}

export const initials = (name = '') =>
  name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'
