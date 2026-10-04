// Persistent config for kg-web: known project list + current selection.
// Lives at <repo-root>/projects.local.json (gitignored, machine-local).

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface Project {
  name: string
  path: string   // absolute path to model root
}

export interface Config {
  projects: Project[]
  current: string | null   // project name
}

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const CONFIG_FILE = join(REPO_ROOT, 'projects.local.json')

const DEFAULT_CONFIG: Config = { projects: [], current: null }

export async function loadConfig(): Promise<Config> {
  try {
    const text = await readFile(CONFIG_FILE, 'utf-8')
    return JSON.parse(text) as Config
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export async function saveConfig(cfg: Config): Promise<void> {
  await writeFile(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8')
}

export async function currentProjectPath(): Promise<string | null> {
  const cfg = await loadConfig()
  if (!cfg.current) return null
  return cfg.projects.find(p => p.name === cfg.current)?.path ?? null
}
