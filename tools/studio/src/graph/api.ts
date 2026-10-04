import type { Graph } from '@dcddp/core'

export interface Project { name: string; path: string }
export interface ProjectsInfo { projects: Project[]; current: string | null; single: boolean }
export interface Finding { severity: 'error' | 'warning' | 'info'; code: string; message: string; nodeId?: string; file?: string }

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`./api${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`)
  return body as T
}

// Static (exported) mode: no API; `graph.json` next to index.html holds { name, graph } and
// attachments live under ./model/. Detected on first projects fetch.
let staticGraph: { name: string; graph: Graph } | null = null
export const isStatic = () => staticGraph !== null

export async function fetchProjects(): Promise<ProjectsInfo> {
  try { return await req<ProjectsInfo>('/projects') }
  catch (e) {
    const r = await fetch('./graph.json').catch(() => null)
    if (!r || !r.ok) throw e
    staticGraph = await r.json() as { name: string; graph: Graph }
    return { projects: [{ name: staticGraph.name, path: '' }], current: staticGraph.name, single: true }
  }
}
export const fetchModel = async (project: string): Promise<Graph> => staticGraph ? staticGraph.graph : req<Graph>(`/model?project=${encodeURIComponent(project)}`)
export const fetchValidate = (project: string) => req<{ findings: Finding[] }>(`/validate?project=${encodeURIComponent(project)}`)

// Attachment URL for a path relative to the model root.
export const fileUrl = (project: string, rel: string) => staticGraph
  ? `./model/${rel.split('/').map(encodeURIComponent).join('/')}`
  : `./api/files/${encodeURIComponent(project)}/${rel.split('/').map(encodeURIComponent).join('/')}`

// ---- Vocabulary (for editing UIs) ----
export interface AttrInfo { name: string; type: string }
export interface NodeKindInfo { kind: string; idPrefix: string; view?: 'business' | 'applications' | 'deployment'; parents: string[]; inline: boolean; valueType: boolean; attrs: AttrInfo[]; singleton: boolean; description: string }
export interface RelKindInfo { kind: string; implicit: boolean; edgeAttrs: string[]; description: string; endpoints: { source: string; target: string; shape: string; required: boolean }[] }
export interface Vocabulary { nodeKinds: NodeKindInfo[]; relKinds: RelKindInfo[] }
export const fetchVocabulary = () => req<Vocabulary>('/vocabulary')

// ---- Mutations (server mode only) ----
const q = (project: string) => `?project=${encodeURIComponent(project)}`
export const apiAddNode = (project: string, kind: string, body: { name?: string; parent?: string; package?: string; attrs?: Record<string, unknown> }) =>
  req<{ ok: true; result: { id: string; file: string } }>(`/node${q(project)}`, { method: 'POST', body: JSON.stringify({ kind, ...body }) })
export const apiUpdateNode = (project: string, id: string, set: Record<string, unknown>, unset: string[] = []) =>
  req<{ ok: true }>(`/node${q(project)}`, { method: 'PUT', body: JSON.stringify({ id, set, unset }) })
export const apiRemoveNode = (project: string, id: string) =>
  req<{ ok: true; result: { removedIds: string[] } }>(`/node${q(project)}`, { method: 'DELETE', body: JSON.stringify({ id }) })
export const apiConnect = (project: string, from: string, rel: string, to: string, attrs: Record<string, unknown> = {}) =>
  req<{ ok: true }>(`/edge${q(project)}`, { method: 'POST', body: JSON.stringify({ from, rel, to, attrs }) })
export const apiUpdateEdge = (project: string, from: string, rel: string, to: string, set: Record<string, unknown>, unset: string[] = []) =>
  req<{ ok: true }>(`/edge${q(project)}`, { method: 'PUT', body: JSON.stringify({ from, rel, to, set, unset }) })
export const apiDisconnect = (project: string, from: string, rel: string, to: string) =>
  req<{ ok: true }>(`/edge${q(project)}`, { method: 'DELETE', body: JSON.stringify({ from, rel, to }) })
