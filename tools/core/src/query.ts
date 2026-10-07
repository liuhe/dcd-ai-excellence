// Sidebar tree + name lookup over a Graph.
//
// The tree STRUCTURE follows studio's original design (business view: 组织关系 / 业务用例 /
// 业务模型; applications view: per app → 领域模型 / 页面 / 用例); the CONTENT comes from
// index.yaml (ids, order, packages, aggregate nesting). Tree ids double as studio routes:
//   view / group ids: 'business', 'org-relations', 'workers', 'business-ucs', 'business-model',
//                     'business-metrics', 'applications', 'app-domain:<appId>', 'app-pages:<appId>', 'app-ucs:<appId>',
//                     'app-resources:<appId>', 'app-metrics:<appId>', 'solutions', 'deployment', 'data-sources', 'observability-stores'
//   package folders:  'pkg:<scope>:<path>'
//   nodes:            the node id

import type { Graph, GNode, TreeNode, IndexEntry } from './types.ts'
import { NODE_KINDS } from './vocabulary.ts'

const PARTY_ICON = (type: unknown) => (type === 'system' || type === '系统' ? '🖥️' : '👥')
const PARTICIPANT_ICON = (type: unknown) =>
  type === 'person' || type === '人' ? '👤' : type === 'device' || type === '设备' ? '📱' : '🖥️'

export function buildTree(g: Graph): TreeNode[] {
  const data = (id: string) => g.nodesData[id] ?? {}
  const roots = (kind: string): IndexEntry[] => g.index.business.filter(e => e.kind === kind)
  const kids = (e: IndexEntry, kind: string): IndexEntry[] => e.children.filter(c => c.kind === kind)

  // ---- 业务视图 ----
  const orgs = roots('organization')
  const orgName = orgs[0]?.name ?? ''
  const workers = roots('business-worker')
  const systems = roots('system')
  const parties = roots('external-party')
  const bucs = roots('business-use-case')
  const entities = roots('entity')

  const orgChildren: TreeNode[] = []
  if (workers.length > 0) {
    orgChildren.push({ id: 'workers', label: '业务工人', icon: '🧑‍💼', children: workers.map(w => ({ id: w.id, label: w.name, icon: '•' })) })
  }
  for (const s of systems) {
    const sucs = kids(s, 'system-use-case')
    orgChildren.push({
      id: s.id, label: s.name, icon: '⚙️',
      children: packageTree(s.id, sucs, e => ({ id: e.id, label: e.name, icon: '◎' })),
    })
  }
  const orgNode: TreeNode = { id: orgs[0]?.id ?? 'org', label: orgName, icon: '🏢', children: orgChildren }

  const partyNodes: TreeNode[] = parties.map(p => {
    const type = data(p.id).type
    const isSystem = type === 'system' || type === '系统'
    return {
      id: p.id, label: p.name, icon: PARTY_ICON(type), tag: isSystem ? '系统' : undefined,
      children: kids(p, 'participant').map(pt => ({ id: pt.id, label: pt.name, icon: PARTICIPANT_ICON(data(pt.id).type) })),
    }
  })

  const entityNode = (e: IndexEntry): TreeNode => {
    const members = kids(e, 'entity')
    const node: TreeNode = { id: e.id, label: e.name, icon: '▪', tag: data(e.id).state_machine ? '有状态机' : undefined }
    if (members.length) node.children = members.map(entityNode)
    return node
  }

  const business: TreeNode = {
    id: 'business', label: '业务视图', icon: '🏢', children: [
      { id: 'org-relations', label: '组织关系', icon: '🔲', children: [orgNode, ...partyNodes] },
      { id: 'business-ucs', label: '业务用例', icon: '🎯', children: packageTree('business-ucs', bucs, b => ({ id: b.id, label: b.name, icon: '•' })) },
      { id: 'business-model', label: '业务模型', icon: '📊', children: entities.map(entityNode) },
      ...(roots('metric').length ? [{ id: 'business-metrics', label: '指标', icon: '📈', children: roots('metric').map(m => ({ id: m.id, label: m.name, icon: '📈' })) }] : []),
    ],
  }

  // ---- 应用视图 ----
  const apps = g.index.applications.filter(e => e.kind === 'application')
  const solutions = g.index.applications.filter(e => e.kind === 'solution')
  const solutionGroup: TreeNode[] = solutions.length ? [{ id: 'solutions', label: '方案', icon: '🧩', children: solutions.map(t => ({ id: t.id, label: t.name, icon: '🧩' })) }] : []
  const applications: TreeNode = {
    id: 'applications', label: '应用视图', icon: '🏗️', children: [...solutionGroup, ...packageTree('applications', apps, app => {
      const ucs = kids(app, 'app-use-case')
      const pages = kids(app, 'page')
      const resources = kids(app, 'resource')
      const metrics = kids(app, 'metric')
      const roles = kids(app, 'role')
      const ents = kids(app, 'entity')
      const vos = kids(app, 'value-object')
      const enums = kids(app, 'enum')
      const svcs = kids(app, 'domain-service')
      const evts = kids(app, 'domain-event')
      const isAgg = (e: IndexEntry) => e.children.length > 0 || (Array.isArray(data(e.id).invariants) && (data(e.id).invariants as unknown[]).length > 0)
      const plain = ents.filter(e => !isAgg(e))
      const aggs = ents.filter(isAgg)
      const domainChildren: TreeNode[] = [
        ...roles.map(r => ({ id: r.id, label: r.name, icon: '🎭' })),
        ...plain.map(e => ({ id: e.id, label: e.name, icon: '▪' })),
        ...aggs.map(a => ({
          id: a.id, label: a.name, icon: '◆',
          children: [
            ...kids(a, 'entity').map(m => ({ id: m.id, label: m.name, icon: '▪' })),
            ...kids(a, 'value-object').map(v => ({ id: v.id, label: v.name, icon: '◇' })),
          ],
        })),
        ...vos.map(v => ({ id: v.id, label: v.name, icon: '◇' })),
        ...enums.map(e => ({ id: e.id, label: e.name, icon: '≡' })),
        ...svcs.map(s => ({ id: s.id, label: s.name, icon: '⚙' })),
        ...evts.map(e => ({ id: e.id, label: e.name, icon: '⚡' })),
      ]
      const children: TreeNode[] = []
      if (domainChildren.length) children.push({ id: `app-domain:${app.id}`, label: '领域模型', icon: '🧱', children: domainChildren })
      if (pages.length) children.push({ id: `app-pages:${app.id}`, label: '页面', icon: '🗂', children: pages.map(p => ({ id: p.id, label: p.name, icon: '📄' })) })
      if (ucs.length) children.push({ id: `app-ucs:${app.id}`, label: '用例', icon: '🗂', children: packageTree(`app-ucs:${app.id}`, ucs, u => ({ id: u.id, label: u.name, icon: '◦' })) })
      if (resources.length) children.push({ id: `app-resources:${app.id}`, label: '资源', icon: '🔌', children: packageTree(`app-resources:${app.id}`, resources, r => ({ id: r.id, label: r.name, icon: '🔌', tag: (data(r.id).type as string | undefined) ?? undefined })) })
      if (metrics.length) children.push({ id: `app-metrics:${app.id}`, label: '指标', icon: '📈', children: metrics.map(m => ({ id: m.id, label: m.name, icon: '📈' })) })
      return { id: app.id, label: app.name, icon: '▸', tag: (data(app.id).type as string | undefined) ?? undefined, children }
    })],
  }

  // ---- 部署视图（只在有部署节点时出现，保持无部署节点的模型侧边栏原样）----
  const dsRoots = g.index.deployment.filter(e => e.kind === 'data-source')
  const obsRoots = g.index.deployment.filter(e => e.kind === 'observability-store')
  if (dsRoots.length === 0 && obsRoots.length === 0) return [business, applications]
  const typed = (icon: string) => (d: IndexEntry): TreeNode => ({ id: d.id, label: d.name, icon, tag: (data(d.id).type as string | undefined) ?? undefined })
  const deployment: TreeNode = {
    id: 'deployment', label: '部署视图', icon: '🖧', children: [
      ...(dsRoots.length ? [{ id: 'data-sources', label: '数据源', icon: '🗄', children: dsRoots.map(typed('🗄')) }] : []),
      ...(obsRoots.length ? [{ id: 'observability-stores', label: '可观测性存储', icon: '📡', children: obsRoots.map(typed('📡')) }] : []),
    ],
  }
  return [business, applications, deployment]
}

// Entries → tree nodes, folding package paths into 📦 folders (multi-level).
function packageTree(scope: string, entries: IndexEntry[], leaf: (e: IndexEntry) => TreeNode): TreeNode[] {
  const out: TreeNode[] = []
  const folders = new Map<string, TreeNode>()
  for (const e of entries) {
    const node = leaf(e)
    if (!e.package) { out.push(node); continue }
    let list = out
    let path = ''
    for (const part of e.package.split('/')) {
      path = path ? `${path}/${part}` : part
      let folder = folders.get(path)
      if (!folder) {
        folder = { id: `pkg:${scope}:${path}`, label: part, icon: '📦', children: [] }
        folders.set(path, folder)
        list.push(folder)
      }
      list = folder.children!
    }
    list.push(node)
  }
  return out
}

// Find a node id by display name (first match in kind declaration order). Accepts
// "<kind>:<name>" to narrow. Returns null if nothing matches.
export function resolveNameToId(name: string, g: Graph): string | null {
  const colon = name.indexOf(':')
  let kind: string | undefined
  let key = name
  if (colon > 0 && name.slice(0, colon) in NODE_KINDS) { kind = name.slice(0, colon); key = name.slice(colon + 1) }
  if (g.nodes.some(n => n.id === key)) return key
  for (const k of Object.keys(NODE_KINDS)) {
    if (kind && k !== kind) continue
    const hit = g.nodes.find(n => n.kind === k && n.name === key)
    if (hit) return hit.id
  }
  return null
}

export function nodesOfKind(g: Graph, kind: string): GNode[] {
  return g.nodes.filter(n => n.kind === kind)
}
