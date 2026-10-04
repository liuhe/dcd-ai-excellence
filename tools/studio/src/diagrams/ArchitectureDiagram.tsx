// Architecture overview — apps and actors with edges from `topology` (semantic flow), via dagre.
import dagre from 'dagre'
import { useGraph } from '../graph/store'
import { ActorFigure, pathOf, midOf, type Pt } from './primitives'

export function ArchitectureDiagram() {
  const { ix, graph } = useGraph()
  const apps = ix.roots('application')
  if (apps.length === 0) return null
  const overviewEdges = (graph.extras.topology ?? []) as Array<{ from?: string; to?: string; label?: string; type?: string }>
  const appNames = new Set(apps.map(a => a.name))
  const allNodes = new Set<string>()
  overviewEdges.forEach(e => { if (e.from) allNodes.add(e.from); if (e.to) allNodes.add(e.to) })
  appNames.forEach(n => allNodes.add(n))
  const TYPE_COLORS: Record<string, string> = { frontend: '#3b82f6', client: '#14b8a6', backend: '#10b981', proxy: '#f59e0b', external: '#8b5cf6' }
  const appTypeMap = new Map<string, string>(); apps.forEach(a => appTypeMap.set(a.name, (ix.data(a.id).type as string) || 'backend'))

  type EdgeItem = { label: string; type: string }
  const directional = new Map<string, EdgeItem[]>(); const selfLoops = new Map<string, EdgeItem[]>()
  overviewEdges.forEach(e => {
    if (!e.from || !e.to) return
    const item = { label: e.label || '', type: e.type || 'call' }
    if (e.from === e.to) { selfLoops.set(e.from, [...(selfLoops.get(e.from) ?? []), item]); return }
    const key = `${e.from}->${e.to}`; directional.set(key, [...(directional.get(key) ?? []), item])
  })
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', ranksep: 200, nodesep: 80, marginx: 60, marginy: 60 })
  g.setDefaultEdgeLabel(() => ({}))
  const appW = 180, appH = 56, actorW = 100, actorH = 80
  allNodes.forEach(n => g.setNode(n, appNames.has(n) ? { label: n, width: appW, height: appH } : { label: n, width: actorW, height: actorH }))
  directional.forEach((items, key) => { const [from, to] = key.split('->'); g.setEdge(from, to, { items, primaryType: items.some(i => i.type === 'sync') ? 'sync' : 'call' }) })
  dagre.layout(g)
  const nodePos = new Map<string, { x: number; y: number; w: number; h: number }>()
  g.nodes().forEach(id => { const nd = g.node(id); if (nd) nodePos.set(id, { x: nd.x, y: nd.y, w: nd.width, h: nd.height }) })
  const gi = g.graph()
  const selfLoopSpaceTop = selfLoops.size > 0 ? 80 : 0
  const svgWidth = (gi.width || 800) + 80, svgHeight = (gi.height || 400) + 80 + selfLoopSpaceTop
  const wrap = (text: string, max = 16): string[] => { if (!text) return []; if (text.length <= max) return [text]; const l: string[] = []; for (let i = 0; i < text.length; i += max) l.push(text.slice(i, i + max)); return l }
  const labelLineH = 12, labelGap = 4, labelChar = 6.5

  const stacked = (items: EdgeItem[], cx: number, top: number) => {
    const wrapped = items.map(it => ({ ...it, lines: wrap(it.label) }))
    const heights = wrapped.map(w => w.lines.length * labelLineH)
    const total = heights.reduce((a, b) => a + b, 0) + Math.max(0, items.length - 1) * labelGap
    let y = top - 6 - total
    return wrapped.map((item, k) => {
      const blockY = y; y += heights[k] + labelGap
      const bgW = Math.max(...item.lines.map(l => l.length)) * labelChar + 8, bgH = item.lines.length * labelLineH + 4
      return (
        <g key={k}>
          <rect x={cx - bgW / 2} y={blockY - 2} width={bgW} height={bgH} rx={3} ry={3} fill="white" fillOpacity={0.9} />
          {item.lines.map((line, li) => <text key={li} x={cx} y={blockY + (li + 1) * labelLineH - 2} textAnchor="middle" fontSize={10} fill="#475569" fontWeight={500}>{line}</text>)}
        </g>
      )
    })
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 overflow-x-auto">
      <svg width={svgWidth} height={svgHeight} viewBox={`0 ${-selfLoopSpaceTop} ${svgWidth} ${svgHeight}`} className="mx-auto" style={{ minWidth: svgWidth }}>
        <defs><marker id="arch-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#94a3b8" /></marker></defs>
        {g.edges().map((e, i) => {
          const ed = g.edge(e); const points = ed?.points as Pt[] | undefined
          if (!points || points.length < 2) return null
          const items = (ed?.items || []) as EdgeItem[]; const mid = midOf(points); const isSync = ed?.primaryType === 'sync'
          return (
            <g key={`edge-${i}`}>
              <path d={pathOf(points)} fill="none" stroke={isSync ? '#3b82f6' : '#94a3b8'} strokeWidth={1.4} strokeDasharray={isSync ? 'none' : '6 3'} markerEnd="url(#arch-arrow)" />
              {stacked(items, mid.x, mid.y)}
            </g>
          )
        })}
        {[...selfLoops.entries()].map(([name, items]) => {
          const pos = nodePos.get(name); if (!pos) return null
          const yTop = pos.y - pos.h / 2, arcRy = 28
          return (
            <g key={`self-${name}`}>
              <path d={`M ${pos.x - 30} ${yTop} A 36 ${arcRy} 0 0 1 ${pos.x + 30} ${yTop}`} fill="none" stroke="#94a3b8" strokeWidth={1.4} strokeDasharray="6 3" markerEnd="url(#arch-arrow)" />
              {stacked(items, pos.x, yTop - arcRy)}
            </g>
          )
        })}
        {[...allNodes].map(name => {
          const pos = nodePos.get(name); if (!pos) return null
          if (!appNames.has(name)) return <ActorFigure key={name} x={pos.x} y={pos.y} label={name} />
          const t = appTypeMap.get(name) || 'backend'; const color = TYPE_COLORS[t] || '#94a3b8'
          return (
            <g key={name}>
              <rect x={pos.x - appW / 2} y={pos.y - appH / 2} width={appW} height={appH} rx={8} ry={8} fill="white" stroke={color} strokeWidth={2} />
              <text x={pos.x} y={pos.y - 4} textAnchor="middle" fontSize={13} fill="#1e293b" fontWeight={700}>{name}</text>
              <text x={pos.x} y={pos.y + 14} textAnchor="middle" fontSize={10} fill={color} fontWeight={500}>{t}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
