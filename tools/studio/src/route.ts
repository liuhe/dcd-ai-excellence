// Hash routes. Tree ids from core's buildTree map 1:1 onto routes:
//   groups / views:  #/<treeId>            e.g. #/business, #/app-domain:app-001, #/pkg:app-ucs:app-001:Auth
//   nodes:           #/n/<id>              e.g. #/n/ent-005

export type Route = { type: 'group'; id: string } | { type: 'node'; id: string }

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#\/?/, '')
  if (h.startsWith('n/')) return { type: 'node', id: decodeURIComponent(h.slice(2)) }
  return { type: 'group', id: decodeURIComponent(h) || 'business' }
}

export function hrefFor(treeIdOrNodeId: string, isNode: boolean): string {
  return isNode ? `#/n/${encodeURIComponent(treeIdOrNodeId)}` : `#/${encodeURIComponent(treeIdOrNodeId)}`
}

export function routeToTreeId(r: Route): string { return r.id }

const NODE_ID = /^[a-z]+-\d+$/
export function isNodeId(s: string): boolean { return NODE_ID.test(s) }
