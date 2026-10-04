// REST API wrapping @dcddp/core for the kg-web client.
// All endpoints scoped to the "current project" from config (except /projects/* itself).

import { readFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import express from 'express'
import type { Request, Response } from 'express'
import {
  loadGraph, nodeReader, addNode, updateNode, connect, removeNode, disconnect,
  addValueType, updateValueType, removeValueType, listUserValueTypes,
  listPrimitives, listValueTypeKinds,
  NODE_KINDS, REL_KINDS, NODE_LAYERS, REL_GROUPS,
  VALUE_TYPE_KINDS, VALUE_TYPE_PRIMITIVES,
  allowedSourceKinds, allowedTargetKinds,
  checkRequiredRels, nodeStorageLines, endpointStorageLines, INDEX_FILE,
  type Graph,
} from '@dcddp/core'
import { loadConfig, saveConfig, currentProjectPath, type Project } from './config.ts'
import { scaffoldNewModel } from './scaffold.ts'
import { loadWorkbenchStore, saveWorkbenchStore, type Workbench } from './workbench.ts'

// The client addresses nodes as `<kind>:<handle>`; in 7.0 the handle is the opaque id.
// This adapter keeps that wire shape: node.id = "<kind>:<id>", nodesData keyed the same way.
const wireId = (g: Graph, id: string): string => `${g.nodes.find(n => n.id === id)?.kind ?? 'unknown'}:${id}`
function toWire(g: Graph) {
  const nodes = g.nodes.map(n => ({ id: `${n.kind}:${n.id}`, kind: n.kind, name: n.name, handle: n.id, parent: n.parent ? wireId(g, n.parent) : undefined, package: n.package }))
  const edges = g.edges.map(e => ({ id: e.id, from: wireId(g, e.from), to: wireId(g, e.to), rel: e.rel, targetKind: e.targetKind, attrs: e.attrs }))
  const nodesData: Record<string, Record<string, unknown>> = {}
  for (const n of g.nodes) nodesData[`${n.kind}:${n.id}`] = g.nodesData[n.id] ?? {}
  return { nodes, edges, nodesData }
}
async function load(root: string): Promise<Graph> {
  return loadGraph(root, nodeReader(root), { onWarn: () => {} })
}
void readFile

export function makeApi(): express.Router {
  const r = express.Router()
  r.use(express.json())

  // ---- Vocabulary (client renders menus from this) ----
  r.get('/vocabulary', (_req: Request, res: Response) => {
    // Serialize the vocabulary registry — trim to what the client needs.
    const nodeKinds = Object.values(NODE_KINDS).map(spec => ({
      kind: spec.kind,
      idForm: 'id' as const,
      idPrefix: spec.idPrefix,
      view: spec.view,
      parents: spec.parents,
      inline: !!spec.inline,
      valueType: !!spec.valueType,
      attrs: spec.attrs,
    }))
    const relKinds = Object.values(REL_KINDS).map(spec => ({
      kind: spec.kind,
      // Derived unions (union across all endpoints) — kept for menu-list backwards compat.
      sourceKinds: allowedSourceKinds(spec),
      targetKinds: allowedTargetKinds(spec),
      // Full endpoint list for endpoint-aware menus (client picks target-kind based on source-kind).
      // `derived: true` on an endpoint means it can't be created via connect — client menu should skip.
      endpoints: spec.endpoints.map(e => ({
        source: e.source,
        target: e.target,
        derived: e.storage.shape === 'derived',
        containment: e.storage.shape === 'containment',
        // Scalar-storage rels expose the field so the client can pop a target picker for it.
        scalarField: e.storage.shape === 'scalar' ? e.storage.field : undefined,
        // v7: required flag — source-kind nodes must have ≥1 edge of this rel to some
        // required target kind. Enforced by checkRequiredRels().
        required: e.required ?? false,
      })),
      edgeAttrs: spec.edgeAttrs,
      implicit: spec.implicit ?? false,
    }))
    // v7: extended payload for VocabRefSheet — grouping + storage summary + value-types.
    const nodeKindsRef = Object.values(NODE_KINDS).map(spec => ({
      kind: spec.kind,
      attrs: spec.attrs,
      idForm: 'id',
      idPrefix: spec.idPrefix,
      view: spec.view,
      parents: spec.parents,
      storage: nodeStorageLines(spec).join('; '),
    }))
    const relKindsRef = Object.values(REL_KINDS).map(spec => ({
      kind: spec.kind,
      implicit: spec.implicit ?? false,
      edgeAttrs: spec.edgeAttrs,
      endpoints: spec.endpoints.map(e => ({
        source: e.source,
        target: e.target,
        required: e.required ?? false,
        shape: e.storage.shape,
        storageSummary: endpointStorageLines(e, spec.edgeAttrs).join('; '),
      })),
    }))
    const valueTypes = {
      primitives: [...VALUE_TYPE_PRIMITIVES],
      userDefined: VALUE_TYPE_KINDS.map(kind => ({
        kind,
        container: `index.yaml under application / entity`,
        attrs: NODE_KINDS[kind].attrs,
      })),
    }
    res.json({
      nodeKinds, relKinds,
      // Extended reference bundle
      nodeLayers: NODE_LAYERS, relGroups: REL_GROUPS,
      nodeKindsRef, relKindsRef, valueTypes,
    })
  })

  // ---- Projects ----
  r.get('/projects', async (_req, res) => {
    const cfg = await loadConfig()
    res.json(cfg)
  })

  r.post('/projects', async (req, res) => {
    try {
      const { name, path } = req.body as { name?: string; path?: string }
      if (!name || !path) return res.status(400).json({ error: 'name + path required' })
      const cfg = await loadConfig()
      if (cfg.projects.some(p => p.name === name)) return res.status(409).json({ error: 'project name exists' })
      const project: Project = { name, path }
      cfg.projects.push(project)
      if (!cfg.current) cfg.current = name
      await saveConfig(cfg)
      res.json(cfg)
    } catch (e) {
      res.status(500).json({ error: msg(e) })
    }
  })

  r.delete('/projects/:name', async (req, res) => {
    try {
      const name = req.params.name
      const cfg = await loadConfig()
      cfg.projects = cfg.projects.filter(p => p.name !== name)
      if (cfg.current === name) cfg.current = cfg.projects[0]?.name ?? null
      await saveConfig(cfg)
      res.json(cfg)
    } catch (e) {
      res.status(500).json({ error: msg(e) })
    }
  })

  r.post('/projects/current', async (req, res) => {
    try {
      const { name } = req.body as { name?: string }
      const cfg = await loadConfig()
      if (name && !cfg.projects.some(p => p.name === name)) return res.status(404).json({ error: 'project not found' })
      cfg.current = name ?? null
      await saveConfig(cfg)
      res.json(cfg)
    } catch (e) {
      res.status(500).json({ error: msg(e) })
    }
  })

  r.post('/projects/scaffold', async (req, res) => {
    // Scaffold new empty model at path, then add (or reuse) project entry.
    try {
      const { name, path } = req.body as { name?: string; path?: string }
      if (!name || !path) return res.status(400).json({ error: 'name + path required' })
      await scaffoldNewModel(path)
      const cfg = await loadConfig()
      if (!cfg.projects.some(p => p.name === name)) cfg.projects.push({ name, path })
      cfg.current = name
      await saveConfig(cfg)
      res.json(cfg)
    } catch (e) {
      res.status(500).json({ error: msg(e) })
    }
  })

  r.post('/projects/:name/scaffold', async (req, res) => {
    // Scaffold into an already-registered project's directory (turns empty dir into a live model).
    try {
      const name = req.params.name
      const cfg = await loadConfig()
      const project = cfg.projects.find(p => p.name === name)
      if (!project) return res.status(404).json({ error: 'project not found' })
      await scaffoldNewModel(project.path)
      res.json({ ok: true })
    } catch (e) {
      res.status(500).json({ error: msg(e) })
    }
  })

  // ---- Model graph ----
  r.get('/model', async (_req, res) => {
    try {
      const root = await currentProjectPath()
      if (!root) return res.status(404).json({ error: 'no current project' })
      // Empty directory (no index.yaml) → tell client to offer scaffold, not an error.
      if (!(await fileExists(join(root, INDEX_FILE)))) {
        const legacy = await fileExists(join(root, 'business.yaml'))
        return res.json({ root, needsScaffold: !legacy, needsMigration: legacy, nodes: [], edges: [] })
      }
      const g = await load(root)
      const missing = checkRequiredRels(g.nodes, g.edges)
      const missingRequired: Record<string, string[]> = {}
      for (const m of missing) {
        const key = wireId(g, m.sourceId)
        missingRequired[key] = [...(missingRequired[key] ?? []), m.relKind]
      }
      res.json({ root, needsScaffold: false, ...toWire(g), missingRequired, warnings: g.warnings })
    } catch (e) {
      res.status(500).json({ error: msg(e) })
    }
  })

  // ---- Node mutations ----
  r.post('/node', async (req, res) => {
    try {
      const root = await currentProjectPath()
      if (!root) return res.status(404).json({ error: 'no current project' })
      const { kind, name, parent, package: pkg, attrs } = req.body as { kind?: string; name?: string; parent?: string; package?: string; attrs?: Record<string, unknown> }
      if (!kind || (!name && !NODE_KINDS[kind]?.inline)) return res.status(400).json({ error: 'kind + name required' })
      const r = await addNode(root, kind, { name: name ?? '', parent, package: pkg, attrs: attrs ?? {} })
      res.json({ ok: true, id: r.id, wireId: `${kind}:${r.id}` })
    } catch (e) {
      res.status(400).json({ error: msg(e) })
    }
  })

  r.delete('/node', async (req, res) => {
    try {
      const root = await currentProjectPath()
      if (!root) return res.status(404).json({ error: 'no current project' })
      const { kind, name } = req.body as { kind?: string; name?: string }
      if (!kind || !name) return res.status(400).json({ error: 'kind + name required' })
      const r = await removeNode(root, `${kind}:${name}`)
      res.json({ ok: true, ...r })
    } catch (e) {
      res.status(400).json({ error: msg(e) })
    }
  })

  r.put('/node', async (req, res) => {
    try {
      const root = await currentProjectPath()
      if (!root) return res.status(404).json({ error: 'no current project' })
      const { kind, name, set, unset } = req.body as {
        kind?: string; name?: string; set?: Record<string, unknown>; unset?: string[]
      }
      if (!kind || !name) return res.status(400).json({ error: 'kind + name required' })
      const result = await updateNode(root, `${kind}:${name}`, set ?? {}, unset ?? [])
      res.json({ ok: true, ...result })
    } catch (e) {
      res.status(400).json({ error: msg(e) })
    }
  })

  // ---- Edge mutations ----
  r.post('/edge', async (req, res) => {
    try {
      const root = await currentProjectPath()
      if (!root) return res.status(404).json({ error: 'no current project' })
      const { from, rel, toKind, toName, attrs } = req.body as {
        from?: string; rel?: string; toKind?: string; toName?: string; attrs?: Record<string, unknown>
      }
      if (!from || !rel || !toKind || !toName) return res.status(400).json({ error: 'from + rel + toKind + toName required' })
      await connect(root, from, rel, `${toKind}:${toName}`, attrs ?? {})
      res.json({ ok: true })
    } catch (e) {
      res.status(400).json({ error: msg(e) })
    }
  })

  r.delete('/edge', async (req, res) => {
    try {
      const root = await currentProjectPath()
      if (!root) return res.status(404).json({ error: 'no current project' })
      const { from, rel, toKind, toName } = req.body as { from?: string; rel?: string; toKind?: string; toName?: string }
      if (!from || !rel || !toKind || !toName) return res.status(400).json({ error: 'from + rel + toKind + toName required' })
      await disconnect(root, from, rel, `${toKind}:${toName}`)
      res.json({ ok: true })
    } catch (e) {
      res.status(400).json({ error: msg(e) })
    }
  })

  // ---- Workbenches (per-project, persisted at `<project>/.dcddp-workbenches.json`) ----

  r.get('/workbenches', async (_req, res) => {
    try {
      const root = await currentProjectPath()
      if (!root) return res.status(404).json({ error: 'no current project' })
      res.json(await loadWorkbenchStore(root))
    } catch (e) { res.status(500).json({ error: msg(e) }) }
  })

  r.post('/workbenches', async (req, res) => {
    try {
      const root = await currentProjectPath()
      if (!root) return res.status(404).json({ error: 'no current project' })
      const { name } = req.body as { name?: string }
      if (!name) return res.status(400).json({ error: 'name required' })
      const store = await loadWorkbenchStore(root)
      if (store.workbenches.some(w => w.name === name)) return res.status(409).json({ error: 'workbench name exists' })
      const wb: Workbench = { name, nodeIds: [], viewMode: 'graph' }
      store.workbenches.push(wb)
      if (!store.currentWorkbench) store.currentWorkbench = name
      await saveWorkbenchStore(root, store)
      res.json(store)
    } catch (e) { res.status(500).json({ error: msg(e) }) }
  })

  r.put('/workbenches/:name', async (req, res) => {
    try {
      const root = await currentProjectPath()
      if (!root) return res.status(404).json({ error: 'no current project' })
      const name = req.params.name
      const patch = req.body as Partial<Workbench>
      const store = await loadWorkbenchStore(root)
      const wb = store.workbenches.find(w => w.name === name)
      if (!wb) return res.status(404).json({ error: 'workbench not found' })
      if (patch.name !== undefined && patch.name !== name) {
        if (store.workbenches.some(w => w.name === patch.name)) return res.status(409).json({ error: 'workbench name exists' })
        if (store.currentWorkbench === name) store.currentWorkbench = patch.name
        wb.name = patch.name
      }
      if (patch.nodeIds !== undefined) wb.nodeIds = patch.nodeIds
      if (patch.viewMode !== undefined) wb.viewMode = patch.viewMode
      if (patch.rootNodeId !== undefined) wb.rootNodeId = patch.rootNodeId
      if (patch.treeRels !== undefined) wb.treeRels = patch.treeRels
      await saveWorkbenchStore(root, store)
      res.json(store)
    } catch (e) { res.status(500).json({ error: msg(e) }) }
  })

  r.delete('/workbenches/:name', async (req, res) => {
    try {
      const root = await currentProjectPath()
      if (!root) return res.status(404).json({ error: 'no current project' })
      const name = req.params.name
      const store = await loadWorkbenchStore(root)
      store.workbenches = store.workbenches.filter(w => w.name !== name)
      if (store.currentWorkbench === name) store.currentWorkbench = store.workbenches[0]?.name ?? null
      await saveWorkbenchStore(root, store)
      res.json(store)
    } catch (e) { res.status(500).json({ error: msg(e) }) }
  })

  r.post('/current-workbench', async (req, res) => {
    try {
      const root = await currentProjectPath()
      if (!root) return res.status(404).json({ error: 'no current project' })
      const { name } = req.body as { name?: string | null }
      const store = await loadWorkbenchStore(root)
      if (name && !store.workbenches.some(w => w.name === name)) return res.status(404).json({ error: 'workbench not found' })
      store.currentWorkbench = name ?? null
      await saveWorkbenchStore(root, store)
      res.json(store)
    } catch (e) { res.status(500).json({ error: msg(e) }) }
  })

  // ---- Value-types (v6) ----

  r.get('/vt', async (_req, res) => {
    try {
      const root = await currentProjectPath()
      if (!root) return res.status(404).json({ error: 'no current project' })
      const items = listUserValueTypes(await load(root))
      res.json({
        primitives: listPrimitives(),
        userKinds: listValueTypeKinds(),
        userItems: items,
      })
    } catch (e) { res.status(500).json({ error: msg(e) }) }
  })

  r.post('/vt', async (req, res) => {
    try {
      const root = await currentProjectPath()
      if (!root) return res.status(404).json({ error: 'no current project' })
      const { kind, name, parent, attrs } = req.body as { kind?: string; name?: string; parent?: string; attrs?: Record<string, unknown> }
      if (!kind || !name || !parent) return res.status(400).json({ error: 'kind + name + parent required' })
      const r = await addValueType(root, kind, name, parent, attrs ?? {})
      res.json({ ok: true, id: r.id })
    } catch (e) { res.status(400).json({ error: msg(e) }) }
  })

  r.put('/vt', async (req, res) => {
    try {
      const root = await currentProjectPath()
      if (!root) return res.status(404).json({ error: 'no current project' })
      const { kind, name, set, unset } = req.body as {
        kind?: string; name?: string; set?: Record<string, unknown>; unset?: string[]
      }
      if (!kind || !name) return res.status(400).json({ error: 'kind + name required' })
      const result = await updateValueType(root, kind, name, set ?? {}, unset ?? [])
      res.json({ ok: true, ...result })
    } catch (e) { res.status(400).json({ error: msg(e) }) }
  })

  r.delete('/vt', async (req, res) => {
    try {
      const root = await currentProjectPath()
      if (!root) return res.status(404).json({ error: 'no current project' })
      const { kind, name } = req.body as { kind?: string; name?: string }
      if (!kind || !name) return res.status(400).json({ error: 'kind + name required' })
      await removeValueType(root, kind, name)
      res.json({ ok: true })
    } catch (e) { res.status(400).json({ error: msg(e) }) }
  })

  return r
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

async function fileExists(p: string): Promise<boolean> {
  try { await access(p); return true } catch { return false }
}
