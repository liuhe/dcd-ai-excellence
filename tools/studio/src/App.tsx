import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { buildTree, type Graph } from '@dcddp/core'
import { ModelTree } from './components/ModelTree'
import { DetailPanel } from './pages/DetailPanel'
import { GraphProvider } from './graph/store'
import { fetchModel, fetchProjects, fetchVocabulary, type Project, type ProjectsInfo, type Vocabulary } from './graph/api'
import { ValidateButton } from './edit/ValidatePanel'
import { SearchButton } from './components/Search'
import { useGraph } from './graph/store'
import { parseHash, hrefFor, isNodeId, type Route } from './route'
import { NavCtx, type Navigate } from './nav'

function App() {
  const [info, setInfo] = useState<ProjectsInfo | null>(null)
  const [project, setProject] = useState<string>('')
  const [graph, setGraph] = useState<Graph | null>(null)
  const [vocab, setVocab] = useState<Vocabulary | null>(null)
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  const [sidebarWidth, setSidebarWidth] = useState(256)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const mainRef = useRef<HTMLElement>(null)

  const navigate = useCallback<Navigate>((id, isNode) => {
    window.location.hash = hrefFor(id, isNode).slice(1)
    setDrawerOpen(false)
    mainRef.current?.scrollTo({ top: 0, behavior: 'auto' })
  }, [])

  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX, startW = sidebarWidth
    const onMove = (ev: MouseEvent) => setSidebarWidth(Math.max(180, Math.min(600, startW + ev.clientX - startX)))
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); document.body.style.cursor = ''; document.body.style.userSelect = '' }
    document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
  }, [sidebarWidth])

  const load = useCallback(async (p: Project, preserveNav = false) => {
    setLoadError(null)
    try {
      const g = await fetchModel(p.name)
      setGraph(g); setProject(p.name)
      const hash = window.location.hash.slice(1)
      const target = preserveNav && hash ? hash : '/business'
      window.history.replaceState(null, '', `?model=${encodeURIComponent(p.name)}#${target}`)
      setRoute(parseHash(`#${target}`))
    } catch (e) { setLoadError((e as Error).message) }
  }, [])

  // Projects: single-model server mode enters directly; otherwise show the picker (or ?model=).
  useEffect(() => {
    fetchVocabulary().then(setVocab).catch(() => setVocab(null))
    fetchProjects().then(i => {
      setInfo(i)
      const wanted = new URLSearchParams(window.location.search).get('model')
      const p = i.projects.find(x => x.name === wanted) ?? (i.single ? i.projects[0] : undefined)
      if (p) void load(p, true)
    }).catch(e => setLoadError(String(e)))
  }, [load])

  const tree = useMemo(() => graph ? buildTree(graph) : null, [graph])

  if (!graph || !tree) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="rounded-2xl p-16 text-center max-w-lg w-full bg-white shadow-sm border border-slate-200">
          <div className="text-5xl mb-4">📋</div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">DCDDP Model Viewer</h1>
          <p className="text-slate-500 mb-6">schema 7.0 建模查看器</p>
          {loadError && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">加载失败: {loadError}</div>}
          {info && info.projects.length > 0 ? (
            <div>
              <p className="text-slate-400 mb-3">选择模型</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {info.projects.map(m => (
                  <button key={`${m.name}:${m.path}`} className="px-4 py-2 bg-blue-50 text-blue-700 rounded-lg border border-blue-200 hover:bg-blue-100 hover:border-blue-300 transition text-sm font-medium" onClick={() => load(m)}>📁 {m.name}</button>
                ))}
              </div>
            </div>
          ) : <p className="text-slate-400">{info ? '未发现可用模型' : '加载中…'}</p>}
        </div>
      </div>
    )
  }

  const selectedTreeId = route.type === 'node' ? route.id : route.id

  return (
    <NavCtx.Provider value={navigate}>
      <GraphProvider project={project} initial={graph} vocab={vocab}>
        <div className="flex flex-col h-screen bg-slate-50" style={{ ['--sidebar-w' as string]: `${sidebarWidth}px` }}>
          <header className="bg-white border-b border-slate-200 sticky top-0 z-10 px-3 md:px-4 py-2.5 md:py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
              <button onClick={() => setDrawerOpen(o => !o)} className="md:hidden text-slate-600 hover:text-slate-900 p-1.5 -ml-1 rounded hover:bg-slate-100" aria-label="切换导航">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
              </button>
              <h1 className="text-base md:text-lg font-bold text-slate-800 whitespace-nowrap">DCDDP Viewer</h1>
              <span className="text-xs md:text-sm text-slate-400 bg-slate-100 px-2 py-0.5 rounded truncate min-w-0">📁 {project}</span>
            </div>
            <SearchButton />
            <ValidateButton />
            {!info?.single && (
              <button onClick={() => { setGraph(null); setProject(''); window.history.replaceState(null, '', window.location.pathname) }}
                className="text-xs md:text-sm text-slate-500 hover:text-slate-700 px-2 md:px-3 py-1 rounded hover:bg-slate-100 transition whitespace-nowrap">
                <span className="md:hidden">换</span><span className="hidden md:inline">换一个模型</span>
              </button>
            )}
          </header>
          <div className="flex flex-1 overflow-hidden relative">
            {drawerOpen && <div className="md:hidden absolute inset-0 z-20 bg-black/30" onClick={() => setDrawerOpen(false)} />}
            <aside className={`bg-white border-r border-slate-200 overflow-y-auto flex-shrink-0 absolute md:static inset-y-0 left-0 z-30 w-72 md:w-[var(--sidebar-w)] transition-transform md:transition-none shadow-xl md:shadow-none ${drawerOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
              <ModelTree roots={tree} selectedId={selectedTreeId} onSelect={id => navigate(id, isNodeId(id))} />
            </aside>
            <div className="hidden md:block w-1 cursor-col-resize hover:bg-blue-400 active:bg-blue-500 transition-colors flex-shrink-0" onMouseDown={handleResizeStart} />
            <main ref={mainRef} className="flex-1 overflow-y-auto overflow-x-hidden md:[min-width:600px]">
              <ErrorBanner />
              <div className="p-3 md:p-6"><DetailPanel route={route} /></div>
            </main>
          </div>
        </div>
      </GraphProvider>
    </NavCtx.Provider>
  )
}

function ErrorBanner() {
  const { error, setError } = useGraph()
  if (!error) return null
  return (
    <div className="m-3 md:mx-6 md:mt-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700 flex justify-between">
      <span>操作失败：{error}</span><button onClick={() => setError(null)} className="text-red-400 hover:text-red-700">✕</button>
    </div>
  )
}

export default App
