// Projects management view. Not a route — modal-ish full-screen overlay triggered from header.

import { useState } from 'react'
import type { ProjectsConfig } from './api.ts'
import { addProject, deleteProject, setCurrentProject, scaffoldProject } from './api.ts'

interface Props {
  config: ProjectsConfig
  onChanged: (next: ProjectsConfig) => void
  onClose: () => void
}

export function SettingsView({ config, onChanged, onClose }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [addName, setAddName] = useState('')
  const [addPath, setAddPath] = useState('')
  const [scaffoldName, setScaffoldName] = useState('')
  const [scaffoldPath, setScaffoldPath] = useState('')

  const wrap = async (fn: () => Promise<ProjectsConfig>) => {
    setError(null)
    try { onChanged(await fn()) } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  return (
    <div className="settings">
      <div className="settings-panel">
        <div className="settings-header">
          <h2>Projects</h2>
          <button onClick={onClose} aria-label="Close">✕</button>
        </div>

        {error && <div className="error-bar">{error}</div>}

        <section>
          <h3>Existing projects</h3>
          {config.projects.length === 0 && <p className="muted">No projects yet.</p>}
          <ul className="project-list">
            {config.projects.map(p => (
              <li key={p.name} className={config.current === p.name ? 'current' : ''}>
                <div className="proj-main">
                  <div className="proj-name">
                    {p.name}
                    {config.current === p.name && <span className="badge">current</span>}
                  </div>
                  <div className="proj-path" title={p.path}>{p.path}</div>
                </div>
                <div className="proj-actions">
                  {config.current !== p.name && (
                    <button onClick={() => wrap(() => setCurrentProject(p.name))}>Switch to</button>
                  )}
                  <button className="danger" onClick={() => wrap(() => deleteProject(p.name))}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3>Add existing directory as project</h3>
          <div className="form-row">
            <input value={addName} placeholder="name (e.g. food-delivery)" onChange={e => setAddName(e.target.value)} />
            <input value={addPath} placeholder="absolute path to model root (e.g. /Users/x/proj/model)" onChange={e => setAddPath(e.target.value)} />
            <button
              disabled={!addName || !addPath}
              onClick={async () => {
                await wrap(() => addProject(addName, addPath))
                setAddName(''); setAddPath('')
              }}
            >Add</button>
          </div>
        </section>

        <section>
          <h3>Scaffold new empty model</h3>
          <div className="form-row">
            <input value={scaffoldName} placeholder="name" onChange={e => setScaffoldName(e.target.value)} />
            <input value={scaffoldPath} placeholder="absolute path (will be created)" onChange={e => setScaffoldPath(e.target.value)} />
            <button
              disabled={!scaffoldName || !scaffoldPath}
              onClick={async () => {
                await wrap(() => scaffoldProject(scaffoldName, scaffoldPath))
                setScaffoldName(''); setScaffoldPath('')
              }}
            >Create</button>
          </div>
        </section>
      </div>
    </div>
  )
}
