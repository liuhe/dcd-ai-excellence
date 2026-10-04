// Migration 4.0 → 5.0
//
// What changed in vocabulary v5:
//   - New node kinds: organization / business-worker / external-party / participant
//   - New rel: has-actor (source: BUC / SUC / app-use-case; target: business-worker / external-party
//     / participant; storage: derived from source's `actor:` scalar field, matched against target
//     node pool by name)
//   - DerivedSource extended with `scalar-field` variant
//
// YAML restructures this migration performs:
//   1. business.yaml schema_version → "5.0"
//   2. business.yaml.organization: string → business.yaml.organizations: [{name: string}]
//   3. business.yaml.business_workers: [string, ...] → business.yaml.business_workers: [{name: string}, ...]
//   4. external_parties already carries structured maps ({name, type, participants}) — no change.
//   5. `actor:` fields on BUCs/SUCs/app-use-cases stay as strings; the has-actor rel derives edges at query time.

import { registerMigration, type Migration, type MigrationContext, type MigrationResult, type FileEdit } from './index.ts'

const migration: Migration = {
  from: '4.0',
  to: '5.0',
  description: 'Promote organization / business-workers / external-parties / participants to first-class node kinds; wrap scalars as {name}-maps; add has-actor derived rel.',
  async run(ctx: MigrationContext): Promise<MigrationResult> {
    const edits: FileEdit[] = []

    for (const f of ctx.files) {
      if (f.relativePath !== 'business.yaml') continue
      const data = { ...f.data }
      let changed = false

      // Bump schema version
      if (data.schema_version !== '5.0') { data.schema_version = '5.0'; changed = true }

      // organization: "X" → organizations: [{name: "X"}]
      if (typeof data.organization === 'string' && data.organization.length > 0) {
        const orgName = data.organization as string
        const existingOrgs = Array.isArray(data.organizations) ? data.organizations : []
        // Only wrap if not already present
        if (!existingOrgs.some((o: unknown) => isRecord(o) && o.name === orgName)) {
          data.organizations = [...existingOrgs, { name: orgName }]
        } else {
          data.organizations = existingOrgs
        }
        delete data.organization
        changed = true
      }

      // business_workers: [string, ...] → [{name: string}, ...]
      if (Array.isArray(data.business_workers)) {
        const items = data.business_workers as unknown[]
        const needsWrap = items.some(x => typeof x === 'string')
        if (needsWrap) {
          data.business_workers = items.map(x =>
            typeof x === 'string' ? { name: x } : x,
          )
          changed = true
        }
      }

      if (changed) edits.push({ relativePath: f.relativePath, absolutePath: f.absolutePath, newData: data })
    }

    return { edits }
  },
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

registerMigration(migration)
export {}
