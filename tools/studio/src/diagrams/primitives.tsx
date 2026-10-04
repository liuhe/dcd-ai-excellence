// Shared SVG primitives for the use-case family of diagrams.

export function ActorFigure({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <g>
      <circle cx={x} cy={y - 24} r={10} fill="none" stroke="#3b82f6" strokeWidth={1.5} />
      <line x1={x} y1={y - 14} x2={x} y2={y + 6} stroke="#3b82f6" strokeWidth={1.5} />
      <line x1={x - 14} y1={y - 6} x2={x + 14} y2={y - 6} stroke="#3b82f6" strokeWidth={1.5} />
      <line x1={x} y1={y + 6} x2={x - 12} y2={y + 22} stroke="#3b82f6" strokeWidth={1.5} />
      <line x1={x} y1={y + 6} x2={x + 12} y2={y + 22} stroke="#3b82f6" strokeWidth={1.5} />
      <text x={x} y={y + 40} textAnchor="middle" fontSize={12} fill="#334155" fontWeight={500}>{label}</text>
    </g>
  )
}

export function UseCaseOval({ cx, cy, label, subLabels }: { cx: number; cy: number; label: string; subLabels?: string[] }) {
  const rx = 120, ry = 24
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#eff6ff" stroke="#3b82f6" strokeWidth={1.5} />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize={12} fill="#1e40af" fontWeight={600}>{label}</text>
      {subLabels?.map((sl, i) => (
        <text key={i} x={cx} y={cy + ry + 14 + i * 14} textAnchor="middle" fontSize={10} fill="#64748b">‹{sl}›</text>
      ))}
    </g>
  )
}

export type Pt = { x: number; y: number }
export const pathOf = (points: Pt[]) => points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ')
export const midOf = (points: Pt[]) => points[Math.floor(points.length / 2)]
