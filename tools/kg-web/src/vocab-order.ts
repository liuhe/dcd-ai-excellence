// Helpers to sort groups/entries by vocabulary registry order (canonical display order).
// The order arrays come from `vocab.nodeKinds` / `vocab.relKinds` — see the ordering
// convention at the top of core/src/vocabulary.ts.

export function rankOf(order: string[]): (key: string) => number {
  const m = new Map<string, number>()
  order.forEach((k, i) => m.set(k, i))
  return (k) => m.get(k) ?? Number.MAX_SAFE_INTEGER
}

export function orderedEntries<V>(map: Map<string, V>, order: string[]): [string, V][] {
  const rank = rankOf(order)
  return [...map.entries()].sort(([a], [b]) => rank(a) - rank(b))
}
