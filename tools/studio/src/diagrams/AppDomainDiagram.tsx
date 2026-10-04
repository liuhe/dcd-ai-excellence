// 自动生成应用领域模型图（DDD 构造块）。
// 节点：聚合根（◆，以根实体名呈现）/ 独立实体 / Role / VO / Enum / Repository / Service / Event；聚合内实体与 VO 作为子节点。
// 业务实体不画进图（schema NOTE 17）。边：depends-on 虚线箭头；implements 虚线空心三角；composition 实线实心菱形
//（聚合 → 内嵌实体 / VO）；associates 实线箭头；Repository → 根实体 manages（实线空心菱形）。realizes 跨层不画。
import dagre from 'dagre'
import { useGraph } from '../graph/store'
import { obj, str } from '../graph/index'
import { pathOf, type Pt } from './primitives'

type Kind = 'role' | 'entity' | 'aggregate' | 'vo' | 'enum' | 'repository' | 'service' | 'event' | 'inner-entity' | 'inner-vo'
const STYLE: Record<Kind, { stroke: string; bg: string; label: string; dashed: boolean }> = {
  role: { stroke: '#eab308', bg: '#fef9c3', label: 'Role', dashed: true },
  entity: { stroke: '#7c3aed', bg: '#f5f3ff', label: 'Entity', dashed: false },
  aggregate: { stroke: '#7c3aed', bg: '#f5f3ff', label: 'Aggregate (root)', dashed: false },
  vo: { stroke: '#06b6d4', bg: '#cffafe', label: 'VO', dashed: false },
  enum: { stroke: '#06b6d4', bg: '#ecfeff', label: 'Enum', dashed: true },
  repository: { stroke: '#475569', bg: '#f1f5f9', label: 'Repository', dashed: false },
  service: { stroke: '#10b981', bg: '#d1fae5', label: 'Service', dashed: false },
  event: { stroke: '#f59e0b', bg: '#fef3c7', label: 'Event', dashed: false },
  'inner-entity': { stroke: '#a78bfa', bg: '#f5f3ff', label: 'Entity', dashed: false },
  'inner-vo': { stroke: '#67e8f9', bg: '#ecfeff', label: 'InnerVO', dashed: false },
}

export function AppDomainDiagram({ appId }: { appId: string }) {
  const { ix } = useGraph()
  const roles = ix.childrenOf(appId, 'role'), ents = ix.childrenOf(appId, 'entity'), vos = ix.childrenOf(appId, 'value-object')
  const enums = ix.childrenOf(appId, 'enum'), svcs = ix.childrenOf(appId, 'domain-service'), evts = ix.childrenOf(appId, 'domain-event')
  const aggs = ents.filter(e => ix.isAggregateRoot(e.id)), plain = ents.filter(e => !ix.isAggregateRoot(e.id))
  // Repositories: on root entities (`repository`) or unassigned on the application (`repositories`)
  const repos: { id: string; name: string; manages?: string }[] = []
  for (const e of ents) { const r = obj(ix.data(e.id), 'repository'); if (r) repos.push({ id: `repo:${e.id}`, name: str(r, 'name'), manages: e.id }) }
  for (const [i, r] of (ix.data(appId).repositories as Array<Record<string, unknown>> | undefined ?? []).entries()) repos.push({ id: `repo:app:${i}`, name: str(r as Record<string, unknown>, 'name') })
  if (roles.length + ents.length + vos.length + enums.length + repos.length + svcs.length + evts.length === 0) return null

  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', ranksep: 110, nodesep: 50, marginx: 40, marginy: 40 })
  g.setDefaultEdgeLabel(() => ({}))
  const NW = 170, NH = 56, NW_INNER = 140, NH_INNER = 44
  type NodeData = { kind: Kind; label: string; width: number; height: number }
  const add = (id: string, kind: Kind, label: string, inner = false) => g.setNode(id, { kind, label, width: inner ? NW_INNER : NW, height: inner ? NH_INNER : NH } as NodeData)
  roles.forEach(r => add(r.id, 'role', r.name))
  plain.forEach(e => add(e.id, 'entity', e.name))
  for (const a of aggs) {
    add(a.id, 'aggregate', a.name)
    ix.childrenOf(a.id, 'entity').forEach(m => add(m.id, 'inner-entity', m.name, true))
    ix.childrenOf(a.id, 'value-object').forEach(v => add(v.id, 'inner-vo', v.name, true))
  }
  vos.forEach(v => add(v.id, 'vo', v.name)); enums.forEach(e => add(e.id, 'enum', e.name))
  repos.forEach(r => add(r.id, 'repository', r.name)); svcs.forEach(s => add(s.id, 'service', s.name)); evts.forEach(e => add(e.id, 'event', e.name))

  type EdgeType = 'manages' | 'implements' | 'composition' | 'depends' | 'associates'
  const edges: { from: string; to: string; type: EdgeType }[] = []
  const pushEdges = (src: string) => {
    for (const e of ix.outEdges(src)) {
      if (!g.hasNode(e.to)) continue
      const t: EdgeType | null = e.rel === 'depends-on' ? 'depends' : e.rel === 'implements' ? 'implements' : e.rel === 'composition' ? 'composition' : e.rel === 'associates' ? 'associates' : null
      if (t) edges.push({ from: src, to: e.to, type: t })
    }
  }
  repos.forEach(r => { if (r.manages && g.hasNode(r.manages)) edges.push({ from: r.id, to: r.manages, type: 'manages' }) })
  for (const a of aggs) {
    pushEdges(a.id)
    for (const m of ix.childrenOf(a.id, 'entity')) { edges.push({ from: a.id, to: m.id, type: 'composition' }); pushEdges(m.id) }
    for (const v of ix.childrenOf(a.id, 'value-object')) { edges.push({ from: a.id, to: v.id, type: 'composition' }); pushEdges(v.id) }
  }
  ;[...plain, ...vos, ...enums, ...svcs, ...evts, ...roles].forEach(n => pushEdges(n.id))
  for (const e of edges) g.setEdge(e.from, e.to, { type: e.type })
  dagre.layout(g)
  const gi = g.graph(); const svgW = (gi.width || 800) + 60, svgH = (gi.height || 400) + 60
  const legend: Array<[Kind, string]> = [['role', 'Role'], ['entity', 'Entity'], ['aggregate', 'Aggregate (root)'], ['inner-entity', '聚合内实体'], ['inner-vo', '聚合内 VO'], ['vo', 'Value Object'], ['enum', 'Enum'], ['repository', 'Repository'], ['service', 'Domain Service'], ['event', 'Domain Event']]

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 overflow-x-auto mb-6">
      <div className="text-xs text-slate-500 mb-2 flex flex-wrap gap-3">
        {legend.map(([k, label]) => <span key={k} className="flex items-center gap-1"><span className="w-3 h-3 rounded border" style={{ background: STYLE[k].bg, borderColor: STYLE[k].stroke, borderStyle: STYLE[k].dashed ? 'dashed' : 'solid' }} />{label}</span>)}
      </div>
      <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} className="mx-auto" style={{ minWidth: svgW }}>
        <defs>
          <marker id="ad-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#94a3b8" /></marker>
          <marker id="ad-realize" markerWidth="14" markerHeight="12" refX="14" refY="6" orient="auto"><polygon points="0 0, 14 6, 0 12" fill="white" stroke="#475569" strokeWidth="1.2" /></marker>
          <marker id="ad-diamond-empty" markerWidth="14" markerHeight="10" refX="14" refY="5" orient="auto"><polygon points="0 5, 7 0, 14 5, 7 10" fill="white" stroke="#475569" strokeWidth="1.2" /></marker>
          <marker id="ad-diamond-filled" markerWidth="14" markerHeight="10" refX="0" refY="5" orient="auto-start-reverse"><polygon points="0 5, 7 0, 14 5, 7 10" fill="#7c3aed" /></marker>
        </defs>
        {g.edges().map((e, i) => {
          const ed = g.edge(e) as { points?: Pt[]; type?: EdgeType }; const points = ed.points
          if (!points || points.length < 2) return null
          let stroke = '#94a3b8', dash = '', markerEnd = 'url(#ad-arrow)'
          if (ed.type === 'implements') { stroke = '#475569'; dash = '4 4'; markerEnd = 'url(#ad-realize)' }
          if (ed.type === 'manages') { markerEnd = 'url(#ad-diamond-empty)' }
          if (ed.type === 'composition') { stroke = '#7c3aed'; markerEnd = 'url(#ad-diamond-filled)' }
          if (ed.type === 'depends') { stroke = '#64748b'; dash = '5 3' }
          if (ed.type === 'associates') { stroke = '#64748b' }
          return <path key={`edge-${i}`} d={pathOf(points)} fill="none" stroke={stroke} strokeWidth={1.2} strokeDasharray={dash} markerEnd={markerEnd} />
        })}
        {g.nodes().map(id => {
          const nd = g.node(id) as NodeData & { x: number; y: number }; if (!nd) return null
          const s = STYLE[nd.kind], w = nd.width || NW, h = nd.height || NH
          return (
            <g key={id}>
              <rect x={nd.x - w / 2} y={nd.y - h / 2} width={w} height={h} rx={6} ry={6} fill={s.bg} stroke={s.stroke} strokeWidth={1.6} strokeDasharray={s.dashed ? '5 3' : ''} />
              <text x={nd.x} y={nd.y - 4} textAnchor="middle" fontSize={12} fontWeight={600} fill="#1e293b">{nd.label}</text>
              <text x={nd.x} y={nd.y + 14} textAnchor="middle" fontSize={9} fill={s.stroke} fontWeight={500}>«{s.label}»</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
