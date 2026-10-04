// 快捷搜索：顶栏按钮或 ⌘K / Ctrl+K 打开，按名字 / id / kind 匹配节点，回车或点击跳到详情页。
import { useEffect, useMemo, useRef, useState } from 'react'
import { useGraph } from '../graph/store'
import { useNavigate } from '../nav'
import { KIND_LABELS, KIND_ICONS } from './kinds'

export function SearchButton() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(o => !o) }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <>
      <button onClick={() => setOpen(true)} title="搜索节点（⌘K / Ctrl+K）"
        className="text-xs md:text-sm text-slate-500 hover:text-slate-700 px-2 md:px-3 py-1 rounded border border-slate-200 hover:bg-slate-100 whitespace-nowrap flex items-center gap-1">
        <span>🔍</span><span className="hidden md:inline">搜索</span><kbd className="hidden md:inline text-[10px] text-slate-400 border border-slate-200 rounded px-1">⌘K</kbd>
      </button>
      {open && <SearchOverlay onClose={() => setOpen(false)} />}
    </>
  )
}

function SearchOverlay({ onClose }: { onClose: () => void }) {
  const { ix } = useGraph()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.focus() }, [])

  // 多关键词：空格分隔，每个词都必须命中（名字 / id / 类型 / 所属应用或父节点任一字段）。
  // 排序：按最弱的那个词的命中位置（id 精确 < 名字精确 < 名字前缀 < 名字包含 < id 包含 < 类型 / 所属）。
  const results = useMemo(() => {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const all = ix.g.nodes.filter(n => n.kind !== 'rule')
    if (terms.length === 0) return all.slice(0, 30)
    const fields = (n: typeof all[0]) => {
      const app = ix.appOf(n.id); const parent = ix.parent(n.id)
      const where = n.kind === 'application' ? '' : (app?.name ?? parent?.name ?? '')
      return { name: n.name.toLowerCase(), id: n.id, kind: `${n.kind} ${KIND_LABELS[n.kind] ?? ''}`.toLowerCase(), where: where.toLowerCase() }
    }
    const score = (f: ReturnType<typeof fields>, t: string): number => {
      if (f.id === t) return 0
      if (f.name === t) return 1
      if (f.name.startsWith(t)) return 2
      if (f.name.includes(t)) return 3
      if (f.id.includes(t)) return 4
      if (f.kind.includes(t) || f.where.includes(t)) return 6
      return -1
    }
    return all
      .map(n => { const f = fields(n); const ss = terms.map(t => score(f, t)); return { n, s: ss.some(x => x < 0) ? -1 : Math.max(...ss) } })
      .filter(x => x.s >= 0)
      .sort((a, b) => a.s - b.s || a.n.name.localeCompare(b.n.name))
      .slice(0, 30).map(x => x.n)
  }, [q, ix])

  useEffect(() => { setCursor(0) }, [q])

  const go = (id: string) => { onClose(); navigate(id, true) }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
    else if (e.key === 'Enter' && results[cursor]) { e.preventDefault(); go(results[cursor].id) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-start justify-center p-4 md:p-6" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-xl mt-4 md:mt-16 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200">
          <span className="text-slate-400">🔍</span>
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey} placeholder="名字 / id / 类型 / 所属应用，多个关键词用空格分隔…（↑↓ 选择，Enter 跳转，Esc 关闭）"
            className="flex-1 text-sm outline-none placeholder:text-slate-300" />
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="关闭">✕</button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {results.length === 0 && <div className="px-4 py-6 text-sm text-slate-400 text-center">没有匹配的节点</div>}
          {results.map((n, i) => {
            const app = ix.appOf(n.id); const parent = ix.parent(n.id)
            const where = n.kind === 'application' ? '' : app ? app.name : parent ? parent.name : ''
            return (
              <button key={n.id} onMouseEnter={() => setCursor(i)} onClick={() => go(n.id)}
                className={`w-full text-left px-4 py-2 flex items-center gap-3 text-sm ${i === cursor ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                <span className="w-5 text-center">{KIND_ICONS[n.kind] ?? '•'}</span>
                <span className="flex-1 min-w-0 truncate"><span className="font-medium text-slate-800">{n.name}</span>{where && <span className="text-slate-400 ml-2 text-xs">{where}</span>}</span>
                <span className="text-xs text-slate-400 whitespace-nowrap">{KIND_LABELS[n.kind] ?? n.kind}</span>
                <span className="text-[11px] font-mono text-slate-300 whitespace-nowrap">{n.id}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
