// G6 v5 canvas wrapper. Tap events → selection callbacks. Touch support is native in G6 v5.

import { useEffect, useRef } from 'react'
import { Graph } from '@antv/g6'
import type { GNode, GEdge } from './api.ts'

interface Props {
  nodes: GNode[]
  edges: GEdge[]
  selectedId: string | null
  onSelectNode: (nodeId: string) => void
  onSelectEdge: (edgeId: string) => void
  onDeselect: () => void
}

const KIND_COLOR: Record<string, string> = {
  'business-use-case': '#fef3c7',
  'system-use-case':   '#dbeafe',
  'application':       '#d1fae5',
  'app-use-case':      '#e0e7ff',
  'page':              '#fce7f3',
  'entity':            '#f3e8ff',
  'rule':              '#fef2f2',
}
const KIND_STROKE: Record<string, string> = {
  'business-use-case': '#d97706',
  'system-use-case':   '#2563eb',
  'application':       '#059669',
  'app-use-case':      '#4f46e5',
  'page':              '#db2777',
  'entity':            '#9333ea',
  'rule':              '#dc2626',
}

export function G6Canvas({ nodes, edges, selectedId, onSelectNode, onSelectEdge, onDeselect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<Graph | null>(null)
  const selectedIdRef = useRef<string | null>(selectedId)

  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])

  useEffect(() => {
    if (!containerRef.current || graphRef.current) return
    const rect = containerRef.current.getBoundingClientRect()

    const graph = new Graph({
      container: containerRef.current,
      width: rect.width,
      height: rect.height,
      node: {
        style: ((data: { data?: Record<string, unknown>; id?: string }) => {
          const kind = (data.data?.kind as string) ?? ''
          const name = (data.data?.name as string) ?? ''
          const isSelected = data.id === selectedIdRef.current
          return {
            size: 44,
            fill: KIND_COLOR[kind] ?? '#f1f5f9',
            stroke: isSelected ? '#0f172a' : (KIND_STROKE[kind] ?? '#94a3b8'),
            lineWidth: isSelected ? 3 : 1.5,
            labelText: name,
            labelPlacement: 'bottom',
            labelFontSize: 12,
            labelFill: '#334155',
          }
        }) as never,
      },
      edge: {
        style: ((data: { data?: Record<string, unknown>; id?: string }) => {
          const isSelected = data.id === selectedIdRef.current
          return {
            stroke: isSelected ? '#0f172a' : '#94a3b8',
            lineWidth: isSelected ? 2.5 : 1.2,
            endArrow: true,
            labelText: (data.data?.rel as string) ?? '',
            labelFontSize: 10,
            labelFill: '#64748b',
            labelBackground: true,
            labelBackgroundFill: '#ffffff',
            labelBackgroundOpacity: 0.9,
            labelPadding: 2,
          }
        }) as never,
      },
      layout: { type: 'dagre', rankdir: 'LR', nodesep: 40, ranksep: 80 },
      behaviors: ['drag-canvas', 'zoom-canvas', 'drag-element'],
    })
    graphRef.current = graph

    graph.on('node:click', (e: unknown) => {
      const ev = e as { target?: { id?: string } }
      if (ev.target?.id) onSelectNode(ev.target.id)
    })
    graph.on('edge:click', (e: unknown) => {
      const ev = e as { target?: { id?: string } }
      if (ev.target?.id) onSelectEdge(ev.target.id)
    })
    graph.on('canvas:click', () => onDeselect())

    const ro = new ResizeObserver(() => {
      if (!containerRef.current || !graphRef.current) return
      const r = containerRef.current.getBoundingClientRect()
      graphRef.current.setSize(r.width, r.height)
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      graph.destroy()
      graphRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const g = graphRef.current
    if (!g) return
    g.setData({
      nodes: nodes.map(n => ({ id: n.id, data: { kind: n.kind, name: n.name } })),
      edges: edges.map(e => ({ id: e.id, source: e.from, target: e.to, data: { rel: e.rel } })),
    })
    g.render()
      .then(() => {
        // Fit the whole graph into view — dagre lays out nodes across many kx of pixels
        // otherwise; default viewport shows origin which is often empty.
        if (nodes.length > 0) g.fitView({ when: 'always', direction: 'both' })
      })
      .catch((err: Error) => console.warn('G6 render error', err))
  }, [nodes, edges])

  useEffect(() => {
    const g = graphRef.current
    if (!g) return
    g.render().catch(() => {})
  }, [selectedId])

  return <div ref={containerRef} style={{ width: '100%', height: '100%', background: '#f8fafc' }} />
}
