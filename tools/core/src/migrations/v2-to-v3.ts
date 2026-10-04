// Migration 2.0 → 3.0
//
// What changed in vocabulary v3:
//   - `system` becomes a first-class node kind (in NODE_KINDS)
//   - rel-kind names refactored: `system-uses`→`uses`, `entry-to`→`has-entry`,
//     `related-to`/`about`/`rule-uses-uc` collapsed into polymorphic `references`,
//     `implements` split into `implements` (OOP) + `realizes` (DDD cross-layer),
//     added implicit `has-uc` (system → suc)
//
// What this migration must actually rewrite in YAML:
//   - `schema_version: "2.0"` → `"3.0"` on business.yaml
//
// What this migration does NOT rewrite (intentionally):
//   - Storage field names on nodes/edges (system_use_cases:, entry:, related_use_cases:,
//     related_entities:, associations[].relation, relationships[].kind, ...) are all
//     UNCHANGED. Only rel-kind NAMES in the vocabulary changed; storage stayed.
//   - `kind: implements` in relationships[]: the OOP vs DDD split can't be decided
//     automatically. This migration warns per occurrence so the reviewer can decide
//     whether to change `kind: implements` → `kind: realizes` by hand (or leave OOP).

import { registerMigration, type Migration, type MigrationContext, type MigrationResult, type FileEdit } from './index.ts'

const migration: Migration = {
  from: '2.0',
  to: '3.0',
  description: 'Vocabulary rename (system-uses→uses, entry-to→has-entry, related-to/about/rule-uses-uc→references, split implements/realizes). Storage fields unchanged.',
  async run(ctx: MigrationContext): Promise<MigrationResult> {
    const edits: FileEdit[] = []

    // Bump schema_version on business.yaml.
    for (const f of ctx.files) {
      if (f.relativePath !== 'business.yaml') continue
      const data = { ...f.data }
      if (data.schema_version !== '3.0') {
        data.schema_version = '3.0'
        edits.push({ relativePath: f.relativePath, absolutePath: f.absolutePath, newData: data })
      }
    }

    // Warn on `kind: implements` occurrences so reviewer can decide OOP vs DDD.
    for (const f of ctx.files) {
      const rels = collectImplementsOccurrences(f.data)
      for (const occ of rels) {
        process.stderr.write(
          `[migrate v2→v3] ${f.relativePath}: relationships[].kind='implements' targeting "${occ.target}" — ` +
          `verify whether this is OOP (keep 'implements') or DDD cross-layer (change to 'realizes').\n`,
        )
      }
    }

    return { edits }
  },
}

interface ImplementsOccurrence { target: string }

function collectImplementsOccurrences(data: unknown): ImplementsOccurrence[] {
  const out: ImplementsOccurrence[] = []
  if (!isRecord(data)) return out
  // Entity detail file: top-level relationships[].
  const rels = data.relationships
  if (Array.isArray(rels)) {
    for (const r of rels) {
      if (isRecord(r) && r.kind === 'implements' && typeof r.target === 'string') {
        out.push({ target: r.target })
      }
    }
  }
  return out
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

registerMigration(migration)
export {}
