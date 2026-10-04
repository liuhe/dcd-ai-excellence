// `dcddp list <kind>` — enumerate nodes of a kind with id, name, container and a short
// scalar summary. Adding a node-kind to vocabulary.ts auto-lights-up here.

import { NODE_KINDS, listNodeKinds, resolveRef } from '@dcddp/core'
import { loadFromDisk } from '../loader.ts'

interface ListOptions { model: string; json: boolean; parent?: string }

const NOISY = new Set(['name', 'summary', 'notes', 'docs', 'fields', 'invariants', 'methods', 'operations', 'payload',
  'tech_stack', 'infrastructure', 'rules', 'relationships', 'state_machine', 'repository', 'values',
  'includes', 'extends', 'uses', 'provides', 'emits', 'handles', 'related_use_cases', 'related_entities', 'api', 'display_mappings', 'external_links'])

function compact(data: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(data)) {
    if (NOISY.has(k) || v == null || v === '') continue
    if (typeof v === 'string' && v.length <= 40) parts.push(`${k}=${v}`)
    else if (typeof v === 'number' || typeof v === 'boolean') parts.push(`${k}=${v}`)
  }
  return parts.join('  ')
}

export async function list(kind: string, opts: ListOptions): Promise<void> {
  if (!(kind in NODE_KINDS)) {
    process.stderr.write(`Unknown node kind: ${kind}\nAvailable: ${listNodeKinds().join(', ')}\n`)
    process.exit(1)
  }
  const g = await loadFromDisk(opts.model)
  let matches = g.nodes.filter(n => n.kind === kind)
  if (opts.parent) {
    const parentId = resolveRef(g, opts.parent).id
    matches = matches.filter(n => n.parent === parentId)
  }
  if (opts.json) {
    process.stdout.write(JSON.stringify(matches.map(n => ({ id: n.id, kind: n.kind, name: n.name, parent: n.parent, package: n.package, file: n.file, data: g.nodesData[n.id] ?? {} })), null, 2) + '\n')
    return
  }
  if (matches.length === 0) { process.stdout.write(`(no ${kind} found)\n`); return }
  const idWidth = Math.max(...matches.map(n => n.id.length))
  for (const n of matches) {
    const parent = n.parent ? g.nodes.find(p => p.id === n.parent) : undefined
    const where = parent ? `  [${parent.kind} ${parent.name}${n.package ? ` / ${n.package}` : ''}]` : (n.package ? `  [${n.package}]` : '')
    const extras = compact(g.nodesData[n.id] ?? {})
    process.stdout.write(`- ${n.id.padEnd(idWidth)}  ${n.name}${where}${extras ? '  ' + extras : ''}\n`)
  }
}
