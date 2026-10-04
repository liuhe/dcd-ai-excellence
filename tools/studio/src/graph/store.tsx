import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { Graph, GNode } from '@dcddp/core'
import { GraphIndex } from './index'
import { fetchModel, fileUrl, isStatic, type Vocabulary } from './api'

interface Store {
  project: string
  graph: Graph
  ix: GraphIndex
  vocab: Vocabulary | null
  canEdit: boolean
  reload: () => Promise<void>
  baseFor: (node?: GNode | string) => string
  error: string | null
  setError: (e: string | null) => void
}

const Ctx = createContext<Store | null>(null)

export function GraphProvider({ project, initial, vocab, children }: { project: string; initial: Graph; vocab: Vocabulary | null; children: ReactNode }) {
  const [graph, setGraph] = useState<Graph>(initial)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => { setGraph(await fetchModel(project)) }, [project])
  const ix = useMemo(() => new GraphIndex(graph), [graph])
  const baseFor = useCallback((node?: GNode | string) => {
    const n = typeof node === 'string' ? ix.node(node) : node
    return fileUrl(project, n?.file ? n.file.replace(/[^/]+$/, '') : '')
  }, [ix, project])
  const value = useMemo<Store>(() => ({ project, graph, ix, vocab, canEdit: !isStatic() && vocab !== null, reload, baseFor, error, setError }), [project, graph, ix, vocab, reload, baseFor, error])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useGraph(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useGraph outside GraphProvider')
  return s
}
