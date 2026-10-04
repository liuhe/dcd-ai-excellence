// Reference cleanup for remove-node: strip any storage value (string-list / scalar /
// struct-list) that references a deleted id, in every detail file. Values are ids, so no
// kind disambiguation is needed. Containment is handled by index.yaml subtree removal.

import { join } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { parseDocument, isMap, isSeq, isScalar, YAMLMap, YAMLSeq } from 'yaml'
import { REL_KINDS } from './vocabulary.ts'
import { nodeReader } from './reader.ts'
import { DETAIL_DIRS } from './loader.ts'

export async function cleanReferencesToDeleted(root: string, deletedIds: string[]): Promise<{ modifiedFiles: string[] }> {
  if (deletedIds.length === 0) return { modifiedFiles: [] }
  const deleted = new Set(deletedIds)
  const reader = nodeReader(root)
  const modifiedFiles: string[] = []
  for (const dir of DETAIL_DIRS) {
    for (const rel of await reader.listYaml(dir)) {
      const abs = join(root, rel)
      const doc = parseDocument(await readFile(abs, 'utf-8'), { keepSourceTokens: true })
      if (!doc.contents) continue
      let modified = false
      walkMaps(doc.contents, m => { if (cleanMap(m, deleted)) modified = true })
      if (modified) {
        await writeFile(abs, doc.toString({ lineWidth: 120, indent: 2 }), 'utf-8')
        modifiedFiles.push(abs)
      }
    }
  }
  return { modifiedFiles }
}

function cleanMap(m: YAMLMap, deleted: Set<string>): boolean {
  let modified = false
  for (const rel of Object.values(REL_KINDS)) {
    if (rel.implicit) continue
    for (const ep of rel.endpoints) {
      const s = ep.storage
      if (s.shape === 'derived' || s.shape === 'containment') continue
      if (s.shape === 'scalar') {
        const v = m.get(s.field, true)
        if (isScalar(v) && deleted.has(String((v as { value: unknown }).value))) { m.delete(s.field); modified = true }
      } else {
        const seq = seqAtPath(m, s.field)
        if (!seq) continue
        for (let i = seq.items.length - 1; i >= 0; i--) {
          const it = seq.items[i]
          if (s.shape === 'string-list') {
            if (isScalar(it) && deleted.has(String((it as { value: unknown }).value))) { seq.delete(i); modified = true }
          } else if (isMap(it)) {
            const t = (it as YAMLMap).get(s.targetField, true)
            if (isScalar(t) && deleted.has(String((t as { value: unknown }).value))) { seq.delete(i); modified = true }
          }
        }
      }
    }
  }
  return modified
}

function seqAtPath(m: YAMLMap, path: string): YAMLSeq | undefined {
  let cur: unknown = m
  for (const p of path.split('.')) {
    if (!isMap(cur)) return undefined
    cur = (cur as YAMLMap).get(p, true)
  }
  return isSeq(cur) ? (cur as YAMLSeq) : undefined
}

function walkMaps(node: unknown, visit: (m: YAMLMap) => void): void {
  if (isMap(node)) {
    visit(node as YAMLMap)
    for (const pair of (node as YAMLMap).items) walkMaps(pair.value, visit)
  } else if (isSeq(node)) {
    for (const item of (node as YAMLSeq).items) walkMaps(item, visit)
  }
}
