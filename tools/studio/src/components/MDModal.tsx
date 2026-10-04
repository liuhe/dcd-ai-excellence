import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import Markdown from 'react-markdown'
import type { Components } from 'react-markdown'

type OpenMD = (url: string) => void
const MDModalCtx = createContext<OpenMD | null>(null)

export function useOpenMD(): OpenMD {
  const fn = useContext(MDModalCtx)
  if (!fn) throw new Error('useOpenMD must be used inside MDModalProvider')
  return fn
}

// 把 url 中的 dirname 取出来当 basePath，用于解析 md 内的相对链接。
function dirOf(url: string): string {
  const i = url.lastIndexOf('/')
  return i >= 0 ? url.slice(0, i + 1) : '/'
}

function resolveHref(href: string | undefined, basePath: string): string | undefined {
  if (!href) return href
  if (/^[a-z]+:\/\//i.test(href) || href.startsWith('/') || href.startsWith('#') || href.startsWith('mailto:')) {
    return href
  }
  const rel = href.startsWith('./') ? href.slice(2) : href
  return basePath.replace(/\/+$/, '/') + rel
}

export function MDModalProvider({ children }: { children: ReactNode }) {
  const [url, setUrl] = useState<string | null>(null)
  const [content, setContent] = useState<string>('')
  const [err, setErr] = useState<string | null>(null)

  const openMD = useCallback<OpenMD>((u) => {
    setUrl(u)
    setContent('')
    setErr(null)
  }, [])

  const close = useCallback(() => setUrl(null), [])

  useEffect(() => {
    if (!url) return
    let cancelled = false
    fetch(url)
      .then(async r => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return r.text()
      })
      .then(t => { if (!cancelled) setContent(t) })
      .catch(e => { if (!cancelled) setErr(String(e.message || e)) })
    return () => { cancelled = true }
  }, [url])

  useEffect(() => {
    if (!url) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [url, close])

  const basePath = url ? dirOf(url) : '/'
  const components: Components = {
    a: ({ href, children: c }) => {
      const resolved = resolveHref(href, basePath)
      const isMd = !!resolved && /\.md(\?|#|$)/i.test(resolved) && !/^[a-z]+:\/\//i.test(resolved)
      if (isMd) {
        return (
          <a
            href={resolved}
            onClick={e => { e.preventDefault(); openMD(resolved!) }}
            className="text-blue-600 hover:underline cursor-pointer"
          >{c}</a>
        )
      }
      return <a href={resolved} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{c}</a>
    },
    h1: ({ children: c }) => <h1 className="text-2xl font-bold text-slate-900 mt-6 mb-3 pb-1 border-b border-slate-200 first:mt-0">{c}</h1>,
    h2: ({ children: c }) => <h2 className="text-xl font-bold text-slate-900 mt-5 mb-2 first:mt-0">{c}</h2>,
    h3: ({ children: c }) => <h3 className="text-lg font-semibold text-slate-900 mt-4 mb-2 first:mt-0">{c}</h3>,
    h4: ({ children: c }) => <h4 className="text-base font-semibold text-slate-900 mt-3 mb-1 first:mt-0">{c}</h4>,
    p: ({ children: c }) => <p className="text-slate-700 my-2 leading-relaxed">{c}</p>,
    ul: ({ children: c }) => <ul className="list-disc ml-6 my-2 space-y-1 text-slate-700">{c}</ul>,
    ol: ({ children: c }) => <ol className="list-decimal ml-6 my-2 space-y-1 text-slate-700">{c}</ol>,
    li: ({ children: c }) => <li className="leading-relaxed">{c}</li>,
    blockquote: ({ children: c }) => <blockquote className="border-l-4 border-slate-300 pl-4 my-3 text-slate-600 italic">{c}</blockquote>,
    code: ({ children: c, className }) => {
      const isBlock = (className || '').includes('language-')
      if (isBlock) return <code className={className}>{c}</code>
      return <code className="px-1.5 py-0.5 bg-slate-100 rounded text-[0.88em] font-mono text-slate-800">{c}</code>
    },
    pre: ({ children: c }) => <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg my-3 overflow-x-auto text-sm font-mono leading-snug">{c}</pre>,
    table: ({ children: c }) => <table className="border-collapse my-3 text-sm">{c}</table>,
    th: ({ children: c }) => <th className="border border-slate-300 px-3 py-1.5 bg-slate-50 text-left font-semibold">{c}</th>,
    td: ({ children: c }) => <td className="border border-slate-300 px-3 py-1.5">{c}</td>,
    hr: () => <hr className="my-5 border-slate-200" />,
    strong: ({ children: c }) => <strong className="font-semibold text-slate-900">{c}</strong>,
    em: ({ children: c }) => <em className="italic">{c}</em>,
    img: ({ src, alt }) => <img src={src} alt={alt} className="max-w-full my-2" />,
  }

  return (
    <MDModalCtx.Provider value={openMD}>
      {children}
      {url && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-6 overflow-y-auto"
          onClick={close}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-3xl w-full my-8 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-50">
              <div className="text-xs text-slate-500 font-mono truncate">{url}</div>
              <button
                onClick={close}
                className="text-slate-500 hover:text-slate-800 px-2 leading-none"
                aria-label="Close"
              >✕</button>
            </div>
            <div className="px-6 py-5 max-h-[75vh] overflow-y-auto">
              {err ? (
                <div className="text-red-600 text-sm">加载失败: {err}</div>
              ) : content ? (
                <Markdown components={components}>{content}</Markdown>
              ) : (
                <div className="text-slate-400 text-sm">加载中…</div>
              )}
            </div>
          </div>
        </div>
      )}
    </MDModalCtx.Provider>
  )
}
