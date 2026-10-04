// Use-case diagrams (ported 1:1 from the 6.x renderer; data now comes from the Graph).
import dagre from 'dagre'
import { useGraph } from '../graph/store'
import { ActorFigure, UseCaseOval, pathOf, midOf, type Pt } from './primitives'

const positions = (g: dagre.graphlib.Graph) => {
  const m = new Map<string, { x: number; y: number; w: number; h: number }>()
  g.nodes().forEach(id => { const nd = g.node(id); if (nd) m.set(id, { x: nd.x, y: nd.y, w: nd.width, h: nd.height }) })
  return m
}

// Diagram for a single business use case → its system use cases
export function SystemUseCaseDiagram({ bucId }: { bucId: string }) {
  const { ix } = useGraph()
  const buc = ix.node(bucId)
  if (!buc) return null
  const bucActor = ix.targets(bucId, 'has-actor')[0]?.name ?? ''
  const sucs = ix.targets(bucId, 'uses')
  if (sucs.length === 0) return null
  const sysUCDetails = sucs.map(s => ({ name: s.name, actor: ix.targets(s.id, 'has-actor')[0]?.name ?? '', system: ix.parent(s.id)?.name ?? '' }))

  const actorSet = new Set<string>()
  if (bucActor) actorSet.add(bucActor)
  sysUCDetails.forEach(s => { if (s.actor) actorSet.add(s.actor) })
  const actors = [...actorSet]

  const actorX = 80, boundaryLeft = 180, boundaryRight = 620
  const ovalCx = (boundaryLeft + boundaryRight) / 2
  const ucSpacing = 70, startY = 70, boundaryPadding = 40
  const ucPositions = sysUCDetails.map((_, i) => ({ cx: ovalCx, cy: startY + i * ucSpacing }))
  const totalHeight = Math.max((sysUCDetails.length - 1) * ucSpacing, 0)
  const actorSpacing = actors.length > 1 ? totalHeight / (actors.length - 1) : 0
  const actorStartY = actors.length > 1 ? startY : startY + totalHeight / 2
  const actorPositions = actors.map((_, i) => ({ x: actorX, y: actorStartY + i * actorSpacing }))
  const boundaryTop = startY - 40
  const boundaryBottom = startY + totalHeight + boundaryPadding
  const svgHeight = boundaryBottom + 30
  const svgWidth = boundaryRight + 40

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 overflow-x-auto">
      <div className="text-xs text-slate-400 mb-2 text-center">业务用例「{buc.name}」的系统用例</div>
      <svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="mx-auto" style={{ minWidth: svgWidth }}>
        <rect x={boundaryLeft} y={boundaryTop} width={boundaryRight - boundaryLeft} height={boundaryBottom - boundaryTop} rx={12} ry={12}
          fill="#f8fafc" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="6 3" />
        <text x={boundaryLeft + 12} y={boundaryTop + 18} fontSize={13} fill="#475569" fontWeight={600}>{sysUCDetails[0]?.system || ix.orgName()}</text>
        {sysUCDetails.map((suc, i) => {
          const ai = actors.indexOf(suc.actor); if (ai < 0) return null
          const ap = actorPositions[ai], up = ucPositions[i]
          return <line key={`line-${i}`} x1={ap.x + 20} y1={ap.y} x2={up.cx - 120} y2={up.cy} stroke="#93c5fd" strokeWidth={1.2} />
        })}
        {actors.map((a, i) => <ActorFigure key={i} x={actorPositions[i].x} y={actorPositions[i].y} label={a} />)}
        {sysUCDetails.map((suc, i) => <UseCaseOval key={i} cx={ucPositions[i].cx} cy={ucPositions[i].cy} label={suc.name} />)}
      </svg>
    </div>
  )
}

// Diagram for a single business use case → subsystem (application) level use cases
export function AppUseCaseDiagram({ bucId }: { bucId: string }) {
  const { ix } = useGraph()
  const buc = ix.node(bucId)
  if (!buc) return null
  const sucs = ix.targets(bucId, 'uses')
  if (sucs.length === 0) return null
  const entries = sucs.flatMap(s => ix.targets(s.id, 'has-entry').map(e => e.id))

  type AppUC = { app: string; name: string; actor: string }
  const collected = new Map<string, AppUC>()
  const edges: { from: string; to: string; relation: string }[] = []
  const visited = new Set<string>()
  const walk = (id: string) => {
    if (visited.has(id)) return
    visited.add(id)
    const uc = ix.node(id); if (!uc) return
    collected.set(id, { app: ix.appOf(id)?.name ?? '', name: uc.name, actor: ix.targets(id, 'has-actor')[0]?.name ?? '' })
    for (const rel of ['includes', 'extends'] as const) {
      for (const e of ix.outEdges(id, rel)) { edges.push({ from: id, to: e.to, relation: rel === 'includes' ? 'Include' : 'Extend' }); walk(e.to) }
    }
  }
  entries.forEach(walk)
  if (collected.size === 0) return null

  const actorSet = new Set<string>()
  for (const e of entries) { const uc = collected.get(e); if (uc?.actor) actorSet.add(uc.actor) }
  const actors = [...actorSet]

  const g = new dagre.graphlib.Graph({ compound: true })
  g.setGraph({ rankdir: 'LR', ranksep: 80, nodesep: 40, marginx: 60, marginy: 50 })
  g.setDefaultEdgeLabel(() => ({}))
  const nodeW = 210, nodeH = 44
  actors.forEach(a => g.setNode(`actor:${a}`, { label: a, width: 120, height: 80 }))
  const appSet = new Set<string>(); for (const uc of collected.values()) appSet.add(uc.app)
  for (const a of appSet) g.setNode(`group:${a}`, { label: a, clusterLabelPos: 'top' })
  for (const [id, uc] of collected) { g.setNode(id, { label: uc.name, width: nodeW, height: nodeH }); g.setParent(id, `group:${uc.app}`) }
  for (const e of entries) { const uc = collected.get(e); if (uc && g.hasNode(`actor:${uc.actor}`)) g.setEdge(`actor:${uc.actor}`, e) }
  for (const e of edges) if (g.hasNode(e.from) && g.hasNode(e.to)) g.setEdge(e.from, e.to, { label: e.relation })
  dagre.layout(g)
  const nodePos = positions(g)

  const appBounds = new Map<string, { minX: number; minY: number; maxX: number; maxY: number }>()
  for (const [id, uc] of collected) {
    const pos = nodePos.get(id); if (!pos) continue
    const halfW = nodeW / 2 + 15, halfH = nodeH / 2 + 15
    const prev = appBounds.get(uc.app)
    if (!prev) appBounds.set(uc.app, { minX: pos.x - halfW, minY: pos.y - halfH, maxX: pos.x + halfW, maxY: pos.y + halfH })
    else { prev.minX = Math.min(prev.minX, pos.x - halfW); prev.minY = Math.min(prev.minY, pos.y - halfH); prev.maxX = Math.max(prev.maxX, pos.x + halfW); prev.maxY = Math.max(prev.maxY, pos.y + halfH) }
  }
  const gi = g.graph()
  const svgWidth = (gi.width || 800) + 80, svgHeight = (gi.height || 400) + 80
  const ovalRx = nodeW / 2, ovalRy = nodeH / 2
  const appColors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4']
  const appColorMap = new Map<string, string>(); [...appSet].forEach((a, i) => appColorMap.set(a, appColors[i % appColors.length]))

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 overflow-x-auto">
      <div className="text-xs text-slate-400 mb-2 text-center">业务用例「{buc.name}」的子系统用例</div>
      <svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="mx-auto" style={{ minWidth: svgWidth }}>
        <defs><marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#94a3b8" /></marker></defs>
        {[...appBounds.entries()].map(([appName, b]) => {
          const color = appColorMap.get(appName) || '#94a3b8', pad = 10
          return (
            <g key={`app-${appName}`}>
              <rect x={b.minX - pad} y={b.minY - 18} width={b.maxX - b.minX + pad * 2} height={b.maxY - b.minY + 24} rx={10} ry={10}
                fill="white" stroke={color} strokeWidth={1.5} strokeDasharray="6 3" opacity={0.8} />
              <text x={b.minX - pad + 10} y={b.minY - 4} fontSize={11} fill={color} fontWeight={700}>{appName}</text>
            </g>
          )
        })}
        {g.edges().map((e, i) => {
          const ed = g.edge(e); const points = ed?.points as Pt[] | undefined
          if (!points || points.length < 2) return null
          const isActorEdge = e.v.startsWith('actor:'); const mid = midOf(points)
          return (
            <g key={`edge-${i}`}>
              <path d={pathOf(points)} fill="none" stroke={isActorEdge ? '#93c5fd' : '#94a3b8'} strokeWidth={isActorEdge ? 1.2 : 1}
                strokeDasharray={isActorEdge ? 'none' : '4 2'} markerEnd={isActorEdge ? undefined : 'url(#arrowhead)'} />
              {!isActorEdge && ed?.label && <text x={mid.x} y={mid.y - 6} textAnchor="middle" fontSize={9} fill="#94a3b8">«{ed.label}»</text>}
            </g>
          )
        })}
        {actors.map(a => { const pos = nodePos.get(`actor:${a}`); return pos ? <ActorFigure key={a} x={pos.x} y={pos.y} label={a} /> : null })}
        {[...collected.entries()].map(([id, uc]) => {
          const pos = nodePos.get(id); if (!pos) return null
          const isEntry = entries.includes(id)
          return (
            <g key={id}>
              <ellipse cx={pos.x} cy={pos.y} rx={ovalRx} ry={ovalRy} fill={isEntry ? '#dbeafe' : '#f0fdf4'} stroke={isEntry ? '#3b82f6' : '#86efac'} strokeWidth={isEntry ? 1.5 : 1} />
              <text x={pos.x} y={pos.y + 4} textAnchor="middle" fontSize={11} fill={isEntry ? '#1e40af' : '#166534'} fontWeight={500}>{uc.name}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// Shared renderer for "all use cases of one container with actors + packages" (system / application).
function ContainerUseCaseDiagram({ containerName, ucs, markerId }: {
  containerName: string
  ucs: { id: string; name: string; actor: string; pkg: string }[]
  markerId: string
}) {
  const { ix } = useGraph()
  if (ucs.length === 0) return null
  const actors = [...new Set(ucs.map(u => u.actor).filter(Boolean))]
  const g = new dagre.graphlib.Graph({ compound: true })
  g.setGraph({ rankdir: 'LR', ranksep: 100, nodesep: 40, marginx: 60, marginy: 50 })
  g.setDefaultEdgeLabel(() => ({}))
  const nodeW = markerId === 'sys-arrow' ? 220 : 200, nodeH = 44
  actors.forEach(a => g.setNode(`actor:${a}`, { label: a, width: 120, height: 80 }))
  const pkgMap = new Map<string, string[]>()
  ucs.forEach(u => { const l = pkgMap.get(u.pkg) ?? []; l.push(u.id); pkgMap.set(u.pkg, l) })
  const hasPackages = pkgMap.size > 1 || (pkgMap.size === 1 && !pkgMap.has(''))
  g.setNode('boundary', { label: containerName, clusterLabelPos: 'top' })
  if (hasPackages) for (const pkg of pkgMap.keys()) { g.setNode(`pkg:${pkg || '__ungrouped__'}`, { label: pkg || 'Other', clusterLabelPos: 'top' }); g.setParent(`pkg:${pkg || '__ungrouped__'}`, 'boundary') }
  ucs.forEach(u => { g.setNode(u.id, { label: u.name, width: nodeW, height: nodeH }); g.setParent(u.id, hasPackages ? `pkg:${u.pkg || '__ungrouped__'}` : 'boundary') })
  ucs.forEach(u => { if (g.hasNode(`actor:${u.actor}`)) g.setEdge(`actor:${u.actor}`, u.id) })
  // Include / Extend edges within the container
  const ids = new Set(ucs.map(u => u.id))
  ucs.forEach(u => {
    for (const rel of ['includes', 'extends'] as const) for (const e of ix.outEdges(u.id, rel)) if (ids.has(e.to)) g.setEdge(u.id, e.to, { label: rel === 'includes' ? 'Include' : 'Extend' })
  })
  dagre.layout(g)
  const nodePos = positions(g)
  const bndPad = hasPackages ? 65 : 20
  let bndMinX = Infinity, bndMinY = Infinity, bndMaxX = -Infinity, bndMaxY = -Infinity
  ucs.forEach(u => { const pos = nodePos.get(u.id); if (!pos) return
    bndMinX = Math.min(bndMinX, pos.x - nodeW / 2 - bndPad); bndMinY = Math.min(bndMinY, pos.y - nodeH / 2 - bndPad)
    bndMaxX = Math.max(bndMaxX, pos.x + nodeW / 2 + bndPad); bndMaxY = Math.max(bndMaxY, pos.y + nodeH / 2 + bndPad) })
  const gi = g.graph()
  const svgWidth = (gi.width || 800) + 80, svgHeight = (gi.height || 400) + 80
  const ovalRx = nodeW / 2, ovalRy = nodeH / 2
  const isSys = markerId === 'sys-arrow'

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 overflow-x-auto">
      <svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="mx-auto" style={{ minWidth: svgWidth }}>
        <defs>
          {isSys
            ? <marker id={markerId} viewBox="0 0 10 10" refX={10} refY={5} markerWidth={6} markerHeight={6} orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 Z" fill="#6366f1" /></marker>
            : <marker id={markerId} markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#94a3b8" /></marker>}
        </defs>
        <rect x={bndMinX} y={bndMinY} width={bndMaxX - bndMinX} height={bndMaxY - bndMinY} rx={12} ry={12} fill="#f8fafc" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="6 3" />
        <text x={bndMinX + 12} y={bndMinY + 18} fontSize={13} fill="#475569" fontWeight={600}>{containerName}</text>
        {hasPackages && [...pkgMap.entries()].map(([pkg, idsIn]) => {
          const pad = 14; let pMinX = Infinity, pMinY = Infinity, pMaxX = -Infinity, pMaxY = -Infinity
          idsIn.forEach(id => { const pos = nodePos.get(id); if (!pos) return
            pMinX = Math.min(pMinX, pos.x - nodeW / 2 - pad); pMinY = Math.min(pMinY, pos.y - nodeH / 2 - pad)
            pMaxX = Math.max(pMaxX, pos.x + nodeW / 2 + pad); pMaxY = Math.max(pMaxY, pos.y + nodeH / 2 + pad) })
          if (pMinX === Infinity) return null
          pMinY -= 20
          return (
            <g key={`pkg-${pkg || '__ungrouped__'}`}>
              <rect x={pMinX} y={pMinY} width={pMaxX - pMinX} height={pMaxY - pMinY} rx={8} ry={8} fill="#eef2ff" fillOpacity={0.5} stroke="#818cf8" strokeWidth={1} strokeDasharray="4 2" />
              <text x={pMinX + 8} y={pMinY + 14} fontSize={10} fill="#6366f1" fontWeight={600}>{pkg || 'Other'}</text>
            </g>
          )
        })}
        {g.edges().map((e, i) => {
          const ed = g.edge(e); const points = ed?.points as Pt[] | undefined
          if (!points || points.length < 2) return null
          const isAssoc = !e.v.startsWith('actor:'); const mid = midOf(points)
          return (
            <g key={`edge-${i}`}>
              <path d={pathOf(points)} fill="none" stroke={isAssoc ? (isSys ? '#6366f1' : '#94a3b8') : '#93c5fd'} strokeWidth={isSys ? 1.2 : (isAssoc ? 1 : 1.2)}
                strokeDasharray={isAssoc ? (isSys ? '6 3' : '4 2') : undefined} markerEnd={isAssoc ? `url(#${markerId})` : undefined} />
              {isAssoc && ed?.label && <text x={mid.x} y={mid.y - 6} textAnchor="middle" fontSize={9} fill={isSys ? '#6366f1' : '#94a3b8'} fontStyle={isSys ? 'italic' : undefined}>«{ed.label}»</text>}
            </g>
          )
        })}
        {actors.map(a => { const pos = nodePos.get(`actor:${a}`); return pos ? <ActorFigure key={a} x={pos.x} y={pos.y} label={a} /> : null })}
        {ucs.map(u => { const pos = nodePos.get(u.id); if (!pos) return null
          return (
            <g key={u.id}>
              <ellipse cx={pos.x} cy={pos.y} rx={ovalRx} ry={ovalRy} fill="#eff6ff" stroke="#3b82f6" strokeWidth={1.5} />
              <text x={pos.x} y={pos.y + 4} textAnchor="middle" fontSize={isSys ? 12 : 11} fill="#1e40af" fontWeight={600}>{u.name}</text>
            </g>
          ) })}
      </svg>
    </div>
  )
}

// Diagram for a system detail page — all use cases of a specific system with actors
export function SystemDetailDiagram({ systemId }: { systemId: string }) {
  const { ix } = useGraph()
  const sys = ix.node(systemId); if (!sys) return null
  const ucs = ix.childrenOf(systemId, 'system-use-case').map(u => ({ id: u.id, name: u.name, actor: ix.targets(u.id, 'has-actor')[0]?.name ?? '', pkg: u.package ?? '' }))
  return <ContainerUseCaseDiagram containerName={sys.name} ucs={ucs} markerId="sys-arrow" />
}

// Use case diagram for a single application detail page
export function AppDetailDiagram({ appId }: { appId: string }) {
  const { ix } = useGraph()
  const app = ix.node(appId); if (!app) return null
  const ucs = ix.childrenOf(appId, 'app-use-case').map(u => ({ id: u.id, name: u.name, actor: ix.targets(u.id, 'has-actor')[0]?.name ?? '', pkg: u.package ?? '' }))
  return <ContainerUseCaseDiagram containerName={app.name} ucs={ucs} markerId="app-uc-arrow" />
}

// Solution use case diagram: the covered app use cases, clustered by owning application
export function SolutionUseCaseDiagram({ solutionId }: { solutionId: string }) {
  const { ix } = useGraph()
  const sol = ix.node(solutionId); if (!sol) return null
  const ucs = ix.targets(solutionId, 'covers').filter(n => n.kind === 'app-use-case').map(u => ({ id: u.id, name: u.name, actor: ix.targets(u.id, 'has-actor')[0]?.name ?? '', pkg: ix.appOf(u.id)?.name ?? '' }))
  return <ContainerUseCaseDiagram containerName={sol.name} ucs={ucs} markerId="solution-uc-arrow" />
}

// Business use case diagram (business view overview)
export function BusinessUseCaseDiagram() {
  const { ix } = useGraph()
  const org = ix.orgName()
  const bucs = ix.roots('business-use-case')
  if (bucs.length === 0) return null
  const actorOf = (id: string) => ix.targets(id, 'has-actor')[0]?.name ?? ''
  const actors = [...new Set(bucs.map(b => actorOf(b.id)).filter(Boolean))]
  const g = new dagre.graphlib.Graph({ compound: true })
  g.setGraph({ rankdir: 'LR', ranksep: 100, nodesep: 50, marginx: 60, marginy: 50 })
  g.setDefaultEdgeLabel(() => ({}))
  const nodeW = 240, nodeH = 48
  actors.forEach(a => g.setNode(`actor:${a}`, { label: a, width: 120, height: 80 }))
  g.setNode('system-boundary', { label: org, clusterLabelPos: 'top' })
  bucs.forEach(b => { g.setNode(b.id, { label: b.name, width: nodeW, height: nodeH }); g.setParent(b.id, 'system-boundary') })
  bucs.forEach(b => { const a = actorOf(b.id); if (g.hasNode(`actor:${a}`)) g.setEdge(`actor:${a}`, b.id) })
  dagre.layout(g)
  const nodePos = positions(g)
  let bndMinX = Infinity, bndMinY = Infinity, bndMaxX = -Infinity, bndMaxY = -Infinity
  bucs.forEach(b => { const pos = nodePos.get(b.id); if (!pos) return
    bndMinX = Math.min(bndMinX, pos.x - nodeW / 2 - 20); bndMinY = Math.min(bndMinY, pos.y - pos.h / 2 - 20)
    bndMaxX = Math.max(bndMaxX, pos.x + nodeW / 2 + 20); bndMaxY = Math.max(bndMaxY, pos.y + pos.h / 2 + 20) })
  const gi = g.graph()
  const svgWidth = (gi.width || 800) + 80, svgHeight = (gi.height || 400) + 80
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 overflow-x-auto">
      <svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="mx-auto" style={{ minWidth: svgWidth }}>
        <rect x={bndMinX} y={bndMinY} width={bndMaxX - bndMinX} height={bndMaxY - bndMinY} rx={12} ry={12} fill="#f8fafc" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="6 3" />
        <text x={bndMinX + 12} y={bndMinY + 18} fontSize={13} fill="#475569" fontWeight={600}>{org}</text>
        {g.edges().map((e, i) => { const points = g.edge(e)?.points as Pt[] | undefined; return points && points.length >= 2 ? <path key={`edge-${i}`} d={pathOf(points)} fill="none" stroke="#93c5fd" strokeWidth={1.2} /> : null })}
        {actors.map(a => { const pos = nodePos.get(`actor:${a}`); return pos ? <ActorFigure key={a} x={pos.x} y={pos.y} label={a} /> : null })}
        {bucs.map(b => { const pos = nodePos.get(b.id); if (!pos) return null
          return (
            <g key={b.id}>
              <ellipse cx={pos.x} cy={pos.y} rx={nodeW / 2} ry={nodeH / 2} fill="#eff6ff" stroke="#3b82f6" strokeWidth={1.5} />
              <text x={pos.x} y={pos.y + 4} textAnchor="middle" fontSize={12} fill="#1e40af" fontWeight={600}>{b.name}</text>
            </g>
          ) })}
      </svg>
    </div>
  )
}
