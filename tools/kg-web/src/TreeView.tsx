// Tree view for a workbench.
// - No single "root": ALL workbench nodes with no incoming tree-rel edge from another workbench
//   node are the roots. (If pure cycle → all workbench nodes as roots.)
// - Auto-grouping:
//   * Roots are grouped by kind (e.g. "external-party (2)", "organization (1)")
//   * Children under a parent are grouped by incoming rel (e.g. "aggregates (3)", "implements (2)")
//   * Groups with only one kind/rel are flattened (no header noise).
// - Traversal: outgoing edges whose rel is in `treeRels` (empty/undefined = all rels).
// - Children only rendered when a branch is expanded (lazy). Group headers are collapsible.
// - Path-based React keys — same node may appear at multiple tree positions without state reuse.

import { useState, useMemo, useCallback, type ReactNode } from 'react'
import type { GNode, GEdge } from './api.ts'
import { orderedEntries } from './vocab-order.ts'

interface Props {
  nodes: GNode[]
  edges: GEdge[]
  workbenchNodeIds: Set<string>
  treeRels: string[]
  nodeKindOrder: string[]  // canonical order from vocab.nodeKinds
  relKindOrder: string[]   // canonical order from vocab.relKinds
  missingRequired?: Record<string, string[]>  // node-id → rel-kinds still required
  onSelectNode: (nodeId: string) => void
}

interface TreeEntry {
  path: string[]
  incomingRel?: string
}

export function TreeView({
  nodes, edges, workbenchNodeIds, treeRels, nodeKindOrder, relKindOrder, missingRequired,
  onSelectNode,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  const nodeById = useMemo(() => {
    const m = new Map<string, GNode>()
    for (const n of nodes) m.set(n.id, n)
    return m
  }, [nodes])

  const outgoingBySource = useMemo(() => {
    const m = new Map<string, GEdge[]>()
    const relFilter = treeRels.length > 0 ? new Set(treeRels) : null
    for (const e of edges) {
      if (relFilter && !relFilter.has(e.rel)) continue
      if (!workbenchNodeIds.has(e.to)) continue
      const list = m.get(e.from) ?? []
      list.push(e)
      m.set(e.from, list)
    }
    return m
  }, [edges, treeRels, workbenchNodeIds])

  const rootIds = useMemo(() => {
    const wbSet = workbenchNodeIds
    const relFilter = treeRels.length > 0 ? new Set(treeRels) : null
    const hasIncoming = new Set<string>()
    for (const e of edges) {
      if (relFilter && !relFilter.has(e.rel)) continue
      if (!wbSet.has(e.from) || !wbSet.has(e.to)) continue
      if (e.from === e.to) continue
      hasIncoming.add(e.to)
    }
    const roots = [...wbSet].filter(id => !hasIncoming.has(id))
    if (roots.length > 0) return roots
    return [...wbSet]
  }, [workbenchNodeIds, edges, treeRels])

  const toggle = useCallback((pathKey: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(pathKey)) next.delete(pathKey)
      else next.add(pathKey)
      return next
    })
  }, [])

  if (rootIds.length === 0) {
    return (
      <div className="tree-view">
        <div className="canvas-placeholder">
          <p>Workbench is empty.<br/>Add nodes first.</p>
        </div>
      </div>
    )
  }

  // Group roots by kind, then render — ordered by vocabulary registry (business → app → domain).
  const rootGroups = groupBy(rootIds, id => nodeById.get(id)?.kind ?? '(unknown)')
  const rootEntries = orderedEntries(rootGroups, nodeKindOrder)
  const flattenRoots = rootEntries.length === 1

  return (
    <div className="tree-view">
      {flattenRoots
        ? rootEntries[0][1].map(rid => (
            <TreeNode
              key={rid}
              entry={{ path: [rid] }}
              nodeById={nodeById}
              outgoingBySource={outgoingBySource}
              relKindOrder={relKindOrder}
              missingRequired={missingRequired}
              expanded={expanded}
              onToggle={toggle}
              onSelectNode={onSelectNode}
              hideOwnIncomingRel={false}
            />
          ))
        : rootEntries.map(([kind, ids]) => (
            <TreeGroup
              key={`root-group::${kind}`}
              groupKey={`root-group::${kind}`}
              label={kind}
              count={ids.length}
              expanded={expanded}
              onToggle={toggle}
            >
              {ids.map(rid => (
                <TreeNode
                  key={rid}
                  entry={{ path: [rid] }}
                  nodeById={nodeById}
                  outgoingBySource={outgoingBySource}
                  relKindOrder={relKindOrder}
                  expanded={expanded}
                  onToggle={toggle}
                  onSelectNode={onSelectNode}
                  hideOwnIncomingRel={false}
                />
              ))}
            </TreeGroup>
          ))}
    </div>
  )
}

// -------------------- Helpers --------------------

function groupBy<T, K>(items: T[], keyFn: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>()
  for (const item of items) {
    const k = keyFn(item)
    const arr = m.get(k) ?? []
    arr.push(item)
    m.set(k, arr)
  }
  return m
}

// -------------------- TreeGroup component --------------------

interface TreeGroupProps {
  groupKey: string
  label: string
  count: number
  expanded: Set<string>
  onToggle: (pathKey: string) => void
  children: ReactNode
}

function TreeGroup({ groupKey, label, count, expanded, onToggle, children }: TreeGroupProps) {
  const isExpanded = expanded.has(groupKey)
  return (
    <div className="tree-group">
      <button
        className="tree-group-header"
        onClick={() => onToggle(groupKey)}
        aria-label={isExpanded ? 'collapse group' : 'expand group'}
      >
        <span className="tree-group-toggle">{isExpanded ? '▾' : '▸'}</span>
        <span className="tree-group-label"><span className="tree-group-sigil">#</span>{label}</span>
        <span className="tree-group-count">({count})</span>
      </button>
      {isExpanded && <div className="tree-group-body">{children}</div>}
    </div>
  )
}

// -------------------- TreeNode component --------------------

interface TreeNodeProps {
  entry: TreeEntry
  nodeById: Map<string, GNode>
  outgoingBySource: Map<string, GEdge[]>
  relKindOrder: string[]
  missingRequired?: Record<string, string[]>
  expanded: Set<string>
  onToggle: (pathKey: string) => void
  onSelectNode: (nodeId: string) => void
  hideOwnIncomingRel: boolean  // true when the node is under a group header showing the rel already
}

function TreeNode({
  entry, nodeById, outgoingBySource, relKindOrder, missingRequired, expanded, onToggle, onSelectNode, hideOwnIncomingRel,
}: TreeNodeProps) {
  const nodeId = entry.path[entry.path.length - 1]
  const node = nodeById.get(nodeId)
  const pathKey = entry.path.join('|')
  const isExpanded = expanded.has(pathKey)

  const outgoing = outgoingBySource.get(nodeId) ?? []
  const hasChildren = outgoing.length > 0
  const cycled = entry.path.slice(0, -1).includes(nodeId)

  if (!node) {
    return <div className="tree-item missing">missing: {nodeId}</div>
  }

  // Group children by rel; flatten if only one rel.
  const childEntries: TreeEntry[] = outgoing.map(edge => ({
    path: [...entry.path, edge.to],
    incomingRel: edge.rel,
  }))
  const childGroups = groupBy(childEntries, e => e.incomingRel ?? '')
  const childGroupList = orderedEntries(childGroups, relKindOrder)
  const flattenChildren = childGroupList.length === 1

  return (
    <div className="tree-item">
      <div className="tree-row">
        {hasChildren && !cycled ? (
          <button
            className="tree-toggle"
            onClick={() => onToggle(pathKey)}
            aria-label={isExpanded ? 'collapse' : 'expand'}
          >
            {isExpanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="tree-toggle-spacer">·</span>
        )}
        <button className="tree-label" onClick={() => onSelectNode(nodeId)}>
          {!hideOwnIncomingRel && entry.incomingRel && (
            <span className="tree-incoming-rel">{entry.incomingRel} →</span>
          )}
          {missingRequired?.[nodeId]?.length ? (
            <span className="node-missing-required" title={`Missing required: ${missingRequired[nodeId].join(', ')}`}>⚠</span>
          ) : null}
          <span className="tree-name">{node.name}</span>
          <span className="tree-kind">{node.kind}</span>
          {cycled && <span className="tree-cycle-badge">cycle</span>}
        </button>
      </div>
      {isExpanded && !cycled && hasChildren && (
        <div className="tree-children">
          {flattenChildren
            ? childEntries.map((childEntry, i) => (
                <TreeNode
                  key={`${pathKey}::${childEntry.incomingRel}::${childEntry.path[childEntry.path.length - 1]}::${i}`}
                  entry={childEntry}
                  nodeById={nodeById}
                  outgoingBySource={outgoingBySource}
                  relKindOrder={relKindOrder}
                  missingRequired={missingRequired}
                  expanded={expanded}
                  onToggle={onToggle}
                  onSelectNode={onSelectNode}
                  hideOwnIncomingRel={false}
                />
              ))
            : childGroupList.map(([rel, entries]) => (
                <TreeGroup
                  key={`${pathKey}::group::${rel}`}
                  groupKey={`${pathKey}::group::${rel}`}
                  label={rel}
                  count={entries.length}
                  expanded={expanded}
                  onToggle={onToggle}
                >
                  {entries.map((childEntry, i) => (
                    <TreeNode
                      key={`${pathKey}::${rel}::${childEntry.path[childEntry.path.length - 1]}::${i}`}
                      entry={childEntry}
                      nodeById={nodeById}
                      outgoingBySource={outgoingBySource}
                      relKindOrder={relKindOrder}
                      expanded={expanded}
                      onToggle={onToggle}
                      onSelectNode={onSelectNode}
                      hideOwnIncomingRel={true}
                    />
                  ))}
                </TreeGroup>
              ))}
        </div>
      )}
    </div>
  )
}
