// 视图总览与分组页：业务视图 / 业务用例 / 业务模型 / 应用视图 / 组织关系 / 组织 / 业务工人 / 领域模型。
import { useGraph } from '../graph/store'
import { str, strs, list, obj, fieldList, fieldText, type Data } from '../graph/index'
import { Badge, Card, H3, DocsSection } from '../components/UI'
import { Ref } from '../components/Ref'
import { BusinessUseCaseDiagram } from '../diagrams/UseCaseDiagrams'
import { ArchitectureDiagram } from '../diagrams/ArchitectureDiagram'
import { DataModelDiagram } from '../diagrams/DataModelDiagram'
import { AppDomainDiagram } from '../diagrams/AppDomainDiagram'
import { OrgBoundaryDiagram, APP_TYPE_COLORS } from './shared'
import { businessRelationships, businessEntityOf, rolesOf } from './entity-helpers'
import { AddRootButtons } from '../edit/EditCards'

function BusinessUcList() {
  const { ix } = useGraph()
  const bucs = ix.roots('business-use-case')
  if (bucs.length === 0) return null
  return (
    <>
      <h2 className="text-2xl font-bold text-slate-800">业务用例</h2>
      <BusinessUseCaseDiagram />
      {bucs.map(b => {
        const d = ix.data(b.id); const sucs = ix.targets(b.id, 'uses'); const interests = list<Data>(d, 'stakeholder_interests'); const actor = ix.targets(b.id, 'has-actor')[0]
        return (
          <Card key={b.id} className="mb-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-bold text-slate-800"><Ref id={b.id} /></h3>
                <span className="text-sm text-slate-500">执行者: {actor ? <Ref id={actor.id} /> : '—'}</span>
              </div>
            </div>
            {sucs.length > 0 && (
              <div className="mb-3">
                <h4 className="text-xs font-semibold text-slate-400 uppercase mb-1">关联系统用例</h4>
                <div className="flex flex-wrap gap-1">{sucs.map(s => <span key={s.id} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded"><Ref id={s.id} /></span>)}</div>
              </div>
            )}
            {interests.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase mb-1">相关方利益</h4>
                <div className="space-y-1">{interests.map((si, j) => <div key={j} className="text-sm"><span className="font-medium text-slate-600">{str(si, 'stakeholder')}:</span> <span className="text-slate-500">{str(si, 'interest')}</span></div>)}</div>
              </div>
            )}
          </Card>
        )
      })}
    </>
  )
}

export function BusinessOverview({ only }: { only?: 'business-uc' }) {
  const { ix, baseFor } = useGraph()
  return (
    <div className="space-y-6">
      {!only && (<><h2 className="text-2xl font-bold text-slate-800">组织结构</h2><AddRootButtons view="business" /><OrgBoundaryDiagram /></>)}
      <BusinessUcList />
      <DocsSection docs={ix.org() ? ix.data(ix.org()!.id).docs : undefined} base={baseFor(ix.org())} />
    </div>
  )
}

export function BusinessModelPage() {
  const { ix, baseFor } = useGraph()
  const entities = ix.ofKind('entity').filter(e => ix.isBusinessEntity(e.id))
  const rels = businessRelationships(ix)
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-800">业务模型关系图</h2>
      <DataModelDiagram />
      <h2 className="text-2xl font-bold text-slate-800">实体概览</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {entities.map(e => {
          const d = ix.data(e.id); const fields = fieldList(d.fields); const raw = fieldText(d.fields)
          return (
            <Card key={e.id} compact>
              <div className="font-bold text-slate-800 mb-1"><Ref id={e.id} /></div>
              <div className="text-xs text-slate-500">{raw ? '字段未按列表格式书写' : `${fields.length} 个字段`}</div>
              {d.state_machine ? <div className="text-xs text-amber-600 mt-1">⚙️ 有状态机</div> : null}
            </Card>
          )
        })}
      </div>
      {rels.length > 0 && (
        <>
          <h2 className="text-2xl font-bold text-slate-800">实体关系</h2>
          <Card>
            <div className="space-y-2">
              {rels.map((r, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <Badge color="blue"><Ref id={r.from} /></Badge>
                  <span className="text-slate-400 text-xs">{r.kind}{r.cardinality ? ` (${r.cardinality})` : ''}</span>
                  <span className="text-slate-400">→</span>
                  <Badge color="blue"><Ref id={r.to} /></Badge>
                  {r.via && <span className="text-xs text-slate-400">(via {r.via})</span>}
                  {r.note && <span className="text-xs text-slate-500 italic">{r.note}</span>}
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
      <DocsSection docs={undefined} base={baseFor()} />
    </div>
  )
}

export function ApplicationsOverview() {
  const { ix, baseFor } = useGraph()
  const apps = ix.roots('application')
  const tech = (id: string) => obj(ix.data(id), 'tech_stack') ?? {}
  return (
    <div className="space-y-6">
      <ArchitectureDiagram />
      <h2 className="text-2xl font-bold text-slate-800">应用列表</h2>
      <AddRootButtons view="applications" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {apps.map(a => {
          const type = str(ix.data(a.id), 'type') || 'backend'
          const ucs = ix.childrenOf(a.id, 'app-use-case').length, pages = ix.childrenOf(a.id, 'page').length
          return (
            <Card key={a.id} compact>
              <Ref id={a.id} className="block text-left w-full cursor-pointer hover:bg-slate-50 -m-3 p-3 rounded-lg transition">
                <div className="flex items-center justify-between mb-2"><h3 className="font-bold text-slate-800">{a.name}</h3><Badge color={APP_TYPE_COLORS[type] || 'gray'}>{type}</Badge></div>
                <div className="text-sm text-slate-600 space-y-1"><div>用例: {ucs}</div>{pages > 0 && <div>页面: {pages}</div>}</div>
              </Ref>
            </Card>
          )
        })}
      </div>
      <h2 className="text-2xl font-bold text-slate-800">技术栈总览</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {apps.map(a => {
          const type = str(ix.data(a.id), 'type') || 'backend'; const t = tech(a.id)
          const fws = strs(t, 'frameworks'), mws = strs(t, 'middleware')
          return (
            <Card key={a.id}>
              <div className="flex items-center justify-between mb-3"><h4 className="font-bold text-slate-800">{a.name}</h4><Badge color={APP_TYPE_COLORS[type] || 'gray'}>{type}</Badge></div>
              <div className="space-y-2 text-sm">
                {str(t, 'language') && <div><span className="text-xs text-slate-400 uppercase font-semibold">语言</span><div className="text-slate-700">{str(t, 'language')}</div></div>}
                {fws.length > 0 && <div><span className="text-xs text-slate-400 uppercase font-semibold">框架</span><div className="flex flex-wrap gap-1 mt-1">{fws.map((f, j) => <Badge key={j} color="blue">{f}</Badge>)}</div></div>}
                {str(t, 'storage') && <div><span className="text-xs text-slate-400 uppercase font-semibold">存储</span><div className="text-slate-700">{str(t, 'storage')}</div></div>}
                {mws.length > 0 && <div><span className="text-xs text-slate-400 uppercase font-semibold">中间件</span><div className="flex flex-wrap gap-1 mt-1">{mws.map((m, j) => <Badge key={j} color="purple">{m}</Badge>)}</div></div>}
              </div>
            </Card>
          )
        })}
      </div>
      <DocsSection docs={undefined} base={baseFor()} />
    </div>
  )
}

export function OrgRelationsPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-800">🔲 组织关系</h2>
      <OrgBoundaryDiagram />
    </div>
  )
}

export function OrgPage({ orgId }: { orgId: string }) {
  const { ix } = useGraph()
  const workers = ix.roots('business-worker'), systems = ix.roots('system')
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">🏢 {ix.name(orgId)}</h2>
      {workers.length > 0 && (
        <Card><H3>业务工人</H3><div className="space-y-1">{workers.map(w => <div key={w.id} className="flex items-center gap-2 py-1"><span>🧑‍💼</span><Ref id={w.id} /></div>)}</div></Card>
      )}
      {systems.length > 0 && (
        <Card><H3>系统</H3><div className="space-y-1">{systems.map(s => <div key={s.id} className="flex items-center gap-2 py-1"><span>⚙️</span><Ref id={s.id} /><span className="text-xs text-slate-400">({ix.childrenOf(s.id, 'system-use-case').length} 用例)</span></div>)}</div></Card>
      )}
    </div>
  )
}

export function WorkersPage() {
  const { ix } = useGraph()
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">🧑‍💼 业务工人</h2>
      <p className="text-slate-600">组织内部执行业务的角色</p>
      <Card>{ix.roots('business-worker').map(w => <div key={w.id} className="flex items-center gap-2 py-2 border-b border-slate-50 last:border-0"><Ref id={w.id} /></div>)}</Card>
    </div>
  )
}

export function AppDomainPage({ appId }: { appId: string }) {
  const { ix } = useGraph()
  const app = ix.node(appId); if (!app) return null
  const roles = ix.childrenOf(appId, 'role'), ents = ix.childrenOf(appId, 'entity'), vos = ix.childrenOf(appId, 'value-object'), enums = ix.childrenOf(appId, 'enum')
  const svcs = ix.childrenOf(appId, 'domain-service'), evts = ix.childrenOf(appId, 'domain-event')
  const plain = ents.filter(e => !ix.isAggregateRoot(e.id)), aggs = ents.filter(e => ix.isAggregateRoot(e.id))
  const repos: { name: string; manages?: string }[] = []
  for (const e of ents) { const r = obj(ix.data(e.id), 'repository'); if (r) repos.push({ name: str(r, 'name'), manages: e.id }) }
  for (const r of list<Data>(ix.data(appId), 'repositories')) repos.push({ name: str(r, 'name') })
  const EntityLine = ({ id, icon }: { id: string; icon: string }) => {
    const be = businessEntityOf(ix, id), rs = rolesOf(ix, id)
    return (
      <li className="flex items-center gap-2 text-sm flex-wrap">
        <span>{icon}</span><span className="font-medium text-slate-700"><Ref id={id} className="text-slate-700 hover:underline" /></span>
        {be && (<><span className="text-xs text-slate-400">→</span><Badge color="purple"><Ref id={be.id} /></Badge></>)}
        {rs.length > 0 && (<><span className="text-xs text-slate-400">扮演:</span>{rs.map(r => <Badge key={r.id} color="amber">{r.name}</Badge>)}</>)}
        {icon === '◆' && <span className="text-xs text-slate-500">根: {ix.name(id)}</span>}
      </li>
    )
  }
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">🧱 {app.name} · 领域模型</h2>
      <p className="text-sm text-slate-500">本 app 的 DDD 构造块（角色 / 聚合 / VO / 仓储 / 领域服务 / 领域事件）</p>
      <AddRootButtons parent={appId} />
      <AppDomainDiagram appId={appId} />
      {roles.length > 0 && <Card><H3>角色 / 接口 ({roles.length})</H3><ul className="space-y-1">{roles.map(r => { const ms = strs(ix.data(r.id), 'methods'); return <li key={r.id} className="flex items-center gap-2 text-sm"><span>🎭</span><span className="font-medium text-slate-700"><Ref id={r.id} className="text-slate-700 hover:underline" /></span>{ms.length > 0 && <span className="text-xs text-slate-500">{ms.length} 个方法</span>}</li> })}</ul></Card>}
      {plain.length > 0 && <Card><H3>实体 ({plain.length})</H3><ul className="space-y-1">{plain.map(e => <EntityLine key={e.id} id={e.id} icon="▪" />)}</ul></Card>}
      {aggs.length > 0 && <Card><H3>聚合 ({aggs.length})</H3><ul className="space-y-1">{aggs.map(a => <EntityLine key={a.id} id={a.id} icon="◆" />)}</ul></Card>}
      {vos.length > 0 && <Card><H3>值对象 ({vos.length})</H3><ul className="space-y-1">{vos.map(v => <li key={v.id} className="flex items-center gap-2 text-sm"><span>◇</span><span className="font-medium text-slate-700"><Ref id={v.id} className="text-slate-700 hover:underline" /></span></li>)}</ul></Card>}
      {enums.length > 0 && <Card><H3>枚举 ({enums.length})</H3><ul className="space-y-1">{enums.map(e => <li key={e.id} className="flex items-center gap-2 text-sm"><span>≡</span><span className="font-medium text-slate-700"><Ref id={e.id} className="text-slate-700 hover:underline" /></span><span className="text-xs text-slate-500">{strs(ix.data(e.id), 'values').join(' | ')}</span></li>)}</ul></Card>}
      {repos.length > 0 && <Card><H3>仓储 ({repos.length})</H3><ul className="space-y-1">{repos.map((r, j) => <li key={j} className="flex items-center gap-2 text-sm"><span>🗄️</span><span className="font-medium text-slate-700">{r.name}</span>{r.manages && <span className="text-xs text-slate-500">→ <Ref id={r.manages} className="text-slate-500 hover:underline" /></span>}</li>)}</ul></Card>}
      {svcs.length > 0 && <Card><H3>领域服务 ({svcs.length})</H3><ul className="space-y-1">{svcs.map(s => <li key={s.id} className="flex items-center gap-2 text-sm"><span>⚙</span><span className="font-medium text-slate-700"><Ref id={s.id} className="text-slate-700 hover:underline" /></span></li>)}</ul></Card>}
      {evts.length > 0 && <Card><H3>领域事件 ({evts.length})</H3><ul className="space-y-1">{evts.map(e => <li key={e.id} className="flex items-center gap-2 text-sm"><span>⚡</span><span className="font-medium text-slate-700"><Ref id={e.id} className="text-slate-700 hover:underline" /></span>{str(ix.data(e.id), 'published_when') && <span className="text-xs text-slate-500">— {str(ix.data(e.id), 'published_when')}</span>}</li>)}</ul></Card>}
    </div>
  )
}
