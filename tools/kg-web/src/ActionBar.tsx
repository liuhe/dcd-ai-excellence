// Floating Action Bar — appears near / at top of viewport when a node or edge is selected.
// Buttons trigger primary actions (New related / Delete for nodes; Delete for edges).
// The "add new" flow opens the BottomSheet with rel-kind picker; delete confirms then executes.

interface NodeSelected {
  type: 'node'
  kind: string
  handle: string
  name: string
}

interface EdgeSelected {
  type: 'edge'
  from: string
  rel: string
  toHandle: string
}

export type Selection = NodeSelected | EdgeSelected

interface Props {
  selection: Selection
  onAddRelated: () => void
  onExpand?: () => void       // node-only: open neighbor expansion sheet
  onEditAttrs?: () => void    // node-only: open attr editor sheet
  onHide?: () => void         // node-only: remove from workbench (no model change)
  onDelete: () => void        // permanent: delete from model YAML (or disconnect edge)
  onDeselect: () => void
}

export function ActionBar({
  selection, onAddRelated, onExpand, onEditAttrs, onHide, onDelete, onDeselect,
}: Props) {
  const label = selection.type === 'node'
    ? `${selection.kind} · ${selection.name}`
    : `edge · ${selection.rel}`
  return (
    <div className="action-bar">
      <span className="action-bar-label" title={label}>{label}</span>
      {selection.type === 'node' && onExpand && (
        <button onClick={onExpand} className="action-btn">
          ↔ Expand
        </button>
      )}
      {selection.type === 'node' && onEditAttrs && (
        <button onClick={onEditAttrs} className="action-btn">
          ✎ Attrs
        </button>
      )}
      {selection.type === 'node' && (
        <button onClick={onAddRelated} className="action-btn primary">
          ＋ New
        </button>
      )}
      {selection.type === 'node' && onHide && (
        <button onClick={onHide} className="action-btn" title="Hide from workbench (keeps model)">
          👁 Hide
        </button>
      )}
      <button onClick={onDelete} className="action-btn danger" title="Delete permanently from model">
        🗑
      </button>
      <button onClick={onDeselect} className="action-btn subtle" aria-label="Deselect">✕</button>
    </div>
  )
}
