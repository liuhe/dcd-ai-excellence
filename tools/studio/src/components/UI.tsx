import type { ReactNode } from 'react'

const BADGE_COLORS: Record<string, string> = {
  blue: 'bg-blue-100 text-blue-700 border-blue-200',
  green: 'bg-green-100 text-green-700 border-green-200',
  amber: 'bg-amber-100 text-amber-700 border-amber-200',
  purple: 'bg-purple-100 text-purple-700 border-purple-200',
  red: 'bg-red-100 text-red-700 border-red-200',
  pink: 'bg-pink-100 text-pink-700 border-pink-200',
  teal: 'bg-teal-100 text-teal-700 border-teal-200',
  gray: 'bg-gray-100 text-gray-700 border-gray-200',
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
  orange: 'bg-orange-100 text-orange-700 border-orange-200',
  cyan: 'bg-cyan-100 text-cyan-700 border-cyan-200',
}

export function Badge({ children, color = 'gray' }: { children: ReactNode; color?: string }) {
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded border ${BADGE_COLORS[color] || BADGE_COLORS.gray}`}>
      {children}
    </span>
  )
}

export function Card({ children, className = '', compact = false, onClick }: { children: ReactNode; className?: string; compact?: boolean; onClick?: () => void }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm ${compact ? 'p-3' : 'p-5'} ${className}`} onClick={onClick}>
      {children}
    </div>
  )
}

export function H3({ children }: { children: ReactNode }) {
  return <h3 className="text-xs font-semibold text-slate-400 uppercase mb-2">{children}</h3>
}

export interface Doc { name?: string; type?: string; path?: string }

// 扩展文档区：docs 列表里的图片 / 文章；路径相对该节点细节文件所在目录。
export function DocsSection({ docs, base }: { docs: unknown; base: string }) {
  const list = Array.isArray(docs) ? (docs as Doc[]).filter(d => d && typeof d === 'object') : []
  const hasDocs = list.length > 0
  const resolve = (p?: string) => !p ? '' : /^[a-z]+:\/\//i.test(p) || p.startsWith('/') ? p : base + (p.startsWith('./') ? p.slice(2) : p)
  const images = list.filter(d => d.type === 'image' || d.type === '图片')
  const articles = list.filter(d => d.type === 'article' || d.type === '文章')
  return (
    <div className="border border-dashed border-slate-200 rounded-xl p-4">
      <H3>扩展文档{hasDocs ? ` (${list.length})` : ''}</H3>
      {!hasDocs && <p className="text-xs text-slate-300 italic">在模型文件中添加 docs 字段，可附加图片或文章</p>}
      {images.map((doc, i) => (
        <div key={`img-${i}`} className="mb-3">
          <p className="text-xs text-slate-500 mb-1">{doc.name}</p>
          <img src={resolve(doc.path)} alt={doc.name} className="max-w-full rounded border border-slate-200" />
        </div>
      ))}
      {articles.length > 0 && (
        <div className="space-y-1">
          {articles.map((doc, i) => (
            <div key={`art-${i}`} className="flex items-center gap-2 text-sm">
              <span className="text-slate-400">📄</span>
              <a href={resolve(doc.path)} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{doc.name}</a>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function Empty() {
  return (
    <Card>
      <p className="text-slate-500 text-center py-8">选择左侧树中的节点查看详情</p>
    </Card>
  )
}
