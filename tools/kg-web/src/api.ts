// Client-side fetch wrapper. All requests go to /api (Vite dev proxy → :3000 in dev; same-origin in prod).

export interface GNode { id: string; kind: string; name: string; handle: string; parent?: string; package?: string }
export interface GEdge { id: string; from: string; to: string; rel: string; targetKind: string }

export interface Project { name: string; path: string }
export interface ProjectsConfig { projects: Project[]; current: string | null }

export interface NodeAttrInfo { name: string; type: string }
export interface NodeKindInfo {
  kind: string
  idForm: 'id'
  idPrefix: string
  view?: 'business' | 'applications'   // may sit at the top of this view
  parents: string[]                     // kinds it may nest under
  inline: boolean
  valueType: boolean
  attrs: NodeAttrInfo[]
}
export interface RelEndpointInfo {
  source: string
  target: string
  derived?: boolean
  containment?: boolean
  // v6: has-actor is now `scalar` storage. `scalarField` names the source attr that stores the
  // target's name — used by client to turn attr-editor for that attr into a target picker.
  scalarField?: string
  // v7: source-kind nodes must have ≥1 edge of this rel to some target of a required endpoint's kind.
  required?: boolean
}
export interface RelKindInfo {
  kind: string
  sourceKinds: string[]         // union across endpoints (menu-list convenience)
  targetKinds: string[]         // union across endpoints
  endpoints: RelEndpointInfo[]  // exact (source, target) pairs
  edgeAttrs: string[]
  implicit: boolean             // implicit rels are not creatable via explicit connect
}
export interface Vocabulary {
  nodeKinds: NodeKindInfo[]
  relKinds: RelKindInfo[]
  // v7: extended reference bundle for VocabRefSheet.
  nodeLayers?: { label: string; kinds: string[] }[]
  relGroups?: { label: string; kinds: string[] }[]
  nodeKindsRef?: NodeKindRef[]
  relKindsRef?: RelKindRef[]
  valueTypes?: ValueTypesRef
}
export interface NodeKindRef {
  kind: string
  attrs: NodeAttrInfo[]
  idForm: string
  idPrefix: string
  view?: string
  parents: string[]
  storage: string  // one-line human-readable summary
}
export interface RelEndpointRef {
  source: string
  target: string
  required: boolean
  shape: string   // 'string-list' | 'scalar' | 'struct-list' | 'derived'
  storageSummary: string
}
export interface RelKindRef {
  kind: string
  implicit: boolean
  edgeAttrs: string[]
  endpoints: RelEndpointRef[]
}
export interface ValueTypesRef {
  primitives: string[]
  userDefined: { kind: string; container: string; attrs: NodeAttrInfo[] }[]
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`)
  return body as T
}

// Vocabulary — fetch once at startup
export const fetchVocabulary = () => req<Vocabulary>('/vocabulary')

// Projects
export const fetchProjects = () => req<ProjectsConfig>('/projects')
export const addProject = (name: string, path: string) =>
  req<ProjectsConfig>('/projects', { method: 'POST', body: JSON.stringify({ name, path }) })
export const deleteProject = (name: string) =>
  req<ProjectsConfig>(`/projects/${encodeURIComponent(name)}`, { method: 'DELETE' })
export const setCurrentProject = (name: string | null) =>
  req<ProjectsConfig>('/projects/current', { method: 'POST', body: JSON.stringify({ name }) })
export const scaffoldProject = (name: string, path: string) =>
  req<ProjectsConfig>('/projects/scaffold', { method: 'POST', body: JSON.stringify({ name, path }) })
export const scaffoldExistingProject = (name: string) =>
  req<{ ok: true }>(`/projects/${encodeURIComponent(name)}/scaffold`, { method: 'POST' })

// Model
export const fetchModel = () =>
  req<{
    root: string
    needsScaffold?: boolean
    needsMigration?: boolean
    nodes: GNode[]
    edges: GEdge[]
    // v6+: raw yaml data per node id (attrs + nested children). Used by attr editor for current values.
    nodesData?: Record<string, Record<string, unknown>>
    // v7: per-node rel-kinds that are required but currently missing. Client shows badge/warning.
    missingRequired?: Record<string, string[]>
  }>('/model')

// Workbenches
export interface Workbench {
  name: string
  nodeIds: string[]
  viewMode: 'graph' | 'tree'
  rootNodeId?: string
  treeRels?: string[]
}
export interface WorkbenchStore {
  workbenches: Workbench[]
  currentWorkbench: string | null
}
export const fetchWorkbenches = () => req<WorkbenchStore>('/workbenches')
export const createWorkbench = (name: string) =>
  req<WorkbenchStore>('/workbenches', { method: 'POST', body: JSON.stringify({ name }) })
export const updateWorkbench = (name: string, patch: Partial<Workbench>) =>
  req<WorkbenchStore>(`/workbenches/${encodeURIComponent(name)}`, { method: 'PUT', body: JSON.stringify(patch) })
export const deleteWorkbench = (name: string) =>
  req<WorkbenchStore>(`/workbenches/${encodeURIComponent(name)}`, { method: 'DELETE' })
export const setCurrentWorkbench = (name: string | null) =>
  req<WorkbenchStore>('/current-workbench', { method: 'POST', body: JSON.stringify({ name }) })

// Value-types (v6)
export interface VtItem { kind: string; app: string; appId: string; name: string; id: string }
export interface VtStore { primitives: string[]; userKinds: string[]; userItems: VtItem[] }
export const fetchValueTypes = () => req<VtStore>('/vt')
export const apiAddVt = (kind: string, name: string, parent: string, attrs: Record<string, unknown> = {}) =>
  req<{ ok: true; id: string }>('/vt', { method: 'POST', body: JSON.stringify({ kind, name, parent, attrs }) })
export const apiUpdateVt = (kind: string, name: string, set: Record<string, unknown> = {}, unset: string[] = []) =>
  req<{ ok: true }>('/vt', { method: 'PUT', body: JSON.stringify({ kind, name, set, unset }) })
export const apiRemoveVt = (kind: string, name: string) =>
  req<{ ok: true }>('/vt', { method: 'DELETE', body: JSON.stringify({ kind, name }) })

// Mutations
// parent: "<kind>:<handle>" of the containing node (required for kinds without a `view`).
export const apiAddNode = (kind: string, name: string, attrs: Record<string, unknown> = {}, parent?: string, pkg?: string) =>
  req<{ ok: true; id: string; wireId: string }>('/node', { method: 'POST', body: JSON.stringify({ kind, name, attrs, parent, package: pkg }) })
export const apiRemoveNode = (kind: string, name: string) =>
  req<{ ok: true }>('/node', { method: 'DELETE', body: JSON.stringify({ kind, name }) })
export const apiUpdateNode = (
  kind: string, name: string,
  set: Record<string, unknown> = {}, unset: string[] = [],
) =>
  req<{ ok: true }>('/node', { method: 'PUT', body: JSON.stringify({ kind, name, set, unset }) })
export const apiConnect = (from: string, rel: string, toKind: string, toName: string, attrs: Record<string, unknown> = {}) =>
  req<{ ok: true }>('/edge', { method: 'POST', body: JSON.stringify({ from, rel, toKind, toName, attrs }) })
export const apiDisconnect = (from: string, rel: string, toKind: string, toName: string) =>
  req<{ ok: true }>('/edge', { method: 'DELETE', body: JSON.stringify({ from, rel, toKind, toName }) })
