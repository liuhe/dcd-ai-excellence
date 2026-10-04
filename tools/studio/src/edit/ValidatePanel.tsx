import { useState } from 'react'
import { useGraph } from '../graph/store'
import { fetchValidate, type Finding } from '../graph/api'
import { Ref } from '../components/Ref'

export function ValidateButton() {
  const { project, canEdit } = useGraph()
  const [open, setOpen] = useState(false)
  const [findings, setFindings] = useState<Finding[] | null>(null)
  const [busy, setBusy] = useState(false)
  if (!canEdit) return null
  const run = async () => { setBusy(true); try { setFindings((await fetchValidate(project)).findings); setOpen(true) } finally { setBusy(false) } }
  const errors = findings?.filter(f => f.severity === 'error').length ?? 0
  return (
    <>
      <button onClick={run} disabled={busy} className="text-xs md:text-sm text-slate-500 hover:text-slate-700 px-2 md:px-3 py-1 rounded hover:bg-slate-100 whitespace-nowrap">
        {busy ? '校验中…' : findings ? `校验 (${errors} 错误)` : '校验'}
      </button>
      {open && findings && (
        <div className="fixed inset-y-0 right-0 z-40 w-full md:w-[28rem] bg-white border-l border-slate-200 shadow-xl flex flex-col">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <span className="font-semibold text-slate-800">校验结果：{errors} 错误，{findings.length - errors} 警告</span>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700">✕</button>
          </div>
          <div className="overflow-y-auto p-3 space-y-2 text-sm">
            {findings.length === 0 && <div className="text-green-700">✓ 没有问题</div>}
            {findings.map((f, i) => (
              <div key={i} className={`rounded p-2 border ${f.severity === 'error' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                <div className="text-xs font-mono text-slate-500">{f.code}{f.nodeId && <> · <Ref id={f.nodeId} /></>}</div>
                <div className="text-slate-700">{f.message}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
