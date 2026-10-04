// Central menu — the only bottom sheet for header actions. Order top → bottom:
//   1. Node (only when selection): Expand / Attrs / New related / Hide / Delete / Deselect
//   2. Workbench: search / view mode / tree settings
//   3. Value types (model-level)
//   4. Workbench management (second-to-last)
//   5. Projects (bottom)
//
// Selection presence changes both the menu button style (in header) AND the contents shown here.

import type { Selection } from './ActionBar.tsx'

interface Props {
  selection: Selection | null

  hasWorkbench: boolean
  viewMode: 'graph' | 'tree'
  canRenameWorkbench: boolean

  // Node actions (only used when selection)
  onExpand: () => void
  onEditAttrs: () => void
  onAddRelated: () => void
  onHide: () => void
  onDelete: () => void
  onDeselect: () => void

  // Workbench
  onSearch: () => void
  onSetViewMode: (mode: 'graph' | 'tree') => void
  onOpenTreeSettings: () => void

  // Workbench management
  onCreateWorkbench: () => void
  onRenameWorkbench: () => void
  onDeleteWorkbench: () => void

  // Model
  onNewNode: () => void
  onOpenValueTypes: () => void
  onOpenVocabRef: () => void
  onOpenProjects: () => void

  onClose: () => void
}

export function MenuSheet(props: Props) {
  const p = props
  const wrap = (fn: () => void) => () => { p.onClose(); fn() }

  const selNode = p.selection?.type === 'node' ? p.selection : null
  const selEdge = p.selection?.type === 'edge' ? p.selection : null

  return (
    <>
      <div className="sheet-backdrop" onClick={p.onClose} />
      <div className="sheet menu-sheet">
        <div className="sheet-header">
          <div className="sheet-spacer" />
          <span className="sheet-title">Menu</span>
          <button className="sheet-close" onClick={p.onClose} aria-label="Close">✕</button>
        </div>
        <div className="sheet-body">

          {/* 1. Node actions — top of menu when selection */}
          {p.selection && (
            <div className="menu-section">
              <div className="menu-section-header">
                {selNode && `Node · ${selNode.kind} · ${selNode.name}`}
                {selEdge && `Edge · ${selEdge.rel}`}
              </div>
              {selNode && (
                <>
                  <button className="sheet-item" onClick={wrap(p.onExpand)}>
                    <span>↔ Expand connections</span><span className="chevron">›</span>
                  </button>
                  <button className="sheet-item" onClick={wrap(p.onEditAttrs)}>
                    <span>✎ Edit node (attrs + rels)</span><span className="chevron">›</span>
                  </button>
                  <button className="sheet-item" onClick={wrap(p.onAddRelated)}>
                    <span>＋ Add related</span><span className="chevron">›</span>
                  </button>
                  <button className="sheet-item" onClick={wrap(p.onHide)}>
                    <span>👁 Hide from workbench</span><span className="chevron">›</span>
                  </button>
                </>
              )}
              <button className="sheet-item" onClick={wrap(p.onDelete)}>
                <span style={{ color: 'var(--danger)' }}>
                  🗑 {selEdge ? 'Delete edge' : 'Delete node from model'}
                </span>
                <span className="chevron">›</span>
              </button>
              <button className="sheet-item" onClick={wrap(p.onDeselect)}>
                <span>✕ Deselect</span><span className="chevron">›</span>
              </button>
            </div>
          )}

          {/* 2. Workbench */}
          {p.hasWorkbench && (
            <div className="menu-section">
              <div className="menu-section-header">Workbench</div>
              <button className="sheet-item" onClick={wrap(p.onSearch)}>
                <span>🔍 Search & add nodes</span><span className="chevron">›</span>
              </button>
              <div className="menu-viewmode-row">
                <span className="menu-viewmode-label">View:</span>
                <button
                  className={`menu-viewmode-btn ${p.viewMode === 'graph' ? 'active' : ''}`}
                  onClick={wrap(() => p.onSetViewMode('graph'))}
                >⬢ Graph</button>
                <button
                  className={`menu-viewmode-btn ${p.viewMode === 'tree' ? 'active' : ''}`}
                  onClick={wrap(() => p.onSetViewMode('tree'))}
                >⋯ Tree</button>
                {p.viewMode === 'tree' && (
                  <button className="menu-viewmode-btn" onClick={wrap(p.onOpenTreeSettings)}>⚙</button>
                )}
              </div>
            </div>
          )}

          {/* 3. Model-level actions */}
          <div className="menu-section">
            <div className="menu-section-header">Model</div>
            <button className="sheet-item" onClick={wrap(p.onNewNode)}>
              <span>＋ New node</span><span className="chevron">›</span>
            </button>
            <button className="sheet-item" onClick={wrap(p.onOpenValueTypes)}>
              <span>𝜏 Value types</span><span className="chevron">›</span>
            </button>
            <button className="sheet-item" onClick={wrap(p.onOpenVocabRef)}>
              <span>📖 Vocabulary reference</span><span className="chevron">›</span>
            </button>
          </div>

          {/* 4. Workbench management — second from bottom */}
          <div className="menu-section">
            <div className="menu-section-header">Workbench management</div>
            <button className="sheet-item" onClick={wrap(p.onCreateWorkbench)}>
              <span>＋ New workbench</span><span className="chevron">›</span>
            </button>
            {p.canRenameWorkbench && (
              <>
                <button className="sheet-item" onClick={wrap(p.onRenameWorkbench)}>
                  <span>✎ Rename current workbench</span><span className="chevron">›</span>
                </button>
                <button className="sheet-item" onClick={wrap(p.onDeleteWorkbench)}>
                  <span style={{ color: 'var(--danger)' }}>🗑 Delete current workbench</span>
                  <span className="chevron">›</span>
                </button>
              </>
            )}
          </div>

          {/* 5. Projects (bottom) */}
          <div className="menu-section">
            <div className="menu-section-header">Projects</div>
            <button className="sheet-item" onClick={wrap(p.onOpenProjects)}>
              <span>⚙ Manage projects</span><span className="chevron">›</span>
            </button>
          </div>

        </div>
      </div>
    </>
  )
}
