// Model loader (schema 7.0): index.yaml + flat detail files → Graph.
//
//   1. index.yaml gives every node (id, name, kind, parent, package, view).
//   2. Every *.yaml under business/ and applications/ is a detail file: a map of
//      <kind> → [entries], each entry keyed by `id`. File boundaries carry no meaning.
//      Inline kinds (rules) live inside their owner's entry under the inline key.
//   3. Edges: containment from index nesting / inline placement; explicit edges from the
//      storage shapes declared in the vocabulary; derived edges (field-type) computed here.

import yaml from 'js-yaml'
import { NODE_KINDS, REL_KINDS, inlineKindsOf, kindOfId, type RelEndpoint, type RelKindSpec } from './vocabulary.ts'
import { INDEX_FILE, parseIndex, walkIndex } from './index-file.ts'
import type { ModelReader } from './reader.ts'
import type { Graph, GNode, GEdge, LoadWarning, ModelIndex } from './types.ts'
import { CURRENT_SCHEMA_VERSION } from './version.ts'

export const DETAIL_DIRS = ['business', 'applications', 'deployment']
export const DEPLOYMENT_FILE = 'deployment.yaml'
// Non-kind top-level keys allowed in detail files (carried through as extras).
const EXTRA_KEYS = new Set(['topology'])

export interface LoadOptions {
  // Called for each warning as it is produced (in addition to graph.warnings).
  onWarn?: (w: LoadWarning) => void
}

export async function loadGraph(root: string, reader: ModelReader, options: LoadOptions = {}): Promise<Graph> {
  const warnings: LoadWarning[] = []
  const warn = (w: LoadWarning) => { warnings.push(w); options.onWarn?.(w) }

  // ---- 1. index ----
  if (!(await reader.exists(INDEX_FILE))) {
    throw new Error(`${INDEX_FILE} not found under ${root} — not a 7.0 model (run \`dcddp migrate\` for older models)`)
  }
  const index: ModelIndex = parseIndex(await reader.readText(INDEX_FILE), warnings)
  const schemaVersion = index.schemaVersion || CURRENT_SCHEMA_VERSION

  const nodes: GNode[] = []
  const byId = new Map<string, GNode>()
  for (const { entry, parent, view } of walkIndex(index)) {
    if (byId.has(entry.id)) {
      warn({ code: 'duplicate-entry', message: `index.yaml lists ${entry.id} more than once`, file: INDEX_FILE, nodeId: entry.id })
      continue
    }
    const expected = kindOfId(entry.id)
    if (expected && expected !== entry.kind) {
      warn({ code: 'bad-nesting', message: `${entry.id} is listed as ${entry.kind} but its prefix says ${expected}`, file: INDEX_FILE, nodeId: entry.id })
    }
    const node: GNode = { id: entry.id, kind: entry.kind, name: entry.name, handle: entry.id, view, parent: parent?.id, package: entry.package }
    nodes.push(node)
    byId.set(entry.id, node)
  }

  // ---- 2. detail files ----
  const nodesData: Record<string, Record<string, unknown>> = {}
  const extras: Graph['extras'] = {}
  const seenEntry = new Map<string, string>() // id → file

  for (const dir of DETAIL_DIRS) {
    for (const file of await reader.listYaml(dir)) {
      let data: unknown
      try { data = yaml.load(await reader.readText(file)) } catch (e) {
        warn({ code: 'bad-file', message: `${file}: ${e instanceof Error ? e.message : String(e)}`, file })
        continue
      }
      if (data == null) continue
      if (typeof data !== 'object' || Array.isArray(data)) {
        warn({ code: 'bad-file', message: `${file}: expected a map of <kind> → [entries]`, file })
        continue
      }
      for (const [key, list] of Object.entries(data as Record<string, unknown>)) {
        if (EXTRA_KEYS.has(key)) {
          if (key === 'topology' && Array.isArray(list)) extras.topology = [...(extras.topology ?? []), ...list]
          continue
        }
        if (!(key in NODE_KINDS)) {
          warn({ code: 'unknown-key', message: `${file}: unknown top-level key "${key}" (expected a node kind)`, file })
          continue
        }
        if (!Array.isArray(list)) {
          warn({ code: 'bad-file', message: `${file}: ${key} must be a list of entries`, file })
          continue
        }
        for (const raw of list) {
          if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
          const entry = raw as Record<string, unknown>
          const id = typeof entry.id === 'string' ? entry.id : ''
          if (!id) {
            warn({ code: 'missing-id', message: `${file}: ${key} entry without id (name=${String(entry.name ?? '?')})`, file })
            continue
          }
          const node = byId.get(id)
          if (!node) {
            warn({ code: 'orphan-entry', message: `${file}: ${key} entry ${id} is not listed in index.yaml`, file, nodeId: id })
            continue
          }
          if (node.kind !== key) {
            warn({ code: 'bad-nesting', message: `${file}: ${id} is filed under ${key} but index.yaml says ${node.kind}`, file, nodeId: id })
          }
          if (seenEntry.has(id)) {
            warn({ code: 'duplicate-entry', message: `${file}: ${id} already has an entry in ${seenEntry.get(id)}`, file, nodeId: id })
            continue
          }
          seenEntry.set(id, file)
          node.file = file
          if (typeof entry.name === 'string' && entry.name !== node.name) {
            warn({ code: 'name-mismatch', message: `${file}: ${id} name "${entry.name}" differs from index.yaml "${node.name}" (index wins)`, file, nodeId: id })
          }
          const { id: _omit, ...rest } = entry
          void _omit
          nodesData[id] = rest
          // Inline children (rules)
          for (const inlineSpec of inlineKindsOf(node.kind)) {
            const inlineList = rest[inlineSpec.inline!.key]
            if (!Array.isArray(inlineList)) continue
            for (const item of inlineList) {
              if (!item || typeof item !== 'object') continue
              const ri = item as Record<string, unknown>
              const rid = typeof ri.id === 'string' ? ri.id : ''
              if (!rid) {
                warn({ code: 'missing-id', message: `${file}: ${inlineSpec.kind} inside ${id} has no id`, file, nodeId: id })
                continue
              }
              if (byId.has(rid)) {
                warn({ code: 'duplicate-entry', message: `${file}: ${rid} appears more than once`, file, nodeId: rid })
                continue
              }
              const rnode: GNode = { id: rid, kind: inlineSpec.kind, name: String(ri.name ?? ''), handle: rid, view: node.view, parent: id, file }
              nodes.push(rnode)
              byId.set(rid, rnode)
              const { id: _o2, ...rrest } = ri
              void _o2
              nodesData[rid] = rrest
            }
          }
        }
      }
    }
  }
  for (const n of nodes) if (!(n.id in nodesData)) nodesData[n.id] = {}

  // Deployment view: opaque, carried through.
  if (await reader.exists(DEPLOYMENT_FILE)) {
    try {
      const d = yaml.load(await reader.readText(DEPLOYMENT_FILE))
      if (d && typeof d === 'object') extras.deployment = d as Record<string, unknown>
    } catch (e) {
      warn({ code: 'bad-file', message: `${DEPLOYMENT_FILE}: ${e instanceof Error ? e.message : String(e)}`, file: DEPLOYMENT_FILE })
    }
  }

  // ---- 3. edges ----
  const edges: GEdge[] = []
  const pushEdge = (from: string, to: string, rel: string, attrs?: Record<string, unknown>, suffix = '') => {
    const target = byId.get(to)
    if (!target) {
      warn({ code: 'dangling-ref', message: `${from} --${rel}--> ${to}: target not found`, nodeId: from })
      return
    }
    edges.push({ id: `${from}--${rel}--${to}${suffix}`, from, to, rel, targetKind: `${target.kind}:${to}`, attrs })
  }

  // Containment (index nesting + inline)
  for (const n of nodes) {
    if (!n.parent) continue
    const parent = byId.get(n.parent)
    if (!parent) continue
    const rel = containmentRelFor(parent.kind, n.kind)
    if (!rel) {
      warn({ code: 'bad-nesting', message: `${n.id} (${n.kind}) is nested under ${parent.id} (${parent.kind}) but no containment rel allows it`, nodeId: n.id })
      continue
    }
    edges.push({ id: `${parent.id}--${rel.kind}--${n.id}`, from: parent.id, to: n.id, rel: rel.kind, targetKind: `${n.kind}:${n.id}` })
  }

  // Explicit + derived edges from storage shapes
  const appOfId = (id: string): string | undefined => {
    let cur = byId.get(id)
    while (cur) { if (cur.kind === 'application') return cur.id; cur = cur.parent ? byId.get(cur.parent) : undefined }
    return undefined
  }
  for (const rel of Object.values(REL_KINDS) as RelKindSpec[]) {
    if (rel.implicit) continue
    for (const ep of rel.endpoints) {
      for (const src of nodes) {
        if (src.kind !== ep.source) continue
        const data = nodesData[src.id]
        for (const t of extractTargets(ep, src, data, nodes, appOfId)) {
          if (rel.kind === 'transitions-to') {
            pushEdge(src.id, src.id, rel.kind, t.attrs, `--${String(t.attrs?.from ?? '')}--${t.value}`)
          } else {
            pushEdge(src.id, t.value, rel.kind, t.attrs)
          }
        }
      }
    }
  }

  // De-dup by edge id
  const seenEdge = new Set<string>()
  const dedup = edges.filter(e => (seenEdge.has(e.id) ? false : (seenEdge.add(e.id), true)))

  return { root, schemaVersion, index, nodes, edges: dedup, nodesData, extras, warnings }
}

function containmentRelFor(parentKind: string, childKind: string): RelKindSpec | null {
  for (const rel of Object.values(REL_KINDS)) {
    if (!rel.implicit) continue
    if (rel.endpoints.some(e => e.source === parentKind && e.target === childKind)) return rel
  }
  return null
}

interface Target { value: string; attrs?: Record<string, unknown> }

function extractTargets(
  ep: RelEndpoint, src: GNode, data: Record<string, unknown>, nodes: GNode[],
  appOfId: (id: string) => string | undefined,
): Target[] {
  const s = ep.storage
  if (s.shape === 'string-list') {
    const v = getPath(data, s.field)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map(value => ({ value })) : []
  }
  if (s.shape === 'scalar') {
    const v = getPath(data, s.field)
    return typeof v === 'string' && v ? [{ value: v }] : []
  }
  if (s.shape === 'struct-list') {
    const list = getPath(data, s.field)
    if (!Array.isArray(list)) return []
    const out: Target[] = []
    for (const item of list) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue
      const m = item as Record<string, unknown>
      if (s.kindField && s.kindValue !== undefined && m[s.kindField] !== s.kindValue) continue
      const v = m[s.targetField]
      if (typeof v !== 'string') continue
      const attrs: Record<string, unknown> = {}
      for (const [k, val] of Object.entries(m)) if (k !== s.targetField && k !== s.kindField) attrs[k] = val
      out.push({ value: v, attrs })
    }
    return out
  }
  if (s.shape === 'derived' && s.source.from === 'field-type') {
    const container = data[s.source.container]
    if (!Array.isArray(container)) return []
    const app = appOfId(src.id)
    const pool = nodes.filter(n => n.kind === s.source.matchNodeKind && appOfId(n.id) === app)
    const out: Target[] = []
    const seen = new Set<string>()
    for (const item of container) {
      if (!item || typeof item !== 'object') continue
      // field-list item: { <fieldName>: "Type, desc" }
      const entry = Object.entries(item as Record<string, unknown>)[0]
      const spec = entry ? String(entry[1]) : ''
      const typeName = spec.match(/^[A-Za-z_][A-Za-z0-9_]*/)?.[0]
      if (!typeName) continue
      const hit = pool.find(n => n.name === typeName)
      if (hit && !seen.has(hit.id)) { seen.add(hit.id); out.push({ value: hit.id }) }
    }
    return out
  }
  return []
}

function getPath(data: Record<string, unknown>, path: string): unknown {
  let cur: unknown = data
  for (const part of path.split('.')) {
    if (!cur || typeof cur !== 'object' || Array.isArray(cur)) return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

// -------------------- Reference resolution --------------------

// Resolve a user-supplied reference to a node:
//   - a node id (`auc-017`)
//   - `<kind>:<id>` or `<kind>:<name>`
//   - a bare name with `kindHint`
// Name matches must be unique within the kind; otherwise an error lists candidates.
export function resolveRef(g: Graph, ref: string, kindHint?: string): GNode {
  const byId = g.nodes.find(n => n.id === ref)
  if (byId && (!kindHint || byId.kind === kindHint)) return byId
  let kind = kindHint
  let key = ref
  const colon = ref.indexOf(':')
  if (colon > 0 && ref.slice(0, colon) in NODE_KINDS) {
    kind = ref.slice(0, colon)
    key = ref.slice(colon + 1)
    const direct = g.nodes.find(n => n.id === key && n.kind === kind)
    if (direct) return direct
  }
  if (!kind) throw new Error(`cannot resolve "${ref}": pass a node id or "<kind>:<name>"`)
  const matches = g.nodes.filter(n => n.kind === kind && n.name === key)
  if (matches.length === 1) return matches[0]
  if (matches.length === 0) throw new Error(`${kind} "${key}" not found`)
  throw new Error(`${kind} name "${key}" is ambiguous — candidates: ${matches.map(m => `${m.id}${m.parent ? ` (under ${m.parent})` : ''}`).join(', ')}. Use the id.`)
}
