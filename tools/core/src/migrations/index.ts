// Model schema migrations. Each migration is registered here and applied in order when
// the CLI runs `dcddp migrate`.
//
// A migration operates on the raw YAML files (as text + parsed object) and returns edits:
// overwrite / create (newData or newText), or delete. 7.0+ migrations may also return a
// markdown report that the CLI writes to `migration-report.md`.

export interface FileHandle {
  relativePath: string  // e.g. "business.yaml", "applications/foo.yaml"
  absolutePath: string
  content: string
  data: Record<string, unknown>
}

export interface FileEdit {
  relativePath: string
  absolutePath: string
  newData?: Record<string, unknown>  // yaml-dumped by caller
  newText?: string                   // written verbatim (takes precedence over newData)
  delete?: true
}

export interface MigrationContext {
  files: FileHandle[]
  modelRoot: string
}

export interface MigrationResult {
  edits: FileEdit[]
  report?: string
}

export interface Migration {
  from: string
  to: string
  description: string
  run(ctx: MigrationContext): Promise<MigrationResult>
}

const registry: Migration[] = []

export function registerMigration(m: Migration): void {
  registry.push(m)
}

export function listMigrations(): readonly Migration[] {
  return registry
}

// Build the chain of migrations that carry a model from `from` to `to`.
export function planPath(from: string, to: string): Migration[] {
  if (from === to) return []
  const chain: Migration[] = []
  let cursor = from
  const visited = new Set<string>()
  while (cursor !== to) {
    if (visited.has(cursor)) throw new Error(`migration cycle detected at ${cursor}`)
    visited.add(cursor)
    const next = registry.find(m => m.from === cursor)
    if (!next) throw new Error(`no migration path from ${cursor} to ${to}`)
    chain.push(next)
    cursor = next.to
  }
  return chain
}
