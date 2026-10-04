import { describe, it, expect, beforeAll } from 'vitest'
import { resolve } from 'node:path'
import { loadGraph, nodeReader, resolveRef, buildTree, validateModel, type Graph } from '../src/index.ts'

const MODEL = resolve(__dirname, '../../../methodology/examples/food-delivery/model')

describe('loadGraph (7.0)', () => {
  let g: Graph
  beforeAll(async () => { g = await loadGraph(MODEL, nodeReader(MODEL), { onWarn: () => {} }) })

  it('reads schema version and sequences from index.yaml', () => {
    expect(g.schemaVersion).toBe('7.0')
    expect(g.index.sequences.app).toBeGreaterThanOrEqual(4)
  })

  it('every index entry becomes a node with view / parent / package', () => {
    const app = g.nodes.find(n => n.kind === 'application' && n.name === 'order-service')!
    expect(app.view).toBe('applications')
    const ucs = g.nodes.filter(n => n.kind === 'app-use-case' && n.parent === app.id)
    expect(ucs.length).toBeGreaterThan(5)
    expect(ucs.some(u => u.package === 'AfterSale')).toBe(true)
    const biz = g.nodes.filter(n => n.kind === 'entity' && !n.parent)
    expect(biz.map(b => b.name)).toContain('Customer')
  })

  it('merges detail entries and records the file', () => {
    const acc = g.nodes.find(n => n.kind === 'entity' && n.name === 'Customer' && !n.parent)!
    expect(acc.file).toBe('business/entities.yaml')
    expect(Array.isArray(g.nodesData[acc.id].fields)).toBe(true)
  })

  it('emits containment edges from nesting and inline rules', () => {
    const app = g.nodes.find(n => n.kind === 'application' && n.name === 'order-service')!
    expect(g.edges.some(e => e.from === app.id && e.rel === 'has-uc')).toBe(true)
    const rule = g.nodes.find(n => n.kind === 'rule')!
    expect(rule.parent).toBeDefined()
    expect(g.edges.some(e => e.rel === 'has-rule' && e.to === rule.id)).toBe(true)
  })

  it('emits explicit edges by id (has-actor, includes, references)', () => {
    expect(g.edges.some(e => e.rel === 'has-actor')).toBe(true)
    expect(g.edges.some(e => e.rel === 'includes')).toBe(true)
    expect(g.edges.some(e => e.rel === 'references')).toBe(true)
    for (const e of g.edges) expect(g.nodes.some(n => n.id === e.to)).toBe(true)
  })

  it('resolves refs by id, kind:name, and reports ambiguity', () => {
    const acc = resolveRef(g, 'entity:Customer')
    expect(acc.id).toMatch(/^ent-\d+$/)
    expect(resolveRef(g, acc.id).id).toBe(acc.id)
    // Order exists both business-scoped and app-scoped → ambiguous
    expect(() => resolveRef(g, 'entity:Order')).toThrow(/ambiguous/)
    expect(() => resolveRef(g, 'entity:Nope')).toThrow(/not found/)
  })

  it('builds the studio sidebar tree (original structure, index content)', () => {
    const tree = buildTree(g)
    expect(tree.map(t => t.id)).toEqual(['business', 'applications'])
    expect(tree[0].children!.map(c => c.id)).toEqual(['org-relations', 'business-ucs', 'business-model'])
    const org = tree[0].children![0].children![0]
    expect(org.icon).toBe('🏢')
    const apps = tree[1].children!
    const ms = apps.find(a => a.label === 'order-service')!
    expect(ms.children!.map(c => c.id)).toEqual([`app-domain:${ms.id}`, `app-ucs:${ms.id}`, `app-resources:${ms.id}`])
    const ucGroup = ms.children!.find(c => c.id.startsWith('app-ucs:'))!
    expect(ucGroup.children!.some(c => c.id.startsWith('pkg:'))).toBe(true)
  })

  it('validates the sample model clean', async () => {
    const { findings } = await validateModel(MODEL)
    expect(findings.filter(f => f.severity === 'error')).toEqual([])
  })
})
