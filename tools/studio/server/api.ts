// REST API wrapping @dcddp/core for the studio client.
//   GET  /api/projects                 → { projects: [{name, path}], current, single }
//   GET  /api/model?project=<name>     → Graph (core shape, untouched)
//   GET  /api/vocabulary               → node / rel kinds for the client
//   GET  /api/validate?project=<name>  → findings
//   GET  /api/files/<project>/<rel…>   → model attachments (svg / md / images)
// Mutations (phase D) are added here, all delegating to core verbs.

import express from 'express'
import { readFile, access } from 'node:fs/promises'
import { join, dirname, resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  loadGraph, nodeReader, validateModel,
  addNode, updateNode, removeNode, connect, disconnect, updateEdge,
  NODE_KINDS, REL_KINDS, NODE_LAYERS, REL_GROUPS,
} from '@dcddp/core'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const REGISTRY = join(REPO_ROOT, 'projects.local.json')

export interface Project { name: string; path: string }

async function projects(): Promise<{ projects: Project[]; current: string | null; single: boolean }> {
  const single = process.env.STUDIO_MODEL
  if (single) {
    const abs = resolve(single)
    const name = process.env.STUDIO_MODEL_NAME ?? abs.split('/').filter(Boolean).slice(-2).join('/')
    return { projects: [{ name, path: abs }], current: name, single: true }
  }
  try {
    const cfg = JSON.parse(await readFile(REGISTRY, 'utf-8')) as { projects?: Project[]; current?: string | null }
    return { projects: cfg.projects ?? [], current: cfg.current ?? null, single: false }
  } catch {
    return { projects: [], current: null, single: false }
  }
}

async function projectPath(name: string | undefined): Promise<string | null> {
  const cfg = await projects()
  const p = cfg.projects.find(x => x.name === name) ?? (cfg.single ? cfg.projects[0] : undefined)
  return p?.path ?? null
}

const MIME: Record<string, string> = {
  '.yaml': 'text/yaml; charset=utf-8', '.yml': 'text/yaml; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
}

export function makeApi(): express.Router {
  const r = express.Router()
  r.use(express.json())

  r.get('/projects', async (_req, res) => res.json(await projects()))

  r.get('/vocabulary', (_req, res) => {
    res.json({
      nodeKinds: Object.values(NODE_KINDS).map(s => ({
        kind: s.kind, idPrefix: s.idPrefix, view: s.view, parents: s.parents, inline: !!s.inline, valueType: !!s.valueType,
        attrs: s.attrs, singleton: !!s.singleton, description: s.description,
      })),
      relKinds: Object.values(REL_KINDS).map(s => ({
        kind: s.kind, implicit: !!s.implicit, edgeAttrs: s.edgeAttrs, description: s.description,
        endpoints: s.endpoints.map(e => ({ source: e.source, target: e.target, shape: e.storage.shape, required: !!e.required })),
      })),
      nodeLayers: NODE_LAYERS, relGroups: REL_GROUPS,
    })
  })

  r.get('/model', async (req, res) => {
    try {
      const root = await projectPath(req.query.project as string | undefined)
      if (!root) return res.status(404).json({ error: 'project not found' })
      const g = await loadGraph(root, nodeReader(root), { onWarn: () => {} })
      res.json(g)
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
    }
  })

  r.get('/validate', async (req, res) => {
    try {
      const root = await projectPath(req.query.project as string | undefined)
      if (!root) return res.status(404).json({ error: 'project not found' })
      const { findings } = await validateModel(root)
      res.json({ findings })
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
    }
  })

  // Attachments: /api/files/<project>/<relative path inside the model directory>
  r.get(/^\/files\/([^/]+)\/(.+)$/, async (req, res) => {
    const [name, rel] = [decodeURIComponent(req.params[0]), decodeURIComponent(req.params[1])]
    const root = await projectPath(name)
    if (!root) return res.status(404).end()
    const file = resolve(root, rel)
    if (!file.startsWith(root + '/')) return res.status(403).end()
    try {
      await access(file)
      res.setHeader('Content-Type', MIME[extname(file).toLowerCase()] ?? 'application/octet-stream')
      res.send(await readFile(file))
    } catch { res.status(404).end() }
  })

  // ---- Mutations (all delegate to core verbs; node refs are ids) ----
  const root = async (req: express.Request, res: express.Response): Promise<string | null> => {
    const p = await projectPath((req.query.project ?? req.body?.project) as string | undefined)
    if (!p) res.status(404).json({ error: 'project not found' })
    return p
  }
  const run = async (res: express.Response, fn: () => Promise<unknown>) => {
    try { res.json({ ok: true, result: await fn() }) } catch (e) { res.status(400).json({ error: msg(e) }) }
  }
  r.post('/node', async (req, res) => { const p = await root(req, res); if (!p) return
    const { kind, name, parent, package: pkg, attrs } = req.body as { kind: string; name?: string; parent?: string; package?: string; attrs?: Record<string, unknown> }
    await run(res, () => addNode(p, kind, { name: name ?? '', parent, package: pkg, attrs: attrs ?? {} })) })
  r.put('/node', async (req, res) => { const p = await root(req, res); if (!p) return
    const { id, set, unset } = req.body as { id: string; set?: Record<string, unknown>; unset?: string[] }
    await run(res, () => updateNode(p, id, set ?? {}, unset ?? [])) })
  r.delete('/node', async (req, res) => { const p = await root(req, res); if (!p) return
    const { id } = req.body as { id: string }
    await run(res, () => removeNode(p, id)) })
  r.post('/edge', async (req, res) => { const p = await root(req, res); if (!p) return
    const { from, rel, to, attrs } = req.body as { from: string; rel: string; to: string; attrs?: Record<string, unknown> }
    await run(res, () => connect(p, from, rel, to, attrs ?? {})) })
  r.put('/edge', async (req, res) => { const p = await root(req, res); if (!p) return
    const { from, rel, to, set, unset } = req.body as { from: string; rel: string; to: string; set?: Record<string, unknown>; unset?: string[] }
    await run(res, () => updateEdge(p, from, rel, to, set ?? {}, unset ?? [])) })
  r.delete('/edge', async (req, res) => { const p = await root(req, res); if (!p) return
    const { from, rel, to } = req.body as { from: string; rel: string; to: string }
    await run(res, () => disconnect(p, from, rel, to)) })

  return r
}

function msg(e: unknown): string { return e instanceof Error ? e.message : String(e) }
