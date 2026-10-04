import dagre from 'dagre'
import { pathOf, type Pt } from './primitives'
import { shorten } from './EntityRelDiagram'

export interface StateMachine { field?: string; states?: string[]; transitions?: Array<{ from?: string; to?: string; trigger?: string }>; notes?: string }

export function StateMachineDiagram({ sm }: { sm: StateMachine }) {
  const states = (sm.states ?? []).map(String), transitions = sm.transitions ?? []
  if (states.length === 0) return null
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', ranksep: 60, nodesep: 60, marginx: 40, marginy: 30, edgesep: 20 })
  g.setDefaultEdgeLabel(() => ({}))
  const nodeW = 110, nodeH = 34
  states.forEach(s => g.setNode(s, { label: s, width: nodeW, height: nodeH }))
  transitions.forEach(t => { const from = String(t.from || ''), to = String(t.to || ''); if (from && to && g.hasNode(from) && g.hasNode(to)) g.setEdge(from, to, { label: t.trigger || '' }) })
  dagre.layout(g)
  const nodePos = new Map<string, { x: number; y: number }>()
  g.nodes().forEach(id => { const nd = g.node(id); if (nd) nodePos.set(id, { x: nd.x, y: nd.y }) })
  const gi = g.graph(); const svgWidth = (gi.width || 400) + 60, svgHeight = (gi.height || 200) + 40
  const halfW = nodeW / 2, halfH = nodeH / 2
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 overflow-x-auto">
      <h3 className="text-xs font-semibold text-slate-400 uppercase mb-3">状态机 ({sm.field ?? ''})</h3>
      <svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="mx-auto" style={{ minWidth: svgWidth }}>
        <defs><marker id="sm-arrow" markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto"><polygon points="0 0, 7 2.5, 0 5" fill="#d97706" /></marker></defs>
        {g.edges().map((e, i) => {
          const ed = g.edge(e); const points = ed?.points as Pt[] | undefined
          if (!points || points.length < 2) return null
          const mid = points[Math.floor(points.length / 2)]; const label = String(ed?.label || '')
          return (
            <g key={`edge-${i}`}>
              <path d={pathOf(shorten(points, halfH))} fill="none" stroke="#d97706" strokeWidth={1.3} markerEnd="url(#sm-arrow)" />
              {label && (<g><rect x={mid.x + 8} y={mid.y - 8} width={label.length * 6.5 + 8} height={16} rx={3} fill="white" fillOpacity={0.9} /><text x={mid.x + 12} y={mid.y + 4} fontSize={10} fill="#92400e">{label}</text></g>)}
            </g>
          )
        })}
        {states.map((s, i) => {
          const pos = nodePos.get(s); if (!pos) return null
          const first = i === 0
          return (
            <g key={s}>
              <rect x={pos.x - halfW} y={pos.y - halfH} width={nodeW} height={nodeH} rx={17} ry={17} fill={first ? '#fef3c7' : '#fffbeb'} stroke={first ? '#d97706' : '#fbbf24'} strokeWidth={first ? 2.5 : 1.5} />
              <text x={pos.x} y={pos.y + 5} textAnchor="middle" fontSize={13} fill="#92400e" fontWeight={600}>{s}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
