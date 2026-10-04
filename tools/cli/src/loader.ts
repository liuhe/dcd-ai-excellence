import { resolve } from 'node:path'
import { loadGraph, nodeReader, type Graph } from '@dcddp/core'

export async function loadFromDisk(modelPath: string): Promise<Graph> {
  const abs = resolve(modelPath)
  return loadGraph(abs, nodeReader(abs), { onWarn: () => {} })
}
