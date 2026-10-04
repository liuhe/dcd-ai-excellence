import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { importDraft } from '@dcddp/core'

interface ImportOptions { model: string; json: boolean; dryRun: boolean }

export async function importCmd(file: string, opts: ImportOptions): Promise<void> {
  const text = file === '-' ? await new Promise<string>(r => { let s = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', c => { s += c }); process.stdin.on('end', () => r(s)) }) : await readFile(resolve(file), 'utf8')
  const report = await importDraft(resolve(opts.model), text, { dryRun: opts.dryRun })
  const errors = report.findings.filter(f => f.severity === 'error').length
  if (opts.json) {
    process.stdout.write(JSON.stringify({ dryRun: opts.dryRun, ...report, validationErrors: errors }, null, 2) + '\n')
  } else if (report.errors.length > 0) {
    process.stdout.write(`✗ draft rejected, nothing written:\n`)
    for (const e of report.errors) process.stdout.write(`  - ${e}\n`)
  } else if (opts.dryRun) {
    process.stdout.write(`dry-run: would create ${report.created.length} node(s), ${report.edges.length} edge(s)\n`)
    for (const c of report.created) process.stdout.write(`  + ${c.kind} "${c.name}"\n`)
    for (const e of report.edges) process.stdout.write(`  ~ ${e.from} --${e.rel}--> ${e.to}\n`)
  } else {
    process.stdout.write(`✓ imported ${report.created.length} node(s), ${report.edges.length} edge(s)\n`)
    for (const c of report.created) process.stdout.write(`  + ${c.id}  ${c.kind} "${c.name}"\n`)
    for (const e of report.skippedEdges) process.stdout.write(`  ! skipped ${e.from} --${e.rel}--> ${e.to}: ${e.reason}\n`)
    if (report.findings.length > 0) {
      process.stdout.write(`validate: ${errors} error(s), ${report.findings.length - errors} warning(s)\n`)
      for (const f of report.findings) process.stdout.write(`  ${f.severity === 'error' ? '✗' : '!'} ${f.code}: ${f.message}\n`)
    } else process.stdout.write('validate: ok\n')
  }
  if (report.errors.length > 0 || errors > 0) process.exit(2)
}
