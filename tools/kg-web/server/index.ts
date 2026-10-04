// kg-web server entry.
//
// - Binds 0.0.0.0 so other machines on the LAN can reach it (per user requirement).
// - Serves /api from `./api.ts`.
// - In prod: also serves the built client from `dist/client/`.
// - In dev: Vite is expected to run separately on :5173 and proxy /api here.

import express from 'express'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { access } from 'node:fs/promises'
import { makeApi } from './api.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

const PORT = Number(process.env.PORT ?? 3000)
const HOST = process.env.HOST ?? '0.0.0.0'

const app = express()

app.use('/api', makeApi())

// In prod (`npm run start`), server also serves the built client bundle.
// dist/server/index.js is one level below dist/, so client is at ../client/
const clientDir = join(__dirname, '..', 'client')
;(async () => {
  try {
    await access(clientDir)
    app.use(express.static(clientDir))
    app.get('*', (_req, res) => res.sendFile(join(clientDir, 'index.html')))
    console.log(`[kg-web] serving client from ${clientDir}`)
  } catch {
    console.log('[kg-web] client dist not found — dev mode: expect Vite on :5173')
  }
})()

app.listen(PORT, HOST, () => {
  const addrs = getLocalAddresses()
  console.log(`\n[kg-web] listening on http://${HOST}:${PORT}`)
  if (HOST === '0.0.0.0') {
    console.log('[kg-web] accessible on your LAN at:')
    for (const a of addrs) console.log(`  http://${a}:${PORT}`)
    console.log('[kg-web] dev mode: open http://localhost:5173 (Vite dev) or the LAN URL from another device')
  }
})

function getLocalAddresses(): string[] {
  const out: string[] = ['localhost']
  try {
    const nets = require('node:os').networkInterfaces() as Record<string, Array<{ family: string; address: string; internal: boolean }>>
    for (const infos of Object.values(nets)) {
      for (const i of infos ?? []) {
        if (i.family === 'IPv4' && !i.internal) out.push(i.address)
      }
    }
  } catch {}
  return out
}
