import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

/**
 * Load .dev.vars (same format used by wrangler) so the Vite dev proxy
 * can forward /api/openai/* to the remote Ollama via Cloudflare Tunnel.
 */
function loadDevVars(): Record<string, string> {
  const filePath = path.resolve(__dirname, '.dev.vars')
  if (!fs.existsSync(filePath)) return {}
  const vars: Record<string, string> = {}
  for (const line of fs.readFileSync(filePath, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?(.+?)"?\s*$/)
    if (m) vars[m[1]] = m[2]
  }
  return vars
}

const devVars = loadDevVars()
const ollamaTarget = devVars.OLLAMA_PRIVATE_BASE_URL || 'http://localhost:11434'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom']
  },
  server: {
    proxy: {
      // Forward /api/openai/* → ${OLLAMA_PRIVATE_BASE_URL}/v1/*
      // Mirrors what the Cloudflare Pages Function does in production.
      '/api/openai': {
        target: ollamaTarget,
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/api\/openai/, '/v1'),
        headers: {
          // Inject CF Access service-token headers for Tunnel auth
          ...(devVars.CF_ACCESS_CLIENT_ID && { 'CF-Access-Client-Id': devVars.CF_ACCESS_CLIENT_ID }),
          ...(devVars.CF_ACCESS_CLIENT_SECRET && { 'CF-Access-Client-Secret': devVars.CF_ACCESS_CLIENT_SECRET }),
        }
      }
    }
  }
})
