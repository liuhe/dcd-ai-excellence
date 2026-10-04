// Draft import: turn an id-less, nested YAML draft into model nodes + edges through the same
// graph verbs the CLI uses (addNode / connect). Lets an author (human or AI) write a whole
// batch of nodes in one file while the tool allocates ids, places entries and resolves refs.
//
// Draft shape — a map of <kind> → [entries]; an entry is a map of:
//   name              display name (inline kinds such as rule may omit it)
//   package           package path in index.yaml ("Auth/Login")
//   <node kind>       nested child entries (containment) — same shape, recursively
//   <rel kind>        edges from this node: a ref, a list of refs, or a list of { target, ...edgeAttrs }
//   <storage field>   accepted as alias for the rel that is stored in that field (actor → has-actor)
//   anything else     attribute written as-is
// A ref is "<kind>:<name>", a bare name (unique among the rel's allowed target kinds, draft + model),
// or an existing node id. Draft nodes may reference each other regardless of order.

import yaml from 'js-yaml'
import { NODE_KINDS, REL_KINDS, nodeSpec, isNodeId } from './vocabulary.ts'
import { loadGraph, resolveRef } from './loader.ts'
import { nodeReader } from './reader.ts'
import { addNode, connect } from './graph.ts'
import { validateModel, type Finding } from './validate.ts'
import type { Graph } from './types.ts'

type Dict = Record<string, unknown>

interface PlannedNode {
  key: number
  kind: string
  name: string
  parentKey?: number
  pkg?: string
  attrs: Dict
  path: string        // human-readable position in the draft, for messages
}
interface PlannedEdge { fromKey: number; rel: string; ref: string; attrs: Dict; path: string }

export interface ImportReport {
  created: { id: string; kind: string; name: string }[]
  edges: { from: string; rel: string; to: string }[]
  skippedEdges: { from: string; rel: string; to: string; reason: string }[]
  errors: string[]
  findings: Finding[]
}

const isDict = (v: unknown): v is Dict => typeof v === 'object' && v !== null && !Array.isArray(v)

// rel kinds (and their storage field aliases) usable from a given source kind
function relsFrom(kind: string): Map<string, string> {
  const m = new Map<string, string>()
  for (const rel of Object.values(REL_KINDS)) {
    if (rel.implicit) continue
    for (const ep of rel.endpoints) {
      if (ep.source !== kind || ep.storage.shape === 'derived' || ep.storage.shape === 'containment') continue
      m.set(rel.kind, rel.kind)
      if ('field' in ep.storage) m.set(ep.storage.field, rel.kind)
    }
  }
  return m
}

function targetKinds(rel: string, sourceKind: string): string[] {
  return [...new Set(REL_KINDS[rel].endpoints.filter(e => e.source === sourceKind).map(e => e.target))]
}

export function planDraft(draft: unknown): { nodes: PlannedNode[]; edges: PlannedEdge[]; errors: string[] } {
  const nodes: PlannedNode[] = []; const edges: PlannedEdge[] = []; const errors: string[] = []
  let seq = 0
  if (!isDict(draft)) return { nodes, edges, errors: ['draft must be a map of <kind> → [entries]'] }

  const walk = (kind: string, entries: unknown, parent: PlannedNode | undefined, at: string) => {
    if (!(kind in NODE_KINDS)) { errors.push(`${at}: unknown node kind "${kind}"`); return }
    if (!Array.isArray(entries)) { errors.push(`${at}: ${kind} must be a list of entries`); return }
    const spec = nodeSpec(kind)
    if (parent && !spec.parents.includes(parent.kind)) errors.push(`${at}: ${kind} cannot be placed under ${parent.kind} (allowed: ${spec.parents.join(', ') || 'none'})`)
    if (!parent && !spec.view) errors.push(`${at}: ${kind} cannot be a top-level entry; nest it under one of: ${spec.parents.join(', ')}`)
    const rels = relsFrom(kind)
    entries.forEach((e, i) => {
      const here = `${at}[${i}]`
      if (!isDict(e)) { errors.push(`${here}: entry must be a map`); return }
      const name = e.name === undefined ? '' : String(e.name)
      if (!name && !spec.inline) errors.push(`${here}: ${kind} entry needs a name`)
      const node: PlannedNode = { key: seq++, kind, name, parentKey: parent?.key, pkg: e.package === undefined ? undefined : String(e.package), attrs: {}, path: `${here} (${kind} "${name}")` }
      nodes.push(node)
      for (const [k, v] of Object.entries(e)) {
        if (k === 'name' || k === 'package' || v === undefined || v === null) continue
        if (k in NODE_KINDS) { walk(k, v, node, `${node.path}.${k}`); continue }
        const rel = rels.get(k)
        if (rel) {
          const items = Array.isArray(v) ? v : [v]
          for (const it of items) {
            if (isDict(it)) {
              const { target, ...attrs } = it
              if (target === undefined) { errors.push(`${node.path}.${k}: struct item needs "target"`); continue }
              edges.push({ fromKey: node.key, rel, ref: String(target), attrs, path: node.path })
            } else edges.push({ fromKey: node.key, rel, ref: String(it), attrs: {}, path: node.path })
          }
          continue
        }
        if (REL_KINDS[k]) { errors.push(`${node.path}: relation "${k}" cannot start from ${kind}`); continue }
        node.attrs[k] = v
      }
    })
  }
  for (const [kind, entries] of Object.entries(draft)) walk(kind, entries, undefined, kind)
  return { nodes, edges, errors }
}

// Resolve a draft ref to either a planned node (by key) or an existing node id.
function makeResolver(g: Graph, nodes: PlannedNode[]) {
  return (ref: string, kinds: string[]): { key?: number; id?: string } | { error: string } => {
    const colon = ref.indexOf(':')
    const hintedKind = colon > 0 && ref.slice(0, colon) in NODE_KINDS ? ref.slice(0, colon) : undefined
    const name = hintedKind ? ref.slice(colon + 1) : ref
    const wanted = hintedKind ? [hintedKind] : kinds
    if (!hintedKind && isNodeId(ref)) {
      const n = g.nodes.find(x => x.id === ref)
      if (n) return kinds.includes(n.kind) ? { id: n.id } : { error: `${ref} is a ${n.kind}; expected ${kinds.join(' / ')}` }
    }
    const planned = nodes.filter(n => wanted.includes(n.kind) && n.name === name)
    const existing = g.nodes.filter(n => wanted.includes(n.kind) && n.name === name)
    const total = planned.length + existing.length
    if (total === 1) return planned[0] ? { key: planned[0].key } : { id: existing[0].id }
    if (total === 0) {
      if (hintedKind) { try { return { id: resolveRef(g, ref, hintedKind).id } } catch { /* fallthrough */ } }
      return { error: `cannot resolve "${ref}" (looked for ${wanted.join(' / ')} named "${name}" in draft and model)` }
    }
    return { error: `"${ref}" is ambiguous: ${planned.map(p => `draft ${p.path}`).concat(existing.map(x => x.id)).join(', ')} — use "<kind>:<name>" or an id` }
  }
}

export interface ImportOptions { dryRun?: boolean }

export async function importDraft(root: string, draftText: string, opts: ImportOptions = {}): Promise<ImportReport> {
  const report: ImportReport = { created: [], edges: [], skippedEdges: [], errors: [], findings: [] }
  let draft: unknown
  try { draft = yaml.load(draftText) } catch (e) { report.errors.push(`draft is not valid YAML: ${e instanceof Error ? e.message : String(e)}`); return report }
  const plan = planDraft(draft)
  report.errors.push(...plan.errors)
  const g = await loadGraph(root, nodeReader(root), { onWarn: () => {} })
  const resolve = makeResolver(g, plan.nodes)

  // Resolve every edge up front so a bad ref aborts before anything is written.
  const resolved: { edge: PlannedEdge; to: { key?: number; id?: string } }[] = []
  for (const edge of plan.edges) {
    const from = plan.nodes.find(n => n.key === edge.fromKey)!
    const r = resolve(edge.ref, targetKinds(edge.rel, from.kind))
    if ('error' in r) report.errors.push(`${edge.path} --${edge.rel}--> ${r.error}`); else resolved.push({ edge, to: r })
  }
  // singleton kinds (organization) must not be duplicated
  for (const n of plan.nodes) {
    const spec = nodeSpec(n.kind)
    if (spec.singleton && (g.nodes.some(x => x.kind === n.kind) || plan.nodes.some(x => x !== n && x.kind === n.kind && x.key < n.key))) report.errors.push(`${n.path}: ${n.kind} is singleton and already exists`)
  }
  if (report.errors.length > 0 || opts.dryRun) {
    report.created = plan.nodes.map(n => ({ id: `(${n.kind})`, kind: n.kind, name: n.name }))
    report.edges = resolved.map(({ edge, to }) => ({ from: plan.nodes.find(n => n.key === edge.fromKey)!.name, rel: edge.rel, to: to.id ?? plan.nodes.find(n => n.key === to.key)!.name }))
    return report
  }

  const ids = new Map<number, string>()
  for (const n of plan.nodes) {
    const parent = n.parentKey === undefined ? undefined : ids.get(n.parentKey)
    const { id } = await addNode(root, n.kind, { name: n.name, parent, package: n.pkg, attrs: n.attrs })
    ids.set(n.key, id)
    report.created.push({ id, kind: n.kind, name: n.name })
  }
  for (const { edge, to } of resolved) {
    const from = ids.get(edge.fromKey)!
    const toId = to.id ?? ids.get(to.key!)!
    try {
      await connect(root, from, edge.rel, toId, edge.attrs)
      report.edges.push({ from, rel: edge.rel, to: toId })
    } catch (e) {
      report.skippedEdges.push({ from, rel: edge.rel, to: toId, reason: e instanceof Error ? e.message : String(e) })
    }
  }
  const { findings } = await validateModel(root)
  report.findings = findings
  return report
}
