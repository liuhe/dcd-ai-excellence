// Mutation helpers: call the API, reload the graph, surface errors in the header.
import { useCallback } from 'react'
import { useGraph } from './store'
import { apiAddNode, apiUpdateNode, apiRemoveNode, apiConnect, apiUpdateEdge, apiDisconnect } from './api'

export function useMutations() {
  const { project, reload, setError } = useGraph()
  const wrap = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    setError(null)
    try { const r = await fn(); await reload(); return r } catch (e) { setError(e instanceof Error ? e.message : String(e)); return null }
  }, [reload, setError])
  return {
    addNode: (kind: string, body: { name?: string; parent?: string; package?: string; attrs?: Record<string, unknown> }) => wrap(() => apiAddNode(project, kind, body)),
    updateNode: (id: string, set: Record<string, unknown>, unset: string[] = []) => wrap(() => apiUpdateNode(project, id, set, unset)),
    removeNode: (id: string) => wrap(() => apiRemoveNode(project, id)),
    connect: (from: string, rel: string, to: string, attrs: Record<string, unknown> = {}) => wrap(() => apiConnect(project, from, rel, to, attrs)),
    updateEdge: (from: string, rel: string, to: string, set: Record<string, unknown>, unset: string[] = []) => wrap(() => apiUpdateEdge(project, from, rel, to, set, unset)),
    disconnect: (from: string, rel: string, to: string) => wrap(() => apiDisconnect(project, from, rel, to)),
  }
}
