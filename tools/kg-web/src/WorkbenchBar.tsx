// Header-below toolbar: workbench selector + view-mode toggle + workbench mgmt actions.
// A workbench is a persisted view slice (which node ids are on canvas + graph/tree mode + tree root).

import type { Workbench } from './api.ts'

interface Props {
  workbenches: Workbench[]
  currentName: string | null
  currentWorkbench: Workbench | null
  onSwitch: (name: string) => void
  onCreate: () => void
  onRename: () => void
  onDelete: () => void
  onSetViewMode: (mode: 'graph' | 'tree') => void
  onOpenTreeSettings: () => void
}

export function WorkbenchBar({
  workbenches, currentName, currentWorkbench,
  onSwitch, onCreate, onRename, onDelete,
  onSetViewMode, onOpenTreeSettings,
}: Props) {
  return (
    <div className="workbench-bar">
      <select
        className="workbench-selector"
        value={currentName ?? ''}
        onChange={e => onSwitch(e.target.value)}
        disabled={workbenches.length === 0}
      >
        {workbenches.length === 0 && <option value="">(no workbenches)</option>}
        {workbenches.map(w => (
          <option key={w.name} value={w.name}>{w.name}</option>
        ))}
      </select>
      <button className="wb-btn" onClick={onCreate} title="New workbench">＋</button>
      {currentWorkbench && (
        <>
          <button className="wb-btn" onClick={onRename} title="Rename workbench">✎</button>
          <button className="wb-btn danger" onClick={onDelete} title="Delete workbench">🗑</button>
        </>
      )}

      {currentWorkbench && (
        <div className="view-mode-toggle" role="group" aria-label="View mode">
          <button
            className={`wb-btn ${currentWorkbench.viewMode === 'graph' ? 'active' : ''}`}
            onClick={() => onSetViewMode('graph')}
            title="Graph view"
          >
            ⬢ Graph
          </button>
          <button
            className={`wb-btn ${currentWorkbench.viewMode === 'tree' ? 'active' : ''}`}
            onClick={() => onSetViewMode('tree')}
            title="Tree view"
          >
            ⋯ Tree
          </button>
          {currentWorkbench.viewMode === 'tree' && (
            <button className="wb-btn" onClick={onOpenTreeSettings} title="Configure tree">⚙</button>
          )}
        </div>
      )}
    </div>
  )
}
