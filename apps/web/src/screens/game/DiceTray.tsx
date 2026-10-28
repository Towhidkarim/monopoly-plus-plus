import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { SpeedFace } from '@skyline/engine'
import { TIMINGS } from '../../game/timings.ts'

/** The Speed die as a number for flicker: 1-3 pips, 4 the bus, 5 and 6 the scout pin. */
const speedValue = (f: SpeedFace): number => (f === 'bus' ? 4 : f === 'scout' ? 5 : f)

/** Side-view bus: the same shape the board's 3D Speed die prints (packages/board dice/icons.ts). */
function BusIcon() {
  return (
    <svg viewBox="0 0 128 128" className="size-full" aria-hidden>
      <path
        fillRule="evenodd"
        fill="currentColor"
        d="M20 30h88a12 12 0 0 1 12 12v36a12 12 0 0 1-12 12H8V42a12 12 0 0 1 12-12ZM16 40h17v19H16Zm22 0h17v19H38Zm22 0h17v19H60Zm22 0h17v19H82Zm18 0h14v28a4 4 0 0 1-4 4H100Z"
      />
      {[36, 92].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="92" r="19" style={{ fill: 'var(--die-body)' }} />
          <circle cx={cx} cy="92" r="14" fill="currentColor" />
          <circle cx={cx} cy="92" r="5" style={{ fill: 'var(--die-body)' }} />
        </g>
      ))}
    </svg>
  )
}

/** Map pin with a star in its head. */
function PinIcon() {
  return (
    <svg viewBox="0 0 128 128" className="size-full" aria-hidden>
      <path
        fillRule="evenodd"
        fill="currentColor"
        d="M64 120 38 70a33 33 0 1 1 52 0ZM64 33l4.4 8.9 9.8 1.4-7.1 6.9 1.7 9.8L64 55.4l-8.8 4.6 1.7-9.8-7.1-6.9 9.8-1.4Z"
      />
    </svg>
  )
}

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
  speedDie = false,
  compact = false,
  index,
  animate,
  hidden,
  arrive,
  speed,
  reduced,
}: {
  value: number
  /** The amber Speed die: values 4 and up print the bus (4) or the pin (5, 6). */
  speedDie?: boolean
  /** Smaller dice when three share the tray. */
  compact?: boolean
  index: number
  animate: boolean
  /** A 3D die is still on the board: keep the slot, show nothing yet. */
  hidden: boolean
  /** A 3D die just flew in: a quick pop instead of the tumble. */
  arrive: boolean
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

  useLayoutEffect(() => {
    const el = body.current
    if (!arrive || !el) return
    const pop = el.animate(
      reduced
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { transform: 'scale(0.7)', opacity: 0 },
            { transform: 'scale(1.12)', opacity: 1, offset: 0.55 },
            { transform: 'none' },
          ],
      { duration: 240, delay: index * 60, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'backwards' },
    )
    return () => pop.cancel()
  }, [arrive, index, reduced])

  const face = flicker ?? value
  const small = compact
  return (
    <div
      className={`relative ${small ? 'size-8' : 'size-11.5'} ${hidden ? 'opacity-0' : ''}`}
      style={{ rotate: index === 0 ? '-8deg' : index === 1 ? '6deg' : '-3deg' }}
    >
      <div
        ref={shadow}
        className="absolute inset-x-1 -bottom-1.5 h-3 rounded-full bg-black/50 opacity-60 blur-[3px]"
      />
      <div
        ref={body}
        className={`relative grid grid-cols-3 grid-rows-3 gap-px ${
          small ? 'size-8 rounded-[8px] p-1.5' : 'size-11.5 rounded-[11px] p-2'
        } ${speedDie ? '' : 'bg-card shadow-[inset_0_-5px_0_var(--color-card-edge)]'}`}
        style={
          speedDie
            ? ({
                '--die-body': '#e8a33c',
                background: '#e8a33c',
                color: '#2b1a06',
                boxShadow: `inset 0 -${small ? 4 : 5}px 0 #b97a1c`,
              } as CSSProperties)
            : undefined
        }
        aria-label={
          speedDie
            ? `Speed die showing ${value === 4 ? 'bus' : value >= 5 ? 'scout' : value}`
            : `Die showing ${value}`
        }
      >
        {speedDie && face >= 4 ? (
          <span className={`col-span-3 row-span-3 place-self-center ${small ? 'size-5' : 'size-7'}`}>
            {face === 4 ? <BusIcon /> : <PinIcon />}
          </span>
        ) : (
          PIPS[face]!.map(([r, c]) => (
            <span
              key={`${r}${c}`}
              className={`${small ? 'size-1.5' : 'size-2'} place-self-center rounded-full ${
                speedDie ? 'bg-[#2b1a06]' : 'bg-card-ink'
              }`}
              style={{ gridRow: r + 1, gridColumn: c + 1 }}
            />
          ))
        )}
      </div>
    </div>
  )
}

/** The engine already chose the dice; this only shows them (CLAUDE.md principle 3). */
export function DiceTray({
  dice,
  speedFace = null,
  roll,
  landing = false,
  speed = 1,
  reduced = false,
}: {
  dice: readonly [number, number] | null
  /** The Speed die's face, shown as a third amber die (null: two dice, as before). */
  speedFace?: SpeedFace | null
  /** Increments per roll; 0 means nothing was rolled in this session (show, do not throw). */
  roll: number
  /** 3D dice are still on the board; they fly in when this turns false. */
  landing?: boolean
  speed?: number
  reduced?: boolean
}) {
  if (!dice) return null
  return (
    <Pair
      key={roll}
      dice={dice}
      speedFace={speedFace}
      roll={roll}
      landing={landing}
      speed={speed}
      reduced={reduced}
    />
  )
}

function Pair({
  dice,
  speedFace,
  roll,
  landing,
  speed,
  reduced,
}: {
  dice: readonly [number, number]
  speedFace: SpeedFace | null
  roll: number
  landing: boolean
  speed: number
  reduced: boolean
}) {
  // A roll that started on the board (3D) arrives with a pop; any other roll tumbles in.
  const [thrown] = useState(landing)
  const die = (i: 0 | 1) => (
    <Die
      value={dice[i]}
      compact={speedFace !== null}
      index={i}
      animate={roll > 0 && !thrown}
      hidden={landing}
      arrive={thrown && !landing}
      speed={speed}
      reduced={reduced}
    />
  )
  return (
    <div
      data-dice-tray
      className={`pointer-events-none flex shrink-0 px-1.5 ${speedFace === null ? 'gap-4' : 'gap-2'}`}
    >
      {die(0)}
      {die(1)}
      {speedFace !== null && (
        <Die
          value={speedValue(speedFace)}
          speedDie
          compact
          index={2}
          animate={roll > 0 && !thrown}
          hidden={landing}
          arrive={thrown && !landing}
          speed={speed}
          reduced={reduced}
        />
      )}
    </div>
  )
}
