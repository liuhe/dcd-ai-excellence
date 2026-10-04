// Vocabulary reference sheet — client-side render of node/rel/value-type kinds.
// Data is served by /api/vocabulary (extended payload); grouping comes from
// NODE_LAYERS / REL_GROUPS in core, so this stays in sync with the md reference.

import { useMemo, useState } from 'react'
import type { Vocabulary, NodeKindRef, RelKindRef } from './api.ts'

interface Props {
  vocab: Vocabulary
  onClose: () => void
}

// Per-node-kind: outgoing = rels where this kind is source; incoming = where target.
// Grouped by rel-kind (so has-actor's 3 endpoints collapse into one row).
interface RelGroupForNode {
  rel: string
  implicit: boolean
  otherKinds: string[]  // targets (outgoing) or sources (incoming)
  required: boolean     // any endpoint in this group is required
}

export function VocabRefSheet({ vocab, onClose }: Props) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()

  const nodeByKind = useMemo(() => {
    const m = new Map<string, NodeKindRef>()
    for (const nk of vocab.nodeKindsRef ?? []) m.set(nk.kind, nk)
    return m
  }, [vocab])
  const relByKind = useMemo(() => {
    const m = new Map<string, RelKindRef>()
    for (const rk of vocab.relKindsRef ?? []) m.set(rk.kind, rk)
    return m
  }, [vocab])

  // Per-node-kind lookup for outgoing / incoming rel groups.
  const relsByNodeKind = useMemo(() => {
    const outByKind = new Map<string, Map<string, RelGroupForNode>>()
    const inByKind = new Map<string, Map<string, RelGroupForNode>>()
    const rels = vocab.relKindsRef ?? []
    for (const rk of rels) {
      for (const ep of rk.endpoints) {
        // outgoing (source-side)
        let outRels = outByKind.get(ep.source)
        if (!outRels) { outRels = new Map(); outByKind.set(ep.source, outRels) }
        let outGroup = outRels.get(rk.kind)
        if (!outGroup) {
          outGroup = { rel: rk.kind, implicit: rk.implicit, otherKinds: [], required: false }
          outRels.set(rk.kind, outGroup)
        }
        if (!outGroup.otherKinds.includes(ep.target)) outGroup.otherKinds.push(ep.target)
        if (ep.required) outGroup.required = true
        // incoming (target-side)
        let inRels = inByKind.get(ep.target)
        if (!inRels) { inRels = new Map(); inByKind.set(ep.target, inRels) }
        let inGroup = inRels.get(rk.kind)
        if (!inGroup) {
          inGroup = { rel: rk.kind, implicit: rk.implicit, otherKinds: [], required: false }
          inRels.set(rk.kind, inGroup)
        }
        if (!inGroup.otherKinds.includes(ep.source)) inGroup.otherKinds.push(ep.source)
      }
    }
    return { outByKind, inByKind }
  }, [vocab])

  const matchNodeKind = (nk: NodeKindRef) =>
    !q || nk.kind.toLowerCase().includes(q) || nk.attrs.some(a => a.name.toLowerCase().includes(q))
  const matchRelKind = (rk: RelKindRef) =>
    !q || rk.kind.toLowerCase().includes(q) ||
    rk.endpoints.some(e => e.source.includes(q) || e.target.includes(q))

  const nodeLayers = vocab.nodeLayers ?? [{ label: 'All', kinds: [...nodeByKind.keys()] }]
  const relGroups = vocab.relGroups ?? [{ label: 'All', kinds: [...relByKind.keys()] }]
  const valueTypes = vocab.valueTypes

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet vocab-ref-sheet">
        <div className="sheet-header">
          <div className="sheet-spacer" />
          <span className="sheet-title">Vocabulary reference</span>
          <button className="sheet-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="search-input-wrap">
          <input
            className="search-input"
            placeholder="Filter by kind / attr / endpoint…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        <div className="sheet-body vocab-ref-body">
          {/* Table of contents */}
          <div className="vocab-ref-toc">
            <a href="#nodes">Nodes</a> · <a href="#rels">Rels</a> · <a href="#vts">Value types</a>
          </div>

          {/* Node kinds */}
          <h2 id="nodes" className="vocab-ref-h2">Node kinds</h2>
          {nodeLayers.map(layer => {
            const kinds = layer.kinds
              .map(k => nodeByKind.get(k))
              .filter((nk): nk is NodeKindRef => !!nk)
              .filter(matchNodeKind)
            if (kinds.length === 0) return null
            return (
              <div key={layer.label} className="vocab-ref-section">
                <h3 className="vocab-ref-h3">{layer.label}</h3>
                {kinds.map(nk => {
                  const outgoing = [...(relsByNodeKind.outByKind.get(nk.kind)?.values() ?? [])]
                  const incoming = [...(relsByNodeKind.inByKind.get(nk.kind)?.values() ?? [])]
                  return (
                    <div key={nk.kind} className="vocab-ref-card">
                      <div className="vocab-ref-card-head">
                        <code className="vocab-ref-kind">{nk.kind}</code>
                        <span className="vocab-ref-idform">
                          {`${nk.idPrefix}-<seq>`}{nk.parents.length ? ` · under ${nk.parents.join(' / ')}` : ''}{nk.view ? ` · top of ${nk.view}` : ''}
                        </span>
                      </div>
                      <div className="vocab-ref-storage">📁 {nk.storage}</div>
                      {nk.attrs.length > 0 && (
                        <table className="vocab-ref-table">
                          <thead><tr><th>attr</th><th>type</th></tr></thead>
                          <tbody>
                            {nk.attrs.map(a => (
                              <tr key={a.name}>
                                <td><code>{a.name}</code></td>
                                <td><code>{a.type}</code></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      {(outgoing.length > 0 || incoming.length > 0) && (
                        <div className="vocab-ref-node-rels">
                          {outgoing.length > 0 && (
                            <div className="vocab-ref-rel-list">
                              <div className="vocab-ref-rel-list-head">Outgoing rels</div>
                              {outgoing.map(g => (
                                <div key={g.rel} className={`vocab-ref-rel-row ${g.required ? 'required' : ''}`}>
                                  <code className="vocab-ref-rel-name">{g.rel}</code>
                                  <span className="vocab-ref-rel-arrow">→</span>
                                  <span className="vocab-ref-rel-targets">
                                    {g.otherKinds.map(k => <code key={k}>{k}</code>).reduce((acc: React.ReactNode[], el, i) => {
                                      if (i > 0) acc.push(<span key={`sep-${i}`} className="vocab-ref-or"> | </span>)
                                      acc.push(el)
                                      return acc
                                    }, [])}
                                  </span>
                                  {g.implicit && <span className="vocab-ref-badge">implicit</span>}
                                  {g.required && <span className="vocab-ref-required">required</span>}
                                </div>
                              ))}
                            </div>
                          )}
                          {incoming.length > 0 && (
                            <div className="vocab-ref-rel-list">
                              <div className="vocab-ref-rel-list-head">Incoming rels</div>
                              {incoming.map(g => (
                                <div key={g.rel} className="vocab-ref-rel-row">
                                  <span className="vocab-ref-rel-sources">
                                    {g.otherKinds.map(k => <code key={k}>{k}</code>).reduce((acc: React.ReactNode[], el, i) => {
                                      if (i > 0) acc.push(<span key={`sep-${i}`} className="vocab-ref-or"> | </span>)
                                      acc.push(el)
                                      return acc
                                    }, [])}
                                  </span>
                                  <span className="vocab-ref-rel-arrow">→</span>
                                  <code className="vocab-ref-rel-name">{g.rel}</code>
                                  {g.implicit && <span className="vocab-ref-badge">implicit</span>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}

          {/* Rel kinds */}
          <h2 id="rels" className="vocab-ref-h2">Rel kinds</h2>
          {relGroups.map(group => {
            const kinds = group.kinds
              .map(k => relByKind.get(k))
              .filter((rk): rk is RelKindRef => !!rk)
              .filter(matchRelKind)
            if (kinds.length === 0) return null
            return (
              <div key={group.label} className="vocab-ref-section">
                <h3 className="vocab-ref-h3">{group.label}</h3>
                {kinds.map(rk => (
                  <div key={rk.kind} className="vocab-ref-card">
                    <div className="vocab-ref-card-head">
                      <code className="vocab-ref-kind">{rk.kind}</code>
                      {rk.implicit && <span className="vocab-ref-badge">implicit</span>}
                    </div>
                    {rk.edgeAttrs.length > 0 && (
                      <div className="vocab-ref-edge-attrs">
                        edge attrs: {rk.edgeAttrs.map(a => <code key={a}>{a}</code>).reduce((acc: React.ReactNode[], el, i) => {
                          if (i > 0) acc.push(', ')
                          acc.push(el)
                          return acc
                        }, [])}
                      </div>
                    )}
                    <table className="vocab-ref-table">
                      <thead><tr><th>source</th><th>→</th><th>target</th><th>storage</th></tr></thead>
                      <tbody>
                        {rk.endpoints.map((ep, i) => (
                          <tr key={i} className={ep.required ? 'required-row' : ''}>
                            <td><code>{ep.source}</code></td>
                            <td className="vocab-ref-arrow">→</td>
                            <td>
                              <code>{ep.target}</code>
                              {ep.required && <span className="vocab-ref-required">required</span>}
                            </td>
                            <td className="vocab-ref-storage-cell">{ep.storageSummary}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )
          })}

          {/* Value types */}
          {valueTypes && (
            <>
              <h2 id="vts" className="vocab-ref-h2">Value types</h2>
              <div className="vocab-ref-section">
                <h3 className="vocab-ref-h3">Primitives</h3>
                <div className="vocab-ref-chips">
                  {valueTypes.primitives.map(p => <code key={p}>{p}</code>)}
                </div>
              </div>
              <div className="vocab-ref-section">
                <h3 className="vocab-ref-h3">Free-text (escape hatch)</h3>
                <div className="vocab-ref-chips"><code>free-text</code></div>
                <div className="vocab-ref-note">intentionally unstructured prose — distinct from <code>String</code></div>
              </div>
              <div className="vocab-ref-section">
                <h3 className="vocab-ref-h3">User-defined</h3>
                {valueTypes.userDefined.map(vt => (
                  <div key={vt.kind} className="vocab-ref-card">
                    <div className="vocab-ref-card-head">
                      <code className="vocab-ref-kind">{vt.kind}</code>
                      <span className="vocab-ref-idform">{`${vt.kind === 'enum' ? 'enum' : 'vo'}-<seq>`}</span>
                    </div>
                    <div className="vocab-ref-storage">📁 index.yaml under application / entity · applications/&lt;app&gt;/domain.yaml</div>
                    <table className="vocab-ref-table">
                      <thead><tr><th>attr</th><th>type</th></tr></thead>
                      <tbody>
                        {vt.attrs.map(a => (
                          <tr key={a.name}>
                            <td><code>{a.name}</code></td>
                            <td><code>{a.type}</code></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
              <div className="vocab-ref-section">
                <h3 className="vocab-ref-h3">Composite (parsed at query time)</h3>
                <div className="vocab-ref-chips">
                  <code>List&lt;T&gt;</code> <code>Optional&lt;T&gt;</code> <code>Map&lt;K, V&gt;</code>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
