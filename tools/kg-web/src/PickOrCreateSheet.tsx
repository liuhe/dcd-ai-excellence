// Pick an existing target node of a given kind — or type a new name to create one.
// Used by the "Add related" flow to avoid making users type exact existing names.

import { useMemo, useState, useEffect, useRef } from 'react'
import type { GNode } from './api.ts'

interface Props {
  targetKind: string
  rel: string
  sourceName: string
  candidates: GNode[]           // all nodes of `targetKind`
  onPickExisting: (name: string) => void  // pass the node's handle
  onCreateNew: (name: string) => void     // pass the new name
  onClose: () => void
}

export function PickOrCreateSheet({
  targetKind, rel, sourceName, candidates,
  onPickExisting, onCreateNew, onClose,
}: Props) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return candidates.slice(0, 60)
    return candidates.filter(n =>
      n.name.toLowerCase().includes(q) || n.handle.toLowerCase().includes(q),
    ).slice(0, 60)
  }, [candidates, query])

  // An exact-name existing match, so we can hide the "create" button when it'd duplicate.
  const exactExisting = useMemo(
    () => candidates.find(n => n.name === query.trim() || n.handle === query.trim()),
    [candidates, query],
  )

  const canCreate = query.trim().length > 0 && !exactExisting

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet search-sheet">
        <div className="sheet-header">
          <div className="sheet-spacer" />
          <span className="sheet-title">
            {sourceName} — {rel} → {targetKind}
          </span>
          <button className="sheet-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="search-input-wrap">
          <input
            ref={inputRef}
            className="search-input"
            placeholder={`Search ${targetKind} or type new name…`}
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>

        {canCreate && (
          <div className="pick-create-bar">
            <button
              className="action-btn primary"
              onClick={() => onCreateNew(query.trim())}
            >
              ＋ Create new {targetKind} "{query.trim()}"
            </button>
          </div>
        )}

        <div className="sheet-body search-body">
          {filtered.length === 0 && (
            <div className="search-empty">
              {candidates.length === 0
                ? `No ${targetKind} nodes exist yet. Type a name above to create the first one.`
                : `No ${targetKind} matches "${query}".`}
            </div>
          )}
          {filtered.map(n => (
            <button
              key={n.id}
              className="sheet-item search-item"
              onClick={() => onPickExisting(n.handle)}
              title={n.handle}
            >
              <span className="search-item-name">{n.name}</span>
              <span className="search-item-handle">{n.handle}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
