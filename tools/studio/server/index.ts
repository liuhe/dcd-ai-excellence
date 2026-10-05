// studio server — API over @dcddp/core + static hosting of the built client.
//
//   dev:  `npm run dev` runs vite (:4732, proxies /api and /files here) + this server (:4733)
//   prod: `dcddp studio -m <model>` runs this server alone, serving dist/client
//
// Models come from either a single --model path (STUDIO_MODEL env) or the repo's
// projects.local.json registry (dev).

import express from 'express'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeApi } from './api.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.STUDIO_PORT ?? 4733)   // DCDDP-dedicated block 4730-4733 (see CLAUDE.md)
const HOST = process.env.STUDIO_HOST ?? '0.0.0.0'

const app = express()
app.use('/api', makeApi())

const clientDir = join(__dirname, '..', 'dist', 'client')
if (existsSync(clientDir)) {
  app.use(express.static(clientDir))
  app.get(/^\/(?!api\/|files\/).*/, (_req, res) => res.sendFile(join(clientDir, 'index.html')))
} else {
  app.get('/', (_req, res) => res.type('text').send('studio: client build not found (dist/client). In dev open the Vite URL (:4732).'))
}

app.listen(PORT, HOST, () => {
  process.stdout.write(`[studio] API on http://localhost:${PORT}${existsSync(clientDir) ? ' (serving built client)' : ' (dev: open Vite on :4732)'}\n`)
})
