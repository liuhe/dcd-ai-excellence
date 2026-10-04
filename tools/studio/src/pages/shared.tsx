import type { ReactNode } from 'react'
import type { GNode } from '@dcddp/core'
import { useGraph } from '../graph/store'
import { fieldList, fieldText, str, strs, list, type Data } from '../graph/index'
import { Badge, Card, H3 } from '../components/UI'
import { Ref } from '../components/Ref'
import { MD } from '../components/MD'

export const APP_TYPE_COLORS: Record<string, string> = { frontend: 'blue', client: 'teal', backend: 'green', proxy: 'amber', external: 'purple' }
export const partyIcon = (d: Data) => (d.type === 'system' || d.type === '系统' ? '🖥️' : '👥')
export const participantIcon = (d: Data) => (d.type === 'person' || d.type === '人' ? '👤' : d.type === 'device' || d.type === '设备' ? '📱' : '🖥️')

export function FieldsFallback({ text }: { text: string }) {
  return (
    <div>
      <div className="text-xs text-amber-600 mb-1">fields 不是列表格式（schema 要求 <code>- name: "Type, desc"</code> 列表），按原文显示</div>
      <pre className="text-xs text-slate-600 whitespace-pre-wrap bg-slate-50 rounded p-2">{text}</pre>
    </div>
  )
}

export function FieldsTable({ fields: raw }: { fields: unknown }) {
  const text = fieldText(raw)
  if (text) return <FieldsFallback text={text} />
  const fields = fieldList(raw)
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100"><th className="py-1 pr-4">字段名</th><th className="py-1">描述</th></tr></thead>
        <tbody>
          {fields.map((f, i) => { const entry = Object.entries(f)[0]; if (!entry) return null
            return (<tr key={i} className="border-b border-slate-50"><td className="py-1.5 pr-4 font-mono text-xs text-blue-700 whitespace-nowrap">{entry[0]}</td><td className="py-1.5 text-slate-600">{entry[1]}</td></tr>) })}
        </tbody>
      </table>
    </div>
  )
}

export function StateMachineCard({ sm }: { sm: Data }) {
  const states = strs(sm, 'states'), transitions = list<Data>(sm, 'transitions')
  return (
    <Card>
      <H3>状态机 ({str(sm, 'field')})</H3>
      <div className="flex flex-wrap gap-2 mb-3">
        {states.map((s, i) => <span key={i} className="px-3 py-1 bg-amber-50 rounded-full text-sm font-medium border border-amber-200 text-amber-800">{s}</span>)}
      </div>
      {transitions.map((t, i) => (
        <div key={i} className="text-sm flex items-center gap-2 py-1">
          <span className="font-mono bg-amber-50 px-2 py-0.5 rounded text-amber-700">{str(t, 'from')}</span>
          <span className="text-amber-400">→</span>
          <span className="font-mono bg-amber-50 px-2 py-0.5 rounded text-amber-700">{str(t, 'to')}</span>
          <span className="text-slate-500 ml-1">{str(t, 'trigger')}</span>
        </div>
      ))}
      {str(sm, 'notes') && <p className="text-xs text-amber-600 mt-2 italic">{str(sm, 'notes')}</p>}
    </Card>
  )
}

// Include chain tree starting at an app use case (used by use-case / trace sections).
export function AppUCTree({ entryId, showRules }: { entryId: string; showRules?: boolean }) {
  const { ix } = useGraph()
  const render = (id: string, visited: Set<string>): ReactNode => {
    if (visited.has(id)) return null
    visited.add(id)
    const uc = ix.node(id); if (!uc) return null
    const app = ix.appOf(id)
    const rules = ix.rules(id).map(r => str(ix.data(r.id), 'content'))
    const children = ix.targets(id, 'includes')
    return (
      <div key={id}>
        <div className="bg-slate-50 rounded p-2.5 border border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 -ml-[1.55rem]" />
            {app && <Badge color="green"><Ref id={app.id} /></Badge>}
            <Ref id={id} />
          </div>
          {showRules && rules.length > 0 && (
            <ul className="text-xs text-slate-500 mt-1 ml-4 space-y-0.5">
              {rules.slice(0, 2).map((r, l) => <li key={l} className="list-disc">{r}</li>)}
              {rules.length > 2 && <li className="text-slate-400">...还有 {rules.length - 2} 条规则</li>}
            </ul>
          )}
        </div>
        {children.length > 0 && <div className="ml-4 border-l-2 border-green-100 pl-3 mt-1 space-y-1">{children.map(c => render(c.id, visited))}</div>}
      </div>
    )
  }
  return <>{render(entryId, new Set())}</>
}

// 组织边界图（JSX 盒子版）：外部参与方在左，组织边界在右，内含业务工人与系统。
export function OrgBoundaryDiagram() {
  const { ix } = useGraph()
  const org = ix.org(), workers = ix.roots('business-worker'), systems = ix.roots('system'), parties = ix.roots('external-party')
  return (
    <div className="flex gap-4 items-stretch">
      <div className="flex flex-col gap-3 justify-center min-w-[160px]">
        {parties.map(p => {
          const d = ix.data(p.id); const isSystem = d.type === 'system' || d.type === '系统'
          const participants = ix.childrenOf(p.id, 'participant')
          return (
            <div key={p.id} className={`border-2 rounded-xl p-3 text-center ${isSystem ? 'bg-purple-50 border-purple-300' : 'bg-blue-50 border-blue-300'}`}>
              <div className="text-lg mb-1">{partyIcon(d)}</div>
              <div className={`text-sm font-medium ${isSystem ? 'text-purple-800' : 'text-blue-800'}`}><Ref id={p.id} /></div>
              {isSystem && <div className="text-xs text-purple-500">系统</div>}
              {participants.length > 0 && (
                <div className="mt-1.5 space-y-0.5">
                  {participants.map(pt => <div key={pt.id} className="text-xs text-blue-600">{participantIcon(ix.data(pt.id))} <Ref id={pt.id} /></div>)}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="flex-1 border-2 border-dashed border-slate-300 rounded-2xl p-5 bg-slate-50 relative">
        <div className="absolute -top-3 left-4 bg-slate-50 px-2 text-sm font-bold text-slate-600">{org ? <Ref id={org.id} /> : ix.orgName()}</div>
        {workers.length > 0 && (
          <div className="mb-4 pb-4 border-b border-slate-200">
            <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">业务工人</h4>
            <div className="flex flex-wrap gap-2">
              {workers.map(w => (
                <div key={w.id} className="bg-amber-50 border border-amber-300 rounded-lg px-3 py-1.5 text-center">
                  <div className="text-sm">🧑‍💼</div>
                  <div className="text-xs font-medium text-amber-800"><Ref id={w.id} /></div>
                </div>
              ))}
            </div>
          </div>
        )}
        {systems.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">系统</h4>
            <div className="space-y-2">
              {systems.map(s => (
                <div key={s.id} className="border border-slate-300 rounded-lg p-3 bg-white flex items-center gap-2">
                  <span>⚙️</span><span className="font-semibold text-slate-700 text-sm"><Ref id={s.id} /></span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Group nodes by (single-level) package label — the way the 6.x pages did.
export function groupByPackage<T extends GNode>(nodes: T[]): { grouped: Map<string, T[]>; hasPackages: boolean } {
  const grouped = new Map<string, T[]>()
  nodes.forEach(n => { const pkg = n.package ?? ''; grouped.set(pkg, [...(grouped.get(pkg) ?? []), n]) })
  return { grouped, hasPackages: grouped.size > 1 || (grouped.size === 1 && !grouped.has('')) }
}

export function PackageCard({ pkg, count, children }: { pkg: string; count: number; children: ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 border-l-4 border-l-indigo-400 shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 bg-gradient-to-r from-indigo-50 to-white border-b border-slate-100">
        <span className="text-sm font-semibold text-indigo-700">{pkg || 'Other'}</span>
        <span className="text-xs text-indigo-400 ml-2">({count})</span>
      </div>
      <div className="p-3 space-y-2">{children}</div>
    </div>
  )
}

export function RuleList({ ownerId, base }: { ownerId: string; base: string }) {
  const { ix } = useGraph()
  return <>{ix.rules(ownerId).map(r => <RuleItem key={r.id} ruleId={r.id} base={base} />)}</>
}

export function RuleItem({ ruleId, base }: { ruleId: string; base: string }) {
  const { ix } = useGraph()
  const d = ix.data(ruleId)
  const field = str(d, 'field'), relUCs = ix.targets(ruleId, 'references').filter(t => t.kind === 'app-use-case'), relEnts = ix.targets(ruleId, 'references').filter(t => t.kind === 'entity')
  return (
    <li className="text-sm text-slate-600">
      <div className="flex gap-2">
        <span className="text-slate-400 flex-shrink-0">•</span>
        <div>{field && <Badge color="blue">{field}</Badge>}{field ? ' ' : ''}<MD basePath={base}>{str(d, 'content')}</MD></div>
      </div>
      {relUCs.length > 0 && (
        <div className="flex flex-wrap gap-1 ml-4 mt-1"><span className="text-xs text-slate-400">关联用例:</span>{relUCs.map(uc => <Badge key={uc.id} color="green"><Ref id={uc.id} /></Badge>)}</div>
      )}
      {relEnts.length > 0 && (
        <div className="flex flex-wrap gap-1 ml-4 mt-1">{relEnts.map(e => <Badge key={e.id} color="purple"><Ref id={e.id} /></Badge>)}</div>
      )}
    </li>
  )
}
