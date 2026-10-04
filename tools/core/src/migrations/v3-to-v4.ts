// Migration 3.0 → 4.0
//
// What changed in vocabulary v4:
//   - `entity` id is polymorphic: bare (business) or qualified `<app>.<name>` (app-scoped)
//   - New node kinds: value-object / domain-service / domain-event / role (all app-scoped)
//   - New rel kinds: aggregates (root→members) / emits / handles
//   - `uses` extended with entity → value-object endpoint (derived storage)
//   - `implements` target narrowed from entity to role
//   - `fields:` schema restructured to `{name, type, desc}` tri-key maps
//
// YAML restructures this migration performs:
//   1. business.yaml schema_version → "4.0"
//   2. applications/<app>.yaml:
//      a. Flatten `domain_model.aggregates[]` → move aggregate.entities[] to
//         `domain_model.entities[]`; merge aggregate.root/invariants/notes onto root entity;
//         add `aggregates: [member-names]` field to root entity.
//      b. Restructure `fields:` maps everywhere they appear: parse `{name: "type_and_desc"}`
//         into `{name, type, desc}` — split value on first comma; before = type; after = desc.
//   3. business/business-model/<name>.yaml: restructure `fields:` same way.

import { registerMigration, type Migration, type MigrationContext, type MigrationResult, type FileEdit } from './index.ts'

const migration: Migration = {
  from: '3.0',
  to: '4.0',
  description: 'Flatten domain_model.aggregates → entities; structure fields as {name,type,desc}; add DDD node kinds & rels.',
  async run(ctx: MigrationContext): Promise<MigrationResult> {
    const edits: FileEdit[] = []

    for (const f of ctx.files) {
      let data = f.data
      let changed = false

      if (f.relativePath === 'business.yaml') {
        if (data.schema_version !== '4.0') {
          data = { ...data, schema_version: '4.0' }
          changed = true
        }
      }

      // Restructure fields wherever they appear.
      const fieldsResult = restructureFieldsRecursive(data)
      if (fieldsResult.changed) {
        data = fieldsResult.data as Record<string, unknown>
        changed = true
      }

      // Flatten domain_model.aggregates for application YAMLs.
      if (f.relativePath.startsWith('applications/') && f.relativePath.endsWith('.yaml')) {
        const flatResult = flattenAggregates(data)
        if (flatResult.changed) {
          data = flatResult.data
          changed = true
        }
      }

      if (changed) {
        edits.push({ relativePath: f.relativePath, absolutePath: f.absolutePath, newData: data })
      }
    }

    return { edits }
  },
}

// -------------------- fields restructuring --------------------
// Old: [{id: "Long, auto-increment primary key"}, {name: "String, unique"}]
// New: [{name: "id", type: "Long", desc: "auto-increment primary key"}, {name: "name", type: "String", desc: "unique"}]
// Also handles already-migrated form (idempotent).

function restructureFieldsRecursive(node: unknown): { data: unknown; changed: boolean } {
  if (Array.isArray(node)) {
    let changed = false
    const out = node.map(item => {
      const r = restructureFieldsRecursive(item)
      if (r.changed) changed = true
      return r.data
    })
    return { data: out, changed }
  }
  if (!isRecord(node)) return { data: node, changed: false }

  let changed = false
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node)) {
    if (key === 'fields' && Array.isArray(value)) {
      const restructured = value.map(f => structureOneField(f))
      if (restructured.some(x => x.changed)) changed = true
      out[key] = restructured.map(x => x.data)
    } else {
      const r = restructureFieldsRecursive(value)
      if (r.changed) changed = true
      out[key] = r.data
    }
  }
  return { data: out, changed }
}

function structureOneField(field: unknown): { data: unknown; changed: boolean } {
  // Already migrated: {name, type, ...} with string type.
  if (isRecord(field) && typeof field.name === 'string' && typeof field.type === 'string') {
    return { data: field, changed: false }
  }
  // Old form: single-key map {fieldName: "type, desc"} (or "type" only).
  if (isRecord(field)) {
    const keys = Object.keys(field)
    if (keys.length === 1) {
      const name = keys[0]
      const raw = field[name]
      if (typeof raw === 'string') {
        const commaIdx = firstUnbalancedComma(raw)
        const type = (commaIdx >= 0 ? raw.slice(0, commaIdx) : raw).trim()
        const desc = commaIdx >= 0 ? raw.slice(commaIdx + 1).trim() : ''
        const out: Record<string, unknown> = { name, type }
        if (desc) out.desc = desc
        return { data: out, changed: true }
      }
    }
  }
  // Unknown shape — leave as-is.
  return { data: field, changed: false }
}

// Find first comma that isn't inside (), [], <>, or "" — so `AccountStatus(Active/Disabled), account state`
// splits at the outer comma, not the paren-internal ones (there are none, but for safety).
function firstUnbalancedComma(s: string): number {
  let depth = 0
  let inQuote: '"' | "'" | null = null
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQuote) { if (c === inQuote) inQuote = null; continue }
    if (c === '"' || c === "'") { inQuote = c; continue }
    if (c === '(' || c === '[' || c === '<') depth++
    else if (c === ')' || c === ']' || c === '>') depth = Math.max(0, depth - 1)
    else if (c === ',' && depth === 0) return i
  }
  return -1
}

// -------------------- aggregate flattening --------------------

interface AppAggregate {
  name?: string
  root?: string
  entities?: Array<Record<string, unknown>>
  value_objects?: Array<Record<string, unknown>>
  invariants?: unknown
  notes?: unknown
  relationships?: unknown
  [k: string]: unknown
}

function flattenAggregates(data: Record<string, unknown>): { data: Record<string, unknown>; changed: boolean } {
  const dm = data.domain_model
  if (!isRecord(dm)) return { data, changed: false }
  const aggregates = dm.aggregates
  if (!Array.isArray(aggregates) || aggregates.length === 0) return { data, changed: false }

  const existingEntities = Array.isArray(dm.entities) ? [...dm.entities] : []
  const newEntities: Array<Record<string, unknown>> = existingEntities.filter(isRecord)

  for (const agg of aggregates as AppAggregate[]) {
    if (!isRecord(agg)) continue
    const rootName = typeof agg.root === 'string' ? agg.root : undefined
    const aggEntities = Array.isArray(agg.entities) ? agg.entities.filter(isRecord) as Array<Record<string, unknown>> : []
    if (!rootName || aggEntities.length === 0) continue

    // Enrich root entity with aggregate metadata (members list, invariants, notes, relationships).
    const memberNames = aggEntities
      .map(e => (typeof e.name === 'string' ? e.name : ''))
      .filter(n => n && n !== rootName)

    for (const ent of aggEntities) {
      const enriched: Record<string, unknown> = { ...ent }
      if (ent.name === rootName) {
        if (memberNames.length) enriched.aggregates = memberNames
        if (agg.invariants !== undefined && enriched.invariants === undefined) enriched.invariants = agg.invariants
        if (agg.notes !== undefined && enriched.notes === undefined) enriched.notes = agg.notes
        if (Array.isArray(agg.relationships) && agg.relationships.length > 0) {
          const existingRel = Array.isArray(enriched.relationships) ? enriched.relationships : []
          enriched.relationships = [...existingRel, ...agg.relationships]
        }
      }
      newEntities.push(enriched)
    }
  }

  const newDm: Record<string, unknown> = { ...dm, entities: newEntities }
  delete newDm.aggregates
  return { data: { ...data, domain_model: newDm }, changed: true }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

registerMigration(migration)
export {}
