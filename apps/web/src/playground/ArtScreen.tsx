import { useEffect, useRef, useState } from 'react'
import { STYLES, mountArtSheet, type ArtSheetHandle } from '@skyline/board'

/** `?seed=` picks the city seed (screenshots); `?styles=clean,toy` limits the columns. */
const params = new URLSearchParams(window.location.search)

/**
 * Art style page (#art, Milestone 6 step 1): every style direction drawn by the real renderer,
 * side by side. Reroll changes the seeded city details; drag to pan, scroll to zoom.
 */
export function ArtScreen() {
  const host = useRef<HTMLDivElement>(null)
  const sheet = useRef<ArtSheetHandle | null>(null)
  const [seed, setSeed] = useState(() => Number(params.get('seed') ?? 1))
  const [only, setOnly] = useState<string[]>(
    () => params.get('styles')?.split(',') ?? STYLES.map((s) => s.id),
  )

  useEffect(() => {
    const el = host.current!
    let cancelled = false
    const styles = STYLES.filter((s) => only.includes(s.id))
    const view = {
      focus: params.get('focus') === 'bottom' ? ('bottom' as const) : ('top' as const),
      zoom: Number(params.get('zoom') ?? 1),
    }
    void mountArtSheet(el, styles, seed, view).then((h) => {
      if (cancelled) h.destroy()
      else sheet.current = h
    })
    return () => {
      cancelled = true
      sheet.current?.destroy()
      sheet.current = null
    }
    // Rebuilt when the style selection changes; seed changes go through setSeed below.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [only])

  const reroll = () => {
    const next = Math.floor(Math.random() * 1_000_000) // cosmetic only
    setSeed(next)
    sheet.current?.setSeed(next)
  }

  return (
    <div className="relative h-full">
      <div
        ref={host}
        className="absolute inset-0 cursor-(--cur-grab) [&>canvas]:absolute [&>canvas]:inset-0"
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-center gap-3 p-4">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-panel/95 px-4 py-2.5 shadow-xl backdrop-blur">
          <a href="#playground" className="text-sm text-ink-muted hover:text-ink">
            ← Playground
          </a>
          <span className="mx-1 h-5 w-px bg-line" />
          <span className="text-sm font-bold text-accent">Art styles</span>
          {STYLES.map((s) => {
            const on = only.includes(s.id)
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={on}
                onClick={() => setOnly(on ? only.filter((x) => x !== s.id) : [...only, s.id])}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${on ? 'bg-accent text-table' : 'border border-line text-ink-muted hover:text-ink'}`}
              >
                {s.name}
              </button>
            )
          })}
          <span className="mx-1 h-5 w-px bg-line" />
          <button
            type="button"
            onClick={reroll}
            className="rounded-full bg-gold px-3.5 py-1 text-xs font-bold text-table hover:brightness-110 active:scale-95"
          >
            Reroll city
          </button>
          <span className="font-mono text-xs text-ink-muted">seed {seed}</span>
        </div>
      </div>
    </div>
  )
}
