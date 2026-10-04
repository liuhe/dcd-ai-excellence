// Stub: viewer is browser-only, never calls fs functions.
export function readFileSync(): never { throw new Error('fs stub: not available in browser') }
export function writeFileSync(): never { throw new Error('fs stub: not available in browser') }
export function existsSync(): boolean { return false }
export default {}
