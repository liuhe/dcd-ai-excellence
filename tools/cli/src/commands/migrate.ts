import { readFile, writeFile, readdir, stat, rm, mkdir, rmdir } from 'node:fs/promises'
import { join, resolve, relative, dirname } from 'node:path'
import yaml from 'js-yaml'
import { CURRENT_SCHEMA_VERSION, planPath, type FileHandle, type MigrationContext } from '@dcddp/core'

interface MigrateOptions { model: string; from?: string; to?: string; dryRun: boolean }

async function walkYaml(root: string): Promise<string[]> {
  const out: string[] = []
  async function recur(dir: string): Promise<void> {
    for (const name of await readdir(dir)) {
      const full = join(dir, name)
      if (name === 'node_modules' || name === 'viewer' || name.startsWith('.')) continue
      const st = await stat(full)
      if (st.isDirectory()) await recur(full)
      else if (name.endsWith('.yaml') || name.endsWith('.yml')) out.push(full)
    }
  }
  await recur(root)
  return out
}

async function detectVersion(root: string): Promise<string | null> {
  for (const f of ['index.yaml', 'business.yaml']) {
    try {
      const d = (yaml.load(await readFile(join(root, f), 'utf-8')) as Record<string, unknown>) || {}
      if (typeof d.schema_version === 'string') return d.schema_version
    } catch { /* try next */ }
  }
  return null
}

export async function migrate(opts: MigrateOptions): Promise<void> {
  const modelRoot = resolve(opts.model)
  const detected = await detectVersion(modelRoot)
  const from = opts.from ?? detected ?? '(unversioned)'
  const to = opts.to ?? CURRENT_SCHEMA_VERSION

  process.stdout.write(`model: ${modelRoot}\n`)
  process.stdout.write(`current schema_version: ${detected ?? '(unversioned)'}${opts.from ? ` (overridden to ${opts.from})` : ''}\n`)
  process.stdout.write(`target schema_version: ${to}\n`)
  if (from === to) { process.stdout.write(`✓ already at ${to}, nothing to do\n`); return }
  if (from === '(unversioned)') {
    process.stdout.write(`! model has no schema_version declared. Use --from <version> to specify the starting version.\n`)
    process.exit(2)
  }
  const chain = planPath(from, to)
  process.stdout.write(`plan: ${chain.map(m => `${m.from}→${m.to} (${m.description})`).join('  |  ')}\n`)

  const paths = await walkYaml(modelRoot)
  const parseWarnings: string[] = []
  const files: FileHandle[] = await Promise.all(paths.map(async p => {
    const content = await readFile(p, 'utf-8')
    let data: Record<string, unknown> = {}
    try { data = (yaml.load(content) as Record<string, unknown>) || {} }
    catch (e) { parseWarnings.push(`  ⚠ ${relative(modelRoot, p)}: ${e instanceof Error ? e.message : String(e)}`) }
    return { relativePath: relative(modelRoot, p), absolutePath: p, content, data }
  }))
  if (parseWarnings.length) {
    process.stdout.write(`YAML parse warnings (${parseWarnings.length} file(s)):\n${parseWarnings.join('\n')}\n`)
  }

  const deletes = new Set<string>()
  const reports: string[] = []
  for (const migration of chain) {
    const ctx: MigrationContext = { files: files.filter(f => !deletes.has(f.absolutePath)), modelRoot }
    const result = await migration.run(ctx)
    process.stdout.write(`  ${migration.from}→${migration.to}: ${result.edits.length} file edit(s)\n`)
    for (const edit of result.edits) {
      if (edit.delete) { deletes.add(edit.absolutePath); continue }
      const content = edit.newText ?? yaml.dump(edit.newData ?? {}, { lineWidth: 120, noRefs: true })
      let data: Record<string, unknown> = {}
      try { data = edit.newData ?? ((yaml.load(content) as Record<string, unknown>) || {}) } catch { /* non-yaml text */ }
      const i = files.findIndex(f => f.absolutePath === edit.absolutePath)
      const handle = { relativePath: edit.relativePath, absolutePath: edit.absolutePath, content, data }
      if (i >= 0) files[i] = handle; else files.push(handle)
      deletes.delete(edit.absolutePath)
    }
    if (result.report) reports.push(result.report)
  }

  // Final version stamp on whichever index file the target format uses.
  const versionFile = files.find(f => f.relativePath === (to >= '7.0' ? 'index.yaml' : 'business.yaml'))
  if (versionFile && versionFile.data.schema_version !== to) {
    versionFile.data = { ...versionFile.data, schema_version: to }
    versionFile.content = versionFile.content.replace(/^schema_version:.*$/m, `schema_version: "${to}"`)
  }

  const toWrite = files.filter(f => !deletes.has(f.absolutePath))
  if (opts.dryRun) {
    process.stdout.write(`[dry-run] would write ${toWrite.length} file(s), delete ${deletes.size} file(s)\n`)
    for (const f of toWrite) process.stdout.write(`  write  ${f.relativePath}\n`)
    for (const d of deletes) process.stdout.write(`  delete ${relative(modelRoot, d)}\n`)
    return
  }
  for (const f of toWrite) { await mkdir(dirname(f.absolutePath), { recursive: true }); await writeFile(f.absolutePath, f.content, 'utf-8') }
  for (const d of deletes) await rm(d, { force: true })
  // prune directories emptied by deletes
  for (const d of [...deletes].map(dirname).sort((a, b) => b.length - a.length)) {
    try { if ((await readdir(d)).length === 0) await rmdir(d) } catch { /* fine */ }
  }
  if (reports.length) {
    const rp = join(modelRoot, 'migration-report.md')
    await writeFile(rp, reports.join('\n\n'), 'utf-8')
    process.stdout.write(`report: ${rp}\n`)
  }
  process.stdout.write(`✓ migrated ${from} → ${to}\n`)
}
