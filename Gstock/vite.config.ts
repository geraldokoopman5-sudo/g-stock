import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import type { ProxyOptions } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'API_PROXY_')
  const target = new URL(env.API_PROXY_TARGET || 'http://localhost:5268')
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
  if ((target.protocol !== 'https:' && !(local && target.protocol === 'http:')) ||
      target.username || target.password || target.pathname !== '/' || target.search || target.hash) {
    throw new Error('API_PROXY_TARGET must be the root HTTPS URL of the backend, or a local HTTP URL.')
  }

  const proxy: ProxyOptions = {
    target: target.origin,
    changeOrigin: true,
    timeout: 120_000,
    proxyTimeout: 120_000,
    configure(server) {
      server.on('proxyReq', (outgoing, incoming) => {
        // Only translate an Origin that matches this local frontend.
        // Invalid origins and fetch metadata remain visible to the API's CSRF checks.
        if (incoming.headers.origin === `http://${incoming.headers.host}`) {
          outgoing.setHeader('Origin', target.origin)
        }
      })
    },
  }

  return {
    plugins: [react()],
    server: { host: 'localhost', proxy: { '/api/v1': proxy } },
    preview: { host: 'localhost', proxy: { '/api/v1': proxy } },
  }
})
