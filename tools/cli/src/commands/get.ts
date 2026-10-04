// `dcddp get <kind> <idOrName>` — show one node: id, name, placement, attrs, edges, children.

import yaml from 'js-yaml'
import { NODE_KINDS, listNodeKinds, resolveRef } from '@dcddp/core'
import { loadFromDisk } from '../loader.ts'

interface GetOptions { model: string; json: boolean }

export async function get(kind: string, key: string, opts: GetOptions): Promise<void> {
  if (!(kind in NODE_KINDS)) {
    process.stderr.write(`Unknown node kind: ${kind}\nAvailable: ${listNodeKinds().join(', ')}\n`)
    process.exit(1)
  }
  const g = await loadFromDisk(opts.model)
  const node = resolveRef(g, `${kind}:${key}`)
  const parent = node.parent ? g.nodes.find(p => p.id === node.parent) : undefined
  const data = g.nodesData[node.id] ?? {}
  const out: Record<string, unknown> = { id: node.id, kind: node.kind, name: node.name }
  if (parent) out.parent = `${parent.id} (${parent.kind} ${parent.name})`
  if (node.package) out.package = node.package
  if (node.file) out.file = node.file
  for (const [k, v] of Object.entries(data)) if (k !== 'name') out[k] = v
  const children = g.nodes.filter(n => n.parent === node.id && !NODE_KINDS[n.kind].inline)
  if (children.length) out.children = children.map(c => `${c.id} (${c.kind} ${c.name})`)
  const outEdges = g.edges.filter(e => e.from === node.id && !NODE_KINDS[e.targetKind.slice(0, e.targetKind.indexOf(':'))]?.inline && e.rel !== 'transitions-to' && !isContainment(e.rel))
  const inEdges = g.edges.filter(e => e.to === node.id && !isContainment(e.rel))
  const label = (id: string) => { const n = g.nodes.find(x => x.id === id); return n ? `${id} (${n.kind} ${n.name})` : id }
  if (outEdges.length) out.edges_out = outEdges.map(e => `--${e.rel}--> ${label(e.to)}`)
  if (inEdges.length) out.edges_in = inEdges.map(e => `<--${e.rel}-- ${label(e.from)}`)
  if (opts.json) process.stdout.write(JSON.stringify(out, null, 2) + '\n')
  else process.stdout.write(yaml.dump(out, { lineWidth: 100, noRefs: true }))
}

function isContainment(rel: string): boolean {
  return rel.startsWith('has-') || rel === 'aggregates'
}
