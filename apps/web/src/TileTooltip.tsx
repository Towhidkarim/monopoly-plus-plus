import { spaceInfo } from './spaceInfo.ts'

/** Floating card above the hovered tile. Positioned by the board via a ref transform. */
export function TileTooltip({ index }: { index: number }) {
  const info = spaceInfo(index)
  return (
    <div className="-translate-x-1/2 -translate-y-[calc(100%+18px)]">
      <div className="min-w-40 overflow-hidden rounded-lg border border-line bg-panel/95 shadow-xl shadow-black/40 backdrop-blur">
        {info.color && <div className="h-2" style={{ background: info.color }} />}
        <div className="px-3 py-2">
          <div className="text-sm font-semibold text-ink">{info.name}</div>
          <div className="text-xs text-ink-muted">
            {info.kind} · #{index}
          </div>
        </div>
      </div>
    </div>
  )
}
