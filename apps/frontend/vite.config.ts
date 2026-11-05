import react from '@vitejs/plugin-react'
import { loadEnv, type Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

/**
 * Stops `vite dev` at startup when BACKEND_URL is missing. It checks in a server hook, not when the config loads, because tools such as knip load this config without a `.env`.
 */
function requireBackendUrl(url: string | undefined): Plugin {
  return {
    name: 'require-backend-url',
    apply: (_config, { command, mode }) =>
      command === 'serve' && mode === 'development',
    configureServer() {
      if (!url) {
        throw new Error('BACKEND_URL is not set: copy .env.example to .env')
      }
    }
  }
}

/**
 * Vite config for the dev server, the production build and Vitest.
 * In dev, `/api/*` is proxied to the backend with the prefix stripped: the browser talks to one origin, so the backend needs no CORS, and `/api` keeps UI routes apart from backend paths.
 */
export default defineConfig(({ mode }) => {
  // '' loads every variable, not just VITE_ ones: BACKEND_URL is read here and never reaches the browser.
  const { BACKEND_URL } = loadEnv(mode, import.meta.dirname, '')

  return {
    plugins: [react(), requireBackendUrl(BACKEND_URL)],
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
