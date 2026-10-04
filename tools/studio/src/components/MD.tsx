import Markdown from 'react-markdown'
import type { Components } from 'react-markdown'
import { resolveMarkdownHref as resolveHref } from '@dcddp/core'
import { useOpenMD } from './MDModal'

// 内联渲染 markdown：链接可点击 + 不引入块边距。
// 适合 rule.content / notes / summary 这类文本字段。
//
// `basePath`（可选）：模型根的相对 URL（如 `vchat-p2p-native/`），
// 用于解析 markdown 中的相对链接（如 `./vchat-client/foo.md` → `vchat-p2p-native/vchat-client/foo.md`，
// 最终由浏览器以当前 document URL 为基准 resolve）。
// 约定：相对路径**相对模型根目录**，不是相对 YAML 文件位置。

const baseComponents = (basePath: string | undefined, openMD: (url: string) => void): Components => ({
  a: ({ href, children: c }) => {
    const resolved = resolveHref(href, basePath)
    const isMd = !!resolved && /\.md(\?|#|$)/i.test(resolved) && !/^[a-z]+:\/\//i.test(resolved)
    if (isMd) {
      return (
        <a href={resolved}
           onClick={e => { e.preventDefault(); openMD(resolved!) }}
           className="text-blue-600 hover:underline cursor-pointer">{c}</a>
      )
    }
    return (
      <a href={resolved} target="_blank" rel="noopener noreferrer"
         className="text-blue-600 hover:underline">{c}</a>
    )
  },
  code: ({ children: c }) => (
    <code className="px-1 py-0.5 bg-slate-100 rounded text-[0.85em]">{c}</code>
  ),
  strong: ({ children: c }) => <strong className="font-semibold">{c}</strong>,
  em: ({ children: c }) => <em className="italic">{c}</em>,
})

// 内联模式：p 当 span 用，无块边距
const inlineComponents = (basePath: string | undefined, openMD: (url: string) => void): Components => ({
  ...baseComponents(basePath, openMD),
  p: ({ children: c }) => <span>{c}</span>,
})

// 块模式：保留段落、列表，紧凑间距
const blockComponents = (basePath: string | undefined, openMD: (url: string) => void): Components => ({
  ...baseComponents(basePath, openMD),
  p: ({ children: c }) => <p className="m-0 [&:not(:last-child)]:mb-1.5">{c}</p>,
  ul: ({ children: c }) => <ul className="list-disc ml-5 my-1 space-y-0.5">{c}</ul>,
  ol: ({ children: c }) => <ol className="list-decimal ml-5 my-1 space-y-0.5">{c}</ol>,
  li: ({ children: c }) => <li className="m-0">{c}</li>,
})

// 判断文本是否需要块级渲染（含列表 / 多段 / 标题）
function needsBlockMode(text: string): boolean {
  if (/\n\s*\n/.test(text)) return true                      // 空行 = 多段
  if (/(^|\n)\s*[-*+]\s/.test(text)) return true             // 无序列表
  if (/(^|\n)\s*\d+\.\s/.test(text)) return true             // 有序列表
  if (/(^|\n)\s*#/.test(text)) return true                   // 标题
  return false
}

export function MD({ children, basePath }: { children: string; basePath?: string }) {
  const openMD = useOpenMD()
  if (!children) return null
  const block = needsBlockMode(children)
  if (block) {
    return (
      <div className="w-full">
        <Markdown components={blockComponents(basePath, openMD)}>{children}</Markdown>
      </div>
    )
  }
  return <Markdown components={inlineComponents(basePath, openMD)}>{children}</Markdown>
}
