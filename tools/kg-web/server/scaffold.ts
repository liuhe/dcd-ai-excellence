// Scaffold a new empty 7.0 model directory (delegates to core).
import { scaffoldModel } from '@dcddp/core'

export async function scaffoldNewModel(rootPath: string): Promise<void> {
  const name = rootPath.split('/').filter(Boolean).pop() ?? 'model'
  await scaffoldModel(rootPath, name)
}
