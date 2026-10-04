// Vocabulary-driven menu logic. Items are derived from the vocabulary passed in — never hardcoded.

import type { NodeKindInfo, RelKindInfo } from './api.ts'

export type MenuAction =
  | { type: 'add-node'; kind: string }
  | { type: 'add-related'; sourceKind: string; sourceHandle: string; rel: string; targetKind: string }
  | { type: 'remove-node'; kind: string; handle: string }
  | { type: 'disconnect'; from: string; rel: string; toKind: string; toName: string }

export interface MenuItem {
  label: string
  action?: MenuAction
  submenu?: MenuItem[]
  disabled?: boolean
}

// Sheet menu for the FAB (canvas — nothing selected): flat list of node kinds.
export function menuForCanvas(nodeKinds: NodeKindInfo[]): MenuItem[] {
  return nodeKinds.map(nk => ({
    label: nk.kind,
    action: { type: 'add-node', kind: nk.kind },
  }))
}

// Sheet menu for a selected node: pick a rel → pick a target kind.
// Uses per-endpoint filtering so target-kind options are exact for the given source-kind,
// and skips implicit rels (has-uc / has-rule) which aren't creatable via connect.
export function menuForNode(sourceKind: string, sourceHandle: string, relKinds: RelKindInfo[]): MenuItem[] {
  const relatable = relKinds
    .filter(r => !r.implicit)
    .map(r => {
      // Skip derived endpoints — they can't be created via connect (set the source's
      // underlying attribute instead via the attr editor).
      const targets = [...new Set(
        r.endpoints
          .filter(e => e.source === sourceKind && !e.derived)
          .map(e => e.target),
      )]
      return { rel: r, targets }
    })
    .filter(x => x.targets.length > 0)

  if (relatable.length === 0) {
    return [{ label: '(no rels allowed for this kind)', disabled: true }]
  }
  return relatable.map(({ rel, targets }) => ({
    label: rel.kind,
    submenu: targets.map(tk => ({
      label: `→ ${tk}`,
      action: {
        type: 'add-related' as const,
        sourceKind, sourceHandle, rel: rel.kind, targetKind: tk,
      },
    })),
  }))
}
