// Path / URL helpers shared by loader, viewer, and CLI.

export function resolveDetailPath(base: string, ref: string): string {
  const cleaned = ref.startsWith('./') ? ref.slice(2) : ref
  return `${base}/${cleaned}`
}

// 提取 detail 文件所在目录（带尾斜杠），用作 markdown 相对链接基准。
export function detailDir(containingBase: string, detailPath: string): string {
  const full = resolveDetailPath(containingBase, detailPath)
  return full.replace(/\/[^/]+$/, '/')
}

// 相对 markdown 链接解析：相对路径以 basePath 为基（模型根），
// 绝对 URL / 锚点 / mailto / 已含 scheme 的保持原样。
export function resolveMarkdownHref(href: string | undefined, basePath: string | undefined): string | undefined {
  if (!href) return href
  if (/^[a-z]+:\/\//i.test(href) || href.startsWith('/') || href.startsWith('#') || href.startsWith('mailto:')) {
    return href
  }
  if (!basePath) return href
  const rel = href.startsWith('./') ? href.slice(2) : href
  return basePath.replace(/\/+$/, '/') + rel
}
