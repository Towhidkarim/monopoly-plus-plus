import { useState, type PointerEvent } from 'react'
import { fmtMoney } from './format.ts'

export interface WorthSeries {
  name: string
  /** The player's own color: a line keeps its player's color everywhere. */
  color: string
  values: readonly number[]
}

const W = 640
const H = 220
const PAD = { top: 14, right: 92, bottom: 26, left: 52 }

/**
 * Net worth by round, one 2px line per player in their color, labelled at its end (so identity
 * never rests on color alone). Hover shows a crosshair and every player's value that round.
 * `mark` draws the turning point as a dashed rule. Inline SVG, scales to its container.
 */
export function WorthChart({
  series,
  rounds,
  mark,
}: {
  series: readonly WorthSeries[]
  rounds: readonly number[]
  mark: number | null
}) {
  const [hover, setHover] = useState<number | null>(null)
  const n = rounds.length
  // The axis spans the data (lines compare trends, so no zero baseline), in round steps.
  const all = series.flatMap((s) => s.values)
  const max = Math.max(1, ...all)
  const min = Math.min(max, ...all)
  const step = niceCeil(Math.max(1, (max - min) / 2))
  const lo = Math.max(0, Math.floor(min / step) * step)
  const top = Math.max(lo + step, Math.ceil(max / step) * step)
  const x = (i: number) => PAD.left + (n <= 1 ? 0 : (i / (n - 1)) * (W - PAD.left - PAD.right))
  const y = (v: number) => PAD.top + (1 - (v - lo) / (top - lo)) * (H - PAD.top - PAD.bottom)
  const ticks = [lo, (lo + top) / 2, top]
  const markAt = mark === null ? -1 : rounds.indexOf(mark)

  const move = (e: PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const fx = ((e.clientX - r.left) / r.width) * W
    const i = Math.round(((fx - PAD.left) / (W - PAD.left - PAD.right)) * (n - 1))
    setHover(Math.min(n - 1, Math.max(0, i)))
  }

  // End labels, nudged apart so they never overlap.
  const ends = series.map((s, k) => ({ k, y: y(s.values.at(-1) ?? 0) })).toSorted((a, b) => a.y - b.y)
  for (let i = 1; i < ends.length; i++) ends[i]!.y = Math.max(ends[i]!.y, ends[i - 1]!.y + 14)
  const endY = new Map(ends.map((e) => [e.k, e.y]))

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="Net worth by round">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.07)" />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="fill-ink-muted text-[11px]">
              {fmtMoney(t)}
            </text>
          </g>
        ))}
        <text x={PAD.left} y={H - 6} className="fill-ink-muted text-[11px]">
          Round {rounds[0]}
        </text>
        <text x={W - PAD.right} y={H - 6} textAnchor="end" className="fill-ink-muted text-[11px]">
          Round {rounds.at(-1)}
        </text>
        {markAt > 0 && (
          <g>
            <line
              x1={x(markAt)}
              x2={x(markAt)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke="var(--color-accent)"
              strokeDasharray="3 4"
              opacity={0.7}
            />
            <text x={x(markAt) + 5} y={PAD.top + 9} className="fill-accent text-[11px] font-bold">
              Turning point
            </text>
          </g>
        )}
        {series.map((s, k) => (
          <g key={s.name}>
            <polyline
              points={s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <circle
              cx={x(n - 1)}
              cy={y(s.values.at(-1) ?? 0)}
              r={4}
              fill={s.color}
              stroke="#121c33"
              strokeWidth={2}
            />
            <text x={x(n - 1) + 10} y={(endY.get(k) ?? 0) + 4} className="fill-ink text-[12px] font-bold">
              {s.name}
            </text>
          </g>
        ))}
        {hover !== null && (
          <g pointerEvents="none">
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke="rgba(255,255,255,0.3)"
            />
            {series.map((s) => (
              <circle
                key={s.name}
                cx={x(hover)}
                cy={y(s.values[hover] ?? 0)}
                r={4}
                fill={s.color}
                stroke="#121c33"
                strokeWidth={2}
              />
            ))}
          </g>
        )}
        <rect
          x={PAD.left}
          y={0}
          width={W - PAD.left - PAD.right}
          height={H}
          fill="transparent"
          onPointerMove={move}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-1 rounded-xl border border-line bg-panel-2 px-3 py-2 text-xs shadow-panel"
          style={{
            left: `${(x(hover) / W) * 100}%`,
            transform: x(hover) > W / 2 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)',
          }}
        >
          <div className="mb-1 font-bold text-ink-muted">Round {rounds[hover]}</div>
          {series
            .map((s) => ({ s, v: s.values[hover] ?? 0 }))
            .toSorted((a, b) => b.v - a.v)
            .map(({ s, v }) => (
              <div key={s.name} className="flex items-center gap-2">
                <span className="size-2 rounded-full" style={{ background: s.color }} />
                <span className="flex-1">{s.name}</span>
                <span className="font-bold tabular-nums">{fmtMoney(v)}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

/** A round axis maximum: 1, 2 or 5 times a power of ten, at or above `v`. */
function niceCeil(v: number): number {
  const p = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p
  return 10 * p
}
