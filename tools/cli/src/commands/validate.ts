import { resolve } from 'node:path'
import { validateModel } from '@dcddp/core'

interface ValidateOptions { model: string; json: boolean }

export async function validate(opts: ValidateOptions): Promise<void> {
  const { graph, findings } = await validateModel(resolve(opts.model))
  const errors = findings.filter(f => f.severity === 'error').length
  const warnings = findings.filter(f => f.severity === 'warning').length
  if (opts.json) {
    process.stdout.write(JSON.stringify({ errors, warnings, nodes: graph.nodes.length, edges: graph.edges.length, findings }, null, 2) + '\n')
  } else if (findings.length === 0) {
    process.stdout.write(`✓ model ok (${graph.nodes.length} nodes, ${graph.edges.length} edges)\n`)
  } else {
    for (const f of findings) {
      const icon = f.severity === 'error' ? '✗' : f.severity === 'warning' ? '!' : 'ℹ'
      process.stdout.write(`${icon} [${f.severity}] ${f.code}: ${f.message}\n`)
    }
    process.stdout.write(`\n${errors} error(s), ${warnings} warning(s)\n`)
  }
  if (errors > 0) process.exit(2)
}
