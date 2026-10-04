import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtemp, cp, rm, readFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { migrate } from '../src/commands/migrate.ts'
import { validate } from '../src/commands/validate.ts'
import { loadGraph, nodeReader } from '@dcddp/core'

const FIXTURE = resolve(__dirname, 'fixtures/chargable-proxy-6.0')
let tmp: string
let model: string

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'dcddp-migrate-'))
  model = join(tmp, 'model')
  await cp(FIXTURE, model, { recursive: true })
})
afterAll(async () => { await rm(tmp, { recursive: true, force: true }) })

function captureStdout(fn: () => Promise<void>): Promise<string> {
  return new Promise(async (res, rej) => {
    let buf = ''
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(chunk => { buf += String(chunk); return true })
    try { await fn(); res(buf) } catch (e) { rej(e as Error) } finally { spy.mockRestore() }
  })
}

describe('migrate 6.0 → 7.0', () => {
  it('restructures the directory, assigns ids and writes a report', async () => {
    const out = await captureStdout(() => migrate({ model, dryRun: false }))
    expect(out).toContain('migrated 6.0 → 7.0')
    await access(join(model, 'index.yaml'))
    await access(join(model, 'business', 'entities.yaml'))
    await expect(access(join(model, 'business.yaml'))).rejects.toThrow()
    const report = await readFile(join(model, 'migration-report.md'), 'utf-8')
    expect(report).toMatch(/\| entity \| Account \| ent-\d+ \|/)
    const g = await loadGraph(model, nodeReader(model), { onWarn: () => {} })
    expect(g.schemaVersion).toBe('7.0')
    expect(g.nodes.filter(n => n.kind === 'application').length).toBe(4)
    expect(g.nodes.filter(n => n.kind === 'rule').length).toBeGreaterThan(40)
    // repositories attach to their root entity (PackageTemplateRepository → PackageTemplate)
    const pt = g.nodes.find(n => n.kind === 'entity' && n.name === 'PackageTemplate' && n.parent)!
    expect(g.nodesData[pt.id].repository).toBeDefined()
    // fields normalized to compact single-key maps
    const biz = g.nodes.find(n => n.kind === 'entity' && n.name === 'Account' && !n.parent)!
    for (const f of g.nodesData[biz.id].fields as unknown[]) expect(Object.keys(f as object).length).toBe(1)
  })
  it('re-running is a no-op', async () => {
    const out = await captureStdout(() => migrate({ model, dryRun: false }))
    expect(out).toContain('already at 7.0')
  })
  it('validates with only the known data error (bu1 without actor)', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const out = await captureStdout(() => validate({ model, json: true }))
    exit.mockRestore()
    const parsed = JSON.parse(out) as { errors: number; findings: Array<{ code: string }> }
    expect(parsed.errors).toBe(1)
    expect(parsed.findings.filter(f => f.code === 'missing-required-rel').length).toBe(1)
  })
})
