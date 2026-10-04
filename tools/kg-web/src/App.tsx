// DCDDP kg-web — main orchestrator (server-backed).
// Workbench-based explorer: each workbench = named view (nodeIds + viewMode + tree root).
// Multiple workbenches per project, persisted at `<project>/.dcddp-workbenches.json`.
// Two view modes per workbench: graph (G6Canvas) or tree (TreeView with lazy expand).
// Model mutations (add/remove/connect/disconnect) still use the +/rel menus.

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import {
  fetchVocabulary, fetchProjects, fetchModel, setCurrentProject,
  fetchWorkbenches, createWorkbench, updateWorkbench, deleteWorkbench, setCurrentWorkbench,
  apiAddNode, apiRemoveNode, apiUpdateNode, apiConnect, apiDisconnect,
  scaffoldExistingProject,
  type Vocabulary, type ProjectsConfig, type GNode, type GEdge,
  type Workbench, type WorkbenchStore,
} from './api.ts'
import { G6Canvas } from './G6Canvas.tsx'
import { TreeView } from './TreeView.tsx'
import { type Selection } from './ActionBar.tsx'
import { BottomSheet } from './BottomSheet.tsx'
import { SettingsView } from './SettingsView.tsx'
import { SearchSheet } from './SearchSheet.tsx'
import { ExpandSheet } from './ExpandSheet.tsx'
import { TreeSettingsSheet } from './TreeSettingsSheet.tsx'
import { MenuSheet } from './MenuSheet.tsx'
import { AttrEditSheet } from './AttrEditSheet.tsx'
import { PickOrCreateSheet } from './PickOrCreateSheet.tsx'
import { PickAttrTargetSheet } from './PickAttrTargetSheet.tsx'
import { ValueTypesSheet } from './ValueTypesSheet.tsx'
import { VocabRefSheet } from './VocabRefSheet.tsx'
import { TextEditSheet } from './TextEditSheet.tsx'
import { menuForCanvas, menuForNode, type MenuAction, type MenuItem } from './menu.ts'

interface SheetState {
  title: string
  items: MenuItem[]
}

// URL params keep project + workbench selection shareable/refresh-safe.
// Read at mount to override server-persisted "current"; written on every switch.
function readUrlSelection(): { project: string | null; workbench: string | null } {
  const p = new URLSearchParams(window.location.search)
  return { project: p.get('project'), workbench: p.get('workbench') }
}

function writeUrlSelection(project: string | null, workbench: string | null) {
  const p = new URLSearchParams(window.location.search)
  if (project) p.set('project', project); else p.delete('project')
  if (workbench) p.set('workbench', workbench); else p.delete('workbench')
  const qs = p.toString()
  const next = window.location.pathname + (qs ? '?' + qs : '') + window.location.hash
  window.history.replaceState(null, '', next)
}

export function App() {
  const [vocab, setVocab] = useState<Vocabulary | null>(null)
  const [config, setConfig] = useState<ProjectsConfig | null>(null)
  const [modelRoot, setModelRoot] = useState<string | null>(null)
  const [nodes, setNodes] = useState<GNode[]>([])
  const [nodesData, setNodesData] = useState<Record<string, Record<string, unknown>>>({})
  const [missingRequired, setMissingRequired] = useState<Record<string, string[]>>({})
  const [edges, setEdges] = useState<GEdge[]>([])
  const [needsScaffold, setNeedsScaffold] = useState(false)
  const [needsMigration, setNeedsMigration] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [sheet, setSheet] = useState<SheetState | null>(null)

  // Workbench state
  const [workbenchStore, setWorkbenchStore] = useState<WorkbenchStore>({ workbenches: [], currentWorkbench: null })
  const [showSearch, setShowSearch] = useState(false)
  const [expandFor, setExpandFor] = useState<string | null>(null)
  const [showTreeSettings, setShowTreeSettings] = useState(false)
  const [attrEditFor, setAttrEditFor] = useState<{ kind: string; handle: string; name: string } | null>(null)
  // Text editor state — reused for both String (single-line) and free-text (multi-line).
  const [textEditFor, setTextEditFor] = useState<{
    kind: string; handle: string; name: string
    attrName: string; attrType: string; multiline: boolean; currentValue: string
  } | null>(null)
  // When a derived-scalar-field attr is being edited, we open a target-picker sheet.
  const [attrPickerFor, setAttrPickerFor] = useState<{
    kind: string; handle: string; name: string;
    attrName: string; targetKinds: string[]
  } | null>(null)
  const [showValueTypes, setShowValueTypes] = useState(false)
  const [showVocabRef, setShowVocabRef] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  // Pending add-related target selection: user picked a rel + target-kind; now they pick/create the target.
  const [pickTarget, setPickTarget] = useState<{
    sourceKind: string
    sourceHandle: string
    sourceName: string
    rel: string
    targetKind: string
  } | null>(null)

  // Canonical display order — declaration order in vocabulary.ts (see its ordering-convention header).
  const nodeKindOrder = useMemo(() => vocab?.nodeKinds.map(nk => nk.kind) ?? [], [vocab])
  const relKindOrder = useMemo(() => vocab?.relKinds.map(rk => rk.kind) ?? [], [vocab])

  const currentWorkbench: Workbench | null = useMemo(() => {
    const name = workbenchStore.currentWorkbench
    if (!name) return null
    return workbenchStore.workbenches.find(w => w.name === name) ?? null
  }, [workbenchStore])

  const displayedIds = useMemo(
    () => new Set(currentWorkbench?.nodeIds ?? []),
    [currentWorkbench],
  )

  const reloadModel = useCallback(async () => {
    try {
      const res = await fetchModel()
      setModelRoot(res.root)
      setNodes(res.nodes)
      setNodesData(res.nodesData ?? {})
      setMissingRequired(res.missingRequired ?? {})
      setEdges(res.edges)
      setNeedsScaffold(res.needsScaffold ?? false)
      setNeedsMigration(res.needsMigration ?? false)
      setError(null)
    } catch (e) {
      setModelRoot(null); setNodes([]); setEdges([]); setNodesData({}); setMissingRequired({}); setNeedsScaffold(false)
      const msg = e instanceof Error ? e.message : String(e)
      if (!msg.includes('no current project')) setError(msg)
    }
  }, [])

  const reloadWorkbenches = useCallback(async () => {
    try { setWorkbenchStore(await fetchWorkbenches()) }
    catch { setWorkbenchStore({ workbenches: [], currentWorkbench: null }) }
  }, [])

  const scaffoldCurrent = useCallback(async () => {
    if (!config?.current) return
    try {
      await scaffoldExistingProject(config.current)
      await reloadModel()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [config, reloadModel])

  // Initial load: vocabulary + projects + model + workbenches.
  // URL params (?project=&workbench=) take precedence over server-persisted "current".
  useEffect(() => {
    (async () => {
      try {
        const urlSel = readUrlSelection()
        const [v, cRaw] = await Promise.all([fetchVocabulary(), fetchProjects()])
        setVocab(v)
        let c = cRaw
        if (urlSel.project && urlSel.project !== c.current &&
            c.projects.some(p => p.name === urlSel.project)) {
          c = await setCurrentProject(urlSel.project)
        }
        setConfig(c)
        if (c.current) {
          await reloadModel()
          const store = await fetchWorkbenches()
          let effective = store
          if (urlSel.workbench && urlSel.workbench !== store.currentWorkbench &&
              store.workbenches.some(w => w.name === urlSel.workbench)) {
            effective = await setCurrentWorkbench(urlSel.workbench)
          }
          setWorkbenchStore(effective)
        } else {
          setShowSettings(true)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })()
  }, [reloadModel])

  // Keep URL params in sync with selection so refresh/share reflects current view.
  useEffect(() => {
    if (!config) return
    writeUrlSelection(config.current ?? null, workbenchStore.currentWorkbench)
  }, [config, workbenchStore.currentWorkbench])

  const switchProject = useCallback(async (name: string) => {
    try {
      const c = await setCurrentProject(name)
      setConfig(c)
      setSelection(null); setSheet(null)
      await reloadModel()
      await reloadWorkbenches()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [reloadModel, reloadWorkbenches])

  // -------------------- Workbench actions --------------------
  // Debounced auto-save for workbench mutations (nodeIds / viewMode / rootNodeId / treeRels)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingPatchRef = useRef<Partial<Workbench>>({})

  const scheduleSave = useCallback((patch: Partial<Workbench>) => {
    if (!currentWorkbench) return
    pendingPatchRef.current = { ...pendingPatchRef.current, ...patch }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      const wbName = currentWorkbench.name
      const patchToSend = pendingPatchRef.current
      pendingPatchRef.current = {}
      try {
        const store = await updateWorkbench(wbName, patchToSend)
        setWorkbenchStore(store)
      } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    }, 500)
  }, [currentWorkbench])

  // Local + debounced-remote update to displayedIds
  const setDisplayedIds = useCallback((updater: (prev: Set<string>) => Set<string>) => {
    if (!currentWorkbench) return
    const next = updater(new Set(currentWorkbench.nodeIds))
    const nextArr = [...next]
    // Optimistic local update
    setWorkbenchStore(prev => ({
      ...prev,
      workbenches: prev.workbenches.map(w => w.name === currentWorkbench.name ? { ...w, nodeIds: nextArr } : w),
    }))
    scheduleSave({ nodeIds: nextArr })
  }, [currentWorkbench, scheduleSave])

  const onCreateWorkbench = useCallback(async () => {
    const name = window.prompt('New workbench name:')
    if (!name) return
    try {
      const store = await createWorkbench(name)
      setWorkbenchStore(store)
      await setCurrentWorkbench(name).then(setWorkbenchStore)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [])

  const onRenameWorkbench = useCallback(async () => {
    if (!currentWorkbench) return
    const name = window.prompt('Rename workbench to:', currentWorkbench.name)
    if (!name || name === currentWorkbench.name) return
    try {
      const store = await updateWorkbench(currentWorkbench.name, { name })
      setWorkbenchStore(store)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [currentWorkbench])

  const onDeleteWorkbench = useCallback(async () => {
    if (!currentWorkbench) return
    if (!window.confirm(`Delete workbench "${currentWorkbench.name}"?`)) return
    try {
      const store = await deleteWorkbench(currentWorkbench.name)
      setWorkbenchStore(store)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [currentWorkbench])

  const onSwitchWorkbench = useCallback(async (name: string) => {
    try {
      const store = await setCurrentWorkbench(name)
      setWorkbenchStore(store)
      setSelection(null)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [])

  const onSetViewMode = useCallback((mode: 'graph' | 'tree') => {
    if (!currentWorkbench) return
    setWorkbenchStore(prev => ({
      ...prev,
      workbenches: prev.workbenches.map(w => w.name === currentWorkbench.name ? { ...w, viewMode: mode } : w),
    }))
    scheduleSave({ viewMode: mode })
  }, [currentWorkbench, scheduleSave])

  const onSetTreeRels = useCallback((rels: string[]) => {
    if (!currentWorkbench) return
    setWorkbenchStore(prev => ({
      ...prev,
      workbenches: prev.workbenches.map(w => w.name === currentWorkbench.name ? { ...w, treeRels: rels } : w),
    }))
    scheduleSave({ treeRels: rels })
  }, [currentWorkbench, scheduleSave])

  // -------------------- Cluster expansion --------------------
  const computeCluster = useCallback((seedId: string): Set<string> => {
    const result = new Set<string>([seedId])
    const seed = nodes.find(n => n.id === seedId)
    if (!seed || seed.kind !== 'entity') return result
    let root = seedId
    for (let hops = 0; hops < 32; hops++) {
      const incoming = edges.find(e => e.rel === 'aggregates' && e.to === root)
      if (!incoming) break
      root = incoming.from
      if (root === seedId) break
    }
    result.add(root)
    for (const e of edges) if (e.rel === 'aggregates' && e.from === root) result.add(e.to)
    const cluster = [...result]
    for (const eid of cluster) {
      for (const e of edges) if (e.rel === 'uses' && e.from === eid) result.add(e.to)
    }
    return result
  }, [nodes, edges])

  const addSeed = useCallback((nodeId: string) => {
    const cluster = computeCluster(nodeId)
    setDisplayedIds(prev => {
      const next = new Set(prev)
      for (const id of cluster) next.add(id)
      return next
    })
  }, [computeCluster, setDisplayedIds])

  const toggleDisplayed = useCallback((nodeId: string, show: boolean) => {
    setDisplayedIds(prev => {
      const next = new Set(prev)
      if (show) next.add(nodeId)
      else next.delete(nodeId)
      return next
    })
  }, [setDisplayedIds])

  // clearCanvas removed with header cleanup — user can use 👁 Hide per-node or delete workbench.

  // -------------------- Filtered nodes/edges for graph canvas --------------------
  const visibleNodes = useMemo(
    () => nodes.filter(n => displayedIds.has(n.id)),
    [nodes, displayedIds],
  )
  const visibleEdges = useMemo(
    () => edges.filter(e => displayedIds.has(e.from) && displayedIds.has(e.to)),
    [edges, displayedIds],
  )

  // -------------------- Selection --------------------
  const selectNode = useCallback((nodeId: string) => {
    const n = nodes.find(n => n.id === nodeId)
    if (!n) return
    setSelection({ type: 'node', kind: n.kind, handle: n.handle, name: n.name })
  }, [nodes])

  const selectEdge = useCallback((edgeId: string) => {
    const e = edges.find(e => e.id === edgeId)
    if (!e) return
    const fromN = nodes.find(n => n.id === e.from)
    if (!fromN) return
    setSelection({
      type: 'edge',
      from: `${fromN.kind}:${fromN.handle}`,
      rel: e.rel,
      toHandle: e.targetKind,
    })
  }, [nodes, edges])

  const deselect = () => setSelection(null)

  const selectedNodeId = useMemo(() =>
    selection?.type === 'node'
      ? nodes.find(n => n.kind === selection.kind && n.handle === selection.handle)?.id ?? null
      : null,
    [selection, nodes],
  )

  const openExpandForSelected = () => {
    if (selectedNodeId) setExpandFor(selectedNodeId)
  }

  const openAttrEditorForSelected = () => {
    if (selection?.type !== 'node') return
    setAttrEditFor({ kind: selection.kind, handle: selection.handle, name: selection.name })
  }

  // Compute which target-kinds a scalar attr drives via scalar-storage rels (for source kind).
  // E.g. BUC + 'actor' → ['business-worker', 'external-party', 'participant'] (from has-actor rel).
  // (Was `derivedFromField` in v5; v6 uses `scalarField` since has-actor migrated to scalar storage.)
  const derivedTargetKinds = useCallback((sourceKind: string, attrName: string): string[] => {
    const targets = new Set<string>()
    for (const rel of vocab?.relKinds ?? []) {
      for (const ep of rel.endpoints) {
        if (ep.source === sourceKind && ep.scalarField === attrName) {
          targets.add(ep.target)
        }
      }
    }
    return [...targets]
  }, [vocab])

  const setNodeAttrOn = useCallback(async (
    target: { kind: string; handle: string },
    attrName: string,
    value: string,
  ) => {
    setError(null)
    try {
      const trimmed = value.trim()
      if (trimmed === '') {
        await apiUpdateNode(target.kind, target.handle, {}, [attrName])
      } else {
        await apiUpdateNode(target.kind, target.handle, { [attrName]: trimmed }, [])
      }
      await reloadModel()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [reloadModel])

  // Called when user taps an attr in AttrEditSheet. Dispatches based on attr type + scalar-rel driver.
  // AttrEditSheet stays open in background; overlay sheets stack on top so user can return to attrs list after.
  const editAttr = useCallback((attrName: string) => {
    if (!attrEditFor) return
    // 1. scalar-rel driver → picker sheet (needs AttrEditSheet gone to avoid confusion)
    const targets = derivedTargetKinds(attrEditFor.kind, attrName)
    if (targets.length > 0) {
      setAttrPickerFor({ ...attrEditFor, attrName, targetKinds: targets })
      setAttrEditFor(null)
      return
    }
    const attrSpec = vocab?.nodeKinds.find(nk => nk.kind === attrEditFor.kind)?.attrs.find(a => a.name === attrName)
    const currentData = nodesData[`${attrEditFor.kind}:${attrEditFor.handle}`] ?? {}
    const currentValue = currentData[attrName]
    const currentStr = typeof currentValue === 'string' ? currentValue : ''
    const type = attrSpec?.type ?? 'String'
    // 2. text-shaped attr → TextEditSheet (free-text = multiline; String = single-line)
    const textyTypes = new Set(['String', 'free-text', 'Long', 'Integer', 'Double', 'LocalDateTime', 'Date'])
    if (textyTypes.has(type) || (attrSpec === undefined /* unknown → default single-line */)) {
      setTextEditFor({
        ...attrEditFor, attrName, attrType: type,
        multiline: type === 'free-text', currentValue: currentStr,
      })
      // AttrEditSheet intentionally stays open — closing TextEditSheet returns to it.
      return
    }
    // 3. fallback: plain prompt (Boolean or user-defined VT etc.)
    const raw = window.prompt(`Set ${attrName} (${type}):`, currentStr)
    if (raw === null) return
    setNodeAttrOn(attrEditFor, attrName, raw)
  }, [attrEditFor, vocab, nodesData, derivedTargetKinds, setNodeAttrOn])

  // -------------------- Mutation flows --------------------
  const openNewNodeSheet = () => {
    if (!vocab) return
    setSheet({ title: 'New node', items: menuForCanvas(vocab.nodeKinds) })
  }

  const openAddRelatedSheet = () => {
    if (!vocab || selection?.type !== 'node') return
    setSheet({
      title: `New related from ${selection.name}`,
      items: menuForNode(selection.kind, selection.handle, vocab.relKinds),
    })
  }

  // Add rel for a specific rel-kind from within AttrEditSheet.
  // - Implicit rel: "add" = create a child node whose id encodes this parent
  //   (e.g. participant `<party>.<name>`). Prompt for bare name, prepend parent handle.
  // - Explicit rel, 1 target-kind: pop PickOrCreateSheet directly.
  // - Explicit rel, multiple target-kinds: pop chooser first.
  const addRelForKind = useCallback((rel: string) => {
    if (!vocab || !attrEditFor) return
    const relSpec = vocab.relKinds.find(r => r.kind === rel)
    if (!relSpec) return

    if (relSpec.implicit) {
      const eps = relSpec.endpoints.filter(e => e.source === attrEditFor.kind)
      if (eps.length === 0) return
      const targetsList = [...new Set(eps.map(e => e.target))]
      const childKind = targetsList.length === 1 ? targetsList[0]
        : window.prompt(`Child kind (${targetsList.join(' / ')}):`, targetsList[0])
      if (!childKind || !targetsList.includes(childKind)) return
      const childInfo = vocab.nodeKinds.find(nk => nk.kind === childKind)
      const bare = childInfo?.inline ? '' : window.prompt(`New ${childKind} under ${attrEditFor.name} — name:`)
      if (bare === null || (!bare && !childInfo?.inline)) return
      const parentRef = `${attrEditFor.kind}:${attrEditFor.handle}`
      setError(null)
      ;(async () => {
        try {
          const created = await apiAddNode(childKind, bare ?? '', {}, parentRef)
          await reloadModel()
          // Show newly-created child in the workbench so user sees it right away.
          const createdId = created.wireId
          setTimeout(() => setDisplayedIds(prev => new Set(prev).add(createdId)), 0)
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
        }
      })()
      return
    }

    const targets = [...new Set(
      relSpec.endpoints
        .filter(e => e.source === attrEditFor.kind && !e.derived)
        .map(e => e.target),
    )]
    if (targets.length === 0) return
    if (targets.length === 1) {
      setPickTarget({
        sourceKind: attrEditFor.kind,
        sourceHandle: attrEditFor.handle,
        sourceName: attrEditFor.name,
        rel,
        targetKind: targets[0],
      })
    } else {
      setSheet({
        title: `${rel} — pick target kind`,
        items: targets.map(tk => ({
          label: `→ ${tk}`,
          action: {
            type: 'add-related' as const,
            sourceKind: attrEditFor.kind,
            sourceHandle: attrEditFor.handle,
            rel,
            targetKind: tk,
          },
        })),
      })
    }
  }, [vocab, attrEditFor, reloadModel, setDisplayedIds])

  // Delete edge from within AttrEditSheet (mirrors ExpandSheet's inline handler).
  const deleteEdgeInline = useCallback(async (edge: GEdge) => {
    const fromNode = nodes.find(n => n.id === edge.from)
    if (!fromNode) return
    const targetHandle = edge.to.substring(edge.to.indexOf(':') + 1)
    if (!window.confirm(`Delete this edge? (${fromNode.name} —${edge.rel}→ ${targetHandle})`)) return
    setError(null)
    try {
      const [toKind, toName] = edge.targetKind.split(/:(.+)/)
      await apiDisconnect(`${fromNode.kind}:${fromNode.handle}`, edge.rel, toKind, toName)
      await reloadModel()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [nodes, reloadModel])

  // Switch selection to another node (used by AttrEditSheet's tap-to-focus incoming/outgoing peer).
  const switchSelectionTo = useCallback((nodeId: string) => {
    const n = nodes.find(nn => nn.id === nodeId)
    if (!n) return
    setSelection({ type: 'node', kind: n.kind, handle: n.handle, name: n.name })
    setAttrEditFor({ kind: n.kind, handle: n.handle, name: n.name })
  }, [nodes])

  const executeAction = useCallback(async (action: MenuAction) => {
    setSheet(null)
    setError(null)
    try {
      let createdNodeId: string | null = null
      switch (action.type) {
        case 'add-node': {
          const nk = vocab?.nodeKinds.find(nk => nk.kind === action.kind)
          // Parent: the selected node if it can contain this kind; otherwise ask (root kinds need none).
          let parentRef: string | undefined
          if (selection?.type === 'node' && nk?.parents.includes(selection.kind)) {
            parentRef = `${selection.kind}:${selection.handle}`
          } else if (nk && !nk.view) {
            const p = window.prompt(`${action.kind} must live under ${nk.parents.join(' / ')}. Parent (id or <kind>:<name>):`)
            if (!p) return
            parentRef = p
          } else if (nk?.parents.length && window.confirm(`Place ${action.kind} at the top of the ${nk.view} view?\n(Cancel to pick a parent: ${nk.parents.join(' / ')})`) === false) {
            const p = window.prompt(`Parent (id or <kind>:<name>):`)
            if (!p) return
            parentRef = p
          }
          const name = nk?.inline ? '' : window.prompt(`Enter name${parentRef ? ` (under ${parentRef})` : ''}:`)
          if (name === null || (!name && !nk?.inline)) return
          const created = await apiAddNode(action.kind, name ?? '', {}, parentRef)
          createdNodeId = created.wireId
          break
        }
        case 'add-related': {
          // Open pick-or-create sheet instead of prompting. The actual connect happens in
          // pickTarget handlers below.
          const sourceNode = nodes.find(n => n.kind === action.sourceKind && n.handle === action.sourceHandle)
          setPickTarget({
            sourceKind: action.sourceKind,
            sourceHandle: action.sourceHandle,
            sourceName: sourceNode?.name ?? action.sourceHandle,
            rel: action.rel,
            targetKind: action.targetKind,
          })
          return
        }
        case 'remove-node': {
          if (!window.confirm(
            `⚠ PERMANENTLY DELETE ${action.kind} "${action.handle}" from the model?\n\n` +
            `This edits the YAML file. To just hide from this workbench, use 👁 Hide instead.`,
          )) return
          await apiRemoveNode(action.kind, action.handle)
          setDisplayedIds(prev => {
            const next = new Set(prev)
            next.delete(`${action.kind}:${action.handle}`)
            return next
          })
          break
        }
        case 'disconnect': {
          if (!window.confirm(`Delete edge (${action.rel})?`)) return
          await apiDisconnect(action.from, action.rel, action.toKind, action.toName)
          break
        }
      }
      setSelection(null)
      await reloadModel()
      if (createdNodeId) {
        setTimeout(() => setDisplayedIds(prev => new Set(prev).add(createdNodeId!)), 0)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [reloadModel, vocab, setDisplayedIds])

  const commitPickTarget = useCallback(async (targetNameOrHandle: string, createNew: boolean) => {
    if (!pickTarget) return
    setError(null)
    try {
      let targetHandle = targetNameOrHandle
      if (createNew) {
        const nk = vocab?.nodeKinds.find(nk => nk.kind === pickTarget.targetKind)
        let parentRef: string | undefined
        if (nk?.parents.includes(pickTarget.sourceKind)) parentRef = `${pickTarget.sourceKind}:${pickTarget.sourceHandle}`
        else if (nk && !nk.view) {
          // same container as the source when the kinds match; otherwise ask
          const src = nodes.find(n => n.kind === pickTarget.sourceKind && n.handle === pickTarget.sourceHandle)
          const srcParent = src?.parent ? nodes.find(n => n.id === src.parent) : undefined
          parentRef = srcParent && nk.parents.includes(srcParent.kind)
            ? `${srcParent.kind}:${srcParent.handle}`
            : (window.prompt(`${pickTarget.targetKind} must live under ${nk.parents.join(' / ')}. Parent (id or <kind>:<name>):`) ?? undefined)
          if (!parentRef) return
        }
        const created = await apiAddNode(pickTarget.targetKind, targetNameOrHandle, {}, parentRef)
        targetHandle = created.id
      }
      const fromArg = `${pickTarget.sourceKind}:${pickTarget.sourceHandle}`
      await apiConnect(fromArg, pickTarget.rel, pickTarget.targetKind, targetHandle, {})
      const createdNodeId = `${pickTarget.targetKind}:${targetHandle}`
      setPickTarget(null)
      setSelection(null)
      await reloadModel()
      setTimeout(() => setDisplayedIds(prev => new Set(prev).add(createdNodeId)), 0)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [pickTarget, reloadModel, setDisplayedIds])

  const deleteSelected = async () => {
    if (!selection) return
    if (selection.type === 'node') {
      await executeAction({ type: 'remove-node', kind: selection.kind, handle: selection.handle })
    } else {
      const [toKind, toName] = selection.toHandle.split(/:(.+)/)
      await executeAction({ type: 'disconnect', from: selection.from, rel: selection.rel, toKind, toName })
    }
  }

  const hideSelected = () => {
    if (selection?.type !== 'node') return
    const nodeId = nodes.find(n => n.kind === selection.kind && n.handle === selection.handle)?.id
    if (!nodeId) return
    setDisplayedIds(prev => {
      const next = new Set(prev)
      next.delete(nodeId)
      return next
    })
    setSelection(null)
  }

  if (!vocab || !config) {
    return <div className="loading">Loading…</div>
  }

  const canvasHasContent = visibleNodes.length > 0
  const viewMode = currentWorkbench?.viewMode ?? 'graph'

  return (
    <div className="app">
      <header>
        <select
          className="project-selector"
          value={config.current ?? ''}
          onChange={e => switchProject(e.target.value)}
          disabled={config.projects.length === 0}
          title="Project"
        >
          {config.projects.length === 0 && <option value="">(no projects)</option>}
          {config.projects.map(p => (
            <option key={p.name} value={p.name}>{p.name}</option>
          ))}
        </select>
        {modelRoot && !needsScaffold && (
          <select
            className="project-selector"
            value={workbenchStore.currentWorkbench ?? ''}
            onChange={e => onSwitchWorkbench(e.target.value)}
            disabled={workbenchStore.workbenches.length === 0}
            title="Workbench"
          >
            {workbenchStore.workbenches.length === 0 && <option value="">(no workbenches)</option>}
            {workbenchStore.workbenches.map(w => (
              <option key={w.name} value={w.name}>{w.name}</option>
            ))}
          </select>
        )}
        <div className="header-actions">
          {selection?.type === 'node' && (
            <button
              className="header-edit-btn"
              onClick={openAttrEditorForSelected}
              title={`Edit ${selection.kind} · ${selection.name}`}
              aria-label="Edit node"
            >✎</button>
          )}
          <button
            className={`header-menu-btn ${selection ? 'has-selection' : ''}`}
            onClick={() => setShowMenu(true)}
            title="Menu"
            aria-label="Menu"
          >⋯</button>
        </div>
      </header>

      {error && (
        <div className="error-bar">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <main className="canvas-wrap">
        {!config.current ? (
          <div className="canvas-placeholder">
            <p>No project selected.</p>
            <button onClick={() => setShowSettings(true)}>Add / choose a project</button>
          </div>
        ) : needsMigration ? (
          <div className="canvas-placeholder">
            <p>This model uses the pre-7.0 layout (business.yaml).<br/>Migrate it first:</p>
            <code>dcddp migrate -m {modelRoot}</code>
          </div>
        ) : needsScaffold ? (
          <div className="canvas-placeholder">
            <p>This project directory is empty.<br/>Scaffold a starter model here to begin.</p>
            <button className="primary" onClick={scaffoldCurrent}>Scaffold model</button>
          </div>
        ) : nodes.length === 0 ? (
          <div className="canvas-placeholder">
            <p>Empty model. Tap ＋ to add your first node.</p>
          </div>
        ) : !currentWorkbench ? (
          <div className="canvas-placeholder">
            <p>No workbench yet.<br/>Create one to start exploring the model.</p>
            <button className="primary" onClick={onCreateWorkbench}>＋ New workbench</button>
          </div>
        ) : !canvasHasContent ? (
          <div className="canvas-placeholder">
            <p>Workbench is empty.<br/>Search to add nodes.</p>
            <button className="primary" onClick={() => setShowSearch(true)}>🔍 Search nodes</button>
          </div>
        ) : viewMode === 'tree' ? (
          <TreeView
            nodes={nodes}
            edges={edges}
            workbenchNodeIds={displayedIds}
            treeRels={currentWorkbench.treeRels ?? []}
            nodeKindOrder={nodeKindOrder}
            relKindOrder={relKindOrder}
            missingRequired={missingRequired}
            onSelectNode={selectNode}
          />
        ) : (
          <G6Canvas
            nodes={visibleNodes}
            edges={visibleEdges}
            selectedId={selectedNodeId}
            onSelectNode={selectNode}
            onSelectEdge={selectEdge}
            onDeselect={deselect}
          />
        )}
      </main>

      {sheet && (
        <BottomSheet
          title={sheet.title}
          items={sheet.items}
          onSelect={executeAction}
          onClose={() => setSheet(null)}
        />
      )}

      {showSearch && (
        <SearchSheet
          allNodes={nodes}
          displayedIds={displayedIds}
          nodeKindOrder={nodeKindOrder}
          onPick={(id) => { addSeed(id); setShowSearch(false) }}
          onClose={() => setShowSearch(false)}
        />
      )}

      {expandFor && (
        <ExpandSheet
          nodeId={expandFor}
          allNodes={nodes}
          allEdges={edges}
          displayedIds={displayedIds}
          relKinds={vocab.relKinds}
          onToggle={toggleDisplayed}
          onDeleteEdge={async (edge) => {
            const fromNode = nodes.find(n => n.id === edge.from)
            if (!fromNode) return
            if (!window.confirm(`Delete this edge? (${fromNode.name} —${edge.rel}→ ${edge.to.split(':').slice(1).join(':')})`)) return
            setError(null)
            try {
              const [toKind, toName] = edge.targetKind.split(/:(.+)/)
              await apiDisconnect(`${fromNode.kind}:${fromNode.handle}`, edge.rel, toKind, toName)
              await reloadModel()
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e))
            }
          }}
          onClose={() => setExpandFor(null)}
        />
      )}

      {showTreeSettings && currentWorkbench && (
        <TreeSettingsSheet
          treeRels={currentWorkbench.treeRels ?? []}
          relKinds={vocab.relKinds}
          onSetTreeRels={onSetTreeRels}
          onClose={() => setShowTreeSettings(false)}
        />
      )}

      {pickTarget && (
        <PickOrCreateSheet
          targetKind={pickTarget.targetKind}
          rel={pickTarget.rel}
          sourceName={pickTarget.sourceName}
          candidates={nodes.filter(n => n.kind === pickTarget.targetKind)}
          onPickExisting={(handle) => commitPickTarget(handle, false)}
          onCreateNew={(name) => commitPickTarget(name, true)}
          onClose={() => setPickTarget(null)}
        />
      )}

      {attrEditFor && (
        <AttrEditSheet
          kind={attrEditFor.kind}
          name={attrEditFor.name}
          nodeId={`${attrEditFor.kind}:${attrEditFor.handle}`}
          attrs={vocab.nodeKinds.find(nk => nk.kind === attrEditFor.kind)?.attrs ?? []}
          currentValues={nodesData[`${attrEditFor.kind}:${attrEditFor.handle}`] ?? {}}
          missingRequired={missingRequired[`${attrEditFor.kind}:${attrEditFor.handle}`]}
          edges={edges}
          allNodes={nodes}
          relKinds={vocab.relKinds}
          onPickAttr={editAttr}
          onAddRel={addRelForKind}
          onDeleteEdge={deleteEdgeInline}
          onSelectOtherNode={switchSelectionTo}
          onClose={() => setAttrEditFor(null)}
        />
      )}

      {textEditFor && (
        <TextEditSheet
          sourceLabel={`${textEditFor.kind} · ${textEditFor.name}`}
          attrName={textEditFor.attrName}
          attrType={textEditFor.attrType}
          multiline={textEditFor.multiline}
          currentValue={textEditFor.currentValue}
          onSave={(newValue) => {
            const target = { kind: textEditFor.kind, handle: textEditFor.handle }
            setNodeAttrOn(target, textEditFor.attrName, newValue)
            setTextEditFor(null)
          }}
          onClose={() => setTextEditFor(null)}
        />
      )}

      {attrPickerFor && (
        <PickAttrTargetSheet
          sourceKind={attrPickerFor.kind}
          sourceName={attrPickerFor.name}
          attrName={attrPickerFor.attrName}
          targetKinds={attrPickerFor.targetKinds}
          allNodes={nodes}
          nodeKindOrder={nodeKindOrder}
          onPick={(value) => {
            const target = { kind: attrPickerFor.kind, handle: attrPickerFor.handle }
            setNodeAttrOn(target, attrPickerFor.attrName, value)
            setAttrPickerFor(null)
          }}
          onClose={() => setAttrPickerFor(null)}
        />
      )}

      {showMenu && (
        <MenuSheet
          selection={selection}
          hasWorkbench={!!currentWorkbench}
          viewMode={viewMode}
          canRenameWorkbench={!!currentWorkbench}
          onExpand={openExpandForSelected}
          onEditAttrs={openAttrEditorForSelected}
          onAddRelated={openAddRelatedSheet}
          onHide={hideSelected}
          onDelete={deleteSelected}
          onDeselect={deselect}
          onSearch={() => setShowSearch(true)}
          onSetViewMode={onSetViewMode}
          onOpenTreeSettings={() => setShowTreeSettings(true)}
          onCreateWorkbench={onCreateWorkbench}
          onRenameWorkbench={onRenameWorkbench}
          onDeleteWorkbench={onDeleteWorkbench}
          onNewNode={openNewNodeSheet}
          onOpenValueTypes={() => setShowValueTypes(true)}
          onOpenVocabRef={() => setShowVocabRef(true)}
          onOpenProjects={() => setShowSettings(true)}
          onClose={() => setShowMenu(false)}
        />
      )}

      {showValueTypes && (
        <ValueTypesSheet
          onClose={() => setShowValueTypes(false)}
          onError={(msg) => setError(msg)}
        />
      )}

      {showVocabRef && (
        <VocabRefSheet vocab={vocab} onClose={() => setShowVocabRef(false)} />
      )}

      {showSettings && (
        <SettingsView
          config={config}
          onChanged={(next) => {
            setConfig(next)
            reloadModel()
            reloadWorkbenches()
          }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
