import type { GraphIndex } from '../graph/index'

export const DDD_RELS = ['composition', 'associates', 'depends-on', 'implements', 'realizes'] as const

export interface BizRel { from: string; to: string; kind: string; cardinality?: string; via?: string; note?: string; bidirectional?: boolean }

// All DDD relationships between business-scoped entities (for the ER diagram / 关系 lists).
export function businessRelationships(ix: GraphIndex): BizRel[] {
  const out: BizRel[] = []
  for (const e of ix.g.edges) {
    if (!(DDD_RELS as readonly string[]).includes(e.rel)) continue
    if (!ix.isBusinessEntity(e.from) || !ix.isBusinessEntity(e.to)) continue
    const a = (e.attrs ?? {}) as Record<string, unknown>
    out.push({ from: e.from, to: e.to, kind: e.rel, cardinality: a.cardinality as string | undefined, via: a.via as string | undefined, note: a.note as string | undefined, bidirectional: a.bidirectional as boolean | undefined })
  }
  return out
}

// Roles an entity plays (implements → role nodes, or business role-archetype entities).
export const rolesOf = (ix: GraphIndex, id: string) => ix.targets(id, 'implements')
// Business entity an app entity realizes.
export const businessEntityOf = (ix: GraphIndex, id: string) => ix.targets(id, 'realizes')[0]
