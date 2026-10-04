// Value-types management sheet (v6).
// Lists primitives + user-defined VTs; allows create / rename / delete of user-defined ones.
// VOs are the current user-defined kind. Enum + composite come later.

import { useEffect, useState, useCallback } from 'react'
import { fetchValueTypes, apiAddVt, apiRemoveVt, type VtStore } from './api.ts'

interface Props {
  onClose: () => void
  onError: (msg: string) => void
}

export function ValueTypesSheet({ onClose, onError }: Props) {
  const [store, setStore] = useState<VtStore | null>(null)
  const [creating, setCreating] = useState(false)

  const reload = useCallback(async () => {
    try { setStore(await fetchValueTypes()) }
    catch (e) { onError(e instanceof Error ? e.message : String(e)) }
  }, [onError])

  useEffect(() => { void reload() }, [reload])

  const onCreate = async () => {
    const parent = window.prompt('Application that declares it (id or application:<name>):')
    if (!parent) return
    const name = window.prompt('Value-type name:')
    if (!name) return
    const kind = window.confirm('Value object? (Cancel = enum)') ? 'value-object' : 'enum'
    setCreating(true)
    try {
      await apiAddVt(kind, name, parent)
      await reload()
    } catch (e) { onError(e instanceof Error ? e.message : String(e)) }
    finally { setCreating(false) }
  }

  const onRemove = async (kind: string, id: string) => {
    if (!window.confirm(`Delete value-type ${id}?\n\n⚠ This edits the YAML. Any field.type references become stale.`)) return
    try {
      await apiRemoveVt(kind, id)
      await reload()
    } catch (e) { onError(e instanceof Error ? e.message : String(e)) }
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet vt-sheet">
        <div className="sheet-header">
          <div className="sheet-spacer" />
          <span className="sheet-title">Value types</span>
          <button className="sheet-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="sheet-body">
          {!store && <div className="search-empty">Loading…</div>}
          {store && (
            <>
              <div className="vt-section">
                <div className="vt-section-header">Primitives (built-in)</div>
                <div className="vt-primitives">
                  {store.primitives.map(p => (
                    <span key={p} className="vt-primitive-chip">{p}</span>
                  ))}
                </div>
              </div>

              <div className="vt-section">
                <div className="vt-section-header">
                  User-defined ({store.userItems.length})
                  <button className="action-btn primary" onClick={onCreate} disabled={creating}>
                    ＋ New
                  </button>
                </div>
                {store.userItems.length === 0 && (
                  <div className="search-empty">No user-defined value-types yet.</div>
                )}
                {store.userItems.map(it => (
                  <div key={it.id} className="expand-item">
                    <span className="expand-item-name">{it.name}</span>
                    <span className="expand-item-kind">{it.kind} {it.id} @ {it.app}</span>
                    <button
                      className="expand-delete-btn"
                      onClick={() => onRemove(it.kind, it.id)}
                      title="Delete this value-type"
                    >
                      🗑
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
