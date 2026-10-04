// Editing affordances for a node page (server mode only): toolbar under the title
// (rename / package / move / delete), attrs card, edges card, children card.
import { useState } from 'react'
import { useGraph } from '../graph/store'
import { useMutations } from '../graph/mutations'
import { useNavigate } from '../nav'
import { fieldList, type Data } from '../graph/index'
import { Card, H3, Badge } from '../components/UI'
import { Ref } from '../components/Ref'
import { Pencil, TextEdit, ListEdit, FieldListEdit, JsonEdit, Picker } from './controls'
import { ResourceForm, MODES_BY_TYPE, ENTITY_MODES } from './ResourceForm'

const btn = 'text-xs px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50'
const danger = 'text-xs px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50'

// Attrs that the page already renders elsewhere are still editable here (single place to edit).
export function EditToolbar({ id }: { id: string }) {
  const { ix, vocab, canEdit } = useGraph()
  const m = useMutations()
  const navigate = useNavigate()
  const [renaming, setRenaming] = useState(false)
  const [picking, setPicking] = useState<'parent' | null>(null)
  const node = ix.node(id)
  if (!canEdit || !node || !vocab) return null
  const spec = vocab.nodeKinds.find(k => k.kind === node.kind)
  const subtree = (() => { const out: string[] = []; const walk = (x: string) => { out.push(x); ix.childrenOf(x).forEach(c => walk(c.id)) }; walk(id); return out })()
  const canMove = !!spec && !spec.inline && (spec.parents.length > 0)
  const parentOptions = spec ? ix.g.nodes.filter(n => spec.parents.includes(n.kind) && !subtree.includes(n.id)).map(n => ({ id: n.id, label: `${n.name}`, hint: `${n.kind} · ${n.id}` })) : []

  return (
    <div className="flex flex-wrap items-center gap-2 -mt-1">
      <span className="text-xs font-mono text-slate-400">{id}</span>
      {ix.ancestors(id).length > 0 && (
        <span className="text-xs text-slate-400">{ix.ancestors(id).reverse().map((a, i) => <span key={a.id}>{i > 0 && ' / '}<Ref id={a.id} className="text-slate-500 hover:underline" /></span>)}</span>
      )}
      {renaming ? (
        <div className="w-72"><TextEdit value={node.name} onCancel={() => setRenaming(false)} onSave={async v => { if (v && v !== node.name) await m.updateNode(id, { name: v }); setRenaming(false) }} /></div>
      ) : <button className={btn} onClick={() => setRenaming(true)}>✎ 改名</button>}
      {!spec?.inline && (
        <button className={btn} title="package 分组（空 = 取消）" onClick={async () => {
          const v = window.prompt('package（多级用 / 分隔，留空取消分组）:', node.package ?? ''); if (v === null) return
          await (v.trim() ? m.updateNode(id, { package: v.trim() }) : m.updateNode(id, {}, ['package']))
        }}>📦 {node.package ? node.package : 'package'}</button>
      )}
      {canMove && <button className={btn} onClick={() => setPicking('parent')}>↗ 移动到…</button>}
      {canMove && spec?.view && node.parent && <button className={btn} onClick={() => m.updateNode(id, { parent: null })}>↑ 移到视图顶层</button>}
      <button className={danger} onClick={async () => {
        const n = subtree.length - 1
        if (!window.confirm(`删除 ${node.kind} "${node.name}"（${id}）${n > 0 ? `及其下 ${n} 个节点` : ''}？\n会同时清理指向它们的引用。此操作直接写入 YAML。`)) return
        const parent = node.parent
        const r = await m.removeNode(id)
        if (r) navigate(parent ?? (node.view === 'business' ? 'business' : 'applications'), !!parent)
      }}>🗑 删除</button>
      {picking === 'parent' && <Picker title={`把「${node.name}」移动到…`} options={parentOptions} onCancel={() => setPicking(null)} onPick={async pid => { setPicking(null); await m.updateNode(id, { parent: pid }) }} />}
    </div>
  )
}

export function AttrsCard({ id }: { id: string }) {
  const { ix, vocab, canEdit } = useGraph()
  const m = useMutations()
  const [editing, setEditing] = useState<string | null>(null)
  const node = ix.node(id)
  if (!canEdit || !node || !vocab) return null
  const spec = vocab.nodeKinds.find(k => k.kind === node.kind); if (!spec) return null
  const d: Data = ix.data(id)
  const save = async (name: string, v: unknown) => { setEditing(null); if (v === null || v === '' || (Array.isArray(v) && v.length === 0)) await m.updateNode(id, {}, [name]); else await m.updateNode(id, { [name]: v }) }
  const preview = (v: unknown): string => v === undefined || v === null ? '' : typeof v === 'string' ? v : Array.isArray(v) ? `[${v.length} 项]` : typeof v === 'object' ? '{…}' : String(v)
  return (
    <Card>
      <H3>属性</H3>
      <table className="w-full text-sm">
        <tbody>
          {spec.attrs.map(a => {
            const v = d[a.name]
            return (
              <tr key={a.name} className="border-b border-slate-50 align-top">
                <td className="py-1.5 pr-3 font-mono text-xs text-slate-500 whitespace-nowrap w-40">{a.name}<div className="text-[10px] text-slate-300">{a.type}</div></td>
                <td className="py-1.5 text-slate-700">
                  {editing === a.name ? (
                    a.name === 'docs' ? <JsonEdit value={v ?? []} onSave={x => save(a.name, x)} onCancel={() => setEditing(null)} />
                    : a.type === 'field-list' ? <FieldListEdit value={fieldList(v)} onSave={x => save(a.name, x)} onCancel={() => setEditing(null)} />
                    : a.type === 'string-list' ? <ListEdit value={Array.isArray(v) ? v.map(String) : []} onSave={x => save(a.name, x)} onCancel={() => setEditing(null)} />
                    : a.type === 'free-text' || a.type === 'String' || /^(Long|Integer|Double|Boolean|Date|LocalDateTime)$/.test(a.type)
                      ? (v !== undefined && typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean'
                          ? <JsonEdit value={v} onSave={x => save(a.name, x)} onCancel={() => setEditing(null)} />
                          : <TextEdit value={v === undefined ? '' : String(v)} multiline={a.type === 'free-text'} onSave={x => save(a.name, a.type === 'free-text' || a.type === 'String' ? x : coerce(x))} onCancel={() => setEditing(null)} />)
                      : <JsonEdit value={v} onSave={x => save(a.name, x)} onCancel={() => setEditing(null)} />
                  ) : (
                    <span className={v === undefined ? 'text-slate-300 italic' : 'whitespace-pre-wrap'}>{v === undefined ? '（未设置）' : preview(v)}<Pencil onClick={() => setEditing(a.name)} /></span>
                  )}
                </td>
              </tr>
            )
          })}
          <ExtRows id={id} ext={d.ext} />
        </tbody>
      </table>
    </Card>
  )
}

// 扩展属性 ext：逐键编辑（改值 / 删键 / 加键），每行写 ext.<key>
function ExtRows({ id, ext }: { id: string; ext: unknown }) {
  const m = useMutations()
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newKey, setNewKey] = useState('')
  const entries = ext && typeof ext === 'object' && !Array.isArray(ext) ? Object.entries(ext as Record<string, unknown>) : []
  const show = (v: unknown) => typeof v === 'string' ? v : JSON.stringify(v)
  const save = async (k: string, raw: string) => { setEditing(null); setAdding(false); setNewKey(''); if (raw === '') await m.updateNode(id, {}, [`ext.${k}`]); else await m.updateNode(id, { [`ext.${k}`]: coerce(raw) }) }
  return (
    <>
      {entries.map(([k, v]) => (
        <tr key={k} className="border-b border-slate-50 align-top">
          <td className="py-1.5 pr-3 font-mono text-xs text-slate-500 whitespace-nowrap w-40">ext.{k}<div className="text-[10px] text-slate-300">扩展属性</div></td>
          <td className="py-1.5 text-slate-700">
            {editing === k ? <TextEdit value={show(v)} multiline={typeof v === 'string' && v.includes('\n')} onSave={x => save(k, x)} onCancel={() => setEditing(null)} />
              : <span className="whitespace-pre-wrap">{show(v)}<Pencil onClick={() => setEditing(k)} /><button className="ml-2 text-xs text-slate-300 hover:text-red-600" title="删除这个键" onClick={async () => { if (window.confirm(`删除扩展属性 ${k}？`)) await save(k, '') }}>✕</button></span>}
          </td>
        </tr>
      ))}
      <tr className="align-top">
        <td className="py-1.5 pr-3 w-40">
          {adding ? <input autoFocus className="w-full text-xs font-mono border border-slate-300 rounded px-1 py-0.5" placeholder="键名，如 data_source" value={newKey} onChange={e => setNewKey(e.target.value.trim())} onKeyDown={e => { if (e.key === 'Escape') { setAdding(false); setNewKey('') } }} />
            : <button className="text-xs text-slate-400 hover:text-blue-600" onClick={() => setAdding(true)}>＋ 扩展属性</button>}
        </td>
        <td className="py-1.5">{adding && newKey && !entries.some(([k]) => k === newKey) && <TextEdit value="" onSave={x => save(newKey, x)} onCancel={() => { setAdding(false); setNewKey('') }} placeholder="值" />}{adding && entries.some(([k]) => k === newKey) && <span className="text-xs text-red-500">已存在，直接编辑上面那行</span>}</td>
      </tr>
    </>
  )
}

function coerce(s: string): unknown { if (s === 'true') return true; if (s === 'false') return false; if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s); return s }

export function EdgesCard({ id }: { id: string }) {
  const { ix, vocab, canEdit } = useGraph()
  const m = useMutations()
  const [adding, setAdding] = useState<{ rel: string; targetKinds: string[] } | null>(null)
  const [editAttrs, setEditAttrs] = useState<string | null>(null)
  const [newResource, setNewResource] = useState(false)
  const node = ix.node(id)
  if (!canEdit || !node || !vocab) return null
  const explicit = vocab.relKinds.filter(r => !r.implicit)
  const out = ix.outEdges(id).filter(e => explicit.some(r => r.kind === e.rel))
  const addable = explicit.map(r => ({ rel: r, targetKinds: [...new Set(r.endpoints.filter(e => e.source === node.kind && e.shape !== 'derived').map(e => e.target))] })).filter(x => x.targetKinds.length > 0)
  const structRels = new Set(explicit.filter(r => r.endpoints.some(e => e.shape === 'struct-list')).map(r => r.kind))
  return (
    <Card>
      <div className="flex items-center justify-between mb-2"><H3>关系</H3>
        {addable.length > 0 && (
          <select className="text-xs border border-slate-200 rounded px-1 py-0.5 text-slate-600" value="" onChange={e => { const a = addable.find(x => x.rel.kind === e.target.value); if (a) setAdding({ rel: a.rel.kind, targetKinds: a.targetKinds }) }}>
            <option value="">＋ 关系…</option>
            {addable.map(a => <option key={a.rel.kind} value={a.rel.kind}>{a.rel.kind} → {a.targetKinds.join(' / ')}</option>)}
          </select>
        )}
      </div>
      {out.length === 0 && <div className="text-xs text-slate-300 italic">无出边</div>}
      <div className="space-y-1">
        {out.map(e => (
          <div key={e.id} className="flex items-center gap-2 text-sm flex-wrap">
            <Badge color="slate">{e.rel}</Badge><span className="text-slate-400">→</span>
            {(() => { const ta = ix.appOf(e.to), sa = ix.appOf(id); return ta && ta.id !== sa?.id ? <Badge color="green"><Ref id={ta.id} /></Badge> : null })()}
            <Ref id={e.to} /><span className="text-xs text-slate-400">({ix.kind(e.to)}{ix.kind(e.to) === 'resource' && ix.data(e.to).type ? ` · ${String(ix.data(e.to).type)}` : ''})</span>
            {e.attrs?.mode ? <Badge color="purple">{String(e.attrs.mode)}</Badge> : null}
            {e.attrs && Object.keys(e.attrs).filter(k => k !== 'mode').length > 0 && <span className="text-xs text-slate-400 font-mono">{JSON.stringify(Object.fromEntries(Object.entries(e.attrs).filter(([k]) => k !== 'mode')))}</span>}
            {structRels.has(e.rel) && <button className="text-xs text-slate-400 hover:text-blue-600" onClick={() => setEditAttrs(e.id)}>✎ 属性</button>}
            {e.rel !== 'transitions-to' && <button className="text-xs text-slate-300 hover:text-red-600" title="删除这条边" onClick={async () => { if (window.confirm(`删除边 ${e.rel} → ${ix.name(e.to)}？`)) await m.disconnect(id, e.rel, e.to) }}>✕</button>}
            {editAttrs === e.id && (
              <div className="w-full pl-6"><JsonEdit value={e.attrs ?? {}} onCancel={() => setEditAttrs(null)} onSave={async v => { setEditAttrs(null); const attrs = (v ?? {}) as Record<string, unknown>; const unset = Object.keys(e.attrs ?? {}).filter(k => !(k in attrs)); await m.updateEdge(id, e.rel, e.to, attrs, unset) }} /></div>
            )}
          </div>
        ))}
      </div>
      {adding && (
        <Picker title={`${node.name} —${adding.rel}→ 选择目标`} onCancel={() => setAdding(null)}
          options={ix.g.nodes.filter(n => adding.targetKinds.includes(n.kind) && n.id !== id && (adding.rel !== 'exposes' || ix.data(n.id).type === 'api') && !(adding.rel === 'uses' && n.kind === 'resource' && ix.data(n.id).type === 'api') && !(adding.rel === 'uses' && (node.kind === 'business-use-case' || node.kind === 'system-use-case') && n.kind === 'entity' && ix.appOf(n.id))).map(n => ({ id: n.id, label: n.name, hint: `${n.kind} · ${ix.appOf(n.id)?.name ?? ''} ${n.id}` }))}
          onCreate={(adding.rel === 'exposes' || (adding.rel === 'uses' && node.kind === 'entity')) && adding.targetKinds.includes('resource') ? () => { setAdding(null); setNewResource(true) } : undefined}
          createLabel={adding.rel === 'exposes' ? '新建接口并关联…' : '新建资源并关联…'}
          onPick={async to => {
            setAdding(null)
            const attrs: Record<string, unknown> = {}
            if (adding.rel === 'uses') {
              const choices = ix.kind(to) === 'entity' ? ENTITY_MODES : (MODES_BY_TYPE[String(ix.data(to).type ?? '')] ?? ['read', 'write', 'publish', 'subscribe'])
              if (choices.length > 0) {
                const mode = window.prompt(`mode（${choices.join(' / ')}）:`, choices[0])
                if (mode === null) return
                if (mode.trim()) attrs.mode = mode.trim()
              }
            }
            await m.connect(id, adding.rel, to, attrs)
          }} />
      )}
      {newResource && <ResourceForm appId={ix.appOf(id)?.id ?? ix.roots('application')[0]?.id ?? ''} fromUseCase={node.kind === 'app-use-case' ? id : undefined} fromEntity={node.kind === 'entity' ? id : undefined} onClose={() => setNewResource(false)} />}
    </Card>
  )
}

export function ChildrenCard({ id }: { id: string }) {
  const { ix, vocab, canEdit } = useGraph()
  const m = useMutations()
  const [newResource, setNewResource] = useState(false)
  const node = ix.node(id)
  if (!canEdit || !node || !vocab) return null
  const childKinds = vocab.nodeKinds.filter(k => k.parents.includes(node.kind))
  if (childKinds.length === 0) return null
  const add = async (kind: string, inline: boolean) => {
    if (kind === 'resource') { setNewResource(true); return }
    if (inline) { const content = window.prompt(`新 ${kind} 内容:`); if (!content) return; await m.addNode(kind, { parent: id, attrs: { content } }); return }
    const name = window.prompt(`新 ${kind} 名称（挂在「${node.name}」下）:`); if (!name) return
    await m.addNode(kind, { name, parent: id })
  }
  return (
    <Card>
      <H3>新建子节点</H3>
      <div className="flex flex-wrap gap-2">{childKinds.map(k => <button key={k.kind} className={btn} onClick={() => add(k.kind, k.inline)}>＋ {k.kind}</button>)}</div>
      <div className="text-xs text-slate-400 mt-2">当前子节点：{ix.childrenOf(id).length} 个（规则 {ix.rules(id).length}）</div>
      {newResource && <ResourceForm appId={id} onClose={() => setNewResource(false)} />}
    </Card>
  )
}

// "＋ 新建 <kind>" for root kinds on view pages / app groups.
export function AddRootButtons({ view, parent }: { view?: 'business' | 'applications'; parent?: string }) {
  const { vocab, canEdit, ix } = useGraph()
  const m = useMutations()
  if (!canEdit || !vocab) return null
  const kinds = parent ? vocab.nodeKinds.filter(k => k.parents.includes(ix.kind(parent)) && !k.inline) : vocab.nodeKinds.filter(k => k.view === view)
  return (
    <div className="flex flex-wrap gap-2">
      {kinds.map(k => <button key={k.kind} className={btn} onClick={async () => { const name = window.prompt(`新 ${k.kind} 名称:`); if (name) await m.addNode(k.kind, { name, parent }) }}>＋ {k.kind}</button>)}
    </div>
  )
}
