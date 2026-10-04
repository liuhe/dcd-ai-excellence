// Picker for attrs that drive derived rels (e.g. BUC.actor → has-actor).
// Shows candidate nodes from all target kinds, grouped, so user picks a name that
// will actually match — instead of typing a bare string that may typo.
// Also supports typing an arbitrary new name (stored as-is; derived rel just won't fire
// until a matching node exists).

import { useMemo, useState, useRef, useEffect } from 'react'
import type { GNode } from './api.ts'
import { orderedEntries } from './vocab-order.ts'

interface Props {
  sourceKind: string
  sourceName: string
  attrName: string
  targetKinds: string[]        // union of kinds the derived rel may match against
  allNodes: GNode[]
  nodeKindOrder: string[]      // canonical order from vocab.nodeKinds
  onPick: (value: string) => void
  onClose: () => void
}

export function PickAttrTargetSheet({
  sourceKind, sourceName, attrName, targetKinds, allNodes, nodeKindOrder,
  onPick, onClose,
}: Props) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.focus() }, [])

  const kindSet = useMemo(() => new Set(targetKinds), [targetKinds])
  const candidates = useMemo(
    () => allNodes.filter(n => kindSet.has(n.kind)),
    [allNodes, kindSet],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = q
      ? candidates.filter(n =>
          n.name.toLowerCase().includes(q) || n.handle.toLowerCase().includes(q),
        )
      : candidates
    // Group by kind
    const grouped = new Map<string, GNode[]>()
    for (const n of matches) {
      const list = grouped.get(n.kind) ?? []
      list.push(n)
      grouped.set(n.kind, list)
    }
    return orderedEntries(grouped, nodeKindOrder)
  }, [candidates, query, nodeKindOrder])

  const exactExisting = useMemo(
    () => candidates.find(n => n.name === query.trim()),
    [candidates, query],
  )
  const canType = query.trim().length > 0 && !exactExisting

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet search-sheet">
        <div className="sheet-header">
          <div className="sheet-spacer" />
          <span className="sheet-title">
            {sourceKind} · {sourceName} — set {attrName}
          </span>
          <button className="sheet-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="search-input-wrap">
          <input
            ref={inputRef}
            className="search-input"
            placeholder={`Pick from ${targetKinds.join(' / ')} or type a name…`}
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>

        {canType && (
          <div className="pick-create-bar">
            <button
              className="action-btn primary"
              onClick={() => onPick(query.trim())}
            >
              Set {attrName} = "{query.trim()}" (no match yet)
            </button>
          </div>
        )}

        <div className="sheet-body search-body">
          {filtered.length === 0 && (
            <div className="search-empty">
              {candidates.length === 0
                ? `No ${targetKinds.join(' / ')} nodes exist yet.`
                : `No match for "${query}".`}
            </div>
          )}
          {filtered.map(([kind, items]) => (
            <div key={kind} className="search-group">
              <div className="search-group-header">{kind}</div>
              {items.map(n => (
                <button
                  key={n.id}
                  className="sheet-item search-item"
                  onClick={() => onPick(n.name)}
                  title={n.handle}
                >
                  <span className="search-item-name">{n.name}</span>
                  <span className="search-item-handle">{n.handle}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
