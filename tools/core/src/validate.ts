// Model validation (schema 7.0). Turns loader warnings + structural checks into findings.

import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { loadGraph } from './loader.ts'
import { nodeReader, type ModelReader } from './reader.ts'
import { NODE_KINDS, REL_KINDS, VALUE_TYPE_PRIMITIVES, RESOURCE_TYPES, USES_MODES, USES_MODES_BY_RESOURCE_TYPE, kindOfId, type RelKindSpec } from './vocabulary.ts'
import type { Graph, GNode, GEdge, LoadWarning } from './types.ts'

export interface Finding {
  severity: 'error' | 'warning' | 'info'
  code: string
  message: string
  nodeId?: string
  file?: string
}

const WARNING_SEVERITY: Record<LoadWarning['code'], Finding['severity']> = {
  'orphan-entry': 'error', 'duplicate-entry': 'error', 'dangling-ref': 'error', 'bad-nesting': 'error',
  'missing-id': 'error', 'bad-file': 'error', 'name-mismatch': 'warning', 'unknown-key': 'warning', 'app-dir': 'warning',
}

export async function validateModel(root: string, reader: ModelReader = nodeReader(root)): Promise<{ graph: Graph; findings: Finding[] }> {
  const graph = await loadGraph(root, reader, { onWarn: () => {} })
  const findings: Finding[] = []
  for (const w of graph.warnings) findings.push({ severity: WARNING_SEVERITY[w.code], code: w.code, message: w.message, nodeId: w.nodeId, file: w.file })

  // Required rels
  for (const m of checkRequiredRels(graph.nodes, graph.edges)) {
    findings.push({ severity: 'error', code: 'missing-required-rel', nodeId: m.sourceId,
      message: `${m.sourceKind} "${m.sourceName}" (${m.sourceId}) missing required rel "${m.relKind}" (allowed targets: ${m.allowedTargetKinds.join(', ')})` })
  }

  // Singletons
  for (const [kind, spec] of Object.entries(NODE_KINDS)) {
    if (!spec.singleton) continue
    const ns = graph.nodes.filter(n => n.kind === kind)
    if (ns.length > 1) findings.push({ severity: 'error', code: 'singleton', message: `${kind} is singleton but model has ${ns.length}: ${ns.map(n => n.id).join(', ')}` })
  }

  // Sequence counters must cover every id in use
  const maxSeq = new Map<string, number>()
  for (const n of graph.nodes) {
    const dash = n.id.lastIndexOf('-')
    const prefix = n.id.slice(0, dash); const seq = Number(n.id.slice(dash + 1))
    if (!kindOfId(n.id)) { findings.push({ severity: 'error', code: 'bad-id', nodeId: n.id, message: `${n.id}: id must be <kind-prefix>-<seq>` }); continue }
    if (seq > (maxSeq.get(prefix) ?? 0)) maxSeq.set(prefix, seq)
  }
  for (const [prefix, max] of maxSeq) {
    const counter = graph.index.sequences[prefix] ?? 0
    if (max > counter) findings.push({ severity: 'error', code: 'sequence', message: `sequences.${prefix} is ${counter} but ${prefix}-${String(max).padStart(3, '0')} exists — raise the counter to at least ${max}` })
  }

  // Application directories must map to an application id
  try {
    const base = join(root, 'applications')
    for (const name of await readdir(base)) {
      const st = await stat(join(base, name))
      if (!st.isDirectory()) continue
      const id = name.match(/^(app-\d+)(?:-|$)/)?.[1]
      const app = id ? graph.nodes.find(n => n.id === id && n.kind === 'application') : undefined
      if (!app) findings.push({ severity: 'warning', code: 'app-dir', file: `applications/${name}`, message: `applications/${name}: directory does not start with the id of an existing application` })
      else if (name !== app.id && !name.startsWith(`${app.id}-`)) { /* unreachable */ }
    }
  } catch { /* no applications dir */ }

  // Value-type conflicts
  for (const c of detectValueTypeConflicts(graph)) {
    findings.push({ severity: c.kind === 'same-app-collision' ? 'error' : 'warning', code: `vt-${c.kind}`, message: c.detail })
  }

  // Structured attr shapes
  for (const n of graph.nodes) {
    const spec = NODE_KINDS[n.kind]
    if (!spec) continue
    const data = graph.nodesData[n.id] ?? {}
    for (const a of spec.attrs) {
      const v = data[a.name]
      if (v === undefined || v === null) continue
      if (a.type === 'field-list' && !(Array.isArray(v) && v.every(x => x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length === 1))) {
        findings.push({ severity: 'error', code: 'attr-shape', nodeId: n.id, file: n.file, message: `${n.id} (${n.name}): ${a.name} must be a list of single-key maps (- name: "Type, desc")` })
      } else if (a.type === 'string-list' && !(Array.isArray(v) && v.every(x => typeof x === 'string'))) {
        findings.push({ severity: 'error', code: 'attr-shape', nodeId: n.id, file: n.file, message: `${n.id} (${n.name}): ${a.name} must be a list of strings` })
      }
    }
    const ext = data.ext
    if (ext !== undefined && ext !== null && (typeof ext !== 'object' || Array.isArray(ext))) {
      findings.push({ severity: 'error', code: 'attr-shape', nodeId: n.id, file: n.file, message: `${n.id} (${n.name}): ext must be a map of extension attributes` })
    }
  }

  // Closed value sets: resource.type, uses.mode
  for (const n of graph.nodes) {
    if (n.kind !== 'resource') continue
    const t = graph.nodesData[n.id]?.type
    if (t !== undefined && !(RESOURCE_TYPES as readonly string[]).includes(String(t))) {
      findings.push({ severity: 'warning', code: 'attr-value', nodeId: n.id, file: n.file, message: `${n.id} (${n.name}): resource type "${String(t)}" is not one of ${RESOURCE_TYPES.join(' / ')}` })
    }
  }
  // Edge endpoint kinds must be allowed by the vocabulary (stale data after a rel's endpoints change)
  const kindOf = (id: string) => graph.nodes.find(n => n.id === id)?.kind ?? ''
  for (const e of graph.edges) {
    const rel = REL_KINDS[e.rel]; if (!rel || rel.implicit) continue
    const sk = kindOf(e.from), tk = kindOf(e.to)
    if (!rel.endpoints.some(ep => ep.source === sk && ep.target === tk)) {
      findings.push({ severity: 'error', code: 'bad-endpoint', nodeId: e.from, message: `${e.from} --${e.rel}--> ${e.to}: ${sk} → ${tk} is not an allowed endpoint (allowed: ${rel.endpoints.map(ep => `${ep.source}→${ep.target}`).join(', ')})` })
    }
  }
  const byId = new Map(graph.nodes.map(n => [n.id, n]))
  const inApplication = (id: string): boolean => { let cur = byId.get(id); while (cur) { if (cur.kind === 'application') return true; cur = cur.parent ? byId.get(cur.parent) : undefined } return false }
  for (const e of graph.edges) {
    if (e.rel !== 'uses' || !e.targetKind.startsWith('entity:')) continue
    const sk = kindOf(e.from)
    if ((sk === 'business-use-case' || sk === 'system-use-case') && inApplication(e.to)) {
      findings.push({ severity: 'error', code: 'layer', nodeId: e.from, message: `${e.from} uses ${e.to}: a ${sk} may only use business-layer entities; ${e.to} belongs to an application (use the business entity it realizes)` })
    }
  }
  const typeOf = (id: string) => String(graph.nodesData[id]?.type ?? '')
  for (const e of graph.edges) {
    if (e.rel === 'exposes') {
      if (typeOf(e.to) !== 'api') findings.push({ severity: 'warning', code: 'attr-value', nodeId: e.from, message: `${e.from} exposes ${e.to}: target should be a resource of type api (is "${typeOf(e.to) || 'unset'}")` })
      continue
    }
    if (e.rel !== 'uses' || e.attrs?.mode === undefined) continue
    const mode = String(e.attrs.mode)
    if (e.targetKind.startsWith('entity:')) {
      if (!['read', 'write'].includes(mode)) findings.push({ severity: 'warning', code: 'attr-value', nodeId: e.from, message: `${e.from} uses ${e.to}: mode "${mode}" should be read / write for an entity` })
    } else if (e.targetKind.startsWith('resource:')) {
      const allowed = USES_MODES_BY_RESOURCE_TYPE[typeOf(e.to)]
      if (allowed && !allowed.includes(mode)) findings.push({ severity: 'warning', code: 'attr-value', nodeId: e.from, message: `${e.from} uses ${e.to}: mode "${mode}" should be ${allowed.join(' / ') || '(api resources are exposed, not used)'} for a ${typeOf(e.to)} resource` })
      else if (!allowed && !(USES_MODES as readonly string[]).includes(mode)) findings.push({ severity: 'warning', code: 'attr-value', nodeId: e.from, message: `${e.from} uses ${e.to}: mode "${mode}" is not one of ${USES_MODES.join(' / ')}` })
    }
  }

  return { graph, findings }
}

// -------------------- Required-rel checking --------------------

export interface MissingRequiredRel {
  sourceId: string; sourceKind: string; sourceName: string; relKind: string; allowedTargetKinds: string[]
}

export function checkRequiredRels(nodes: GNode[], edges: GEdge[]): MissingRequiredRel[] {
  const requiredByKindRel = new Map<string, Map<string, Set<string>>>()
  for (const rel of Object.values(REL_KINDS) as RelKindSpec[]) {
    for (const ep of rel.endpoints) {
      if (!ep.required) continue
      let byRel = requiredByKindRel.get(ep.source)
      if (!byRel) { byRel = new Map(); requiredByKindRel.set(ep.source, byRel) }
      let targets = byRel.get(rel.kind)
      if (!targets) { targets = new Set(); byRel.set(rel.kind, targets) }
      targets.add(ep.target)
    }
  }
  if (requiredByKindRel.size === 0) return []
  const outByNodeRel = new Map<string, Set<string>>()
  for (const e of edges) {
    const key = `${e.from}::${e.rel}`
    let s = outByNodeRel.get(key)
    if (!s) { s = new Set(); outByNodeRel.set(key, s) }
    s.add(e.targetKind.slice(0, e.targetKind.indexOf(':')))
  }
  const findings: MissingRequiredRel[] = []
  for (const node of nodes) {
    const byRel = requiredByKindRel.get(node.kind)
    if (!byRel) continue
    for (const [relKind, allowed] of byRel) {
      const present = outByNodeRel.get(`${node.id}::${relKind}`)
      if (!(present && [...allowed].some(t => present.has(t)))) {
        findings.push({ sourceId: node.id, sourceKind: node.kind, sourceName: node.name, relKind, allowedTargetKinds: [...allowed] })
      }
    }
  }
  return findings
}

// -------------------- Value-type conflicts --------------------

export interface VtConflict {
  kind: 'primitive-shadow' | 'same-app-collision' | 'cross-app-collision'
  name: string
  locations: string[]
  detail: string
}

export function detectValueTypeConflicts(g: Graph): VtConflict[] {
  const prim = new Set<string>(VALUE_TYPE_PRIMITIVES)
  const vts = g.nodes.filter(n => NODE_KINDS[n.kind]?.valueType)
  const appOf = (n: GNode): string => {
    let cur: GNode | undefined = n
    while (cur) { if (cur.kind === 'application') return cur.id; cur = cur.parent ? g.nodes.find(x => x.id === cur!.parent) : undefined }
    return '(none)'
  }
  const out: VtConflict[] = []
  const byName = new Map<string, GNode[]>()
  for (const v of vts) {
    if (prim.has(v.name)) out.push({ kind: 'primitive-shadow', name: v.name, locations: [v.id], detail: `${v.kind} ${v.id} "${v.name}" shadows built-in primitive ${v.name}` })
    byName.set(v.name, [...(byName.get(v.name) ?? []), v])
  }
  for (const [name, list] of byName) {
    if (list.length < 2) continue
    const apps = new Map<string, GNode[]>()
    for (const v of list) apps.set(appOf(v), [...(apps.get(appOf(v)) ?? []), v])
    for (const [app, vs] of apps) if (vs.length > 1) out.push({ kind: 'same-app-collision', name, locations: vs.map(v => v.id), detail: `value type "${name}" declared ${vs.length} times in ${app}: ${vs.map(v => v.id).join(', ')}` })
    if (apps.size > 1) out.push({ kind: 'cross-app-collision', name, locations: [...apps.keys()], detail: `value type "${name}" declared in ${apps.size} applications (${[...apps.keys()].join(', ')}) — field types resolve within their own application` })
  }
  return out
}
