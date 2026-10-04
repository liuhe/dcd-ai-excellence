// `dcddp vt ...` — value-type surface over the node ops (value-object / enum are nodes).

import { resolve } from 'node:path'
import {
  addValueType, updateValueType, removeValueType, listUserValueTypesOnDisk,
  listPrimitives, listValueTypeKinds, describeValueType, describeAllValueTypes, parseSetKvs,
} from '@dcddp/core'

interface VtBaseOpts { model: string; json: boolean }
interface VtAddOpts extends VtBaseOpts { kind: string; parent: string; set: string[] }
interface VtUpdateOpts extends VtBaseOpts { kind: string; set: string[]; unset: string[] }
interface VtRemoveOpts extends VtBaseOpts { kind: string }
interface VtListOpts extends VtBaseOpts { app?: string }

function report(json: boolean, human: string, data: Record<string, unknown>): void {
  if (json) process.stdout.write(JSON.stringify(data, null, 2) + '\n')
  else process.stdout.write(human + '\n')
}

export async function vtAdd(name: string, opts: VtAddOpts): Promise<void> {
  const attrs = parseSetKvs(opts.set)
  const { id, file } = await addValueType(resolve(opts.model), opts.kind, name, opts.parent, attrs)
  report(opts.json, `✓ added ${opts.kind} ${id} "${name}" → ${file}`, { added: opts.kind, id, name, file })
}

export async function vtUpdate(ref: string, opts: VtUpdateOpts): Promise<void> {
  const set = parseSetKvs(opts.set)
  const { id, file, changed } = await updateValueType(resolve(opts.model), opts.kind, ref, set, opts.unset)
  report(opts.json, `✓ updated ${opts.kind} ${id} (${changed} change(s)) → ${file}`, { updated: opts.kind, id, file, changed })
}

export async function vtRemove(ref: string, opts: VtRemoveOpts): Promise<void> {
  const r = await removeValueType(resolve(opts.model), opts.kind, ref)
  report(opts.json, `✓ removed ${opts.kind} ${r.id}`, { removed: opts.kind, ...r })
}

export async function vtList(opts: VtListOpts): Promise<void> {
  const items = await listUserValueTypesOnDisk(resolve(opts.model), opts.app)
  if (opts.json) {
    process.stdout.write(JSON.stringify({ primitives: listPrimitives(), userKinds: listValueTypeKinds(), userItems: items }, null, 2) + '\n')
    return
  }
  process.stdout.write(`Primitives: ${listPrimitives().join(', ')}\n`)
  process.stdout.write(`User-defined (${items.length}):\n`)
  for (const it of items) process.stdout.write(`  - ${it.id}  ${it.name}  [${it.kind} in ${it.app || '(no app)'}]\n`)
}

export async function vtDescribe(name: string | undefined, _opts: VtBaseOpts): Promise<void> {
  if (!name) { process.stdout.write(describeAllValueTypes() + '\n'); return }
  process.stdout.write(describeValueType(name) + '\n')
}
