// Migration 5.0 → 6.0
//
// What changed in vocabulary v6:
//   - Value-type system introduced (see vocabulary.ts VALUE_TYPE_PRIMITIVES, VALUE_TYPE_KINDS)
//   - `value-object` REMOVED from NODE_KINDS; VOs are now pure value-types (still stored in
//     applications/<app>.yaml → domain_model.value_objects[], addressable via `dcddp vt` CLI)
//   - `NodeKindSpec.attrs` upgraded from `string[]` to `NodeAttrSpec[]` (`{name, type}`)
//   - `has-actor` promoted from `derived scalar-field` to proper `scalar` storage rel
//   - `derived scalar-field` shape removed (has-actor was only user); `derived field-type` retained
//   - `uses (entity → value-object)` endpoint REMOVED (VO isn't a node)
//
// What this migration does to YAML:
//   - schema_version 5.0 → 6.0
//   - No data restructure needed. VO YAML stays. actor: field stays. attrs stay.

import { registerMigration, type Migration, type MigrationContext, type MigrationResult, type FileEdit } from './index.ts'

const migration: Migration = {
  from: '5.0',
  to: '6.0',
  description: 'Introduce value-type system; VO reclassified from node to pure value-type; has-actor from derived to scalar rel storage. YAML data unchanged.',
  async run(ctx: MigrationContext): Promise<MigrationResult> {
    const edits: FileEdit[] = []
    for (const f of ctx.files) {
      if (f.relativePath !== 'business.yaml') continue
      if (f.data.schema_version !== '6.0') {
        edits.push({ relativePath: f.relativePath, absolutePath: f.absolutePath, newData: { ...f.data, schema_version: '6.0' } })
      }
    }
    return { edits }
  },
}

registerMigration(migration)
export {}
