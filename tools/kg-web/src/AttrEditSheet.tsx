// Node editor sheet — attrs + outgoing/incoming rel editing.
// Attrs open TextEditSheet / picker (parent decides via onPickAttr).
// Outgoing rels: add via onAddRel(rel) — parent pops target-kind chooser + picker.
//                delete via onDeleteEdge (parent calls apiDisconnect + reloads).
// Incoming rels: read-only info (edit via the source node's editor).

import type { ReactNode } from 'react'
import type { NodeAttrInfo, GNode, GEdge, RelKindInfo } from './api.ts'

interface Props {
  kind: string
  name: string
  nodeId: string
  attrs: NodeAttrInfo[]
  currentValues: Record<string, unknown>
  missingRequired?: string[]
  edges: GEdge[]
  allNodes: GNode[]
  relKinds: RelKindInfo[]
  onPickAttr: (attrName: string) => void
  onAddRel: (rel: string) => void
  onDeleteEdge: (edge: GEdge) => void
  onSelectOtherNode?: (nodeId: string) => void  // tap incoming source to switch selection
  onClose: () => void
}

interface RelGroup {
  rel: string
  implicit: boolean
  isScalar: boolean            // any relevant endpoint has scalar storage
  required: boolean            // any endpoint (for this source) required
  edges: GEdge[]
  allowedOtherKinds: string[]  // possible targets (outgoing) or sources (incoming)
}

export function AttrEditSheet({
  kind, name, nodeId, attrs, currentValues, missingRequired,
  edges, allNodes, relKinds,
  onPickAttr, onAddRel, onDeleteEdge, onSelectOtherNode, onClose,
}: Props) {
  const complexAttrs = new Set([
    'fields', 'methods', 'invariants', 'operations', 'payload', 'tech_stack', 'values',
  ])

  const displayValue = (attrName: string): string => {
    const v = currentValues[attrName]
    if (v === undefined || v === null) return '—'
    if (typeof v === 'string') return v
    if (typeof v === 'number' || typeof v === 'boolean') return String(v)
    if (Array.isArray(v)) return `[${v.length} items]`
    if (typeof v === 'object') return `{${Object.keys(v).length} keys}`
    return String(v)
  }

  const editable = attrs.filter(a => a.name !== 'name')

  // Build outgoing / incoming rel groups.
  const nodeById = new Map(allNodes.map(n => [n.id, n]))
  const outgoingEdges = edges.filter(e => e.from === nodeId)
  const incomingEdges = edges.filter(e => e.to === nodeId && e.from !== nodeId)

  const outgoing: RelGroup[] = []
  const incoming: RelGroup[] = []
  const missingSet = new Set(missingRequired ?? [])

  // Outgoing: iterate all rel-kinds this source-kind can originate; include even those with 0 edges.
  for (const rk of relKinds) {
    const eps = rk.endpoints.filter(e => e.source === kind && !e.derived)
    if (eps.length === 0) continue
    const targets = [...new Set(eps.map(e => e.target))]
    const es = outgoingEdges.filter(e => e.rel === rk.kind)
    const isScalar = eps.some(e => !!e.scalarField)
    const required = eps.some(e => e.required) || missingSet.has(rk.kind)
    outgoing.push({
      rel: rk.kind, implicit: rk.implicit, isScalar, required,
      edges: es, allowedOtherKinds: targets,
    })
  }
  // Sort: required first, then rels with existing edges, then the rest — preserving vocab order within tiers.
  outgoing.sort((a, b) => {
    const aScore = (a.required ? 0 : 2) + (a.edges.length > 0 ? 0 : 1)
    const bScore = (b.required ? 0 : 2) + (b.edges.length > 0 ? 0 : 1)
    return aScore - bScore
  })

  // Incoming: group existing incoming edges by rel-kind (only show rels that actually point here).
  const incomingByRel = new Map<string, GEdge[]>()
  for (const e of incomingEdges) {
    const list = incomingByRel.get(e.rel) ?? []
    list.push(e)
    incomingByRel.set(e.rel, list)
  }
  for (const [rel, es] of incomingByRel) {
    const rk = relKinds.find(r => r.kind === rel)
    incoming.push({
      rel, implicit: rk?.implicit ?? false, isScalar: false, required: false,
      edges: es, allowedOtherKinds: [],
    })
  }

  const targetHandleLabel = (e: GEdge): { name: string; kind: string; id: string } => {
    // targetKind is "kind:handle"; look up the actual node for the display name.
    const targetNode = nodeById.get(e.to)
    if (targetNode) return { name: targetNode.name, kind: targetNode.kind, id: targetNode.id }
    const colon = e.targetKind.indexOf(':')
    const k = colon >= 0 ? e.targetKind.slice(0, colon) : e.targetKind
    const h = colon >= 0 ? e.targetKind.slice(colon + 1) : ''
    return { name: h, kind: k, id: e.to }
  }
  const sourceLabel = (e: GEdge): { name: string; kind: string; id: string } => {
    const srcNode = nodeById.get(e.from)
    if (srcNode) return { name: srcNode.name, kind: srcNode.kind, id: srcNode.id }
    return { name: e.from, kind: 'unknown', id: e.from }
  }

  return (
    <>
      <div className="sheet-backdrop node-edit-backdrop" onClick={onClose} />
      <div className="sheet node-edit-sheet">
        <div className="sheet-header">
          <div className="sheet-spacer" />
          <span className="sheet-title">Edit {kind} · {name}</span>
          <button className="sheet-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="sheet-body">
          {missingRequired && missingRequired.length > 0 && (
            <div className="required-warning">
              ⚠ Missing required rel{missingRequired.length > 1 ? 's' : ''}:{' '}
              {missingRequired.map(r => <code key={r}>{r}</code>).reduce<ReactNode[]>((acc, el, i) => {
                if (i > 0) acc.push(', ')
                acc.push(el)
                return acc
              }, [])}
              <div className="required-warning-hint">Add below in Outgoing rels.</div>
            </div>
          )}

          {/* ---- Attrs ---- */}
          <div className="node-edit-section-head">Attrs</div>
          {editable.length === 0 && (
            <div className="search-empty">No editable attrs for {kind}.</div>
          )}
          {editable.map(a => {
            const isComplex = complexAttrs.has(a.name)
            const val = displayValue(a.name)
            const empty = val === '—'
            return (
              <button key={a.name} className="sheet-item attr-item" onClick={() => onPickAttr(a.name)}>
                <div className="attr-item-head">
                  <span className="expand-item-name">{a.name}</span>
                  <span className="expand-item-kind"> : {a.type}</span>
                  {isComplex && <span className="attr-complex-badge">structured</span>}
                </div>
                <div className={`attr-item-value ${empty ? 'empty' : ''}`}>{val}</div>
              </button>
            )
          })}

          {/* ---- Outgoing rels ---- */}
          {outgoing.length > 0 && (
            <>
              <div className="node-edit-section-head">Outgoing rels</div>
              {outgoing.map(g => {
                // For implicit rels, "add" means creating a child whose id encodes
                // this parent (e.g. participant `<party>.<name>`). Always allow.
                const canAdd = g.implicit || (!g.isScalar || g.edges.length === 0)
                const canReplace = !g.implicit && g.isScalar && g.edges.length > 0
                const addLabel = canReplace
                  ? `↺ Change ${g.rel}`
                  : g.implicit
                    ? `＋ New ${g.allowedOtherKinds[0]}`
                    : `＋ Add ${g.rel}`
                return (
                  <div key={g.rel} className={`rel-group ${g.required && g.edges.length === 0 ? 'missing' : ''}`}>
                    <div className="rel-group-head">
                      <code className="rel-group-name">{g.rel}</code>
                      <span className="rel-group-targets">
                        → {g.allowedOtherKinds.join(' | ')}
                      </span>
                      {g.required && <span className="vocab-ref-required">required</span>}
                      {g.implicit && <span className="vocab-ref-badge">implicit</span>}
                    </div>
                    {g.edges.length === 0 && (
                      <div className="rel-group-empty">(none)</div>
                    )}
                    {g.edges.map(e => {
                      const t = targetHandleLabel(e)
                      return (
                        <div key={e.id} className="rel-edge-row">
                          <button
                            className="rel-edge-target"
                            onClick={() => onSelectOtherNode?.(t.id)}
                            title={`Switch to ${t.id}`}
                          >
                            <span className="rel-arrow">→</span>
                            <span className="rel-edge-name">{t.name}</span>
                            <span className="rel-edge-kind">{t.kind}</span>
                          </button>
                          {!g.implicit && (
                            <button
                              className="rel-edge-delete"
                              onClick={() => onDeleteEdge(e)}
                              title="Delete this edge"
                              aria-label="Delete"
                            >🗑</button>
                          )}
                        </div>
                      )
                    })}
                    {(canAdd || canReplace) && (
                      <button className="rel-add-btn" onClick={() => onAddRel(g.rel)}>
                        {addLabel}
                      </button>
                    )}
                  </div>
                )
              })}
            </>
          )}

          {/* ---- Incoming rels (read-only) ---- */}
          {incoming.length > 0 && (
            <>
              <div className="node-edit-section-head">Incoming rels</div>
              {incoming.map(g => (
                <div key={g.rel} className="rel-group incoming">
                  <div className="rel-group-head">
                    <code className="rel-group-name">{g.rel}</code>
                    {g.implicit && <span className="vocab-ref-badge">implicit</span>}
                  </div>
                  {g.edges.map(e => {
                    const s = sourceLabel(e)
                    return (
                      <div key={e.id} className="rel-edge-row">
                        <button
                          className="rel-edge-target"
                          onClick={() => onSelectOtherNode?.(s.id)}
                          title={`Switch to ${s.id}`}
                        >
                          <span className="rel-edge-name">{s.name}</span>
                          <span className="rel-edge-kind">{s.kind}</span>
                          <span className="rel-arrow">→</span>
                        </button>
                      </div>
                    )
                  })}
                </div>
              ))}
              <div className="node-edit-hint">
                To modify an incoming edge, tap the source and edit there.
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
