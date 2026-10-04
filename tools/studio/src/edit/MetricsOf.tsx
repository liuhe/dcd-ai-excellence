// 用例页 / 实体页的"监控指标"分区：measures 入边。编辑模式下可关联已有指标（选择器里可新建并关联）、解除关联。
import { useState } from 'react'
import { useGraph } from '../graph/store'
import { useMutations } from '../graph/mutations'
import { str } from '../graph/index'
import { Badge, Card, H3 } from '../components/UI'
import { Ref } from '../components/Ref'
import { Picker } from './controls'
import { grafanaExploreLinks, GrafanaLinks } from '../pages/nodes'

const btn = 'text-xs px-2 py-0.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50'

export function MetricsOf({ id }: { id: string }) {
  const { ix, canEdit } = useGraph()
  const m = useMutations()
  const [picking, setPicking] = useState(false)
  const [creating, setCreating] = useState(false)
  const metrics = ix.sources(id, 'measures')
  if (metrics.length === 0 && !canEdit) return null
  const linked = new Set(metrics.map(x => x.id))
  return (
    <Card>
      <div className="flex items-center justify-between mb-2"><H3>监控指标 ({metrics.length})</H3>
        {canEdit && <button className={btn} onClick={() => setPicking(true)}>＋ 关联指标…</button>}
      </div>
      {metrics.length === 0 && <div className="text-xs text-slate-300 italic">还没有指标度量这个节点</div>}
      <div className="space-y-1">{metrics.map(x => { const ma = ix.appOf(x.id); const expr = str(ix.data(x.id), 'expression')
        const src = ix.targets(x.id, 'sourced-from')[0]; const links = src ? grafanaExploreLinks(ix.data(src.id), expr) : []
        return (<div key={x.id} className="flex items-center gap-2 text-sm flex-wrap"><span>📈</span><Ref id={x.id} />{ma ? <Badge color="green"><Ref id={ma.id} /></Badge> : <Badge color="purple">业务指标</Badge>}{expr && <span className="text-xs text-slate-400 font-mono truncate max-w-md">{expr.split('\n')[0]}</span>}<GrafanaLinks links={links} />
          {canEdit && <button className="text-xs text-slate-300 hover:text-red-600" title="解除关联" onClick={async () => { if (window.confirm(`解除 ${ix.name(x.id)} 对本节点的度量？`)) await m.disconnect(x.id, 'measures', id) }}>✕</button>}
        </div>) })}</div>
      {picking && (
        <Picker title={`选择度量 ${ix.name(id)} 的指标`} onCancel={() => setPicking(false)}
          options={ix.g.nodes.filter(n => n.kind === 'metric' && !linked.has(n.id)).map(n => ({ id: n.id, label: n.name, hint: `${ix.appOf(n.id)?.name ?? '业务指标'} ${n.id}` }))}
          onCreate={() => { setPicking(false); setCreating(true) }} createLabel="新建指标并关联…"
          onPick={async to => { setPicking(false); await m.connect(to, 'measures', id) }} />
      )}
      {creating && <MetricForm measured={id} onClose={() => setCreating(false)} />}
    </Card>
  )
}

// 新建指标的小表单：名字 / 表达式 / 放置（业务指标或某个应用），创建后 measures → 当前节点
function MetricForm({ measured, onClose }: { measured: string; onClose: () => void }) {
  const { ix } = useGraph()
  const m = useMutations()
  const apps = ix.roots('application')
  const [name, setName] = useState('')
  const [expression, setExpression] = useState('')
  const [owner, setOwner] = useState(ix.appOf(measured)?.id ?? '')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (!name.trim()) return
    setBusy(true)
    const r = await m.addNode('metric', { name: name.trim(), ...(owner ? { parent: owner } : {}), attrs: expression.trim() ? { expression: expression.trim() } : {} })
    if (r) await m.connect(r.result.id, 'measures', measured)
    setBusy(false)
    if (r) onClose()
  }
  const field = 'w-full text-sm border border-slate-300 rounded px-2 py-1'
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-start justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mt-16" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-2 border-b border-slate-200 text-sm font-semibold text-slate-700 flex justify-between"><span>新建指标（度量 {ix.name(measured)}）</span><button onClick={onClose} className="text-slate-400">✕</button></div>
        <div className="p-4 space-y-3 text-sm">
          <label className="block"><span className="text-xs text-slate-500">名字</span><input autoFocus className={field} value={name} onChange={e => setName(e.target.value)} placeholder="下单支付转化率 · CreateOrder p99 延迟" onKeyDown={e => { if (e.key === 'Enter') void submit() }} /></label>
          <label className="block"><span className="text-xs text-slate-500">放置</span><select className={field} value={owner} onChange={e => setOwner(e.target.value)}><option value="">业务指标（业务视图根）</option>{apps.map(a => <option key={a.id} value={a.id}>{a.name}（技术指标）</option>)}</select></label>
          <label className="block"><span className="text-xs text-slate-500">expression（怎么算：PromQL / SQL / 口径，可选）</span><textarea className={`${field} min-h-[4rem] font-mono`} value={expression} onChange={e => setExpression(e.target.value)} /></label>
          <p className="text-xs text-slate-400">数据来源、负责人等放扩展属性 ext，创建后在指标页逐键填写。</p>
          <div className="flex gap-2 justify-end pt-1">
            <button className="text-xs px-3 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50" onClick={onClose}>取消</button>
            <button className="text-xs px-3 py-1 rounded border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50" disabled={busy || !name.trim()} onClick={submit}>{busy ? '保存中…' : '创建并关联'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
