// Thin CLI wrappers over graph ops (6 graph-primitive verbs + describe + init).
// Node references: an id (`auc-017`) or `<kind>:<name>`; the positional <kind> narrows a bare name.

import { resolve } from 'node:path'
import {
  addNode as coreAddNode, updateNode, removeNode, connect, disconnect, updateEdge, parseSetKvs,
  describeNode, describeRel, listNodeKinds, listRelKinds, describeVocabularyMarkdown, scaffoldModel,
  isNodeId, NODE_KINDS,
} from '@dcddp/core'

interface BaseOpts { model: string; json: boolean }
interface NodeAddOpts extends BaseOpts { set: string[]; parent?: string; package?: string }
interface NodeUpdateOpts extends BaseOpts { set: string[]; unset: string[] }
interface ConnectOpts extends BaseOpts { rel: string; to: string; set: string[] }
interface UpdateEdgeOpts extends ConnectOpts { unset: string[] }

function report(json: boolean, human: string, data: Record<string, unknown>): void {
  if (json) process.stdout.write(JSON.stringify(data, null, 2) + '\n')
  else process.stdout.write(human + '\n')
}

// Build a resolvable ref from the CLI's (kind, key) pair.
function ref(kind: string, key: string): string {
  return isNodeId(key) ? key : `${kind}:${key}`
}

export async function addNode(kind: string, name: string | undefined, opts: NodeAddOpts): Promise<void> {
  const attrs = parseSetKvs(opts.set)
  if (!name && !NODE_KINDS[kind]?.inline) throw new Error(`add-node ${kind} requires a name`)
  const { id, file } = await coreAddNode(resolve(opts.model), kind, { name: name ?? '', parent: opts.parent, package: opts.package, attrs })
  report(opts.json, `✓ added ${kind} ${id}${name ? ` "${name}"` : ''} → ${file}`, { added: kind, id, name, file })
}

export async function updateNodeCmd(kind: string, key: string, opts: NodeUpdateOpts): Promise<void> {
  const set = parseSetKvs(opts.set)
  const { id, file, changed } = await updateNode(resolve(opts.model), ref(kind, key), set, opts.unset)
  report(opts.json, `✓ updated ${kind} ${id} (${changed} change(s)) → ${file}`, { updated: kind, id, file, changed })
}

export async function removeNodeCmd(kind: string, key: string, opts: BaseOpts): Promise<void> {
  const res = await removeNode(resolve(opts.model), ref(kind, key))
  const cascade = res.removedIds.length > 1 ? `\n  cascaded: ${res.removedIds.slice(1).join(', ')}` : ''
  report(opts.json, `✓ removed ${kind} ${res.id}${cascade}\n  files touched: ${res.files.length}`, { removed: kind, ...res })
}

export async function connectCmd(from: string, opts: ConnectOpts): Promise<void> {
  const attrs = parseSetKvs(opts.set)
  const r = await connect(resolve(opts.model), from, opts.rel, opts.to, attrs)
  report(opts.json, `✓ connect ${r.from} --${opts.rel}--> ${r.to} → ${r.file}`, { connected: opts.rel, ...r })
}

export async function disconnectCmd(from: string, opts: ConnectOpts): Promise<void> {
  const r = await disconnect(resolve(opts.model), from, opts.rel, opts.to)
  report(opts.json, `✓ disconnect ${r.from} --${opts.rel}--> ${r.to} → ${r.file}`, { disconnected: opts.rel, ...r })
}

export async function updateEdgeCmd(from: string, opts: UpdateEdgeOpts): Promise<void> {
  const set = parseSetKvs(opts.set)
  const r = await updateEdge(resolve(opts.model), from, opts.rel, opts.to, set, opts.unset)
  report(opts.json, `✓ update-edge ${from} --${opts.rel}--> ${opts.to} (${r.changed} change(s)) → ${r.file}`, { updatedEdge: opts.rel, from, to: opts.to, ...r })
}

export async function initCmd(opts: BaseOpts & { org: string }): Promise<void> {
  const root = resolve(opts.model)
  await scaffoldModel(root, opts.org)
  report(opts.json, `✓ created empty model at ${root} (organization "${opts.org}")`, { created: root, org: opts.org })
}

export async function describeCmd(kind: string | undefined, opts: { json: boolean; format?: string }): Promise<void> {
  const nodeKinds = listNodeKinds()
  const relKinds = listRelKinds()
  if (kind === 'all' || kind === undefined) {
    if (opts.format === 'markdown') { process.stdout.write(describeVocabularyMarkdown()); return }
    if (opts.json) process.stdout.write(JSON.stringify({ nodes: nodeKinds, rels: relKinds }, null, 2) + '\n')
    else {
      process.stdout.write(`node kinds: ${nodeKinds.join(', ')}\n`)
      process.stdout.write(`rel kinds:  ${relKinds.join(', ')}\n`)
    }
    return
  }
  if (nodeKinds.includes(kind)) process.stdout.write(describeNode(kind) + '\n')
  else if (relKinds.includes(kind)) process.stdout.write(describeRel(kind) + '\n')
  else { process.stderr.write(`unknown kind: ${kind}\n`); process.exit(1) }
}
