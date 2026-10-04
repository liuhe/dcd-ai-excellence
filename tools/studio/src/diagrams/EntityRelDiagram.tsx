// 实体邻域关系图（当前实体 + 与之有关系的实体）。
import dagre from 'dagre'
import { useGraph } from '../graph/store'
import { pathOf, type Pt } from './primitives'

export interface Rel { from: string; to: string; type: string; via?: string }

export function EntityRelDiagram({ entityId, relationships }: { entityId: string; relationships: Rel[] }) {
  const { ix } = useGraph()
  if (relationships.length === 0) return null
  const ids = new Set<string>([entityId]); relationships.forEach(r => { ids.add(r.from); ids.add(r.to) })
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', ranksep: 60, nodesep: 60, marginx: 40, marginy: 30, edgesep: 20 })
  g.setDefaultEdgeLabel(() => ({}))
  const nodeW = 130, nodeH = 36
  ids.forEach(id => g.setNode(id, { label: ix.name(id), width: nodeW, height: nodeH }))
  relationships.forEach(r => { if (g.hasNode(r.from) && g.hasNode(r.to)) g.setEdge(r.from, r.to, { label: r.type, via: r.via || '' }) })
  dagre.layout(g)
  const nodePos = new Map<string, { x: number; y: number }>()
  g.nodes().forEach(id => { const nd = g.node(id); if (nd) nodePos.set(id, { x: nd.x, y: nd.y }) })
  const gi = g.graph(); const svgWidth = (gi.width || 400) + 60, svgHeight = (gi.height || 200) + 40
  const halfW = nodeW / 2, halfH = nodeH / 2
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 overflow-x-auto">
      <h3 className="text-xs font-semibold text-slate-400 uppercase mb-3">关系图</h3>
      <svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="mx-auto" style={{ minWidth: svgWidth }}>
        <defs><marker id="er-arrow" markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto"><polygon points="0 0, 7 2.5, 0 5" fill="#3b82f6" /></marker></defs>
        {g.edges().map((e, i) => {
          const ed = g.edge(e); const points = ed?.points as Pt[] | undefined
          if (!points || points.length < 2) return null
          const adjusted = shorten(points, halfH)
          const mid = points[Math.floor(points.length / 2)]
          const label = String(ed?.label || ''), via = String(ed?.via || ''); const full = via ? `${label}  via ${via}` : label
          return (
            <g key={`edge-${i}`}>
              <path d={pathOf(adjusted)} fill="none" stroke="#93c5fd" strokeWidth={1.5} markerEnd="url(#er-arrow)" />
              {full && (
                <g>
                  <rect x={mid.x + 8} y={mid.y - 8} width={full.length * 5.8 + 10} height={16} rx={3} fill="white" fillOpacity={0.9} />
                  <text x={mid.x + 12} y={mid.y + 4} fontSize={10} fill="#3b82f6">{label}</text>
                  {via && <text x={mid.x + 12 + label.length * 6 + 6} y={mid.y + 4} fontSize={9} fill="#94a3b8" fontStyle="italic">via {via}</text>}
                </g>
              )}
            </g>
          )
        })}
        {[...ids].map(id => {
          const pos = nodePos.get(id); if (!pos) return null
          const cur = id === entityId
          return (
            <g key={id}>
              <rect x={pos.x - halfW} y={pos.y - halfH} width={nodeW} height={nodeH} rx={8} ry={8} fill={cur ? '#dbeafe' : '#f8fafc'} stroke={cur ? '#3b82f6' : '#cbd5e1'} strokeWidth={cur ? 2.5 : 1.5} />
              <text x={pos.x} y={pos.y + 5} textAnchor="middle" fontSize={13} fill={cur ? '#1d4ed8' : '#475569'} fontWeight={cur ? 700 : 500}>{ix.name(id)}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// Pull both ends of a polyline back so arrows stop at node borders.
export function shorten(points: Pt[], halfH: number): Pt[] {
  const last = points[points.length - 1], prev = points[points.length - 2]
  const dx = last.x - prev.x, dy = last.y - prev.y, dist = Math.hypot(dx, dy), shrink = halfH + 3
  const adjusted = [...points.slice(0, -1), { x: dist > 0 ? last.x - (dx / dist) * shrink : last.x, y: dist > 0 ? last.y - (dy / dist) * shrink : last.y }]
  const first = adjusted[0], next = adjusted.length >= 2 ? adjusted[1] : first
  const dx0 = next.x - first.x, dy0 = next.y - first.y, dist0 = Math.hypot(dx0, dy0)
  adjusted[0] = { x: dist0 > 0 ? first.x + (dx0 / dist0) * (halfH + 1) : first.x, y: dist0 > 0 ? first.y + (dy0 / dist0) * (halfH + 1) : first.y }
  return adjusted
}
