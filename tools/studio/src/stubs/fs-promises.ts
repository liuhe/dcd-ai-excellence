// Stub: viewer is browser-only, never calls fs functions.
// This file exists so Vite doesn't choke on @dcddp/core's yaml-io.ts + graph.ts imports.
const err = () => { throw new Error('fs stub: not available in browser') }
export const readFile = err
export const writeFile = err
export const access = err
export const mkdir = err
export const rm = err

// 7.0 core imports more of node:fs/promises (writer / validate paths); the browser never calls them.
const notInBrowser = (name: string) => async (): Promise<never> => { throw new Error(`${name} is not available in the browser`) }
export const rename = notInBrowser('rename')
export const readdir = notInBrowser('readdir')
export const stat = notInBrowser('stat')
export const rmdir = notInBrowser('rmdir')
