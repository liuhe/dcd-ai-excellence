// 业务模型 ER 图：业务实体 + 实体间关系（composition / associates / depends-on），四色 archetype 着色。
import dagre from 'dagre'
import { useGraph } from '../graph/store'
import { businessRelationships } from '../pages/entity-helpers'
import { pathOf, midOf, type Pt } from './primitives'

export function DataModelDiagram() {
  const { ix } = useGraph()
  const entities = ix.ofKind('entity').filter(e => ix.isBusinessEntity(e.id))
  if (entities.length === 0) return null
  const rels = businessRelationships(ix)
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', ranksep: 80, nodesep: 40, marginx: 40, marginy: 40 })
  g.setDefaultEdgeLabel(() => ({}))
  const nodeW = 140, nodeH = 40
  entities.forEach(e => g.setNode(e.id, { label: e.name, width: nodeW, height: nodeH }))
  rels.forEach(r => { if (g.hasNode(r.from) && g.hasNode(r.to) && r.kind !== 'implements') g.setEdge(r.from, r.to, { label: r.cardinality || '', via: r.via || '', relation: r.kind === 'composition' ? 'composition' : 'association' }) })
  try { dagre.layout(g) } catch (err) {
    return <div className="bg-amber-50 border border-amber-300 rounded p-4 text-sm text-amber-900">数据模型图渲染失败：{err instanceof Error ? err.message : String(err)}</div>
  }
  const nodePos = new Map<string, { x: number; y: number; w: number; h: number }>()
  g.nodes().forEach(id => { const nd = g.node(id); if (nd) nodePos.set(id, { x: nd.x, y: nd.y, w: nd.width, h: nd.height }) })
  const gi = g.graph(); const svgWidth = (gi.width || 600) + 60, svgHeight = (gi.height || 400) + 60
  const ARCHETYPE_COLORS: Record<string, string> = { 'moment-interval': '#ec4899', role: '#eab308', 'party-place-thing': '#10b981', description: '#3b82f6' }
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 overflow-x-auto">
      <svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="mx-auto" style={{ minWidth: svgWidth }}>
        <defs>
          <marker id="dm-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#94a3b8" /></marker>
          <marker id="dm-diamond" markerWidth="14" markerHeight="10" refX="0" refY="5" orient="auto-start-reverse"><polygon points="0,5 7,0 14,5 7,10" fill="#475569" /></marker>
        </defs>
        {g.edges().map((e, i) => {
          const ed = g.edge(e); const points = ed?.points as Pt[] | undefined
          if (!points || points.length < 2) return null
          const mid = midOf(points)
          return (
            <g key={`edge-${i}`}>
              <path d={pathOf(points)} fill="none" stroke="#94a3b8" strokeWidth={1.2} markerEnd="url(#dm-arrow)" markerStart={ed?.relation === 'composition' ? 'url(#dm-diamond)' : undefined} />
              {ed?.label && <text x={mid.x} y={mid.y - 8} textAnchor="middle" fontSize={9} fill="#64748b" fontWeight={500}>{ed.label}</text>}
              {ed?.via && <text x={mid.x} y={mid.y + 6} textAnchor="middle" fontSize={8} fill="#94a3b8" fontStyle="italic">via {ed.via}</text>}
            </g>
          )
        })}
        {entities.map(e => {
          const pos = nodePos.get(e.id); if (!pos) return null
          const color = ARCHETYPE_COLORS[String(ix.data(e.id).archetype ?? '')] || '#94a3b8'
          return (
            <g key={e.id}>
              <rect x={pos.x - pos.w / 2} y={pos.y - pos.h / 2} width={pos.w} height={pos.h} rx={8} ry={8} fill={color} opacity={0.08} stroke={color} strokeWidth={1.5} />
              <text x={pos.x} y={pos.y + 5} textAnchor="middle" fontSize={13} fill={color} fontWeight={700}>{e.name}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
