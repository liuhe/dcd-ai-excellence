// Clickable reference to a node by id (replaces the old name-based Link).
import type { ReactNode } from 'react'
import { useGraph } from '../graph/store'
import { useNavigate } from '../nav'

export function Ref({ id, children, className }: { id: string | undefined | null; children?: ReactNode; className?: string }) {
  const { ix } = useGraph()
  const navigate = useNavigate()
  const node = ix.node(id)
  if (!node) return <>{children ?? id ?? ''}</>
  return (
    <button
      onClick={e => { e.stopPropagation(); navigate(node.id, true) }}
      className={className ?? 'text-blue-600 hover:text-blue-800 hover:underline cursor-pointer font-medium'}
    >
      {children ?? node.name}
    </button>
  )
}

// Link to a group / view route (e.g. the trace section anchors).
export function GroupRef({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  const navigate = useNavigate()
  return (
    <button onClick={e => { e.stopPropagation(); navigate(id, false) }} className={className ?? 'hover:text-blue-600 cursor-pointer'}>{children}</button>
  )
}
