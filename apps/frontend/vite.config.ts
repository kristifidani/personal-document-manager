import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

/**
 * Vite config for the dev server, the production build and Vitest.
 * In dev, `/api/*` is proxied to the backend with the prefix stripped: the browser talks to one origin, so the backend needs no CORS, and `/api` keeps UI routes apart from backend paths.
 */
export default defineConfig(({ mode }) => {
  // '' loads every variable, not just VITE_ ones: BACKEND_URL is read here and never reaches the browser.
  const { BACKEND_URL } = loadEnv(mode, import.meta.dirname, '')
  if (mode === 'development' && !BACKEND_URL) {
    throw new Error('BACKEND_URL is not set: copy .env.example to .env')
  }

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: BACKEND_URL,
          rewrite: (path) => path.replace(/^\/api/, '')
        }
      }
    },
    test: {
      environment: 'jsdom'
    }
  }
})
