import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Static Vite build, deployable to Vercel (framework preset: Vite).
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist' }
})
