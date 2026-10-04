// Full-viewport search sheet — filters all nodes by keyword; tap to add to canvas.
// Results grouped by kind; empty query shows all kinds' first-N as browse view.

import { useMemo, useState, useEffect, useRef } from 'react'
import type { GNode } from './api.ts'
import { orderedEntries } from './vocab-order.ts'

interface Props {
  allNodes: GNode[]
  displayedIds: Set<string>
  nodeKindOrder: string[]  // canonical order from vocab.nodeKinds
  onPick: (nodeId: string) => void
  onClose: () => void
}

const MAX_PER_KIND = 30

export function SearchSheet({ allNodes, displayedIds, nodeKindOrder, onPick, onClose }: Props) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = q
      ? allNodes.filter(n =>
          n.name.toLowerCase().includes(q) ||
          n.handle.toLowerCase().includes(q) ||
          n.kind.toLowerCase().includes(q))
      : allNodes
    // Group by kind
    const grouped = new Map<string, GNode[]>()
    for (const n of matches) {
      const list = grouped.get(n.kind) ?? []
      list.push(n)
      grouped.set(n.kind, list)
    }
    // Order kinds by vocabulary registry (business → app → domain); cap per kind
    return orderedEntries(grouped, nodeKindOrder)
      .map(([kind, list]) => ({
        kind,
        items: list.slice(0, MAX_PER_KIND),
        total: list.length,
      }))
  }, [allNodes, query, nodeKindOrder])

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet search-sheet">
        <div className="sheet-header">
          <div className="sheet-spacer" />
          <span className="sheet-title">Add nodes to canvas</span>
          <button className="sheet-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="search-input-wrap">
          <input
            ref={inputRef}
            className="search-input"
            placeholder="Search by name, handle, or kind…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        <div className="sheet-body search-body">
          {filtered.length === 0 && (
            <div className="search-empty">No nodes match "{query}"</div>
          )}
          {filtered.map(group => (
            <div key={group.kind} className="search-group">
              <div className="search-group-header">
                {group.kind}
                {group.total > MAX_PER_KIND && (
                  <span className="search-group-count"> (showing {MAX_PER_KIND} of {group.total} — narrow query to see more)</span>
                )}
              </div>
              {group.items.map(n => {
                const shown = displayedIds.has(n.id)
                return (
                  <button
                    key={n.id}
                    className={`sheet-item search-item ${shown ? 'shown' : ''}`}
                    onClick={() => { if (!shown) onPick(n.id) }}
                    disabled={shown}
                    title={n.handle}
                  >
                    <span className="search-item-name">{n.name}</span>
                    <span className="search-item-handle">{n.handle}</span>
                    {shown && <span className="search-item-badge">on canvas</span>}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
