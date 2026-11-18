import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Keep the browser and API on one origin, including the refresh cookie and CSRF checks.
  server: {
    host: 'localhost',
    proxy: { '/api': { target: 'http://localhost:5268', changeOrigin: false } },
  },
  preview: {
    host: 'localhost',
    proxy: { '/api': { target: 'http://localhost:5268', changeOrigin: false } },
  },
})
