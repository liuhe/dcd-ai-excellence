// Value-type helpers (schema 7.0). User-defined value types (value-object / enum) are node
// kinds flagged `valueType`; these wrappers keep the `dcddp vt` surface and kg-web API stable.

import { VALUE_TYPE_PRIMITIVES, VALUE_TYPE_KINDS, NODE_KINDS, describeNode } from './vocabulary.ts'
import { addNode, updateNode, removeNode, type Coerced } from './graph.ts'
import { loadGraph } from './loader.ts'
import { nodeReader } from './reader.ts'
import type { Graph } from './types.ts'
export { detectValueTypeConflicts, type VtConflict } from './validate.ts'

export function listPrimitives(): readonly string[] { return VALUE_TYPE_PRIMITIVES }
export function listValueTypeKinds(): string[] { return VALUE_TYPE_KINDS }

function assertVt(kind: string): void {
  if (!NODE_KINDS[kind]?.valueType) throw new Error(`"${kind}" is not a value-type kind (${VALUE_TYPE_KINDS.join(', ')})`)
}

export function listUserValueTypes(g: Graph, appFilter?: string): Array<{ kind: string; app: string; appId: string; name: string; id: string }> {
  const out: Array<{ kind: string; app: string; appId: string; name: string; id: string }> = []
  for (const n of g.nodes) {
    if (!NODE_KINDS[n.kind]?.valueType) continue
    let cur = n.parent ? g.nodes.find(x => x.id === n.parent) : undefined
    while (cur && cur.kind !== 'application') cur = cur.parent ? g.nodes.find(x => x.id === cur!.parent) : undefined
    const app = cur?.name ?? ''
    if (appFilter && appFilter !== app && appFilter !== cur?.id) continue
    out.push({ kind: n.kind, app, appId: cur?.id ?? '', name: n.name, id: n.id })
  }
  return out
}

export async function listUserValueTypesOnDisk(root: string, appFilter?: string) {
  return listUserValueTypes(await loadGraph(root, nodeReader(root), { onWarn: () => {} }), appFilter)
}

export async function addValueType(root: string, kind: string, name: string, parentRef: string, attrs: Coerced = {}) {
  assertVt(kind)
  return addNode(root, kind, { name, parent: parentRef, attrs })
}
export async function updateValueType(root: string, kind: string, ref: string, set: Coerced, unset: string[]) {
  assertVt(kind)
  return updateNode(root, ref.includes(':') || /^[a-z]+-\d+$/.test(ref) ? ref : `${kind}:${ref}`, set, unset)
}
export async function removeValueType(root: string, kind: string, ref: string) {
  assertVt(kind)
  return removeNode(root, ref.includes(':') || /^[a-z]+-\d+$/.test(ref) ? ref : `${kind}:${ref}`)
}

export function describeValueType(kind: string): string {
  assertVt(kind)
  return describeNode(kind)
}

export function describeAllValueTypes(): string {
  const lines: string[] = []
  lines.push('Primitives (built-in, read-only):')
  for (const p of VALUE_TYPE_PRIMITIVES) lines.push(`  - ${p}`)
  lines.push('', 'Structured attr shapes: field-list (- name: "Type, desc"), string-list, free-text', '')
  lines.push('User-defined kinds (nodes, see `dcddp describe <kind>`):')
  for (const k of VALUE_TYPE_KINDS) lines.push(`  - ${k}`)
  lines.push('', 'Composite (parsed at query time): List<T>, Map<K,V>, Optional<T>')
  return lines.join('\n')
}
