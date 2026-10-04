// Stub: minimal path utilities for browser context.
export function resolve(...parts: string[]): string { return parts.join('/') }
export function join(...parts: string[]): string { return parts.join('/') }
export function dirname(p: string): string { return p.split('/').slice(0, -1).join('/') }
export function basename(p: string): string { return p.split('/').pop() || '' }
export default { resolve, join, dirname, basename }
