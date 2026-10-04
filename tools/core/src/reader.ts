// Model file access abstraction. The loader only needs to read text and list YAML files;
// CLI / servers use the node implementation, browsers can supply a fetch-based one backed
// by a manifest.

export interface ModelReader {
  readText(relPath: string): Promise<string>
  exists(relPath: string): Promise<boolean>
  // Recursively list *.yaml / *.yml under relDir, as paths relative to the model root,
  // sorted. Returns [] if the directory does not exist.
  listYaml(relDir: string): Promise<string[]>
}

export function nodeReader(root: string): ModelReader {
  return {
    async readText(rel) {
      const { readFile } = await import('node:fs/promises')
      const { join } = await import('node:path')
      return readFile(join(root, rel), 'utf-8')
    },
    async exists(rel) {
      const { access } = await import('node:fs/promises')
      const { join } = await import('node:path')
      try { await access(join(root, rel)); return true } catch { return false }
    },
    async listYaml(relDir) {
      const { readdir, stat } = await import('node:fs/promises')
      const { join, relative } = await import('node:path')
      const out: string[] = []
      const base = join(root, relDir)
      async function recur(dir: string): Promise<void> {
        let entries: string[]
        try { entries = await readdir(dir) } catch { return }
        for (const name of entries.sort()) {
          const full = join(dir, name)
          const st = await stat(full)
          if (st.isDirectory()) await recur(full)
          else if (name.endsWith('.yaml') || name.endsWith('.yml')) out.push(relative(root, full))
        }
      }
      await recur(base)
      return out
    },
  }
}
