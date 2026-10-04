// Graph-shaped model types (schema 7.0). The loader produces a Graph; every interface
// (CLI, kg-web, studio) consumes it. There is no "file-shaped" model object any more —
// file layout is an implementation detail of the loader / writer.

export type ViewName = 'business' | 'applications'

export interface GNode {
  id: string            // opaque id: <prefix>-<seq>, e.g. auc-017
  kind: string
  name: string
  handle: string        // = id (kept for interface compatibility: kg-web addresses nodes by kind + handle)
  view: ViewName
  parent?: string       // containing node id (index nesting / inline owner)
  package?: string      // package path derived from index position, e.g. "Claude Session/Streaming"
  file?: string         // relative path of the detail file holding this node's entry (undefined = stub)
}

export interface GEdge {
  id: string
  from: string
  to: string
  rel: string
  targetKind: string    // "<kind>:<id>" (interface compatibility)
  attrs?: Record<string, unknown>
}

// index.yaml, parsed. Entries are ordered as declared.
export interface IndexEntry {
  id: string
  name: string
  kind: string
  package?: string
  children: IndexEntry[]
}

export interface ModelIndex {
  schemaVersion: string
  sequences: Record<string, number>
  business: IndexEntry[]
  applications: IndexEntry[]
}

export interface Graph {
  root: string
  schemaVersion: string
  index: ModelIndex
  nodes: GNode[]
  edges: GEdge[]
  // Raw detail entry per node id (attrs + storage fields, minus `id`). Stub nodes have {}.
  nodesData: Record<string, Record<string, unknown>>
  // Non-node content carried through: application topology, deployment view.
  extras: { topology?: unknown[]; deployment?: Record<string, unknown> }
  // Loader diagnostics (orphans, duplicates, dangling refs, …). `validate` turns these into findings.
  warnings: LoadWarning[]
}

export interface LoadWarning {
  code: 'orphan-entry' | 'duplicate-entry' | 'dangling-ref' | 'bad-nesting' | 'missing-id'
      | 'name-mismatch' | 'bad-file' | 'unknown-key' | 'app-dir'
  message: string
  file?: string
  nodeId?: string
}

// UI-agnostic tree (sidebar). `icon` / `tag` are hints for viewers; CLIs may ignore them.
export interface TreeNode {
  id: string
  label: string
  icon: string
  tag?: string
  children?: TreeNode[]
}

// Small helpers shared by consumers.
export function nodeById(g: Graph, id: string): GNode | undefined {
  return g.nodes.find(n => n.id === id)
}
export function childrenOf(g: Graph, id: string): GNode[] {
  return g.nodes.filter(n => n.parent === id)
}
// Nearest ancestor of `kind` (or self if `includeSelf`).
export function ancestorOfKind(g: Graph, id: string, kind: string, includeSelf = false): GNode | undefined {
  let cur = nodeById(g, id)
  if (!includeSelf) cur = cur?.parent ? nodeById(g, cur.parent) : undefined
  while (cur) {
    if (cur.kind === kind) return cur
    cur = cur.parent ? nodeById(g, cur.parent) : undefined
  }
  return undefined
}
export function appOf(g: Graph, id: string): GNode | undefined {
  return ancestorOfKind(g, id, 'application', true)
}
