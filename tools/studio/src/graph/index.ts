// Derived indexes over a core Graph. Pure; rebuilt whenever the graph reloads.

import type { Graph, GNode, GEdge, IndexEntry } from '@dcddp/core'

export type Data = Record<string, unknown>

export class GraphIndex {
  readonly byId = new Map<string, GNode>()
  private readonly children = new Map<string, GNode[]>()
  private readonly out = new Map<string, GEdge[]>()
  private readonly inn = new Map<string, GEdge[]>()

  readonly g: Graph

  constructor(g: Graph) {
    this.g = g
    for (const n of g.nodes) this.byId.set(n.id, n)
    for (const n of g.nodes) if (n.parent) this.push(this.children, n.parent, n)
    for (const e of g.edges) { this.push(this.out, e.from, e); this.push(this.inn, e.to, e) }
  }
  private push<T>(m: Map<string, T[]>, k: string, v: T) { const l = m.get(k); if (l) l.push(v); else m.set(k, [v]) }

  node(id: string | undefined | null): GNode | undefined { return id ? this.byId.get(id) : undefined }
  name(id: unknown): string { return typeof id === 'string' ? this.byId.get(id)?.name ?? id : '' }
  data(id: string): Data { return this.g.nodesData[id] ?? {} }
  kind(id: string): string { return this.byId.get(id)?.kind ?? '' }

  ofKind(kind: string): GNode[] { return this.g.nodes.filter(n => n.kind === kind) }
  roots(kind: string): GNode[] { return this.g.nodes.filter(n => n.kind === kind && !n.parent) }
  childrenOf(id: string, kind?: string): GNode[] {
    const l = this.children.get(id) ?? []
    return kind ? l.filter(n => n.kind === kind) : l
  }
  outEdges(id: string, rel?: string): GEdge[] { const l = this.out.get(id) ?? []; return rel ? l.filter(e => e.rel === rel) : l }
  inEdges(id: string, rel?: string): GEdge[] { const l = this.inn.get(id) ?? []; return rel ? l.filter(e => e.rel === rel) : l }
  targets(id: string, rel: string): GNode[] { return this.outEdges(id, rel).map(e => this.byId.get(e.to)).filter((n): n is GNode => !!n) }
  sources(id: string, rel: string): GNode[] { return this.inEdges(id, rel).map(e => this.byId.get(e.from)).filter((n): n is GNode => !!n) }

  parent(id: string): GNode | undefined { return this.node(this.byId.get(id)?.parent) }
  ancestors(id: string): GNode[] { const out: GNode[] = []; let cur = this.parent(id); while (cur) { out.push(cur); cur = this.parent(cur.id) }; return out }
  appOf(id: string): GNode | undefined { const n = this.byId.get(id); if (n?.kind === 'application') return n; return this.ancestors(id).find(a => a.kind === 'application') }
  // Aggregate root: an entity with member entities / aggregate-local VOs / invariants.
  isAggregateRoot(id: string): boolean {
    const n = this.byId.get(id); if (n?.kind !== 'entity') return false
    const inv = this.data(id).invariants
    return this.childrenOf(id).length > 0 || (Array.isArray(inv) && inv.length > 0)
  }
  // Business-scoped entity = top of the business view (no application ancestor).
  isBusinessEntity(id: string): boolean { const n = this.byId.get(id); return n?.kind === 'entity' && !this.appOf(id) }
  org(): GNode | undefined { return this.roots('organization')[0] }
  orgName(): string { return this.org()?.name ?? '' }
  rules(ownerId: string): GNode[] { return this.childrenOf(ownerId, 'rule') }
  indexEntry(id: string): IndexEntry | undefined {
    const walk = (es: IndexEntry[]): IndexEntry | undefined => { for (const e of es) { if (e.id === id) return e; const h = walk(e.children); if (h) return h } ; return undefined }
    return walk(this.g.index.business) ?? walk(this.g.index.applications)
  }
}

// ---- small typed accessors over raw entry data ----
export const str = (d: Data, k: string): string => { const v = d[k]; return v == null ? '' : String(v) }
export const list = <T = unknown>(d: Data, k: string): T[] => Array.isArray(d[k]) ? (d[k] as T[]) : []
export const strs = (d: Data, k: string): string[] => list<unknown>(d, k).map(x => String(x))
export const obj = (d: Data, k: string): Data | undefined => (d[k] && typeof d[k] === 'object' && !Array.isArray(d[k]) ? d[k] as Data : undefined)

// Field lists are `- name: "Type, desc"`; tolerate free text (validate flags it).
export function fieldList(x: unknown): Record<string, string>[] {
  return Array.isArray(x) ? x.filter((f): f is Record<string, string> => !!f && typeof f === 'object' && !Array.isArray(f)) : []
}
export function fieldText(x: unknown): string | null { return typeof x === 'string' && x.trim() ? x : null }

export interface Relationship { kind: string; target: string; cardinality?: string; via?: string; note?: string; bidirectional?: boolean }
export const relationships = (d: Data): Relationship[] => list<Data>(d, 'relationships').filter(r => r && typeof r.target === 'string').map(r => ({ ...r, kind: String(r.kind), target: String(r.target) }) as Relationship)
