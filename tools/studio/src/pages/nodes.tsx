// 节点详情页：按 kind 分发，分区照 6.x 原样。
import { useGraph } from '../graph/store'
import { str, strs, list, obj, fieldList, type Data } from '../graph/index'
import { Badge, Card, H3, DocsSection, Empty } from '../components/UI'
import { Ref, GroupRef } from '../components/Ref'
import { MD } from '../components/MD'
import { SystemUseCaseDiagram, AppUseCaseDiagram, SystemDetailDiagram, AppDetailDiagram } from '../diagrams/UseCaseDiagrams'
import { StateMachineDiagram } from '../diagrams/StateMachineDiagram'
import { EntityRelDiagram } from '../diagrams/EntityRelDiagram'
import { FieldsTable, StateMachineCard, AppUCTree, APP_TYPE_COLORS, partyIcon, participantIcon, groupByPackage, PackageCard, RuleList, RuleItem } from './shared'
import { businessRelationships, businessEntityOf, rolesOf, DDD_RELS } from './entity-helpers'
import { EditToolbar, AttrsCard, EdgesCard, ChildrenCard } from '../edit/EditCards'
import { MetricsOf } from '../edit/MetricsOf'
import { KIND_LABELS, KIND_ICONS } from '../components/kinds'

// 页面骨架：标题 / 属性 / 自身内容 / 对外关系 / 被谁引用（各 kind 页内） → 扩展文档 → 新建子节点。
// 扩展文档只读模式下没有内容不显示；编辑模式下空占位放进编辑区。
// 编辑模式下"属性"卡紧跟页头，"关系"卡放在各页的对外关系位置（下列 kind 自行摆放，只读的出边列表随之隐藏），其余 kind 放在页尾。
const PLACES_EDGES = new Set(['app-use-case', 'entity', 'page', 'business-use-case', 'system-use-case'])

export function NodePage({ id }: { id: string }) {
  const { ix, vocab, canEdit, baseFor } = useGraph()
  const node = ix.node(id)
  if (!node) return <Empty />
  const docs = ix.data(id).docs
  const hasDocs = Array.isArray(docs) && docs.length > 0
  const docsAttr = vocab?.nodeKinds.find(k => k.kind === node.kind)?.attrs.some(a => a.name === 'docs') ?? false
  return (
    <div className="space-y-4">
      <KindPage id={id} kind={node.kind} />
      {!canEdit && <ExtCard id={id} />}
      {!PLACES_EDGES.has(node.kind) && <EdgesCard id={id} />}
      {hasDocs && <DocsSection docs={docs} base={baseFor(id)} />}
      {canEdit && (
        <>
          <TraceHeader title="编辑" sub="新建子节点；上方内容随之刷新" />
          {!hasDocs && docsAttr && <DocsSection docs={docs} base={baseFor(id)} />}
          <ChildrenCard id={id} />
        </>
      )}
    </div>
  )
}

function KindPage({ id, kind }: { id: string; kind: string }) {
  const { ix } = useGraph()
  switch (kind) {
    case 'organization': return <OrgNode id={id} />
    case 'business-worker': return <WorkerPage id={id} />
    case 'external-party': return <PartyPage id={id} />
    case 'participant': return <ParticipantPage id={id} />
    case 'system': return <SystemPage id={id} />
    case 'system-use-case': return <SucPage id={id} />
    case 'business-use-case': return <BucPage id={id} />
    case 'entity': return ix.isBusinessEntity(id) ? <BusinessEntityPage id={id} /> : <AppEntityPage id={id} />
    case 'application': return <AppPage id={id} />
    case 'page': return <PagePage id={id} />
    case 'resource': return <ResourcePage id={id} />
    case 'metric': return <MetricPage id={id} />
    case 'app-use-case': return <AucPage id={id} />
    case 'role': return <RolePage id={id} />
    case 'value-object': return <VoPage id={id} />
    case 'enum': return <EnumPage id={id} />
    case 'domain-service': return <SvcPage id={id} />
    case 'domain-event': return <EvtPage id={id} />
    case 'rule': return <RulePage id={id} />
    default: return <Empty />
  }
}

// Organization node: same content as the original "org" page.
function OrgNode({ id }: { id: string }) {
  const { ix } = useGraph()
  const workers = ix.roots('business-worker'), systems = ix.roots('system')
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">🏢 {ix.name(id)}</h2>
      <EditToolbar id={id} />
      <AttrsCard id={id} />
      {workers.length > 0 && <Card><H3>业务工人</H3><div className="space-y-1">{workers.map(w => <div key={w.id} className="flex items-center gap-2 py-1"><span>🧑‍💼</span><Ref id={w.id} /></div>)}</div></Card>}
      {systems.length > 0 && <Card><H3>系统</H3><div className="space-y-1">{systems.map(s => <div key={s.id} className="flex items-center gap-2 py-1"><span>⚙️</span><Ref id={s.id} /><span className="text-xs text-slate-400">({ix.childrenOf(s.id, 'system-use-case').length} 用例)</span></div>)}</div></Card>}
    </div>
  )
}

// 参与的业务用例 / 触发的系统用例 — shared by worker / party / participant pages.
function ActorUsage({ actorIds, showEntry }: { actorIds: string[]; showEntry?: boolean }) {
  const { ix } = useGraph()
  const bucs = actorIds.flatMap(a => ix.sources(a, 'has-actor')).filter(n => n.kind === 'business-use-case')
  const sucs = actorIds.flatMap(a => ix.sources(a, 'has-actor')).filter(n => n.kind === 'system-use-case')
  return (
    <>
      {bucs.length > 0 && <Card><H3>参与的业务用例</H3>{bucs.map(b => <div key={b.id} className="py-1.5 border-b border-slate-50 last:border-0"><Ref id={b.id} /></div>)}</Card>}
      {sucs.length > 0 && (
        <Card><H3>触发的系统用例</H3>
          {sucs.map(s => { const entry = ix.targets(s.id, 'has-entry')[0]
            return (<div key={s.id} className="py-1.5 border-b border-slate-50 last:border-0 flex items-center gap-2"><Ref id={s.id} />{showEntry && entry && <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">入口: <Ref id={entry.id} className="text-green-700 hover:underline" /></span>}</div>) })}
        </Card>
      )}
    </>
  )
}

function WorkerPage({ id }: { id: string }) {
  const { ix } = useGraph()
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">🧑‍💼 {ix.name(id)}</h2>
      <EditToolbar id={id} />
      <Badge color="amber">业务工人</Badge>
      <p className="text-slate-600">组织内部执行业务的角色</p>
      <AttrsCard id={id} />
      <ActorUsage actorIds={[id]} />
    </div>
  )
}

function PartyPage({ id }: { id: string }) {
  const { ix } = useGraph()
  const d = ix.data(id); const isSystem = d.type === 'system' || d.type === '系统'
  const participants = ix.childrenOf(id, 'participant')
  const actorIds = isSystem ? [id] : [id, ...participants.map(p => p.id)]
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">{partyIcon(d)} {ix.name(id)}</h2>
      <EditToolbar id={id} />
      {isSystem && <Badge color="purple">系统</Badge>}
      <AttrsCard id={id} />
      {participants.length > 0 && (
        <Card><H3>参与者</H3>
          {participants.map(p => { const pd = ix.data(p.id)
            return (<div key={p.id} className="flex items-center gap-2 py-1.5 border-b border-slate-50 last:border-0"><span>{participantIcon(pd)}</span><Ref id={p.id} /><span className="text-xs text-slate-400">{str(pd, 'type')}</span></div>) })}
        </Card>
      )}
      <ActorUsage actorIds={actorIds} />
    </div>
  )
}

function ParticipantPage({ id }: { id: string }) {
  const { ix } = useGraph()
  const d = ix.data(id); const party = ix.parent(id)
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">{participantIcon(d)} {ix.name(id)}</h2>
      <EditToolbar id={id} />
      <div className="flex gap-2"><Badge color="gray">{str(d, 'type')}</Badge>{party && <Badge color="slate"><Ref id={party.id} /></Badge>}</div>
      <AttrsCard id={id} />
      <ActorUsage actorIds={[id]} showEntry />
    </div>
  )
}

function SystemPage({ id }: { id: string }) {
  const { ix } = useGraph()
  const ucs = ix.childrenOf(id, 'system-use-case')
  const { grouped, hasPackages } = groupByPackage(ucs)
  const table = (items: typeof ucs) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100"><th className="py-1.5 pr-3">用例</th><th className="py-1.5 pr-3">执行者</th><th className="py-1.5">入口</th></tr></thead>
        <tbody>
          {items.map(u => { const actor = ix.targets(u.id, 'has-actor')[0], entry = ix.targets(u.id, 'has-entry')[0]
            return (<tr key={u.id} className="border-b border-slate-50"><td className="py-2 pr-3"><Ref id={u.id} /></td><td className="py-2 pr-3 text-slate-600">{actor ? <Ref id={actor.id} /> : '—'}</td><td className="py-2 text-slate-500 font-mono text-xs">{entry ? <Ref id={entry.id} /> : '—'}</td></tr>) })}
        </tbody>
      </table>
    </div>
  )
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">⚙️ {ix.name(id)}</h2>
      <EditToolbar id={id} />
      <AttrsCard id={id} />
      <SystemDetailDiagram systemId={id} />
      {!hasPackages ? (
        <Card><h3 className="text-xs font-semibold text-slate-400 uppercase mb-3">系统用例 ({ucs.length})</h3>{table(ucs)}</Card>
      ) : (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-slate-400 uppercase">系统用例 ({ucs.length})</h3>
          {[...grouped.entries()].map(([pkg, items]) => <PackageCard key={pkg || '__ungrouped__'} pkg={pkg} count={items.length}>{table(items)}</PackageCard>)}
        </div>
      )}
    </div>
  )
}

function TraceHeader({ title, sub }: { title: string; sub: string }) {
  return (<><h3 className="text-lg font-bold text-slate-800">↳ {title}</h3><p className="text-sm text-slate-500">{sub}</p></>)
}

function SucPage({ id }: { id: string }) {
  const { ix, canEdit } = useGraph()
  const system = ix.parent(id), actor = ix.targets(id, 'has-actor')[0], entry = ix.targets(id, 'has-entry')[0]
  const bucs = ix.sources(id, 'uses')
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">◎ {ix.name(id)}</h2>
      <EditToolbar id={id} />
      <div className="flex gap-2"><Badge color="blue">系统用例</Badge>{system && <Badge color="gray"><Ref id={system.id} /></Badge>}</div>
      {str(ix.data(id), 'summary') && <p className="text-slate-600">{str(ix.data(id), 'summary')}</p>}
      <AttrsCard id={id} />
      <Card><div className="space-y-3"><div><h3 className="text-xs font-semibold text-slate-400 uppercase mb-1">执行者</h3><p className="text-slate-700">{actor ? <Ref id={actor.id} /> : '—'}</p></div></div></Card>
      {bucs.length > 0 && <Card><H3>所属业务用例</H3>{bucs.map(b => <div key={b.id} className="py-1.5 flex items-center gap-2"><span>🎯</span><Ref id={b.id} /></div>)}</Card>}
      {entry && (
        <Card>
          <h3 className="text-xs font-semibold text-slate-400 uppercase mb-3">用例链路 ↳</h3>
          <div className="ml-4 border-l-2 border-blue-100 pl-4 space-y-2"><AppUCTree entryId={entry.id} /></div>
        </Card>
      )}
      {!canEdit && <UsedBusinessEntities id={id} />}
      <EdgesCard id={id} />
      <MetricsOf id={id} />
      {/* 追溯链路（原侧边栏子项，现为分区） */}
      <TraceHeader title="追溯链路" sub="系统用例 → 子系统用例" />
      <Card>
        {bucs.length > 0 && <div className="mb-4"><span className="text-xs text-slate-400 uppercase font-semibold">所属业务用例: </span>{bucs.map(b => <Badge key={b.id} color="red"><Ref id={b.id} /></Badge>)}</div>}
        <div className="flex items-center gap-2 mb-3"><div className="w-2 h-2 rounded-full bg-blue-400" /><span className="font-medium text-blue-700"><Ref id={id} /></span>{actor && <span className="text-xs text-slate-400">(<Ref id={actor.id} />)</span>}</div>
        {entry && <div className="ml-4 border-l-2 border-blue-100 pl-4 space-y-2"><AppUCTree entryId={entry.id} showRules /></div>}
      </Card>
    </div>
  )
}

function BucPage({ id }: { id: string }) {
  const { ix, canEdit } = useGraph()
  const d = ix.data(id); const actor = ix.targets(id, 'has-actor')[0]
  const interests = list<Data>(d, 'stakeholder_interests'); const sucs = ix.targets(id, 'uses')
  const sucRow = (s: { id: string }, showRules: boolean) => {
    const sa = ix.targets(s.id, 'has-actor')[0], entry = ix.targets(s.id, 'has-entry')[0]
    return (
      <div key={s.id}>
        <div className="flex items-center gap-2 mb-2"><div className={`w-2 h-2 rounded-full bg-blue-400${showRules ? ' -ml-[1.3rem]' : ''}`} /><span className="font-medium text-blue-700"><Ref id={s.id} /></span>{sa && <span className="text-xs text-slate-400">(<Ref id={sa.id} />)</span>}</div>
        {entry && <div className="ml-4 border-l-2 border-blue-100 pl-4 space-y-2"><AppUCTree entryId={entry.id} showRules={showRules} /></div>}
      </div>
    )
  }
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">🎯 {ix.name(id)}</h2>
      <EditToolbar id={id} />
      {actor && <Badge color="blue"><Ref id={actor.id} /></Badge>}
      <AttrsCard id={id} />
      {interests.length > 0 && (
        <Card><H3>相关方利益</H3>
          <div className="space-y-3">{interests.map((si, i) => <div key={i} className="bg-slate-50 rounded p-3 border border-slate-100"><div className="font-semibold text-slate-700 mb-1">{str(si, 'stakeholder')}</div><div className="text-slate-600 text-sm">{str(si, 'interest')}</div></div>)}</div>
        </Card>
      )}
      <SystemUseCaseDiagram bucId={id} />
      <AppUseCaseDiagram bucId={id} />
      {sucs.length > 0 && (
        <Card>
          <h3 className="text-xs font-semibold text-slate-400 uppercase mb-3">关联系统用例 ↳</h3>
          <div className="space-y-3">{sucs.map(s => sucRow(s, false))}</div>
        </Card>
      )}
      {!canEdit && <UsedBusinessEntities id={id} />}
      <EdgesCard id={id} />
      <MetricsOf id={id} />
      {/* 追溯链路（原侧边栏子项，现为分区） */}
      {sucs.length > 0 && (
        <>
          <TraceHeader title="追溯链路" sub="业务用例 → 系统用例 → 子系统用例 → 页面" />
          <Card>
            <div className="flex items-center gap-3 mb-4"><div className="w-2 h-2 rounded-full bg-red-400" /><h3 className="font-bold text-slate-800"><Ref id={id} /></h3>{actor && <Badge color="blue"><Ref id={actor.id} /></Badge>}</div>
            <div className="ml-6 border-l-2 border-slate-200 pl-4 space-y-3">{sucs.map(s => sucRow(s, true))}</div>
          </Card>
        </>
      )}
    </div>
  )
}

function ArchetypeBadge({ archetype }: { archetype: string }) {
  if (!archetype) return null
  return <Badge color={archetype === 'role' ? 'amber' : archetype === 'moment-interval' ? 'pink' : archetype === 'party-place-thing' ? 'green' : 'blue'}>{archetype}</Badge>
}

function BusinessEntityPage({ id }: { id: string }) {
  const { ix, baseFor } = useGraph()
  const d = ix.data(id); const base = baseFor(id)
  const sm = obj(d, 'state_machine')
  const rels = businessRelationships(ix).filter(r => r.from === id || r.to === id)
  const roles = rolesOf(ix, id)
  // UC rules referencing this entity (rule → entity references, rule owned by an app use case)
  const ucRules = ix.sources(id, 'references').filter(r => r.kind === 'rule' && ix.parent(r.id)?.kind === 'app-use-case')
  const ownRules = ix.rules(id)
  const allRules = ownRules.length + ucRules.length
  // 被引用：其他业务实体字段描述里提到本实体名
  const crossRefs = ix.ofKind('entity').filter(o => o.id !== id && ix.isBusinessEntity(o.id)).flatMap(o => fieldList(ix.data(o.id).fields).map(f => { const e = Object.entries(f)[0]; return e ? { model: o.id, field: e[0], desc: e[1] } : null }))
    .filter((f): f is NonNullable<typeof f> => f !== null && String(f.desc).includes(ix.name(id)))
  const members = ix.childrenOf(id, 'entity'), aggVOs = ix.childrenOf(id, 'value-object'), invariants = strs(d, 'invariants'), repo = obj(d, 'repository')
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">▪ {ix.name(id)}</h2>
      <EditToolbar id={id} />
      {str(d, 'summary') && <p className="text-slate-600">{str(d, 'summary')}</p>}
      <div className="flex gap-2 items-center flex-wrap">
        {str(d, 'table_name') && <span className="font-mono text-sm text-slate-400 bg-slate-100 px-2 py-1 rounded">{str(d, 'table_name')}</span>}
        <ArchetypeBadge archetype={str(d, 'archetype')} />
        {roles.length > 0 && (<><span className="text-xs text-slate-500">实现:</span>{roles.map(r => <Badge key={r.id} color="amber"><Ref id={r.id} /></Badge>)}</>)}
      </div>
      <AttrsCard id={id} />
      <Card><H3>字段</H3><FieldsTable fields={d.fields} /></Card>
      {str(d, 'notes') && <Card><H3>备注</H3><p className="text-slate-600 text-sm"><MD basePath={base}>{str(d, 'notes')}</MD></p></Card>}
      {allRules > 0 && (
        <Card><H3>规则 ({allRules})</H3>
          <ul className="space-y-2">
            <RuleList ownerId={id} base={base} />
            {ucRules.map(r => { const uc = ix.parent(r.id)!
              return (
                <li key={r.id} className="text-sm text-slate-600">
                  <div className="flex gap-2"><span className="text-green-400 flex-shrink-0">•</span><div><MD basePath={baseFor(uc)}>{str(ix.data(r.id), 'content')}</MD></div></div>
                  <div className="flex flex-wrap gap-1 ml-4 mt-1"><span className="text-xs text-slate-400">来自用例:</span><Badge color="green"><Ref id={uc.id}>{`${ix.appOf(uc.id)?.name ?? ''}.${uc.name}`}</Ref></Badge></div>
                </li>
              ) })}
          </ul>
        </Card>
      )}
      {sm && <StateMachineDiagram sm={sm as never} />}
      {sm && <StateMachineCard sm={sm} />}
      <AggregateSections members={members} vos={aggVOs} invariants={invariants} repo={repo} base={base} />
      {rels.length > 0 && <EntityRelDiagram entityId={id} relationships={rels.map(r => ({ from: r.from, to: r.to, type: r.cardinality || r.kind, via: r.via }))} />}
      {rels.length > 0 && (
        <Card><H3>关系</H3>
          <div className="space-y-2">{rels.map((r, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <Badge color="blue"><Ref id={r.from} /></Badge><span className="text-slate-400 text-xs">{r.kind}{r.cardinality ? ` (${r.cardinality})` : ''}</span><span className="text-slate-400">→</span><Badge color="blue"><Ref id={r.to} /></Badge>
              {r.via && <span className="text-xs text-slate-400">(via {r.via})</span>}{r.note && <span className="text-xs text-slate-500 italic">{r.note}</span>}
            </div>))}</div>
        </Card>
      )}
      <EdgesCard id={id} />
      <EntityResources id={id} />
      <MetricsOf id={id} />
      {crossRefs.length > 0 && (
        <Card><H3>被引用</H3>{crossRefs.map((ref, i) => <div key={i} className="flex items-center gap-2 py-1 text-sm"><Badge color="purple"><Ref id={ref.model} /></Badge><span className="font-mono text-xs text-slate-600">.{ref.field}</span><span className="text-xs text-slate-400">— {String(ref.desc)}</span></div>)}</Card>
      )}
    </div>
  )
}

// 聚合根实体的附加分区：聚合成员 / 聚合内值对象 / 不变量 / 仓储（已确认新增）。
function AggregateSections({ members, vos, invariants, repo, base }: { members: { id: string; name: string }[]; vos: { id: string; name: string }[]; invariants: string[]; repo?: Data; base: string }) {
  const { ix } = useGraph()
  return (
    <>
      {members.length > 0 && (
        <Card><H3>聚合成员</H3>{members.map(m => <div key={m.id} className="mb-3"><div className="font-semibold text-slate-700 text-sm"><Ref id={m.id} className="text-slate-700 hover:underline" /></div><FieldsTable fields={ix.data(m.id).fields} /></div>)}</Card>
      )}
      {vos.length > 0 && (
        <Card><H3>内含值对象</H3>{vos.map(v => <div key={v.id} className="mb-3"><div className="font-semibold text-slate-700 text-sm"><Ref id={v.id} className="text-slate-700 hover:underline" /></div><FieldsTable fields={ix.data(v.id).fields} /></div>)}</Card>
      )}
      {invariants.length > 0 && <Card><H3>不变量</H3><ul className="space-y-1">{invariants.map((inv, j) => <li key={j} className="text-sm text-slate-600 flex gap-2"><span>•</span><MD basePath={base}>{inv}</MD></li>)}</ul></Card>}
      {repo && (
        <Card><H3>仓储</H3><div className="text-sm font-medium text-slate-700 flex items-center gap-2"><span>🗄️</span>{str(repo, 'name')}</div>
          {strs(repo, 'operations').length > 0 && <ul className="space-y-1 mt-2">{strs(repo, 'operations').map((op, j) => <li key={j} className="text-sm font-mono text-slate-700 flex gap-2"><span>•</span>{op}</li>)}</ul>}
        </Card>
      )}
    </>
  )
}

function AppEntityPage({ id }: { id: string }) {
  const { ix, baseFor } = useGraph()
  const d = ix.data(id); const base = baseFor(id)
  const app = ix.appOf(id); const parent = ix.parent(id); const isRoot = ix.isAggregateRoot(id); const isMember = parent?.kind === 'entity'
  const be = businessEntityOf(ix, id); const roles = rolesOf(ix, id)
  const members = ix.childrenOf(id, 'entity'), aggVOs = ix.childrenOf(id, 'value-object'), invariants = strs(d, 'invariants'), repo = obj(d, 'repository')
  const kindLabel = isRoot ? '聚合（Aggregate）' : isMember ? '聚合内实体' : '实体（Entity）'
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">{isRoot ? '◆' : '▪'} {ix.name(id)}</h2>
      <EditToolbar id={id} />
      <div className="flex gap-2 items-center flex-wrap">
        {app && <Badge color="green"><Ref id={app.id} /></Badge>}
        {isMember && parent && <Badge color="purple"><Ref id={parent.id} /></Badge>}
        <Badge color="gray">{kindLabel}</Badge>
        {be && (<><span className="text-xs text-slate-500">业务实体:</span><Badge color="purple"><Ref id={be.id} /></Badge></>)}
        {roles.length > 0 && (<><span className="text-xs text-slate-500">扮演角色:</span>{roles.map(r => <Badge key={r.id} color="amber"><Ref id={r.id} /></Badge>)}</>)}
      </div>
      <AttrsCard id={id} />
      {isRoot && <Card><h3 className="text-xs font-semibold text-slate-400 uppercase mb-1">聚合根</h3><p className="text-slate-700">{ix.name(id)}（本实体即聚合根）</p></Card>}
      {fieldList(d.fields).length > 0 || typeof d.fields === 'string' ? <Card><H3>字段</H3><FieldsTable fields={d.fields} /></Card> : null}
      {str(d, 'notes') && <Card><H3>备注</H3><p className="text-sm text-slate-600"><MD basePath={base}>{str(d, 'notes')}</MD></p></Card>}
      <AggregateSections members={members} vos={aggVOs} invariants={invariants} repo={repo} base={base} />
      <EdgesCard id={id} />
      <EntityResources id={id} />
      <MetricsOf id={id} />
    </div>
  )
}

function AppPage({ id }: { id: string }) {
  const { ix } = useGraph()
  const d = ix.data(id); const type = str(d, 'type') || 'backend'
  const ucs = ix.childrenOf(id, 'app-use-case'), pages = ix.childrenOf(id, 'page')
  const { grouped, hasPackages } = groupByPackage(ucs)
  const tech = obj(d, 'tech_stack'); const infra = list<Data>(d, 'infrastructure')
  const INFRA_COLORS: Record<string, string> = { database: 'green', cache: 'amber', 'message-queue': 'orange', search: 'blue', monitoring: 'purple', 'file-storage': 'cyan' }
  const renderUc = (u: { id: string; name: string }) => {
    const actor = ix.targets(u.id, 'has-actor')[0]; const api = strs(ix.data(u.id), 'api')
    return (
      <div key={u.id} className="bg-slate-50 rounded p-2 border border-slate-100">
        <div className="flex items-center justify-between"><Ref id={u.id} /><span className="text-xs text-slate-400">{actor && <Ref id={actor.id} />}</span></div>
        {api.length > 0 && <div className="flex flex-wrap gap-1 mt-1">{api.map((p, k) => <code key={k} className="text-xs bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200 font-mono">{p}</code>)}</div>}
      </div>
    )
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3"><h2 className="text-2xl font-bold text-slate-800">{ix.name(id)}</h2><Badge color={APP_TYPE_COLORS[type] || 'gray'}>{type}</Badge></div>
      <EditToolbar id={id} />
      {str(d, 'summary') && <p className="text-slate-600">{str(d, 'summary')}</p>}
      <AttrsCard id={id} />
      <AppDetailDiagram appId={id} />
      {!hasPackages ? (
        <Card><H3>用例 ({ucs.length})</H3><div className="space-y-2">{ucs.map(renderUc)}</div></Card>
      ) : (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-slate-400 uppercase">用例 ({ucs.length})</h3>
          {[...grouped.entries()].map(([pkg, items]) => <PackageCard key={pkg || '__ungrouped__'} pkg={pkg} count={items.length}>{items.map(renderUc)}</PackageCard>)}
        </div>
      )}
      {pages.length > 0 && (
        <Card><H3>页面 ({pages.length})</H3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pages.map(p => (
              <div key={p.id} className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                <div className="font-medium text-blue-800 mb-1"><Ref id={p.id} /></div>
                <div className="flex flex-wrap gap-1">{ix.targets(p.id, 'references').map(uc => <span key={uc.id} className="text-xs bg-white text-blue-600 px-1.5 py-0.5 rounded border border-blue-200"><Ref id={uc.id} /></span>)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
      <AppResources id={id} />
      <AppMetrics id={id} />
      {infra.length > 0 && (
        <Card><H3>基础设施 ({infra.length})</H3>
          <div className="space-y-2">{infra.map((item, j) => (
            <div key={j} className="bg-slate-50 rounded-lg p-3 border border-slate-100">
              <div className="flex items-center gap-2 mb-1"><span className="font-medium text-slate-800 text-sm">{str(item, 'name')}</span><Badge color={INFRA_COLORS[str(item, 'type')] || 'gray'}>{str(item, 'type')}</Badge></div>
              {str(item, 'description') && <p className="text-xs text-slate-500">{str(item, 'description')}</p>}
            </div>))}</div>
        </Card>
      )}
      {tech && (
        <Card><H3>技术栈</H3>
          <div className="flex flex-wrap gap-2">
            {str(tech, 'language') && <span className="text-sm bg-slate-100 text-slate-600 px-2 py-1 rounded">{str(tech, 'language')}</span>}
            {strs(tech, 'frameworks').map((fw, j) => <span key={j} className="text-sm bg-blue-50 text-blue-600 px-2 py-1 rounded">{fw}</span>)}
            {str(tech, 'storage') && <span className="text-sm bg-green-50 text-green-600 px-2 py-1 rounded">{str(tech, 'storage')}</span>}
            {strs(tech, 'middleware').map((mw, j) => <span key={j} className="text-sm bg-purple-50 text-purple-600 px-2 py-1 rounded">{mw}</span>)}
            {str(tech, 'implementation') && <span className="text-sm bg-gray-100 text-gray-600 px-2 py-1 rounded italic">{str(tech, 'implementation')}</span>}
          </div>
        </Card>
      )}
      {/* 追溯链路（原侧边栏子项，现为分区） */}
      {ucs.length > 0 && (
        <>
          <TraceHeader title="追溯链路" sub="子系统用例依赖链路" />
          <Card>
            <div className="flex items-center gap-3 mb-4"><h3 className="font-bold text-slate-800"><Ref id={id} /></h3><Badge color="green">{type}</Badge></div>
            <div className="space-y-3">
              {ucs.map(u => { const actor = ix.targets(u.id, 'has-actor')[0]; const incs = ix.targets(u.id, 'includes')
                return (
                  <div key={u.id}>
                    <div className="flex items-center gap-2 mb-2"><div className="w-2 h-2 rounded-full bg-green-400" /><span className="font-medium text-green-700"><Ref id={u.id} /></span>{actor && <span className="text-xs text-slate-400">(<Ref id={actor.id} />)</span>}</div>
                    {incs.length > 0 && <div className="ml-4 border-l-2 border-green-100 pl-4 space-y-2">{incs.map(t => <AppUCTree key={t.id} entryId={t.id} showRules />)}</div>}
                  </div>
                ) })}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

const MODE_COLORS: Record<string, string> = { read: 'green', write: 'purple', publish: 'orange', subscribe: 'amber' }
const RES_COLORS: Record<string, string> = { api: 'blue', topic: 'orange', queue: 'orange', table: 'green', 'cache-key': 'purple', file: 'gray', bucket: 'gray' }

// 用例页：实现的接口（exposes → api 资源）
function ExposedApis({ id }: { id: string }) {
  const { ix } = useGraph()
  const apis = ix.targets(id, 'exposes')
  if (apis.length === 0) return null
  return (
    <Card><H3>接口 ({apis.length})</H3>
      <div className="space-y-1">{apis.map(r => <div key={r.id} className="flex items-center gap-2 text-sm"><span>🔌</span><Ref id={r.id} /><Badge color="blue">api</Badge>{str(ix.data(r.id), 'spec') && <span className="text-xs text-slate-400 truncate">{str(ix.data(r.id), 'spec').split('\n')[0]}</span>}</div>)}</div>
    </Card>
  )
}

// 用例页：使用的实体（uses → entity，mode read / write）
function UsedEntities({ id }: { id: string }) {
  const { ix } = useGraph()
  const edges = ix.outEdges(id, 'uses').filter(e => ix.kind(e.to) === 'entity')
  if (edges.length === 0) return null
  return (
    <Card><H3>使用的实体 ({edges.length})</H3>
      <div className="space-y-1">{edges.map(e => { const mode = String(e.attrs?.mode ?? ''); const owner = ix.appOf(e.to)
        return (<div key={e.id} className="flex items-center gap-2 text-sm flex-wrap">{mode && <Badge color={MODE_COLORS[mode] || 'gray'}>{mode}</Badge>}<span>▪</span><Ref id={e.to} />{owner && owner.id !== ix.appOf(id)?.id && <Badge color="green"><Ref id={owner.id} /></Badge>}{!owner && <Badge color="purple">业务实体</Badge>}{e.attrs?.note ? <span className="text-xs text-slate-500 italic">{String(e.attrs.note)}</span> : null}</div>) })}</div>
    </Card>
  )
}

// 业务用例 / 系统用例页：涉及的业务实体（uses → entity，mode read / write）
function UsedBusinessEntities({ id }: { id: string }) {
  const { ix } = useGraph()
  const edges = ix.outEdges(id, 'uses').filter(e => ix.kind(e.to) === 'entity')
  if (edges.length === 0) return null
  return (
    <Card><H3>涉及的业务实体 ({edges.length})</H3>
      <div className="space-y-1">{edges.map(e => { const mode = String(e.attrs?.mode ?? '')
        return (<div key={e.id} className="flex items-center gap-2 text-sm flex-wrap">{mode && <Badge color={MODE_COLORS[mode] || 'gray'}>{mode}</Badge>}<span>▪</span><Ref id={e.to} />{str(ix.data(e.to), 'archetype') && <Badge color="gray">{str(ix.data(e.to), 'archetype')}</Badge>}{e.attrs?.note ? <span className="text-xs text-slate-500 italic">{String(e.attrs.note)}</span> : null}</div>) })}</div>
    </Card>
  )
}

const UC_KIND_LABEL: Record<string, string> = { 'business-use-case': '业务用例', 'system-use-case': '系统用例' }

// 实体页：使用的资源（uses → resource）与被哪些用例使用（uses 入边：业务 / 系统 / 应用用例）
function EntityResources({ id }: { id: string }) {
  const { ix, canEdit } = useGraph()
  const edges = canEdit ? [] : ix.outEdges(id, 'uses').filter(e => ix.kind(e.to) === 'resource')
  const users = ix.inEdges(id, 'uses').filter(e => ['app-use-case', 'business-use-case', 'system-use-case'].includes(ix.kind(e.from)))
  return (
    <>
      {edges.length > 0 && (
        <Card><H3>使用的资源 ({edges.length})</H3>
          <div className="space-y-1">{edges.map(e => { const t = str(ix.data(e.to), 'type'); const mode = String(e.attrs?.mode ?? ''); const owner = ix.appOf(e.to)
            return (<div key={e.id} className="flex items-center gap-2 text-sm flex-wrap">{mode && <Badge color={MODE_COLORS[mode] || 'gray'}>{mode}</Badge>}<span>🔌</span><Ref id={e.to} />{t && <Badge color={RES_COLORS[t] || 'gray'}>{t}</Badge>}{owner && owner.id !== ix.appOf(id)?.id && <Badge color="green"><Ref id={owner.id} /></Badge>}{e.attrs?.note ? <span className="text-xs text-slate-500 italic">{String(e.attrs.note)}</span> : null}</div>) })}</div>
        </Card>
      )}
      {users.length > 0 && (
        <Card><H3>被哪些用例使用 ({users.length})</H3>
          <div className="space-y-1">{users.map(e => { const mode = String(e.attrs?.mode ?? ''); const ua = ix.appOf(e.from); const k = ix.kind(e.from)
            return (<div key={e.id} className="flex items-center gap-2 text-sm flex-wrap">{mode && <Badge color={MODE_COLORS[mode] || 'gray'}>{mode}</Badge>}<span>{k === 'business-use-case' ? '🎯' : k === 'system-use-case' ? '◎' : '◦'}</span><Ref id={e.from} />{UC_KIND_LABEL[k] && <Badge color="blue">{UC_KIND_LABEL[k]}</Badge>}{ua && <Badge color="green"><Ref id={ua.id} /></Badge>}</div>) })}</div>
        </Card>
      )}
    </>
  )
}

// 指标页：表达式 / 数据来源 / 度量对象
function MetricPage({ id }: { id: string }) {
  const { ix, baseFor, canEdit } = useGraph()
  const d = ix.data(id); const app = ix.appOf(id)
  const targets = ix.targets(id, 'measures')
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">📈 {ix.name(id)}</h2>
      <EditToolbar id={id} />
      <div className="flex gap-2 items-center flex-wrap">{app ? <Badge color="green"><Ref id={app.id} /></Badge> : <Badge color="purple">业务指标</Badge>}<Badge color="gray">指标</Badge></div>
      {str(d, 'summary') && <p className="text-slate-600">{str(d, 'summary')}</p>}
      <AttrsCard id={id} />
      {str(d, 'expression') && <Card><H3>表达式</H3><pre className="text-sm text-slate-700 whitespace-pre-wrap font-mono bg-slate-50 rounded p-2 border border-slate-100"><MD basePath={baseFor(id)}>{str(d, 'expression')}</MD></pre></Card>}
      {!canEdit && targets.length > 0 && (
        <Card><H3>度量对象 ({targets.length})</H3>
          <div className="space-y-1">{targets.map(t => { const ta = ix.appOf(t.id); return (<div key={t.id} className="flex items-center gap-2 text-sm flex-wrap"><span>{KIND_ICONS[t.kind] ?? '•'}</span><Ref id={t.id} /><Badge color="blue">{KIND_LABELS[t.kind] ?? t.kind}</Badge>{ta && <Badge color="green"><Ref id={ta.id} /></Badge>}</div>) })}</div>
        </Card>
      )}
    </div>
  )
}

// 应用页：本应用的技术指标
function AppMetrics({ id }: { id: string }) {
  const { ix } = useGraph()
  const metrics = ix.childrenOf(id, 'metric')
  if (metrics.length === 0) return null
  return (
    <Card><H3>指标 ({metrics.length})</H3>
      <div className="space-y-1">{metrics.map(m => (<div key={m.id} className="flex items-center gap-2 text-sm"><span>📈</span><Ref id={m.id} /><span className="text-xs text-slate-400">{ix.targets(m.id, 'measures').length} 个度量对象</span></div>))}</div>
    </Card>
  )
}

// 任意节点：扩展属性 ext（自由 map）
function ExtCard({ id }: { id: string }) {
  const { ix } = useGraph()
  const ext = ix.data(id).ext
  if (!ext || typeof ext !== 'object' || Array.isArray(ext) || Object.keys(ext as object).length === 0) return null
  return (
    <Card><H3>扩展属性</H3>
      <table className="text-sm"><tbody>{Object.entries(ext as Record<string, unknown>).map(([k, v]) => <tr key={k} className="border-b border-slate-50"><td className="py-1 pr-4 font-mono text-xs text-slate-500">{k}</td><td className="py-1 text-slate-700">{typeof v === 'string' ? v : JSON.stringify(v)}</td></tr>)}</tbody></table>
    </Card>
  )
}

// 应用页：本应用拥有的资源
function AppResources({ id }: { id: string }) {
  const { ix } = useGraph()
  const resources = ix.childrenOf(id, 'resource')
  if (resources.length === 0) return null
  return (
    <Card><H3>资源 ({resources.length})</H3>
      <div className="space-y-1">
        {resources.map(r => { const t = str(ix.data(r.id), 'type'); const n = t === 'api' ? ix.sources(r.id, 'exposes').length : ix.sources(r.id, 'uses').length
          return (<div key={r.id} className="flex items-center gap-2 text-sm"><span>🔌</span><Ref id={r.id} />{t && <Badge color={RES_COLORS[t] || 'gray'}>{t}</Badge>}<span className="text-xs text-slate-400">{t === 'api' ? `${n} 个用例实现` : `${n} 个实体使用`}</span></div>) })}
      </div>
    </Card>
  )
}

function ResourcePage({ id }: { id: string }) {
  const { ix, baseFor } = useGraph()
  const d = ix.data(id); const app = ix.appOf(id); const t = str(d, 'type')
  const implementers = ix.sources(id, 'exposes')
  const users = ix.inEdges(id, 'uses')
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">🔌 {ix.name(id)}</h2>
      <EditToolbar id={id} />
      <div className="flex gap-2 items-center flex-wrap">{app && <Badge color="green"><Ref id={app.id} /></Badge>}<Badge color="gray">资源</Badge>{t && <Badge color={RES_COLORS[t] || 'gray'}>{t}</Badge>}</div>
      {str(d, 'summary') && <p className="text-slate-600">{str(d, 'summary')}</p>}
      <AttrsCard id={id} />
      {str(d, 'spec') && <Card><H3>规格</H3><div className="text-sm text-slate-700"><MD basePath={baseFor(id)}>{str(d, 'spec')}</MD></div></Card>}
      {implementers.length > 0 && (
        <Card><H3>由哪些用例实现 ({implementers.length})</H3>
          <div className="space-y-1">{implementers.map(u => { const ua = ix.appOf(u.id); return (<div key={u.id} className="flex items-center gap-2 text-sm"><span>◦</span><Ref id={u.id} />{ua && <Badge color="green"><Ref id={ua.id} /></Badge>}</div>) })}</div>
        </Card>
      )}
      {users.length > 0 && (
        <Card><H3>被哪些实体使用 ({users.length})</H3>
          <div className="space-y-1">
            {users.map(e => { const mode = String(e.attrs?.mode ?? ''); const ua = ix.appOf(e.from)
              return (<div key={e.id} className="flex items-center gap-2 text-sm flex-wrap">{mode && <Badge color={MODE_COLORS[mode] || 'gray'}>{mode}</Badge>}<span>▪</span><Ref id={e.from} />{ua && <Badge color="green"><Ref id={ua.id} /></Badge>}{!ua && <Badge color="purple">业务实体</Badge>}{e.attrs?.note ? <span className="text-xs text-slate-500 italic">{String(e.attrs.note)}</span> : null}</div>) })}
          </div>
        </Card>
      )}
    </div>
  )
}

function PagePage({ id }: { id: string }) {
  const { ix, canEdit } = useGraph()
  const d = ix.data(id); const app = ix.appOf(id)
  const relUCs = ix.targets(id, 'references'); const extLinks = list<Data>(d, 'external_links'); const mappings = list<unknown>(d, 'display_mappings')
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">📄 {ix.name(id)}</h2>
      <EditToolbar id={id} />
      <div className="flex gap-2">{app && <Badge color="blue"><Ref id={app.id} /></Badge>}<Badge color="gray">页面</Badge></div>
      {str(d, 'summary') && <p className="text-slate-600">{str(d, 'summary')}</p>}
      <AttrsCard id={id} />
      <EdgesCard id={id} />
      {!canEdit && relUCs.length > 0 && <Card><H3>关联用例</H3><div className="flex flex-wrap gap-2">{relUCs.map(uc => <Badge key={uc.id} color="blue"><Ref id={uc.id} /></Badge>)}</div></Card>}
      {extLinks.length > 0 && (
        <Card><H3>外部链接</H3><div className="space-y-1">{extLinks.map((link, i) => { const label = str(link, 'label') || Object.keys(link)[0]; const url = str(link, 'url') || String(Object.values(link)[0] ?? '')
          return <div key={i} className="text-sm"><span className="text-slate-600">{label}:</span> <span className="text-blue-600 font-mono text-xs">{url}</span></div> })}</div></Card>
      )}
      {mappings.length > 0 && (
        <Card><H3>显示映射</H3><div className="space-y-1">{mappings.map((m, i) => typeof m === 'string'
          ? <div key={i} className="text-sm text-slate-600 bg-slate-50 p-2 rounded">{m}</div>
          : (() => { const e = Object.entries(m as Data)[0]; return e ? <div key={i} className="text-sm text-slate-600 bg-slate-50 p-2 rounded"><span className="font-medium text-slate-700">{e[0]}</span>: {String(e[1])}</div> : null })())}</div></Card>
      )}
    </div>
  )
}

function AucPage({ id }: { id: string }) {
  const { ix, baseFor, canEdit } = useGraph()
  const d = ix.data(id); const base = baseFor(id); const app = ix.appOf(id)
  const actor = ix.targets(id, 'has-actor')[0]; const api = strs(d, 'api')
  const ownRules = ix.rules(id)
  const entityRules = ix.sources(id, 'references').filter(r => r.kind === 'rule' && ix.parent(r.id)?.kind === 'entity')
  const allCount = ownRules.length + entityRules.length
  const sucs = ix.sources(id, 'has-entry')
  const callers = [...ix.inEdges(id, 'includes').map(e => ({ id: e.from, rel: 'Include' })), ...ix.inEdges(id, 'extends').map(e => ({ id: e.from, rel: 'Extend' }))]
  const assocs = [...ix.targets(id, 'includes').map(t => ({ t, rel: 'Include' })), ...ix.targets(id, 'extends').map(t => ({ t, rel: 'Extend' }))]
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">◦ {ix.name(id)}</h2>
      <EditToolbar id={id} />
      <div className="flex gap-2">{app && <Badge color="green"><Ref id={app.id} /></Badge>}<Badge color="gray">子系统用例</Badge></div>
      {str(d, 'summary') && <p className="text-slate-600">{str(d, 'summary')}</p>}
      <AttrsCard id={id} />
      <Card>
        <div><h3 className="text-xs font-semibold text-slate-400 uppercase mb-1">执行者</h3><p className="text-slate-700">{actor ? <Ref id={actor.id} /> : '—'}</p></div>
        {api.length > 0 && <div className="mt-3"><h3 className="text-xs font-semibold text-slate-400 uppercase mb-1">API</h3><div className="flex flex-wrap gap-1.5">{api.map((p, j) => <code key={j} className="text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded border border-emerald-200 font-mono">{p}</code>)}</div></div>}
      </Card>
      {allCount > 0 && (
        <Card><H3>规则 ({allCount})</H3>
          <ul className="space-y-2">
            {ownRules.map(r => <RuleItem key={r.id} ruleId={r.id} base={base} />)}
            {entityRules.map(r => { const ent = ix.parent(r.id)!; const rd = ix.data(r.id)
              return (
                <li key={r.id} className="text-sm text-slate-600">
                  <div className="flex gap-2"><span className="text-purple-400 flex-shrink-0">•</span><div>{str(rd, 'field') && <Badge color="blue">{str(rd, 'field')}</Badge>}{str(rd, 'field') ? ' ' : ''}<MD basePath={baseFor(ent)}>{str(rd, 'content')}</MD></div></div>
                  <div className="flex flex-wrap gap-1 ml-4 mt-1"><span className="text-xs text-slate-400">来自实体:</span><Badge color="purple"><Ref id={ent.id} /></Badge></div>
                </li>
              ) })}
          </ul>
        </Card>
      )}
      <EdgesCard id={id} />
      {!canEdit && assocs.length > 0 && (
        <Card><H3>关联</H3>
          <div className="space-y-2">{assocs.map(({ t, rel }, i) => { const tApp = ix.appOf(t.id); const cross = tApp && tApp.id !== app?.id
            return (
              <div key={i} className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded ${rel === 'Include' ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'}`}>«{rel}»</span>
                {cross && <Badge color="green"><Ref id={tApp.id} /></Badge>}
                <Ref id={t.id} />
              </div>) })}</div>
        </Card>
      )}
      {!canEdit && <ExposedApis id={id} />}
      {!canEdit && <UsedEntities id={id} />}
      {(sucs.length > 0 || callers.length > 0) && (
        <Card><H3>被引用</H3>
          {sucs.map(s => <div key={s.id} className="py-1.5 flex items-center gap-2"><span>◎</span><Ref id={s.id} /><Badge color="blue">系统用例</Badge>{ix.parent(s.id) && <Badge color="gray"><Ref id={ix.parent(s.id)!.id} /></Badge>}</div>)}
          {callers.map((c, i) => <div key={i} className="py-1.5 flex items-center gap-2"><span>◦</span><Ref id={c.id} /><span className="text-xs text-slate-400">«{c.rel}»</span>{ix.appOf(c.id) && <Badge color="green"><Ref id={ix.appOf(c.id)!.id} /></Badge>}</div>)}
        </Card>
      )}
      <MetricsOf id={id} />
    </div>
  )
}

function RolePage({ id }: { id: string }) {
  const { ix, baseFor } = useGraph()
  const d = ix.data(id); const app = ix.appOf(id); const methods = strs(d, 'methods')
  const implementers = ix.sources(id, 'implements')
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">🎭 {ix.name(id)}</h2>
      <EditToolbar id={id} />
      <div className="flex gap-2">{app && <Badge color="green"><Ref id={app.id} /></Badge>}<Badge color="amber">角色 / 接口</Badge></div>
      <AttrsCard id={id} />
      {methods.length > 0 && <Card><H3>方法</H3><ul className="space-y-1">{methods.map((m, j) => <li key={j} className="text-sm font-mono text-slate-700 flex gap-2"><span>•</span>{m}</li>)}</ul></Card>}
      {str(d, 'summary') && <Card><H3>备注</H3><p className="text-sm text-slate-600"><MD basePath={baseFor(id)}>{str(d, 'summary')}</MD></p></Card>}
      {implementers.length > 0 && (
        <Card><H3>本 app 内的实现者 ({implementers.length})</H3>
          <ul className="space-y-1">{implementers.map(it => <li key={it.id} className="text-sm text-slate-700 flex gap-2"><span className="text-xs text-slate-400">{ix.isAggregateRoot(it.id) ? '聚合' : ix.parent(it.id)?.kind === 'entity' ? '聚合内实体' : '实体'}:</span><Ref id={it.id} /></li>)}</ul>
        </Card>
      )}
    </div>
  )
}

function VoPage({ id }: { id: string }) {
  const { ix } = useGraph()
  const d = ix.data(id); const app = ix.appOf(id); const parent = ix.parent(id); const inAgg = parent?.kind === 'entity'
  const roles = rolesOf(ix, id); const be = businessEntityOf(ix, id)
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">◇ {ix.name(id)}</h2>
      <EditToolbar id={id} />
      <div className="flex gap-2 items-center flex-wrap">
        {app && <Badge color="green"><Ref id={app.id} /></Badge>}
        {inAgg && parent && <Badge color="purple"><Ref id={parent.id} /></Badge>}
        <Badge color="gray">{inAgg ? '聚合内值对象' : '值对象（Value Object）'}</Badge>
        {be && (<><span className="text-xs text-slate-500">业务实体:</span><Badge color="purple"><Ref id={be.id} /></Badge></>)}
        {roles.length > 0 && (<><span className="text-xs text-slate-500">扮演角色:</span>{roles.map(r => <Badge key={r.id} color="amber"><Ref id={r.id} /></Badge>)}</>)}
      </div>
      <AttrsCard id={id} />
      {(fieldList(d.fields).length > 0 || typeof d.fields === 'string') && <Card><H3>字段</H3><FieldsTable fields={d.fields} /></Card>}
    </div>
  )
}

function EnumPage({ id }: { id: string }) {
  const { ix } = useGraph()
  const d = ix.data(id); const app = ix.appOf(id); const values = strs(d, 'values')
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">≡ {ix.name(id)}</h2>
      <EditToolbar id={id} />
      <div className="flex gap-2">{app && <Badge color="green"><Ref id={app.id} /></Badge>}<Badge color="gray">枚举（Enum）</Badge></div>
      <AttrsCard id={id} />
      {values.length > 0 && <Card><H3>取值</H3><div className="flex flex-wrap gap-2">{values.map((v, j) => <span key={j} className="px-3 py-1 bg-cyan-50 rounded-full text-sm font-medium border border-cyan-200 text-cyan-800">{v}</span>)}</div></Card>}
      {str(d, 'summary') && <Card><H3>备注</H3><p className="text-sm text-slate-600">{str(d, 'summary')}</p></Card>}
    </div>
  )
}

function SvcPage({ id }: { id: string }) {
  const { ix, baseFor } = useGraph()
  const d = ix.data(id); const app = ix.appOf(id); const ops = strs(d, 'operations')
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">⚙ {ix.name(id)}</h2>
      <EditToolbar id={id} />
      <div className="flex gap-2">{app && <Badge color="green"><Ref id={app.id} /></Badge>}<Badge color="gray">领域服务（Domain Service）</Badge></div>
      <AttrsCard id={id} />
      {ops.length > 0 && <Card><H3>操作</H3><ul className="space-y-1">{ops.map((op, j) => <li key={j} className="text-sm font-mono text-slate-700 flex gap-2"><span>•</span>{op}</li>)}</ul></Card>}
      {str(d, 'summary') && <Card><H3>备注</H3><p className="text-sm text-slate-600"><MD basePath={baseFor(id)}>{str(d, 'summary')}</MD></p></Card>}
    </div>
  )
}

function EvtPage({ id }: { id: string }) {
  const { ix } = useGraph()
  const d = ix.data(id); const app = ix.appOf(id)
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">⚡ {ix.name(id)}</h2>
      <EditToolbar id={id} />
      <div className="flex gap-2">{app && <Badge color="green"><Ref id={app.id} /></Badge>}<Badge color="gray">领域事件（Domain Event）</Badge></div>
      <AttrsCard id={id} />
      {str(d, 'published_when') && <Card><h3 className="text-xs font-semibold text-slate-400 uppercase mb-1">何时发布</h3><p className="text-sm text-slate-700">{str(d, 'published_when')}</p></Card>}
      {(fieldList(d.payload).length > 0 || typeof d.payload === 'string') && <Card><H3>载荷</H3><FieldsTable fields={d.payload} /></Card>}
    </div>
  )
}

function RulePage({ id }: { id: string }) {
  const { ix, baseFor } = useGraph()
  const owner = ix.parent(id)
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-800">§ 规则 {id}</h2>
      <EditToolbar id={id} />
      {owner && <div className="flex gap-2"><span className="text-xs text-slate-500">所属:</span><Badge color="gray"><Ref id={owner.id} /></Badge></div>}
      <AttrsCard id={id} />
      <Card><ul className="space-y-2"><RuleItem ruleId={id} base={baseFor(id)} /></ul></Card>
      <GroupRef id={owner?.id ?? 'business'} className="text-sm text-blue-600 hover:underline">→ 查看所属节点</GroupRef>
    </div>
  )
}

export { DDD_RELS }
