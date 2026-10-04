import { useState, useEffect } from 'react'
import type { TreeNode } from '@dcddp/core'

export type { TreeNode }

function findAncestorPath(roots: TreeNode[], targetId: string): string[] | null {
  for (const node of roots) {
    if (node.id === targetId) return []
    if (node.children) {
      const sub = findAncestorPath(node.children, targetId)
      if (sub !== null) return [node.id, ...sub]
    }
  }
  return null
}

interface Props {
  roots: TreeNode[]
  selectedId: string
  onSelect: (id: string) => void
}

export function ModelTree({ roots, selectedId, onSelect }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    // Start with first top-level node expanded
    const initial = new Set<string>()
    if (roots.length > 0) initial.add(roots[0].id)
    return initial
  })

  // Auto-expand ancestors when selectedId changes (e.g. via cross-link navigation)
  useEffect(() => {
    const path = findAncestorPath(roots, selectedId)
    if (path && path.length > 0) {
      setExpanded(prev => {
        const next = new Set(prev)
        let changed = false
        for (const id of path) {
          if (!next.has(id)) { next.add(id); changed = true }
        }
        return changed ? next : prev
      })
    }
  }, [selectedId, roots])

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const renderNode = (node: TreeNode, depth: number) => {
    const hasChildren = node.children && node.children.length > 0
    const isExpanded = expanded.has(node.id)
    const isSelected = selectedId === node.id
    const isTopLevel = depth === 0

    return (
      <div key={node.id}>
        <button
          onClick={() => {
            onSelect(node.id)
            if (hasChildren) toggle(node.id)
          }}
          className={`w-full flex items-center gap-1.5 rounded transition group ${
            isTopLevel
              ? `px-3 py-2 text-sm font-semibold ${
                  isSelected
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-800 hover:bg-slate-100'
                }`
              : `px-2 py-1.5 text-sm ${
                  isSelected
                    ? 'bg-blue-100 text-blue-700 font-medium'
                    : 'text-slate-600 hover:bg-slate-50'
                }`
          }`}
          style={{ paddingLeft: isTopLevel ? undefined : `${(depth - 1) * 14 + 24}px` }}
        >
          {/* Expand/collapse */}
          {hasChildren ? (
            <span className={`w-4 text-center flex-shrink-0 ${isTopLevel ? 'text-sm text-slate-400' : 'text-xs text-slate-400'}`}>
              {isExpanded ? '▼' : '▶'}
            </span>
          ) : (
            <span className="w-4" />
          )}

          {/* Icon */}
          <span className="flex-shrink-0">{node.icon}</span>

          {/* Label */}
          <span className="flex-1 text-left truncate">{node.label}</span>

          {/* Tag */}
          {node.tag && (
            <span className="text-xs text-slate-400 flex-shrink-0 hidden group-hover:inline">
              {node.tag}
            </span>
          )}
        </button>

        {hasChildren && isExpanded && (
          <div>
            {node.children!.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <nav className="p-2 space-y-0.5">
      {roots.map(root => renderNode(root, 0))}
    </nav>
  )
}
