// Workbench persistence — lives at `<project.path>/.dcddp-workbenches.json`.
// Chosen storage location (per audit decision 1B, 2026-08-13): shareable via VCS
// with the rest of the project. Users who want them personal can gitignore the file.

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface Workbench {
  name: string
  nodeIds: string[]                    // which node ids are displayed on canvas
  viewMode: 'graph' | 'tree'
  rootNodeId?: string                  // tree view only
  treeRels?: string[]                  // rels considered "tree edges" (empty/undefined = all)
}

export interface WorkbenchStore {
  workbenches: Workbench[]
  currentWorkbench: string | null
}

const FILE_NAME = '.dcddp-workbenches.json'

export async function loadWorkbenchStore(projectPath: string): Promise<WorkbenchStore> {
  const path = join(projectPath, FILE_NAME)
  try {
    const text = await readFile(path, 'utf-8')
    const parsed = JSON.parse(text) as Partial<WorkbenchStore>
    return {
      workbenches: Array.isArray(parsed.workbenches) ? parsed.workbenches : [],
      currentWorkbench: parsed.currentWorkbench ?? null,
    }
  } catch {
    return { workbenches: [], currentWorkbench: null }
  }
}

export async function saveWorkbenchStore(projectPath: string, store: WorkbenchStore): Promise<void> {
  const path = join(projectPath, FILE_NAME)
  await writeFile(path, JSON.stringify(store, null, 2) + '\n', 'utf-8')
}
