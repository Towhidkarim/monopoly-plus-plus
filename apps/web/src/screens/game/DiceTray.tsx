import { useLayoutEffect, useRef, useState } from 'react'
import { TIMINGS } from '../../game/timings.ts'

const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [0, 2],
    [2, 0],
    [2, 2],
  ],
  5: [
    [0, 0],
    [0, 2],
    [1, 1],
    [2, 0],
    [2, 2],
  ],
  6: [
    [0, 0],
    [0, 2],
    [1, 0],
    [1, 2],
    [2, 0],
    [2, 2],
  ],
}

/** Faces flashed while a die tumbles, before it settles on the real value. */
const FLIPS = 5

/**
 * One die thrown into the tray: it arcs in spinning, its shadow tightens as it drops, it lands
 * with a squash and settles. Faces flicker mid-air; the final face is the engine's.
 */
function Die({
  value,
  index,
  animate,
  speed,
  reduced,
}: {
  value: number
  index: number
  animate: boolean
  speed: number
  reduced: boolean
}) {
  const body = useRef<HTMLDivElement>(null)
  const shadow = useRef<HTMLDivElement>(null)
  // Start mid-tumble on another face, so the result never shows before the throw.
  const [flicker, setFlicker] = useState<number | null>(() =>
    animate && !reduced ? 1 + ((value + index + 2) % 6) : null,
  )

  // Layout effect: the throw must start before the first paint, or the die flashes at rest.
  useLayoutEffect(() => {
    const el = body.current
    const sh = shadow.current
    if (!animate || !el || !sh) return
    const duration = TIMINGS.dice / speed
    const timing = {
      duration,
      delay: (index * 70) / speed,
      easing: 'cubic-bezier(.3,.7,.4,1)',
      fill: 'backwards' as const,
    }
    if (reduced) {
      const fade = el.animate([{ opacity: 0 }, { opacity: 1 }], { ...timing, duration: duration * 0.4 })
      return () => fade.cancel()
    }
    let flips = 0
    const timer = setInterval(
      () => {
        flips++
        setFlicker(flips >= FLIPS ? null : 1 + ((value + flips * (index + 2)) % 6))
        if (flips >= FLIPS) clearInterval(timer)
      },
      (duration * 0.6) / FLIPS,
    )
    const spin = (index === 0 ? 1 : -1) * (540 + index * 120)
    const throwAnim = el.animate(
      [
        { transform: `translate(${50 + index * 16}px, -64px) rotate(${spin}deg) scale(0.7)`, opacity: 0 },
        { transform: `translate(14px, -8px) rotate(${spin * 0.3}deg) scale(1.04)`, opacity: 1, offset: 0.45 },
        { transform: 'translate(4px, -14px) rotate(-10deg)', offset: 0.62 },
        { transform: 'translate(0, 0) rotate(0deg) scale(1.14, 0.84)', offset: 0.78 },
        { transform: 'translate(0, -3px) scale(0.96, 1.05)', offset: 0.9 },
        { transform: 'none' },
      ],
      timing,
    )
    const shadowAnim = sh.animate(
      [
        { transform: 'scale(0.3)', opacity: 0 },
        { transform: 'scale(0.8)', opacity: 0.45, offset: 0.45 },
        { transform: 'scale(0.6)', opacity: 0.3, offset: 0.62 },
        { transform: 'scale(1.2, 1)', opacity: 0.75, offset: 0.78 },
        { transform: 'scale(1)', opacity: 0.6 },
      ],
      timing,
    )
    return () => {
      clearInterval(timer)
      throwAnim.cancel()
      shadowAnim.cancel()
    }
  }, [animate, index, reduced, speed, value])

  const face = flicker ?? value
  return (
    <div className="relative size-12">
      <div
        ref={shadow}
        className="absolute inset-x-1 -bottom-1.5 h-3 rounded-full bg-black/60 opacity-60 blur-[3px]"
      />
      <div
        ref={body}
        className="relative grid size-12 grid-cols-3 grid-rows-3 gap-0.5 rounded-xl bg-ink p-2 shadow-[inset_0_-3px_0_#94a3b8]"
        aria-label={`Die showing ${value}`}
      >
        {PIPS[face]!.map(([r, c]) => (
          <span
            key={`${r}${c}`}
            className="size-2 place-self-center rounded-full bg-table"
            style={{ gridRow: r + 1, gridColumn: c + 1 }}
          />
        ))}
      </div>
    </div>
  )
}

/** The engine already chose the dice; this only shows them (CLAUDE.md principle 3). */
export function DiceTray({
  dice,
  roll,
  speed = 1,
  reduced = false,
}: {
  dice: readonly [number, number] | null
  /** Increments per roll; 0 means nothing was rolled in this session (show, do not throw). */
  roll: number
  speed?: number
  reduced?: boolean
}) {
  if (!dice) return null
  return (
    <div key={roll} className="pointer-events-none flex gap-2.5">
      <Die value={dice[0]} index={0} animate={roll > 0} speed={speed} reduced={reduced} />
      <Die value={dice[1]} index={1} animate={roll > 0} speed={speed} reduced={reduced} />
    </div>
  )
}
