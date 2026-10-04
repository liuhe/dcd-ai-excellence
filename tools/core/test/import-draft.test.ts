import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, cp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { importDraft, loadGraph, nodeReader, resolveRef, type Graph } from '../src/index.ts'

const SRC = resolve(__dirname, '../../../methodology/examples/chargable-proxy/model')
let root: string
const load = (): Promise<Graph> => loadGraph(root, nodeReader(root), { onWarn: () => {} })

beforeAll(async () => {
  root = join(await mkdtemp(join(tmpdir(), 'dcddp-import-')), 'model')
  await cp(SRC, root, { recursive: true })
})
afterAll(async () => { await rm(resolve(root, '..'), { recursive: true, force: true }) })

const DRAFT = `
business-worker:
  - name: Auditor
system:
  - name: audit-system
    system-use-case:
      - name: RunAudit
        has-actor: Auditor
business-use-case:
  - name: AuditSales
    summary: monthly audit
    has-actor: Auditor
    uses: [system-use-case:RunAudit]
application:
  - name: audit-service
    type: backend
    resource:
      - name: audit_log
        type: table
    entity:
      - name: AuditEntry
        fields:
          - id: "Long, audit entry id"
        uses: [{ target: audit_log, mode: write }]
        entity:
          - name: AuditLine
    app-use-case:
      - name: RecordAudit
        package: Audit
        actor: business-worker:Auditor
        uses: [{ target: AuditEntry, mode: write }]
        includes: [AutoFulfillOrder]
        rule:
          - content: one entry per sale
`

describe('import-draft', () => {
  it('dry-run reports the plan without writing', async () => {
    const before = await readFile(join(root, 'index.yaml'), 'utf8')
    const r = await importDraft(root, DRAFT, { dryRun: true })
    expect(r.errors).toEqual([])
    expect(r.created.map(c => c.kind)).toEqual(['business-worker', 'system', 'system-use-case', 'business-use-case', 'application', 'resource', 'entity', 'entity', 'app-use-case', 'rule'])
    expect(r.edges.length).toBe(7)
    expect(await readFile(join(root, 'index.yaml'), 'utf8')).toBe(before)
  })
  it('aborts on unresolved or ambiguous refs before writing', async () => {
    const before = await readFile(join(root, 'index.yaml'), 'utf8')
    const r = await importDraft(root, 'business-use-case:\n  - name: X\n    has-actor: Nobody\napp-use-case:\n  - name: Y\n    includes: [CreatePackages]\n')
    expect(r.errors.some(e => /cannot resolve "Nobody"/.test(e))).toBe(true)
    expect(r.errors.some(e => /"CreatePackages" is ambiguous/.test(e))).toBe(true)
    expect(r.errors.some(e => /app-use-case cannot be a top-level entry/.test(e))).toBe(true)
    expect(await readFile(join(root, 'index.yaml'), 'utf8')).toBe(before)
  })
  it('creates nodes with allocated ids, nests children, resolves draft and model refs, connects edges', async () => {
    const r = await importDraft(root, DRAFT)
    expect(r.errors).toEqual([])
    expect(r.created.find(c => c.name === 'RecordAudit')!.id).toMatch(/^auc-\d{3}$/)
    expect(r.skippedEdges).toEqual([])
    expect(r.findings.filter(f => f.severity === 'error')).toEqual([])
    const g = await load()
    const uc = resolveRef(g, 'app-use-case:RecordAudit'); const app = resolveRef(g, 'application:audit-service')
    const entry = resolveRef(g, 'entity:AuditEntry'); const line = resolveRef(g, 'entity:AuditLine')
    expect(uc.parent).toBe(app.id); expect(uc.package).toBe('Audit'); expect(line.parent).toBe(entry.id)
    expect(g.edges.some(e => e.rel === 'has-actor' && e.from === uc.id && e.to === resolveRef(g, 'business-worker:Auditor').id)).toBe(true)
    expect(g.edges.find(e => e.rel === 'uses' && e.from === uc.id && e.to === entry.id)?.attrs?.mode).toBe('write')
    expect(g.edges.find(e => e.rel === 'uses' && e.from === entry.id && e.to === resolveRef(g, 'resource:audit_log').id)?.attrs?.mode).toBe('write')
    expect(g.edges.some(e => e.rel === 'includes' && e.from === uc.id && e.to === resolveRef(g, 'app-use-case:AutoFulfillOrder').id)).toBe(true)
    expect(g.edges.some(e => e.rel === 'uses' && e.from === resolveRef(g, 'business-use-case:AuditSales').id && e.to === resolveRef(g, 'system-use-case:RunAudit').id)).toBe(true)
    expect(g.nodes.filter(n => n.kind === 'rule' && n.parent === uc.id).length).toBe(1)
  })
  it('rejects unknown kinds, bad nesting and relations that cannot start from the kind', async () => {
    const r = await importDraft(root, 'widget:\n  - name: A\nentity:\n  - name: B\n    app-use-case: [{ name: C }]\n    includes: [Ping]\n', { dryRun: true })
    expect(r.errors.join('\n')).toMatch(/unknown node kind "widget"/)
    expect(r.errors.join('\n')).toMatch(/app-use-case cannot be placed under entity/)
    expect(r.errors.join('\n')).toMatch(/relation "includes" cannot start from entity/)
  })
})
