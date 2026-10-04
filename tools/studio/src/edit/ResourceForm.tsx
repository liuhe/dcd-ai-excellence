// 新建资源的小表单，一次完成建节点 + 连边：
//   从用例发起：建 api 资源并 exposes（用例实现接口）
//   从实体发起：建资源并 uses，mode 按资源类型给（表 / 缓存 / 文件 read-write，topic / queue publish-subscribe）
//   从应用发起：只建资源
import { useState } from 'react'
import { useGraph } from '../graph/store'
import { useMutations } from '../graph/mutations'

export const RESOURCE_TYPES = ['api', 'topic', 'table', 'cache-key', 'queue', 'file', 'bucket']
export const MODES_BY_TYPE: Record<string, string[]> = { api: [], table: ['read', 'write'], 'cache-key': ['read', 'write'], file: ['read', 'write'], bucket: ['read', 'write'], topic: ['publish', 'subscribe'], queue: ['publish', 'subscribe'] }
export const ENTITY_MODES = ['read', 'write']

export function ResourceForm({ appId, fromUseCase, fromEntity, onClose }: { appId: string; fromUseCase?: string; fromEntity?: string; onClose: () => void }) {
  const { ix } = useGraph()
  const m = useMutations()
  const apps = ix.roots('application')
  const types = fromUseCase ? ['api'] : fromEntity ? RESOURCE_TYPES.filter(t => t !== 'api') : RESOURCE_TYPES
  const [name, setName] = useState('')
  const [type, setType] = useState(types[0])
  const [owner, setOwner] = useState(appId)
  const [spec, setSpec] = useState('')
  const [mode, setMode] = useState(MODES_BY_TYPE[types[0]]?.[0] ?? '')
  const [busy, setBusy] = useState(false)
  const onType = (t: string) => { setType(t); setMode(MODES_BY_TYPE[t]?.[0] ?? '') }
  const submit = async () => {
    if (!name.trim()) return
    setBusy(true)
    const r = await m.addNode('resource', { name: name.trim(), parent: owner, attrs: { type, ...(spec.trim() ? { spec: spec.trim() } : {}) } })
    if (r && fromUseCase) await m.connect(fromUseCase, 'exposes', r.result.id)
    if (r && fromEntity) await m.connect(fromEntity, 'uses', r.result.id, mode ? { mode } : {})
    setBusy(false)
    if (r) onClose()
  }
  const field = 'w-full text-sm border border-slate-300 rounded px-2 py-1'
  const title = fromUseCase ? '新建接口（当前用例实现它）' : fromEntity ? '新建资源并关联到当前实体' : '新建资源'
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-start justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mt-16" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-2 border-b border-slate-200 text-sm font-semibold text-slate-700 flex justify-between"><span>{title}</span><button onClick={onClose} className="text-slate-400">✕</button></div>
        <div className="p-4 space-y-3 text-sm">
          <label className="block"><span className="text-xs text-slate-500">名字</span><input autoFocus className={field} value={name} onChange={e => setName(e.target.value)} placeholder={fromUseCase ? 'POST /api/login' : 'session.events · t_session · session:{id}'} onKeyDown={e => { if (e.key === 'Enter') void submit() }} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="text-xs text-slate-500">所属应用</span><select className={field} value={owner} onChange={e => setOwner(e.target.value)}>{apps.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
            <label className="block"><span className="text-xs text-slate-500">type</span><select className={field} value={type} onChange={e => onType(e.target.value)} disabled={types.length === 1}>{types.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
          </div>
          <label className="block"><span className="text-xs text-slate-500">spec（可选：路径与方法 / key 模式 / 字段摘要）</span><textarea className={`${field} min-h-[4rem]`} value={spec} onChange={e => setSpec(e.target.value)} /></label>
          {fromEntity && (MODES_BY_TYPE[type]?.length ?? 0) > 0 && (
            <label className="block"><span className="text-xs text-slate-500">当前实体对它的 mode</span><select className={field} value={mode} onChange={e => setMode(e.target.value)}>{MODES_BY_TYPE[type].map(x => <option key={x} value={x}>{x}</option>)}</select></label>
          )}
          <div className="flex gap-2 justify-end pt-1">
            <button className="text-xs px-3 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50" onClick={onClose}>取消</button>
            <button className="text-xs px-3 py-1 rounded border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50" disabled={busy || !name.trim()} onClick={submit}>{busy ? '保存中…' : fromUseCase || fromEntity ? '创建并关联' : '创建'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
