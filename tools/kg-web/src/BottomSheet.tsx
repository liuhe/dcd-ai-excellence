// BottomSheet — modal panel that slides up from the bottom (mobile-native pattern).
// On desktop, still looks like a bottom sheet but centered wider.
// Handles nested submenu navigation with breadcrumbs.

import { useState, useEffect } from 'react'
import type { MenuItem, MenuAction } from './menu.ts'

interface Props {
  title: string
  items: MenuItem[]
  onSelect: (action: MenuAction) => void
  onClose: () => void
}

interface Frame {
  title: string
  items: MenuItem[]
}

export function BottomSheet({ title, items, onSelect, onClose }: Props) {
  const [stack, setStack] = useState<Frame[]>([{ title, items }])
  const top = stack[stack.length - 1]

  useEffect(() => {
    // Escape to close
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const openSub = (sub: MenuItem[], label: string) => setStack([...stack, { title: label, items: sub }])
  const goBack = () => setStack(stack.slice(0, -1))

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-header">
          {stack.length > 1 ? (
            <button className="sheet-back" onClick={goBack} aria-label="Back">‹</button>
          ) : <span className="sheet-spacer" />}
          <span className="sheet-title">{top.title}</span>
          <button className="sheet-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="sheet-body">
          {top.items.map((item, i) => (
            <button
              key={i}
              className={`sheet-item${item.action || item.submenu ? '' : ' disabled'}`}
              disabled={!item.action && !item.submenu}
              onClick={() => {
                if (item.submenu && item.submenu.length > 0) openSub(item.submenu, item.label)
                else if (item.action) onSelect(item.action)
              }}
            >
              <span>{item.label}</span>
              {item.submenu && item.submenu.length > 0 && <span className="chevron">›</span>}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
