// Neighbor-expansion sheet for a selected node.
// Lists all edges touching the node, grouped by (rel, direction); each target has a toggle
// to add/remove it from the displayed set.

import { useMemo } from 'react'
import type { GNode, GEdge, RelKindInfo } from './api.ts'
import { rankOf } from './vocab-order.ts'

interface Neighbor {
  target: GNode
  direction: 'out' | 'in'  // out = source is this node; in = target is this node
  edge: GEdge              // the actual edge (needed for delete)
}

interface Props {
  nodeId: string
  allNodes: GNode[]
  allEdges: GEdge[]
  displayedIds: Set<string>
  relKinds: RelKindInfo[]                   // to detect implicit / derived rels (can't be deleted)
  onToggle: (nodeId: string, show: boolean) => void
  onDeleteEdge: (edge: GEdge) => void       // delete a single edge (via apiDisconnect)
  onClose: () => void
}

export function ExpandSheet({
  nodeId, allNodes, allEdges, displayedIds, relKinds,
  onToggle, onDeleteEdge, onClose,
}: Props) {
  const nodeById = useMemo(() => {
    const m = new Map<string, GNode>()
    for (const n of allNodes) m.set(n.id, n)
    return m
  }, [allNodes])

  const relByKind = useMemo(() => {
    const m = new Map<string, RelKindInfo>()
    for (const r of relKinds) m.set(r.kind, r)
    return m
  }, [relKinds])

  const relRank = useMemo(() => rankOf(relKinds.map(r => r.kind)), [relKinds])

  const self = nodeById.get(nodeId)

  // Collect neighbors grouped by (rel, direction).
  const groups = useMemo(() => {
    const g = new Map<string, { rel: string; direction: 'out' | 'in'; neighbors: Neighbor[] }>()
    for (const e of allEdges) {
      let direction: 'out' | 'in' | null = null
      let targetId: string | null = null
      if (e.from === nodeId) { direction = 'out'; targetId = e.to }
      else if (e.to === nodeId) { direction = 'in'; targetId = e.from }
      if (!direction || !targetId) continue
      if (e.from === e.to) direction = 'out'
      const target = nodeById.get(targetId)
      if (!target) continue
      const key = `${e.rel}::${direction}`
      const bucket = g.get(key) ?? { rel: e.rel, direction, neighbors: [] }
      if (!bucket.neighbors.some(n => n.target.id === targetId)) {
        bucket.neighbors.push({ target, direction, edge: e })
      }
      g.set(key, bucket)
    }
    return [...g.values()].sort((a, b) => {
      if (a.direction !== b.direction) return a.direction === 'out' ? -1 : 1
      return relRank(a.rel) - relRank(b.rel)
    })
  }, [nodeId, allEdges, nodeById, relRank])

  const totalNeighbors = groups.reduce((n, g) => n + g.neighbors.length, 0)

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet expand-sheet">
        <div className="sheet-header">
          <div className="sheet-spacer" />
          <span className="sheet-title">
            {self ? `${self.kind} · ${self.name}` : 'Expand'}
          </span>
          <button className="sheet-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="sheet-body">
          {totalNeighbors === 0 && (
            <div className="search-empty">This node has no connections.</div>
          )}
          {groups.map(group => (
            <div key={`${group.rel}::${group.direction}`} className="expand-group">
              <div className="expand-group-header">
                <span className="expand-rel">{group.rel}</span>
                <span className="expand-dir">
                  {group.direction === 'out' ? '→ (outgoing)' : '← (incoming)'}
                </span>
                <span className="expand-count">· {group.neighbors.length}</span>
              </div>
              {group.neighbors.map(n => {
                const shown = displayedIds.has(n.target.id)
                const relInfo = relByKind.get(group.rel)
                // Deletable = explicit rel (not implicit, endpoint not derived).
                // We only allow deleting from the source side (direction=out); incoming edges
                // are managed from the OTHER end's perspective — user should tap the source.
                const epIsDerived = relInfo?.endpoints.some(
                  ep => ep.source === (group.direction === 'out' ? (self?.kind ?? '') : n.target.kind) &&
                        ep.target === (group.direction === 'out' ? n.target.kind : (self?.kind ?? '')) &&
                        ep.derived,
                ) ?? false
                const canDelete = !!relInfo && !relInfo.implicit && !epIsDerived && group.direction === 'out'
                return (
                  <div key={n.target.id} className="expand-item">
                    <input
                      type="checkbox"
                      checked={shown}
                      onChange={e => onToggle(n.target.id, e.target.checked)}
                    />
                    <span className="expand-item-name">{n.target.name}</span>
                    <span className="expand-item-kind">{n.target.kind}</span>
                    {canDelete && (
                      <button
                        className="expand-delete-btn"
                        onClick={() => onDeleteEdge(n.edge)}
                        title="Delete this edge (keeps both nodes)"
                        aria-label="Delete edge"
                      >
                        🗑
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
