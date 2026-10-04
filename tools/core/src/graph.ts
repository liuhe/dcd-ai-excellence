// Graph ops (schema 7.0) — add-node / update-node / move-node / remove-node /
// connect / update-edge / disconnect against the on-disk model.
//
// Every op: load the graph (to resolve refs + find detail files), mutate index.yaml and/or
// the relevant detail file through yaml@2 documents (comments / order preserved), write.
// No hardcoded per-kind knowledge — placement and storage come from the vocabulary.

import { join, dirname, basename } from 'node:path'
import { readFile, writeFile, mkdir, rm, rename, readdir, stat, access } from 'node:fs/promises'
import { parseDocument, YAMLMap, YAMLSeq, isMap, isSeq, isScalar, type Document } from 'yaml'
import { nodeReader } from './reader.ts'
import { loadGraph, resolveRef, DETAIL_DIRS } from './loader.ts'
import * as idx from './index-file.ts'
import {
  nodeSpec, relSpec, resolveEndpoint, locationFor, EXT_ATTR, type NodeKindSpec, type RelEndpoint,
} from './vocabulary.ts'
import type { Graph, GNode } from './types.ts'
import { cleanReferencesToDeleted } from './ref-cleanup.ts'

// A detail file longer than this gets sharded: new entries go to `<file>/<shard>.yaml`.
// Override with DCDDP_SHARD_LINES (tests use a tiny value).
export const SHARD_THRESHOLD_LINES = Number((typeof process !== 'undefined' && process.env?.DCDDP_SHARD_LINES) || 400)

export interface Coerced { [k: string]: unknown }

// -------------------- --set parsing --------------------

function coerce(v: string): unknown {
  if (v === 'true') return true
  if (v === 'false') return false
  if (v === 'null') return null
  if (/^-?\d+$/.test(v)) return Number(v)
  if (/^-?\d+\.\d+$/.test(v)) return Number(v)
  // Structured values: JSON arrays / objects (e.g. --set 'fields=[{"id":"Long, pk"}]')
  if ((v.startsWith('[') && v.endsWith(']')) || (v.startsWith('{') && v.endsWith('}'))) {
    try { return JSON.parse(v) } catch { /* keep as string */ }
  }
  return v
}

export function parseSetKvs(kvs: string[]): Coerced {
  const out: Coerced = {}
  for (const kv of kvs) {
    const i = kv.indexOf('=')
    if (i < 0) throw new Error(`--set expects key=value, got: ${kv}`)
    out[kv.slice(0, i)] = coerce(kv.slice(i + 1))
  }
  return out
}

function checkAttrs(spec: NodeKindSpec, attrs: Coerced): void {
  const allowed = new Set(['name', EXT_ATTR, ...spec.attrs.map(a => a.name)])
  for (const key of Object.keys(attrs)) {
    const top = key.split('.')[0]
    if (allowed.has(top)) continue
    process.stderr.write(`warning: attr "${key}" not in vocabulary for ${spec.kind}. Writing anyway; add to vocabulary.ts if intentional.\n`)
  }
}

// -------------------- fs / yaml helpers --------------------

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true } catch { return false }
}

type YDoc = Document.Parsed

async function openDoc(abs: string): Promise<YDoc> {
  if (await exists(abs)) return parseDocument(await readFile(abs, 'utf-8'), { keepSourceTokens: true })
  return parseDocument('{}\n')
}

async function saveDoc(abs: string, doc: YDoc): Promise<void> {
  await mkdir(dirname(abs), { recursive: true })
  await writeFile(abs, doc.toString({ lineWidth: 120, indent: 2 }), 'utf-8')
}

function rootMap(doc: YDoc): YAMLMap {
  if (!doc.contents || !isMap(doc.contents)) {
    const m = new YAMLMap()
    doc.contents = m as unknown as typeof doc.contents
    return m
  }
  // An empty file scaffolded as `{}` is a flow mapping; everything added under it would inherit
  // flow (JSON-like) style. Entries are always written in block style.
  const root = doc.contents as YAMLMap
  root.flow = false
  return root
}

function getOrCreateSeq(m: YAMLMap, key: string): YAMLSeq {
  const v = m.get(key, true)
  if (isSeq(v)) return v as YAMLSeq
  const s = new YAMLSeq()
  m.set(key, s)
  return s
}

function str(m: YAMLMap, key: string): string | undefined {
  const v = m.get(key, true)
  if (isScalar(v)) { const val = (v as { value: unknown }).value; return val == null ? undefined : String(val) }
  return undefined
}

function findInSeqById(seq: YAMLSeq, id: string): { map: YAMLMap; index: number } | undefined {
  for (let i = 0; i < seq.items.length; i++) {
    const it = seq.items[i]
    if (isMap(it) && str(it as YAMLMap, 'id') === id) return { map: it as YAMLMap, index: i }
  }
  return undefined
}

function setPath(m: YAMLMap, path: string, value: unknown): void {
  const parts = path.split('.')
  let cur = m
  for (let i = 0; i < parts.length - 1; i++) {
    const next = cur.get(parts[i], true)
    if (isMap(next)) cur = next as YAMLMap
    else { const fresh = new YAMLMap(); cur.set(parts[i], fresh); cur = fresh }
  }
  cur.set(parts[parts.length - 1], value)
}

function unsetPath(m: YAMLMap, path: string): void {
  const parts = path.split('.')
  let cur = m
  for (let i = 0; i < parts.length - 1; i++) {
    const next = cur.get(parts[i], true)
    if (!isMap(next)) return
    cur = next as YAMLMap
  }
  cur.delete(parts[parts.length - 1])
}

function getSeqAtPath(m: YAMLMap, path: string, create: boolean): YAMLSeq | undefined {
  const parts = path.split('.')
  let cur = m
  for (let i = 0; i < parts.length - 1; i++) {
    const next = cur.get(parts[i], true)
    if (isMap(next)) cur = next as YAMLMap
    else if (create) { const fresh = new YAMLMap(); cur.set(parts[i], fresh); cur = fresh }
    else return undefined
  }
  const leaf = cur.get(parts[parts.length - 1], true)
  if (isSeq(leaf)) return leaf as YAMLSeq
  if (!create) return undefined
  const s = new YAMLSeq()
  cur.set(parts[parts.length - 1], s)
  return s
}

// -------------------- Model access --------------------

async function load(root: string): Promise<Graph> {
  return loadGraph(root, nodeReader(root), { onWarn: () => {} })
}

async function readIndexDoc(root: string): Promise<idx.IndexDoc> {
  const p = join(root, idx.INDEX_FILE)
  if (!(await exists(p))) throw new Error(`${idx.INDEX_FILE} not found under ${root}`)
  return idx.parseIndexDoc(await readFile(p, 'utf-8'))
}

async function writeIndexDoc(root: string, doc: idx.IndexDoc): Promise<void> {
  await writeFile(join(root, idx.INDEX_FILE), idx.serializeIndexDoc(doc), 'utf-8')
}

export function slug(name: string): string {
  return name.trim().replace(/[\s/\\]+/g, '-').replace(/[<>:"|?*]/g, '').replace(/[A-Z]/g, c => c.toLowerCase()) || 'app'
}

function ancestorKinds(g: Graph, node: GNode | undefined): string[] {
  const out: string[] = []
  let cur = node
  while (cur) { out.push(cur.kind); cur = cur.parent ? g.nodes.find(n => n.id === cur!.parent) : undefined }
  return out
}

function appAncestor(g: Graph, node: GNode | undefined): GNode | undefined {
  let cur = node
  while (cur) { if (cur.kind === 'application') return cur; cur = cur.parent ? g.nodes.find(n => n.id === cur!.parent) : undefined }
  return undefined
}

// applications/<app-id>-<name>/ — find existing (by id prefix) or compute the default.
export async function appDir(root: string, app: GNode): Promise<string> {
  const base = join(root, 'applications')
  try {
    for (const name of await readdir(base)) {
      if (name === app.id || name.startsWith(`${app.id}-`)) {
        const st = await stat(join(base, name))
        if (st.isDirectory()) return join(base, name)
      }
    }
  } catch { /* no applications dir yet */ }
  return join(base, `${app.id}-${slug(app.name)}`)
}

// Default detail file for a new entry of `kind` placed under `parent` (may shard).
async function defaultDetailFile(root: string, g: Graph, kind: string, parent: GNode | undefined, shardKey: string): Promise<string> {
  const loc = locationFor(kind, ancestorKinds(g, parent))
  let file: string
  if (loc.dir === 'business') file = join(root, 'business', `${loc.file}.yaml`)
  else if (loc.dir === 'applications') file = join(root, 'applications', `${loc.file}.yaml`)
  else if (loc.dir === 'deployment') file = join(root, 'deployment', `${loc.file}.yaml`)
  else {
    const app = parent?.kind === 'application' ? parent : appAncestor(g, parent)
    if (!app) throw new Error(`${kind} must live under an application`)
    file = join(await appDir(root, app), `${loc.file}.yaml`)
  }
  if (await exists(file)) {
    const lines = (await readFile(file, 'utf-8')).split('\n').length
    if (lines > SHARD_THRESHOLD_LINES) {
      return join(dirname(file), basename(file, '.yaml'), `${slug(shardKey) || '_'}.yaml`)
    }
  }
  return file
}

interface Located { file: string; doc: YDoc; map: YAMLMap; seq: YAMLSeq; index: number }

// Find (or create as a stub) the detail entry for a node. Inline nodes resolve inside their owner.
async function locateEntry(root: string, g: Graph, node: GNode, create: boolean): Promise<Located | undefined> {
  const spec = nodeSpec(node.kind)
  if (spec.inline) {
    const owner = g.nodes.find(n => n.id === node.parent)
    if (!owner) throw new Error(`${node.id}: owner ${node.parent} not found`)
    const ownerLoc = await locateEntry(root, g, owner, create)
    if (!ownerLoc) return undefined
    const seq = getOrCreateSeq(ownerLoc.map, spec.inline.key)
    const hit = findInSeqById(seq, node.id)
    if (hit) return { file: ownerLoc.file, doc: ownerLoc.doc, map: hit.map, seq, index: hit.index }
    if (!create) return undefined
    const m = new YAMLMap(); m.set('id', node.id); seq.add(m)
    return { file: ownerLoc.file, doc: ownerLoc.doc, map: m, seq, index: seq.items.length - 1 }
  }
  if (node.file) {
    const file = join(root, node.file)
    const doc = await openDoc(file)
    const seq = getOrCreateSeq(rootMap(doc), node.kind)
    const hit = findInSeqById(seq, node.id)
    if (hit) return { file, doc, map: hit.map, seq, index: hit.index }
  }
  if (!create) return undefined
  const parent = node.parent ? g.nodes.find(n => n.id === node.parent) : undefined
  const file = await defaultDetailFile(root, g, node.kind, parent, parent?.id ?? node.name)
  const doc = await openDoc(file)
  const seq = getOrCreateSeq(rootMap(doc), node.kind)
  const m = new YAMLMap(); m.set('id', node.id); m.set('name', node.name); seq.add(m)
  return { file, doc, map: m, seq, index: seq.items.length - 1 }
}

// -------------------- Node CRUD --------------------

export interface AddNodeOptions {
  name: string
  parent?: string        // ref of containing node (required for non-root kinds)
  package?: string       // package path in index, e.g. "Auth/Login"
  attrs?: Coerced
}

export async function addNode(root: string, kind: string, opts: AddNodeOptions): Promise<{ id: string; file: string }> {
  const spec = nodeSpec(kind)
  const attrs = { ...(opts.attrs ?? {}) }
  delete attrs.name
  checkAttrs(spec, attrs)
  const g = await load(root)
  const parent = opts.parent ? resolveRef(g, opts.parent) : undefined
  if (parent && !spec.parents.includes(parent.kind)) {
    throw new Error(`${kind} cannot be placed under ${parent.kind} (allowed: ${spec.parents.join(', ') || 'none'})`)
  }
  if (!parent && !spec.view) throw new Error(`${kind} requires --parent (one of: ${spec.parents.join(', ')})`)
  if (spec.singleton && g.nodes.some(n => n.kind === kind)) {
    throw new Error(`${kind} is singleton: model already has one — remove the existing ${kind} before adding another`)
  }
  if (spec.inline && !parent) throw new Error(`${kind} requires --parent`)

  const indexDoc = await readIndexDoc(root)
  const id = idx.allocateId(indexDoc, kind)
  if (!spec.inline) idx.addEntry(indexDoc, kind, id, opts.name, parent?.id, opts.package)
  await writeIndexDoc(root, indexDoc)

  const node: GNode = { id, kind, name: opts.name, handle: id, view: parent?.view ?? spec.view!, parent: parent?.id }
  g.nodes.push(node)
  if (parent?.kind === 'application' || kind === 'application') {
    // make sure an application directory exists for app-scoped children
    if (kind === 'application') await mkdir(await appDir(root, node), { recursive: true })
  }
  const loc = (await locateEntry(root, g, node, true))!
  if (spec.inline && opts.name) loc.map.set('name', opts.name)
  for (const [k, v] of Object.entries(attrs)) setPath(loc.map, k, v)
  await saveDoc(loc.file, loc.doc)
  return { id, file: loc.file }
}

export async function updateNode(root: string, ref: string, set: Coerced, unset: string[]): Promise<{ id: string; file: string; changed: number }> {
  const g = await load(root)
  const node = resolveRef(g, ref)
  const spec = nodeSpec(node.kind)
  const attrs = { ...set }
  let changed = 0

  // Index-level changes: name / package / parent
  const newName = typeof attrs.name === 'string' ? attrs.name : undefined
  const pkg = 'package' in attrs ? (attrs.package == null ? null : String(attrs.package)) : undefined
  const parentRef = 'parent' in attrs ? (attrs.parent == null ? null : String(attrs.parent)) : undefined
  delete attrs.name; delete attrs.package; delete attrs.parent
  checkAttrs(spec, attrs)
  if (newName !== undefined || pkg !== undefined || parentRef !== undefined || unset.includes('package')) {
    if (spec.inline && (pkg !== undefined || parentRef !== undefined)) throw new Error(`${node.kind} is inline — cannot move it`)
    const indexDoc = await readIndexDoc(root)
    if (newName !== undefined && !spec.inline) { idx.renameEntry(indexDoc, node.id, newName); changed++ }
    if (pkg !== undefined || parentRef !== undefined || unset.includes('package')) {
      const parentId = parentRef === undefined ? undefined : (parentRef === null ? null : resolveRef(g, parentRef).id)
      if (parentId) {
        const pk = g.nodes.find(n => n.id === parentId)!.kind
        if (!spec.parents.includes(pk)) throw new Error(`${node.kind} cannot be placed under ${pk}`)
      }
      if (parentId === null && !spec.view) throw new Error(`${node.kind} must have a parent`)
      idx.moveEntry(indexDoc, node.id, { parentId, packagePath: unset.includes('package') ? null : pkg })
      changed++
    }
    await writeIndexDoc(root, indexDoc)
    if (newName !== undefined && node.kind === 'application') {
      const oldDir = await appDir(root, node)
      const newDir = join(root, 'applications', `${node.id}-${slug(newName)}`)
      if (await exists(oldDir) && oldDir !== newDir) await rename(oldDir, newDir)
    }
  }

  const remaining = unset.filter(k => k !== 'package')
  if (Object.keys(attrs).length || remaining.length || newName !== undefined) {
    const loc = (await locateEntry(root, g, node, true))!
    if (newName !== undefined) loc.map.set('name', newName)
    for (const [k, v] of Object.entries(attrs)) { setPath(loc.map, k, v); changed++ }
    for (const k of remaining) { unsetPath(loc.map, k); changed++ }
    await saveDoc(loc.file, loc.doc)
    return { id: node.id, file: loc.file, changed }
  }
  return { id: node.id, file: join(root, idx.INDEX_FILE), changed }
}

export async function moveNode(root: string, ref: string, opts: { parent?: string | null; package?: string | null }): Promise<{ id: string }> {
  const set: Coerced = {}
  if (opts.parent !== undefined) set.parent = opts.parent
  if (opts.package !== undefined) set.package = opts.package
  const r = await updateNode(root, ref, set, [])
  return { id: r.id }
}

export async function removeNode(root: string, ref: string): Promise<{ id: string; removedIds: string[]; files: string[] }> {
  const g = await load(root)
  const node = resolveRef(g, ref)
  const spec = nodeSpec(node.kind)
  const files = new Set<string>()

  // Subtree: index descendants + inline children of each.
  const subtree: string[] = []
  const walk = (id: string) => { subtree.push(id); for (const c of g.nodes.filter(n => n.parent === id)) walk(c.id) }
  walk(node.id)

  if (!spec.inline) {
    const indexDoc = await readIndexDoc(root)
    idx.removeEntry(indexDoc, node.id)
    await writeIndexDoc(root, indexDoc)
    files.add(join(root, idx.INDEX_FILE))
  }

  // Delete detail entries (deepest first so inline children go before owners).
  for (const id of [...subtree].reverse()) {
    const n = g.nodes.find(x => x.id === id)!
    const loc = await locateEntry(root, g, n, false)
    if (!loc) continue
    loc.seq.delete(loc.index)
    await saveDoc(loc.file, loc.doc)
    files.add(loc.file)
  }

  // Application: drop its directory if nothing else lives there.
  if (node.kind === 'application') {
    const dir = await appDir(root, node)
    if (await exists(dir)) {
      const reader = nodeReader(root)
      const rel = dir.slice(root.length + 1)
      const remaining = await reader.listYaml(rel)
      let hasEntries = false
      for (const f of remaining) {
        const doc = await openDoc(join(root, f))
        for (const pair of rootMap(doc).items) if (isSeq(pair.value) && (pair.value as YAMLSeq).items.length) hasEntries = true
      }
      if (!hasEntries) await rm(dir, { recursive: true, force: true })
    }
  }

  const cleaned = await cleanReferencesToDeleted(root, subtree)
  for (const f of cleaned.modifiedFiles) files.add(f)
  return { id: node.id, removedIds: subtree, files: [...files] }
}

// -------------------- Edge CRUD --------------------

function storageOf(relKind: string, srcKind: string, toKind: string): RelEndpoint {
  const rel = relSpec(relKind)
  if (rel.implicit) throw new Error(`rel "${relKind}" is containment — express it by placing the node (add-node --parent / update-node --set parent=...)`)
  const ep = resolveEndpoint(rel, srcKind, toKind)
  if (ep.storage.shape === 'derived') throw new Error(`rel "${relKind}" (${srcKind}→${toKind}) is derived — edit the underlying attribute instead`)
  return ep
}

export async function connect(root: string, fromRef: string, relKind: string, toRef: string, edgeAttrs: Coerced = {}): Promise<{ file: string; from: string; to: string }> {
  const g = await load(root)
  const src = resolveRef(g, fromRef)
  const dst = resolveRef(g, toRef)
  const rel = relSpec(relKind)
  const ep = storageOf(relKind, src.kind, dst.kind)
  for (const k of Object.keys(edgeAttrs)) if (!rel.edgeAttrs.includes(k)) process.stderr.write(`warning: attr "${k}" not in vocabulary for rel "${relKind}". Writing anyway.\n`)
  const loc = (await locateEntry(root, g, src, true))!
  const s = ep.storage
  if (s.shape === 'string-list') {
    const seq = getSeqAtPath(loc.map, s.field, true)!
    if (seq.items.some(it => isScalar(it) && (it as { value: unknown }).value === dst.id)) throw new Error(`edge ${src.id} --${relKind}--> ${dst.id} already exists`)
    seq.add(dst.id)
  } else if (s.shape === 'scalar') {
    if (loc.map.has(s.field)) throw new Error(`${s.field} already set on ${src.id} (${str(loc.map, s.field)}); disconnect first`)
    setPath(loc.map, s.field, dst.id)
  } else if (s.shape === 'struct-list') {
    const seq = getSeqAtPath(loc.map, s.field, true)!
    const dup = seq.items.find(it => isMap(it)
      && (!s.kindField || str(it as YAMLMap, s.kindField) === s.kindValue)
      && str(it as YAMLMap, s.targetField) === dst.id)
    if (dup) throw new Error(`edge ${src.id} --${relKind}--> ${dst.id} already exists`)
    const m = new YAMLMap()
    if (s.kindField && s.kindValue) m.set(s.kindField, s.kindValue)
    m.set(s.targetField, dst.id)
    for (const [k, v] of Object.entries(edgeAttrs)) m.set(k, v)
    seq.add(m)
  }
  await saveDoc(loc.file, loc.doc)
  return { file: loc.file, from: src.id, to: dst.id }
}

export async function disconnect(root: string, fromRef: string, relKind: string, toRef: string): Promise<{ file: string; from: string; to: string }> {
  const g = await load(root)
  const src = resolveRef(g, fromRef)
  const dst = resolveRef(g, toRef)
  const ep = storageOf(relKind, src.kind, dst.kind)
  const loc = await locateEntry(root, g, src, false)
  if (!loc) throw new Error(`edge not found`)
  const s = ep.storage
  if (s.shape === 'string-list') {
    const seq = getSeqAtPath(loc.map, s.field, false)
    const i = seq ? seq.items.findIndex(it => isScalar(it) && (it as { value: unknown }).value === dst.id) : -1
    if (i < 0) throw new Error(`edge not found`)
    seq!.delete(i)
  } else if (s.shape === 'scalar') {
    if (str(loc.map, s.field) !== dst.id) throw new Error(`edge not found`)
    loc.map.delete(s.field)
  } else if (s.shape === 'struct-list') {
    const seq = getSeqAtPath(loc.map, s.field, false)
    const i = seq ? seq.items.findIndex(it => isMap(it)
      && (!s.kindField || str(it as YAMLMap, s.kindField) === s.kindValue)
      && str(it as YAMLMap, s.targetField) === dst.id) : -1
    if (i < 0) throw new Error(`edge not found`)
    seq!.delete(i)
  }
  await saveDoc(loc.file, loc.doc)
  return { file: loc.file, from: src.id, to: dst.id }
}

export async function updateEdge(root: string, fromRef: string, relKind: string, toRef: string, set: Coerced, unset: string[]): Promise<{ file: string; changed: number }> {
  const g = await load(root)
  const src = resolveRef(g, fromRef)
  const dst = resolveRef(g, toRef)
  const ep = storageOf(relKind, src.kind, dst.kind)
  if (ep.storage.shape !== 'struct-list') throw new Error(`rel "${relKind}" (${src.kind}→${dst.kind}) is stored as ${ep.storage.shape} — no edge attrs to update`)
  const loc = await locateEntry(root, g, src, false)
  if (!loc) throw new Error(`edge not found`)
  const s = ep.storage
  const seq = getSeqAtPath(loc.map, s.field, false)
  const item = seq?.items.find(it => isMap(it)
    && (!s.kindField || str(it as YAMLMap, s.kindField) === s.kindValue)
    && str(it as YAMLMap, s.targetField) === dst.id) as YAMLMap | undefined
  if (!item) throw new Error(`edge not found`)
  let changed = 0
  for (const [k, v] of Object.entries(set)) { item.set(k, v); changed++ }
  for (const k of unset) { item.delete(k); changed++ }
  await saveDoc(loc.file, loc.doc)
  return { file: loc.file, changed }
}

// -------------------- Scaffold --------------------

export async function scaffoldModel(root: string, orgName: string): Promise<void> {
  if (await exists(join(root, idx.INDEX_FILE))) throw new Error(`model already exists at ${root} (${idx.INDEX_FILE} present)`)
  await mkdir(join(root, 'business'), { recursive: true })
  await mkdir(join(root, 'applications'), { recursive: true })
  await writeFile(join(root, idx.INDEX_FILE), idx.emptyIndexText(), 'utf-8')
  await addNode(root, 'organization', { name: orgName })
}

export { DETAIL_DIRS }
