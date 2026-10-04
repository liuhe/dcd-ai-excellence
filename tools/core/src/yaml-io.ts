import { readFile, writeFile } from 'node:fs/promises'
import { parseDocument, isMap, isSeq, YAMLMap, YAMLSeq, Scalar, Document } from 'yaml'
import type { Node, ParsedNode } from 'yaml'

// Round-trip YAML I/O that preserves comments, blank lines, key order.
// The mutation commands (add/update/remove/rename) all funnel through here.

export type YDoc = Document.Parsed

export async function readDoc(path: string): Promise<YDoc> {
  const text = await readFile(path, 'utf-8')
  return parseDocument(text, { keepSourceTokens: true })
}

export async function writeDoc(path: string, doc: YDoc): Promise<void> {
  const text = doc.toString({ lineWidth: 100, indent: 2 })
  await writeFile(path, text, 'utf-8')
}

// Get a sequence node by (bilingual) key on the document root.
export function seqAt(doc: YDoc | YAMLMap, ...keys: string[]): YAMLSeq | undefined {
  const container = doc instanceof Document ? doc.contents : doc
  if (!isMap(container)) return undefined
  for (const k of keys) {
    const node = container.get(k, true)
    if (isSeq(node)) return node
  }
  return undefined
}

// Get a map node by key.
export function mapAt(doc: YDoc | YAMLMap, ...keys: string[]): YAMLMap | undefined {
  const container = doc instanceof Document ? doc.contents : doc
  if (!isMap(container)) return undefined
  for (const k of keys) {
    const node = container.get(k, true)
    if (isMap(node)) return node
  }
  return undefined
}

// Get or create a sequence at the given key; returns the seq.
export function getOrCreateSeq(doc: YDoc | YAMLMap, key: string): YAMLSeq {
  const container = doc instanceof Document ? doc.contents : doc
  if (!isMap(container)) throw new Error('root is not a map')
  const existing = container.get(key, true)
  if (isSeq(existing)) return existing as YAMLSeq
  const fresh = new YAMLSeq()
  container.set(key, fresh)
  return fresh
}

// Find an item in a seq where any of nameKeys equals name. Returns the item node (usually a Map).
export function findInSeq(seq: YAMLSeq, name: string, nameKeys: string[] = ['name', '名称']): { item: YAMLMap; index: number } | undefined {
  for (let i = 0; i < seq.items.length; i++) {
    const item = seq.items[i]
    if (!isMap(item)) continue
    for (const k of nameKeys) {
      const v = item.get(k)
      if (v === name || (v as Scalar | undefined)?.toString?.() === name) {
        return { item: item as YAMLMap, index: i }
      }
    }
  }
  return undefined
}

// Read scalar value at bilingual key.
export function scalar(node: YAMLMap | undefined, ...keys: string[]): string | undefined {
  if (!node) return undefined
  for (const k of keys) {
    const v = node.get(k)
    if (v !== undefined && v !== null) return String(v)
  }
  return undefined
}

// Set a scalar at a dot-path (e.g. "tech_stack.language") on a map.
// Creates intermediate maps as needed. If the path traverses through a seq index like `pages.0.name`, that's supported too.
export function setPath(root: YAMLMap, path: string, value: unknown): void {
  const parts = path.split('.')
  let cursor: Node = root
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]
    if (isMap(cursor)) {
      let next = cursor.get(part, true) as ParsedNode | undefined
      if (!next || (!isMap(next) && !isSeq(next))) {
        next = new YAMLMap() as unknown as ParsedNode
        cursor.set(part, next)
      }
      cursor = next
    } else if (isSeq(cursor)) {
      const idx = Number(part)
      if (Number.isNaN(idx)) throw new Error(`setPath: expected numeric index at seq, got ${part}`)
      cursor = cursor.items[idx] as Node
      if (!cursor) throw new Error(`setPath: index ${idx} out of bounds`)
    } else {
      throw new Error(`setPath: cannot traverse into non-container at ${parts.slice(0, i + 1).join('.')}`)
    }
  }
  const last = parts[parts.length - 1]
  if (isMap(cursor)) cursor.set(last, value)
  else if (isSeq(cursor)) cursor.set(Number(last), value)
  else throw new Error(`setPath: cannot set on non-container`)
}

// Delete an item at index from a seq.
export function deleteAt(seq: YAMLSeq, index: number): void {
  seq.delete(index)
}

// Enumerate all YAML files under a model root (via node fs).
export async function walkYamlFiles(root: string): Promise<string[]> {
  const { readdir, stat } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const out: string[] = []
  async function recur(dir: string): Promise<void> {
    const entries = await readdir(dir)
    for (const name of entries) {
      const full = join(dir, name)
      const st = await stat(full)
      if (st.isDirectory()) await recur(full)
      else if (name.endsWith('.yaml') || name.endsWith('.yml')) out.push(full)
    }
  }
  await recur(root)
  return out
}

// Bring parser primitives back out so command modules can use them without a second import.
export { isMap, isSeq, YAMLMap, YAMLSeq, Scalar } from 'yaml'
