// Inline editors used by the editing cards. Each takes a value, renders a read view with a
// pencil, and an edit view with save / cancel. Structured values round-trip as JSON.
import { useState } from 'react'

const btn = 'text-xs px-2 py-0.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800'
export const Pencil = ({ onClick, title = '编辑' }: { onClick: () => void; title?: string }) => (
  <button className="text-slate-300 hover:text-blue-600 text-xs ml-1" onClick={onClick} title={title} aria-label={title}>✎</button>
)

export function TextEdit({ value, multiline, onSave, onCancel, placeholder }: { value: string; multiline?: boolean; onSave: (v: string) => void; onCancel: () => void; placeholder?: string }) {
  const [v, setV] = useState(value)
  const Input = multiline ? 'textarea' : 'input'
  return (
    <div className="flex flex-col gap-1 w-full">
      <Input className={`w-full text-sm border border-blue-300 rounded px-2 py-1 font-mono ${multiline ? 'min-h-[6rem]' : ''}`} value={v} placeholder={placeholder} autoFocus
        onChange={e => setV((e.target as HTMLInputElement).value)}
        onKeyDown={e => { if (e.key === 'Escape') onCancel(); if (e.key === 'Enter' && !multiline) onSave(v); if (e.key === 'Enter' && multiline && (e.metaKey || e.ctrlKey)) onSave(v) }} />
      <div className="flex gap-2"><button className={`${btn} bg-blue-50 text-blue-700 border-blue-200`} onClick={() => onSave(v)}>保存</button><button className={btn} onClick={onCancel}>取消</button>{multiline && <span className="text-xs text-slate-300 self-center">⌘/Ctrl+Enter 保存</span>}</div>
    </div>
  )
}

// string-list: one item per line
export function ListEdit({ value, onSave, onCancel }: { value: string[]; onSave: (v: string[]) => void; onCancel: () => void }) {
  return <TextEdit value={value.join('\n')} multiline placeholder="每行一项" onSave={v => onSave(v.split('\n').map(s => s.trim()).filter(Boolean))} onCancel={onCancel} />
}

// field-list: `name: Type, desc` per line  ⇄  [{ name: "Type, desc" }]
export function FieldListEdit({ value, onSave, onCancel }: { value: Record<string, string>[]; onSave: (v: Record<string, string>[]) => void; onCancel: () => void }) {
  const text = value.map(f => { const e = Object.entries(f)[0]; return e ? `${e[0]}: ${e[1]}` : '' }).join('\n')
  return <TextEdit value={text} multiline placeholder={'fieldName: Type, description'} onCancel={onCancel}
    onSave={v => onSave(v.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const i = l.indexOf(':'); return i > 0 ? { [l.slice(0, i).trim()]: l.slice(i + 1).trim() } : { [l]: '' } }))} />
}

// anything else: JSON
export function JsonEdit({ value, onSave, onCancel }: { value: unknown; onSave: (v: unknown) => void; onCancel: () => void }) {
  const [err, setErr] = useState<string | null>(null)
  return (
    <div>
      <TextEdit value={value === undefined ? '' : JSON.stringify(value, null, 2)} multiline onCancel={onCancel}
        onSave={v => { try { onSave(v.trim() === '' ? null : JSON.parse(v)); setErr(null) } catch (e) { setErr(String((e as Error).message)) } }} />
      {err && <div className="text-xs text-red-600 mt-1">JSON 无效：{err}</div>}
    </div>
  )
}

// Pick one of `options` with a search box; returns the chosen id.
export function Picker({ title, options, onPick, onCancel, onCreate, createLabel }: { title: string; options: { id: string; label: string; hint?: string }[]; onPick: (id: string) => void; onCancel: () => void; onCreate?: () => void; createLabel?: string }) {
  const [q, setQ] = useState('')
  const shown = options.filter(o => !q || o.label.toLowerCase().includes(q.toLowerCase()) || o.id.includes(q)).slice(0, 50)
  return (
    <div className="fixed inset-0 z-40 bg-black/30 flex items-start justify-center p-6" onClick={onCancel}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mt-16" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-2 border-b border-slate-200 text-sm font-semibold text-slate-700 flex justify-between"><span>{title}</span><button onClick={onCancel} className="text-slate-400">✕</button></div>
        <div className="p-3"><input autoFocus className="w-full text-sm border border-slate-300 rounded px-2 py-1" placeholder="搜索…" value={q} onChange={e => setQ(e.target.value)} /></div>
        <div className="max-h-80 overflow-y-auto">
          {shown.map(o => (
            <button key={o.id} className="w-full text-left px-4 py-1.5 text-sm hover:bg-blue-50 flex justify-between" onClick={() => onPick(o.id)}>
              <span>{o.label}</span><span className="text-xs text-slate-400 font-mono">{o.hint ?? o.id}</span>
            </button>
          ))}
          {shown.length === 0 && <div className="px-4 py-3 text-sm text-slate-400">无匹配</div>}
        </div>
        {onCreate && <div className="border-t border-slate-200 p-2"><button className="w-full text-left px-2 py-1.5 text-sm text-blue-700 hover:bg-blue-50 rounded" onClick={onCreate}>＋ {createLabel ?? '新建…'}</button></div>}
      </div>
    </div>
  )
}
