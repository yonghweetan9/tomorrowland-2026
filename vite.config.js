import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Build stamp so you can tell which version is actually loaded on a device.
// On Vercel the commit SHA is provided; locally it falls back to "dev".
const sha = (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7)
const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
const buildId = `${stamp} · ${sha}`

// Static Vite build, deployable to Vercel (framework preset: Vite).
export default defineConfig({
  plugins: [react()],
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  build: { outDir: 'dist' }
})
