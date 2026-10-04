import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, cp, rm, readFile, writeFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  addNode, updateNode, removeNode, connect, disconnect, updateEdge, moveNode,
  loadGraph, nodeReader, resolveRef, validateModel, scaffoldModel, parseSetKvs, type Graph,
} from '../src/index.ts'

const SRC = resolve(__dirname, '../../../methodology/examples/food-delivery/model')
let root: string
const load = (): Promise<Graph> => loadGraph(root, nodeReader(root), { onWarn: () => {} })

beforeAll(async () => {
  root = join(await mkdtemp(join(tmpdir(), 'dcddp-v7-')), 'model')
  await cp(SRC, root, { recursive: true })
})
afterAll(async () => { await rm(resolve(root, '..'), { recursive: true, force: true }) })

describe('add-node', () => {
  it('allocates ids from sequences and places root kinds in the view', async () => {
    const r = await addNode(root, 'business-worker', { name: 'Support' })
    expect(r.id).toMatch(/^bw-\d{3}$/)
    const g = await load()
    const n = resolveRef(g, r.id)
    expect(n.view).toBe('business'); expect(n.parent).toBeUndefined(); expect(n.file).toBe('business/actors.yaml')
  })
  it('requires --parent for nested kinds and validates the parent kind', async () => {
    await expect(addNode(root, 'app-use-case', { name: 'X' })).rejects.toThrow(/parent/)
    await expect(addNode(root, 'app-use-case', { name: 'X', parent: 'business-worker:OpsManager' })).rejects.toThrow(/cannot be placed/)
  })
  it('creates app-scoped entries in the application directory with packages', async () => {
    const r = await addNode(root, 'app-use-case', { name: 'Ping', parent: 'application:payment-gateway', package: 'Ops/Health', attrs: parseSetKvs(['summary=liveness', 'api=["GET /ping"]']) })
    expect(r.file).toMatch(/applications\/app-\d+-payment-gateway\/use-cases\.yaml$/)
    const g = await load()
    const n = resolveRef(g, r.id)
    expect(n.package).toBe('Ops/Health')
    expect(g.nodesData[n.id].api).toEqual(['GET /ping'])
  })
  it('nests entities under an aggregate root and VOs under an app', async () => {
    const s = await addNode(root, 'entity', { name: 'Session', parent: 'application:order-service', attrs: { fields: [{ id: 'Long, pk' }] } })
    const m = await addNode(root, 'entity', { name: 'SessionLog', parent: s.id })
    const vo = await addNode(root, 'value-object', { name: 'Coupon', parent: 'application:order-service' })
    const g = await load()
    expect(resolveRef(g, m.id).parent).toBe(s.id)
    expect(g.edges.some(e => e.rel === 'aggregates' && e.from === s.id && e.to === m.id)).toBe(true)
    expect(resolveRef(g, vo.id).file).toMatch(/domain\.yaml$/)
  })
  it('adds inline rules inside the owner entry', async () => {
    const r = await addNode(root, 'rule', { name: '', parent: 'app-use-case:Ping', attrs: { content: 'fast' } })
    const g = await load()
    const rule = resolveRef(g, r.id)
    expect(rule.parent).toBe(resolveRef(g, 'app-use-case:Ping').id)
    expect(g.index.sequences.rule).toBeGreaterThan(0)
    const owner = g.nodesData[rule.parent!]
    expect((owner.rules as Array<{ id: string }>).some(x => x.id === r.id)).toBe(true)
  })
  it('enforces singleton', async () => {
    await expect(addNode(root, 'organization', { name: 'Another' })).rejects.toThrow(/singleton/)
  })
})

describe('update-node / move', () => {
  it('renames in index + entry, and renames the application directory', async () => {
    await updateNode(root, 'application:payment-gateway', { name: 'pay-gateway' }, [])
    const g = await load()
    const app = resolveRef(g, 'application:pay-gateway')
    expect((await readdir(join(root, 'applications'))).some(d => d.startsWith(`${app.id}-pay-gateway`))).toBe(true)
    expect(g.nodesData[app.id].name).toBe('pay-gateway')
  })
  it('moves between packages and prunes empty wrappers', async () => {
    await updateNode(root, 'app-use-case:Ping', { package: 'Ops' }, [])
    const text = await readFile(join(root, 'index.yaml'), 'utf-8')
    expect(text).not.toMatch(/package: Health/)
    const g = await load()
    expect(resolveRef(g, 'app-use-case:Ping').package).toBe('Ops')
  })
  it('re-parents via moveNode', async () => {
    const g0 = await load()
    const log = resolveRef(g0, 'entity:SessionLog')
    await moveNode(root, log.id, { parent: 'application:order-service' })
    const g = await load()
    expect(resolveRef(g, log.id).parent).toBe(resolveRef(g, 'application:order-service').id)
  })
  it('sets and unsets plain attrs', async () => {
    const r = await updateNode(root, 'app-use-case:Ping', { summary: 'x' }, ['api'])
    expect(r.changed).toBe(2)
    const g = await load()
    expect(g.nodesData[resolveRef(g, 'app-use-case:Ping').id].api).toBeUndefined()
  })
})

describe('edges', () => {
  it('connect / update-edge / disconnect through storage shapes', async () => {
    const g0 = await load()
    const session = resolveRef(g0, 'entity:Session')
    const account = g0.nodes.find(n => n.kind === 'entity' && n.name === 'Customer' && !n.parent)!
    await connect(root, session.id, 'realizes', account.id, { note: 'projection' })
    await expect(connect(root, session.id, 'realizes', account.id)).rejects.toThrow(/already exists/)
    await updateEdge(root, session.id, 'realizes', account.id, { note: 'app projection' }, [])
    let g = await load()
    const e = g.edges.find(x => x.rel === 'realizes' && x.from === session.id)!
    expect(e.to).toBe(account.id); expect(e.attrs?.note).toBe('app projection')
    const act = resolveRef(g, 'business-use-case:OperateMarketplace')
    const oldActor = g.nodesData[act.id].actor as string
    await disconnect(root, act.id, 'has-actor', oldActor)
    await connect(root, act.id, 'has-actor', 'business-worker:Support')
    await expect(connect(root, act.id, 'has-actor', 'business-worker:OpsManager')).rejects.toThrow(/already set/)
    await disconnect(root, session.id, 'realizes', account.id)
    g = await load()
    expect(g.edges.some(x => x.rel === 'realizes' && x.from === session.id)).toBe(false)
  })
  it('refuses containment and derived rels', async () => {
    await expect(connect(root, 'application:order-service', 'has-uc', 'app-use-case:Ping')).rejects.toThrow(/containment/)
    const g = await load()
    const vo = resolveRef(g, 'value-object:Coupon')
    await expect(connect(root, 'entity:Session', 'uses', vo.id)).rejects.toThrow(/derived/)
  })
})

describe('resources', () => {
  it('use case exposes an api; use case uses entity; entity uses topic / table with modes', async () => {
    const g0 = await load()
    const app = resolveRef(g0, 'application:order-service')
    const uc = g0.nodes.find(n => n.kind === 'app-use-case' && n.name === 'ExecuteRefund' && n.parent === app.id)!
    const ent = g0.nodes.find(n => n.kind === 'entity' && n.name === 'RefundRequest' && n.parent === app.id)!
    const api = await addNode(root, 'resource', { name: 'POST /api/x', parent: app.id, attrs: { type: 'api' } })
    const topic = await addNode(root, 'resource', { name: 'x.events', parent: app.id, attrs: { type: 'topic' } })
    expect(api.id).toMatch(/^res-\d{3}$/)
    await connect(root, uc.id, 'exposes', api.id)
    await connect(root, uc.id, 'uses', ent.id, { mode: 'write' })
    await connect(root, ent.id, 'uses', topic.id, { mode: 'publish' })
    const g = await load()
    expect(g.edges.some(x => x.rel === 'exposes' && x.from === uc.id && x.to === api.id)).toBe(true)
    expect(g.edges.find(x => x.rel === 'uses' && x.from === uc.id && x.to === ent.id)?.attrs?.mode).toBe('write')
    expect(g.edges.find(x => x.rel === 'uses' && x.from === ent.id && x.to === topic.id)?.attrs?.mode).toBe('publish')
    // mode / type mismatches are flagged
    await updateEdge(root, ent.id, 'uses', topic.id, { mode: 'write' }, [])
    const { findings } = await validateModel(root)
    expect(findings.some(f => f.code === 'attr-value' && f.nodeId === ent.id)).toBe(true)
    await updateEdge(root, ent.id, 'uses', topic.id, { mode: 'publish' }, [])
  })
})

describe('metrics and extension attributes', () => {
  it('business and app metrics measure use cases / entities; ext map is kept verbatim', async () => {
    const g0 = await load()
    const buc = resolveRef(g0, 'business-use-case:OperateMarketplace')
    const bizOrder = g0.nodes.find(n => n.kind === 'entity' && n.name === 'Order' && !n.parent)!
    const kpi = await addNode(root, 'metric', { name: 'TestKPI', attrs: { expression: 'paid / created', ext: { owner: 'ops', data_source: 'ClickHouse' } } })
    expect(kpi.id).toMatch(/^met-\d{3}$/); expect(kpi.file).toBe(join(root, 'business', 'metrics.yaml'))
    const tech = await addNode(root, 'metric', { name: 'TestLatency', parent: 'application:order-service', attrs: { expression: 'histogram_quantile(0.99, …)' } })
    expect(tech.file).toMatch(/applications\/app-\d+-order-service\/metrics\.yaml$/)
    await connect(root, kpi.id, 'measures', buc.id)
    await connect(root, kpi.id, 'measures', bizOrder.id)
    await connect(root, tech.id, 'measures', 'app-use-case:CreateOrder')
    const g = await load()
    expect(g.edges.filter(e => e.rel === 'measures' && e.from === kpi.id).map(e => e.to).sort()).toEqual([buc.id, bizOrder.id].sort())
    expect(g.nodesData[kpi.id].ext).toEqual({ owner: 'ops', data_source: 'ClickHouse' })
    await updateNode(root, kpi.id, { 'ext.team': 'trade' }, [])
    expect((await load()).nodesData[kpi.id].ext).toEqual({ owner: 'ops', data_source: 'ClickHouse', team: 'trade' })
    await updateNode(root, kpi.id, { ext: 'oops' }, [])
    expect((await validateModel(root)).findings.some(f => f.code === 'attr-shape' && f.nodeId === kpi.id)).toBe(true)
    await removeNode(root, kpi.id); await removeNode(root, tech.id)
  })
})

describe('business-layer entity usage', () => {
  it('business and system use cases use business entities; an application entity target is flagged', async () => {
    const g0 = await load()
    const buc = resolveRef(g0, 'business-use-case:OperateMarketplace')
    const suc = resolveRef(g0, 'system-use-case:MonitorOrders')
    const bizCustomer = g0.nodes.find(n => n.kind === 'entity' && n.name === 'Customer' && !n.parent)!
    const appOrder = g0.nodes.find(n => n.kind === 'entity' && n.name === 'Order' && n.parent)!
    await connect(root, buc.id, 'uses', bizCustomer.id, { mode: 'read' })
    await connect(root, suc.id, 'uses', bizCustomer.id, { mode: 'read' })
    await connect(root, suc.id, 'uses', appOrder.id, { mode: 'read' })
    const g = await load()
    expect(g.edges.find(e => e.rel === 'uses' && e.from === buc.id && e.to === bizCustomer.id)?.attrs?.mode).toBe('read')
    expect(Array.isArray(g.nodesData[buc.id].entities)).toBe(true)
    const { findings } = await validateModel(root)
    expect(findings.some(f => f.code === 'layer' && f.nodeId === suc.id)).toBe(true)
    await disconnect(root, suc.id, 'uses', appOrder.id)
    await disconnect(root, suc.id, 'uses', bizCustomer.id)
    await disconnect(root, buc.id, 'uses', bizCustomer.id)
  })
})

describe('remove-node', () => {
  it('cascades through the subtree and cleans references', async () => {
    const g0 = await load()
    const ping = resolveRef(g0, 'app-use-case:Ping')
    const bca = g0.nodes.find(n => n.kind === 'app-use-case' && n.name === 'UpdateMenu')!
    await connect(root, bca.id, 'includes', ping.id)
    const r = await removeNode(root, ping.id)
    expect(r.removedIds.length).toBe(2) // ping + its rule
    const g = await load()
    expect(g.nodes.some(n => n.id === ping.id)).toBe(false)
    expect((g.nodesData[bca.id].includes as string[] | undefined) ?? []).not.toContain(ping.id)
    expect(g.warnings.filter(w => w.code === 'dangling-ref')).toEqual([])
  })
  it('removes an application with its directory', async () => {
    const g0 = await load()
    const app = resolveRef(g0, 'application:pay-gateway')
    await removeNode(root, app.id)
    expect((await readdir(join(root, 'applications'))).some(d => d.startsWith(app.id))).toBe(false)
  })
})

describe('validate', () => {
  it('flags orphan entries and bad field shapes', async () => {
    await writeFile(join(root, 'business', 'extra.yaml'), 'entity:\n  - id: ent-999\n    name: Ghost\n', 'utf-8')
    const { findings } = await validateModel(root)
    expect(findings.some(f => f.code === 'orphan-entry' && f.message.includes('ent-999'))).toBe(true)
    await rm(join(root, 'business', 'extra.yaml'))
    const g = await load()
    const acc = g.nodes.find(n => n.kind === 'entity' && n.name === 'Customer' && !n.parent)!
    await updateNode(root, acc.id, { fields: 'just text' }, [])
    const r2 = await validateModel(root)
    expect(r2.findings.some(f => f.code === 'attr-shape' && f.nodeId === acc.id)).toBe(true)
  })
})

describe('scaffold', () => {
  it('creates an empty 7.0 model with an organization', async () => {
    const dir = join(await mkdtemp(join(tmpdir(), 'dcddp-new-')), 'm')
    await scaffoldModel(dir, 'Acme')
    const g = await loadGraph(dir, nodeReader(dir))
    expect(g.nodes.map(n => n.kind)).toEqual(['organization'])
    expect(g.schemaVersion).toBe('7.0')
    await rm(resolve(dir, '..'), { recursive: true, force: true })
  })
})
