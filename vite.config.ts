import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Pin to a quiet port + strictPort so Tauri's devUrl always matches.
// Picking 5193 specifically because 5173 / 5174 are commonly taken
// by sibling React projects on this machine; if they grab 5193 too
// we want Vite to FAIL fast rather than silently drift to 5194 and
// load the wrong frontend in the Tauri window.
const DEV_PORT = 5193

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: DEV_PORT,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
