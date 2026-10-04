// index.yaml — the single source of node existence.
//
//   schema_version: "7.0"
//   sequences: { buc: 3, auc: 85, ... }        # next-id counters per prefix (never reused)
//   business:
//     <kind>:
//       - { id, name, <child-kind>: [...] }     # nesting = containment
//       - package: <name>                        # grouping, not a node
//         <kind>: [...]
//   applications:
//     application:
//       - { id, name, app-use-case: [...], page: [...], entity: [...], ... }
//
// Reading goes through plain objects (js-yaml). Mutations go through yaml@2 Documents so
// comments / order survive.

import yaml from 'js-yaml'
import { parseDocument, isMap, isSeq, isScalar, YAMLMap, YAMLSeq, type Document } from 'yaml'
import { NODE_KINDS, childKindsOf, rootKindsOf, nodeSpec } from './vocabulary.ts'
import type { IndexEntry, ModelIndex, ViewName, LoadWarning } from './types.ts'

export const INDEX_FILE = 'index.yaml'
export const VIEWS: ViewName[] = ['business', 'applications']

// -------------------- Parse (read side) --------------------

export function parseIndex(text: string, warnings: LoadWarning[] = []): ModelIndex {
  const data = (yaml.load(text) as Record<string, unknown>) || {}
  const schemaVersion = typeof data.schema_version === 'string' ? data.schema_version : ''
  const sequences: Record<string, number> = {}
  if (data.sequences && typeof data.sequences === 'object') {
    for (const [k, v] of Object.entries(data.sequences as Record<string, unknown>)) {
      if (typeof v === 'number') sequences[k] = v
    }
  }
  const out: ModelIndex = { schemaVersion, sequences, business: [], applications: [] }
  for (const view of VIEWS) {
    const section = data[view]
    if (!section) continue
    if (typeof section !== 'object' || Array.isArray(section)) {
      warnings.push({ code: 'bad-file', message: `index.yaml: ${view} must be a map of kind → list`, file: INDEX_FILE })
      continue
    }
    for (const [key, list] of Object.entries(section as Record<string, unknown>)) {
      if (!(key in NODE_KINDS)) {
        warnings.push({ code: 'unknown-key', message: `index.yaml: unknown kind "${key}" under ${view}`, file: INDEX_FILE })
        continue
      }
      if (!rootKindsOf(view).includes(key)) {
        warnings.push({ code: 'bad-nesting', message: `index.yaml: ${key} cannot be at the top of the ${view} view`, file: INDEX_FILE })
      }
      out[view].push(...parseList(key, list, undefined, warnings))
    }
  }
  return out
}

function parseList(kind: string, list: unknown, pkg: string | undefined, warnings: LoadWarning[]): IndexEntry[] {
  if (!Array.isArray(list)) {
    warnings.push({ code: 'bad-file', message: `index.yaml: ${kind} must be a list`, file: INDEX_FILE })
    return []
  }
  const out: IndexEntry[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const m = item as Record<string, unknown>
    if (typeof m.package === 'string' && !('id' in m)) {
      const sub = pkg ? `${pkg}/${m.package}` : m.package
      out.push(...parseList(kind, m[kind] ?? [], sub, warnings))
      continue
    }
    const id = typeof m.id === 'string' ? m.id : ''
    if (!id) {
      warnings.push({ code: 'missing-id', message: `index.yaml: ${kind} entry without id (name=${String(m.name ?? '?')})`, file: INDEX_FILE })
      continue
    }
    const entry: IndexEntry = { id, name: String(m.name ?? ''), kind, package: pkg, children: [] }
    for (const [key, val] of Object.entries(m)) {
      if (key === 'id' || key === 'name') continue
      if (!(key in NODE_KINDS)) {
        warnings.push({ code: 'unknown-key', message: `index.yaml: unknown key "${key}" on ${id}`, file: INDEX_FILE, nodeId: id })
        continue
      }
      if (!childKindsOf(kind).includes(key)) {
        warnings.push({ code: 'bad-nesting', message: `index.yaml: ${key} cannot nest under ${kind} (${id})`, file: INDEX_FILE, nodeId: id })
      }
      entry.children.push(...parseList(key, val, undefined, warnings))
    }
    out.push(entry)
  }
  return out
}

export function* walkIndex(index: ModelIndex): Generator<{ entry: IndexEntry; parent?: IndexEntry; view: ViewName }> {
  function* recur(entries: IndexEntry[], parent: IndexEntry | undefined, view: ViewName): Generator<{ entry: IndexEntry; parent?: IndexEntry; view: ViewName }> {
    for (const e of entries) {
      yield { entry: e, parent, view }
      yield* recur(e.children, e, view)
    }
  }
  yield* recur(index.business, undefined, 'business')
  yield* recur(index.applications, undefined, 'applications')
}

// -------------------- Mutate (write side, yaml@2 Document) --------------------

export type IndexDoc = Document.Parsed

export function parseIndexDoc(text: string): IndexDoc {
  return parseDocument(text, { keepSourceTokens: true })
}

export function serializeIndexDoc(doc: IndexDoc): string {
  return doc.toString({ lineWidth: 120, indent: 2 })
}

export function emptyIndexText(): string {
  return `schema_version: "7.0"\nsequences: {}\n\nbusiness: {}\n\napplications: {}\n`
}

function rootMap(doc: IndexDoc): YAMLMap {
  if (!doc.contents || !isMap(doc.contents)) throw new Error('index.yaml: root must be a map')
  return doc.contents as YAMLMap
}

// Container maps (sequences / business / applications / package wrappers) are always block style,
// even when the file was scaffolded with `{}` placeholders. Entry maps stay compact flow one-liners.
function getOrCreateMap(parent: YAMLMap, key: string): YAMLMap {
  const existing = parent.get(key, true)
  if (isMap(existing)) { (existing as YAMLMap).flow = false; return existing as YAMLMap }
  const fresh = new YAMLMap()
  parent.set(key, fresh)
  return fresh
}

function getOrCreateSeq(parent: YAMLMap, key: string): YAMLSeq {
  const existing = parent.get(key, true)
  if (isSeq(existing)) return existing as YAMLSeq
  const fresh = new YAMLSeq()
  parent.set(key, fresh)
  return fresh
}

function scalarStr(m: YAMLMap, key: string): string | undefined {
  const v = m.get(key, true)
  if (isScalar(v)) { const val = (v as { value: unknown }).value; return val == null ? undefined : String(val) }
  return undefined
}

// Allocate the next id for a kind and bump the counter.
export function allocateId(doc: IndexDoc, kind: string): string {
  const spec = nodeSpec(kind)
  const seqs = getOrCreateMap(rootMap(doc), 'sequences')
  const cur = Number(scalarStr(seqs, spec.idPrefix) ?? 0)
  const next = cur + 1
  seqs.set(spec.idPrefix, next)
  return formatId(spec.idPrefix, next)
}

export function formatId(prefix: string, seq: number): string {
  return `${prefix}-${String(seq).padStart(3, '0')}`
}

// Bump a counter to at least `seq` (used by migration / repair).
export function ensureSequenceAtLeast(doc: IndexDoc, prefix: string, seq: number): void {
  const seqs = getOrCreateMap(rootMap(doc), 'sequences')
  const cur = Number(scalarStr(seqs, prefix) ?? 0)
  if (seq > cur) seqs.set(prefix, seq)
}

export interface EntryLocation {
  map: YAMLMap          // the entry map
  seq: YAMLSeq          // the list it sits in
  index: number
  kind: string
  parentMap?: YAMLMap   // containing node entry (undefined = view root or package root)
  packagePath?: string
}

// Depth-first search for an entry by id anywhere in the document.
export function findEntry(doc: IndexDoc, id: string): EntryLocation | undefined {
  const root = rootMap(doc)
  for (const view of VIEWS) {
    const section = root.get(view, true)
    if (!isMap(section)) continue
    const hit = searchKindMap(section as YAMLMap, id, undefined, undefined)
    if (hit) return hit
  }
  return undefined
}

function searchKindMap(container: YAMLMap, id: string, parentMap: YAMLMap | undefined, pkg: string | undefined): EntryLocation | undefined {
  for (const pair of container.items) {
    const key = isScalar(pair.key) ? String((pair.key as { value: unknown }).value) : String(pair.key)
    if (!(key in NODE_KINDS)) continue
    if (!isSeq(pair.value)) continue
    const hit = searchSeq(pair.value as YAMLSeq, key, id, parentMap, pkg)
    if (hit) return hit
  }
  return undefined
}

function searchSeq(seq: YAMLSeq, kind: string, id: string, parentMap: YAMLMap | undefined, pkg: string | undefined): EntryLocation | undefined {
  for (let i = 0; i < seq.items.length; i++) {
    const item = seq.items[i]
    if (!isMap(item)) continue
    const m = item as YAMLMap
    const pkgName = scalarStr(m, 'package')
    if (pkgName !== undefined && !m.has('id')) {
      const inner = m.get(kind, true)
      if (isSeq(inner)) {
        const hit = searchSeq(inner as YAMLSeq, kind, id, parentMap, pkg ? `${pkg}/${pkgName}` : pkgName)
        if (hit) return hit
      }
      continue
    }
    if (scalarStr(m, 'id') === id) return { map: m, seq, index: i, kind, parentMap, packagePath: pkg }
    const hit = searchKindMap(m, id, m, undefined)
    if (hit) return hit
  }
  return undefined
}

// Resolve the list (creating package levels as needed) where a new `kind` entry goes.
function targetSeq(doc: IndexDoc, kind: string, parentId: string | undefined, packagePath: string | undefined): YAMLSeq {
  const spec = nodeSpec(kind)
  let container: YAMLMap
  if (parentId) {
    const parent = findEntry(doc, parentId)
    if (!parent) throw new Error(`parent ${parentId} not found in index.yaml`)
    if (!spec.parents.includes(parent.kind)) {
      throw new Error(`${kind} cannot be placed under ${parent.kind} (allowed parents: ${spec.parents.join(', ') || 'none'})`)
    }
    container = parent.map
  } else {
    if (!spec.view) throw new Error(`${kind} must be placed under a parent (${spec.parents.join(', ')}); pass --parent`)
    container = getOrCreateMap(rootMap(doc), spec.view)
  }
  let seq = getOrCreateSeq(container, kind)
  if (packagePath) {
    for (const part of packagePath.split('/').map(s => s.trim()).filter(Boolean)) {
      let pkgMap: YAMLMap | undefined
      for (const item of seq.items) {
        if (isMap(item) && scalarStr(item as YAMLMap, 'package') === part && !(item as YAMLMap).has('id')) { pkgMap = item as YAMLMap; break }
      }
      if (!pkgMap) {
        pkgMap = new YAMLMap()
        pkgMap.set('package', part)
        pkgMap.set(kind, new YAMLSeq())
        seq.add(pkgMap)
      }
      seq = getOrCreateSeq(pkgMap, kind)
    }
  }
  return seq
}

export function addEntry(doc: IndexDoc, kind: string, id: string, name: string, parentId?: string, packagePath?: string): void {
  if (findEntry(doc, id)) throw new Error(`id ${id} already exists in index.yaml`)
  const seq = targetSeq(doc, kind, parentId, packagePath)
  const m = new YAMLMap()
  m.set('id', id)
  m.set('name', name)
  m.flow = true
  seq.add(m)
}

export function removeEntry(doc: IndexDoc, id: string): { removedIds: string[] } {
  const loc = findEntry(doc, id)
  if (!loc) throw new Error(`id ${id} not found in index.yaml`)
  const removedIds = collectIds(loc.map)
  loc.seq.delete(loc.index)
  pruneEmptyPackages(doc)
  return { removedIds }
}

// Drop package wrappers whose kind list became empty (after move / remove).
export function pruneEmptyPackages(doc: IndexDoc): void {
  const root = rootMap(doc)
  const pruneSeq = (seq: YAMLSeq, kind: string): void => {
    for (let i = seq.items.length - 1; i >= 0; i--) {
      const item = seq.items[i]
      if (!isMap(item)) continue
      const m = item as YAMLMap
      if (scalarStr(m, 'package') !== undefined && !m.has('id')) {
        const inner = m.get(kind, true)
        if (isSeq(inner)) pruneSeq(inner as YAMLSeq, kind)
        if (!isSeq(inner) || (inner as YAMLSeq).items.length === 0) seq.delete(i)
      } else {
        pruneMap(m)
      }
    }
  }
  const pruneMap = (m: YAMLMap): void => {
    for (const pair of m.items) {
      const key = isScalar(pair.key) ? String((pair.key as { value: unknown }).value) : String(pair.key)
      if (key in NODE_KINDS && isSeq(pair.value)) pruneSeq(pair.value as YAMLSeq, key)
    }
  }
  for (const view of VIEWS) {
    const section = root.get(view, true)
    if (isMap(section)) pruneMap(section as YAMLMap)
  }
}

function collectIds(m: YAMLMap): string[] {
  const out: string[] = []
  const id = scalarStr(m, 'id')
  if (id) out.push(id)
  for (const pair of m.items) {
    if (isSeq(pair.value)) for (const item of (pair.value as YAMLSeq).items) if (isMap(item)) out.push(...collectIds(item as YAMLMap))
  }
  return out
}

export function renameEntry(doc: IndexDoc, id: string, name: string): void {
  const loc = findEntry(doc, id)
  if (!loc) throw new Error(`id ${id} not found in index.yaml`)
  loc.map.set('name', name)
}

// Move an entry (with its subtree) to another parent and/or package.
export function moveEntry(doc: IndexDoc, id: string, opts: { parentId?: string | null; packagePath?: string | null }): void {
  const loc = findEntry(doc, id)
  if (!loc) throw new Error(`id ${id} not found in index.yaml`)
  const currentParentId = loc.parentMap ? scalarStr(loc.parentMap, 'id') : undefined
  const parentId = opts.parentId === undefined ? currentParentId : (opts.parentId ?? undefined)
  const packagePath = opts.packagePath === undefined ? loc.packagePath : (opts.packagePath ?? undefined)
  if (parentId && collectIds(loc.map).includes(parentId)) throw new Error(`cannot move ${id} under its own descendant ${parentId}`)
  loc.seq.delete(loc.index)
  const seq = targetSeq(doc, loc.kind, parentId, packagePath)
  seq.add(loc.map)
  pruneEmptyPackages(doc)
}

// Ids of every entry in the document (for validation / cleanup).
export function allIds(doc: IndexDoc): string[] {
  const root = rootMap(doc)
  const out: string[] = []
  for (const view of VIEWS) {
    const section = root.get(view, true)
    if (!isMap(section)) continue
    for (const pair of (section as YAMLMap).items) {
      if (isSeq(pair.value)) for (const item of (pair.value as YAMLSeq).items) if (isMap(item)) out.push(...collectIdsDeep(item as YAMLMap))
    }
  }
  return out
}
function collectIdsDeep(m: YAMLMap): string[] {
  // package wrapper maps have no id but contain kind lists
  return collectIds(m)
}

export function setSchemaVersion(doc: IndexDoc, v: string): void {
  rootMap(doc).set('schema_version', v)
}

export function readSequences(doc: IndexDoc): Record<string, number> {
  const seqs = rootMap(doc).get('sequences', true)
  const out: Record<string, number> = {}
  if (isMap(seqs)) for (const pair of (seqs as YAMLMap).items) {
    const k = isScalar(pair.key) ? String((pair.key as { value: unknown }).value) : String(pair.key)
    const v = isScalar(pair.value) ? Number((pair.value as { value: unknown }).value) : NaN
    if (!Number.isNaN(v)) out[k] = v
  }
  return out
}
