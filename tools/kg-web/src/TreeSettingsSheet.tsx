// Tree view settings for the current workbench: pick which rels count as "tree edges".
// Roots are auto-derived (workbench nodes with no incoming tree-rel edge), so no root picker here.

import type { RelKindInfo } from './api.ts'

interface Props {
  treeRels: string[]          // empty = "all rels"
  relKinds: RelKindInfo[]
  onSetTreeRels: (rels: string[]) => void
  onClose: () => void
}

export function TreeSettingsSheet({ treeRels, relKinds, onSetTreeRels, onClose }: Props) {
  const allChecked = treeRels.length === 0
  const toggleRel = (kind: string, checked: boolean) => {
    const explicit = allChecked ? relKinds.map(r => r.kind) : [...treeRels]
    if (checked) {
      if (!explicit.includes(kind)) explicit.push(kind)
    } else {
      const idx = explicit.indexOf(kind)
      if (idx >= 0) explicit.splice(idx, 1)
    }
    if (explicit.length === relKinds.length) onSetTreeRels([])
    else onSetTreeRels(explicit)
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet tree-settings-sheet">
        <div className="sheet-header">
          <div className="sheet-spacer" />
          <span className="sheet-title">Tree settings</span>
          <button className="sheet-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="sheet-body">
          <div className="tree-settings-section">
            <div className="tree-settings-heading">
              Tree rels
              <span className="tree-settings-hint">
                (which rels count as parent → child; roots auto-derived from those with no incoming tree edge)
              </span>
            </div>
            {relKinds.map(r => {
              const checked = allChecked || treeRels.includes(r.kind)
              return (
                <label key={r.kind} className="expand-item">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={e => toggleRel(r.kind, e.target.checked)}
                  />
                  <span className="expand-item-name">{r.kind}</span>
                  <span className="expand-item-kind">
                    {r.endpoints.map(e => `${e.source}→${e.target}`).join(' | ')}
                  </span>
                </label>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
