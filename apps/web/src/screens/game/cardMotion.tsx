import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
  type TransitionEvent,
} from 'react'
import { useReducedMotion } from './cardEnv.tsx'

/** Timings from the Feel study (docs/design/m8/Feel.dc.html). */
const CARD_MS = { deal: 620, flip: 560, followIn: 120, springBack: 500, stamp: 420, shake: 300 }

const SPRING_BACK = 'transform 500ms cubic-bezier(0.2, 0.9, 0.3, 1.35)'
const FOLLOW = 'transform 120ms ease-out'
const FLIP = 'transform 560ms cubic-bezier(0.2, 0.9, 0.3, 1.15)'

/** Skyline card back in a deck's color. */
export function CardBack({
  color,
  edge,
  label = 'SKYLINE',
  radius = 20,
}: {
  color: string
  edge: string
  label?: string | undefined
  radius?: number
}) {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 flex flex-col items-center justify-center gap-3"
      style={{ background: color, border: `2px solid ${edge}`, borderRadius: radius }}
    >
      <svg width="96" height="96" viewBox="0 0 96 96">
        <path d="M48 8 L88 48 L48 88 L8 48 Z" fill="none" stroke={edge} strokeWidth="3" />
        <path
          d="M30 62 V40 H40 V62 M44 62 V28 H54 V62 M58 62 V46 H68 V62"
          fill="none"
          stroke={edge}
          strokeWidth="3"
        />
      </svg>
      <span className="font-display font-bold tracking-[0.3em]" style={{ color: edge }}>
        {label}
      </span>
    </div>
  )
}

/**
 * Wraps a card face with the card motion: dealt in from the deck (arc, overshoot, settle), flipped
 * over from its back, a tiny idle sway, and a tilt toward the cursor with a moving sheen. The
 * children are the face (it sets the size). Pointer tracking writes styles straight to the DOM, so
 * mouse moves never touch React state. With reduced motion there is no sway, tilt, deal or flip:
 * the face just fades in.
 */
export function CardStage({
  children,
  back,
  deal = false,
  flip = deal,
  dealFrom,
  sway = true,
  tilt = true,
  radius = 20,
  className = '',
}: {
  children: ReactNode
  /** Back shown before the flip; without it the card is never flipped. */
  back?: { color: string; edge: string; label?: string }
  /** Fly in from `dealFrom` (px offset the deal starts at; default far left, like a side deck). */
  deal?: boolean
  flip?: boolean
  dealFrom?: { x: number; y: number }
  sway?: boolean
  tilt?: boolean
  radius?: number
  className?: string
}) {
  const reduced = useReducedMotion()
  const tiltRef = useRef<HTMLDivElement>(null)
  const perspRef = useRef<HTMLDivElement>(null)
  const swayRef = useRef<HTMLDivElement>(null)
  const sheenRef = useRef<HTMLDivElement>(null)
  const flipRef = useRef<HTMLDivElement>(null)
  // The 3D machinery (perspective, preserve-3d, backface-visibility, the back face) exists only
  // while flipping; at rest the card is plain 2D so text is rasterized crisp (not in a 3D layer).
  const [flipping, setFlipping] = useState(!!back && flip && !reduced)

  useLayoutEffect(() => {
    const el = flipRef.current
    if (!el || !flipping) return
    el.style.transition = 'none'
    el.style.transform = 'rotateY(180deg)'
    let raf = 0
    const t = window.setTimeout(
      () => {
        raf = requestAnimationFrame(() => {
          el.style.transition = FLIP
          el.style.transform = 'rotateY(0deg)'
        })
      },
      deal ? CARD_MS.deal * 0.45 : 60,
    )
    // transitionend can be skipped (hidden tab), so a timer also ends the flip.
    const done = window.setTimeout(
      () => {
        // Always end un-rotated, even if the animation frame never ran (throttled tab).
        el.style.transition = 'none'
        el.style.transform = ''
        setFlipping(false)
      },
      (deal ? CARD_MS.deal * 0.45 : 60) + CARD_MS.flip + 80,
    )
    return () => {
      clearTimeout(t)
      clearTimeout(done)
      cancelAnimationFrame(raf)
    }
  }, [flipping, deal])

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const t = tiltRef.current
    const p = perspRef.current
    if (reduced || !tilt || flipping || !t || !p || e.pointerType === 'touch') return
    const r = p.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    p.style.perspective = '900px'
    t.style.willChange = 'transform'
    t.style.transition = FOLLOW
    t.style.transform = `rotateX(${((0.5 - y) * 10).toFixed(2)}deg) rotateY(${((x - 0.5) * 13).toFixed(2)}deg) translateY(-10px) scale(1.02)`
    const s = sheenRef.current
    if (s) {
      s.style.opacity = '1'
      // Matte paper under a lamp: a broad warm light on the side tilted toward the viewer and a
      // faint shade on the far side (no tight white hotspot, which reads as glossy plastic).
      const px = (x * 100).toFixed(1)
      const py = (y * 100).toFixed(1)
      s.style.background = `radial-gradient(farthest-corner at ${px}% ${py}%, rgba(255,247,226,0.16), rgba(255,247,226,0) 62%), radial-gradient(farthest-corner at ${(100 - x * 100).toFixed(1)}% ${(100 - y * 100).toFixed(1)}%, rgba(90,64,24,0.09), rgba(90,64,24,0) 55%)`
    }
    if (swayRef.current) swayRef.current.style.animationPlayState = 'paused'
  }
  const leave = () => {
    const t = tiltRef.current
    if (t && t.style.transform) {
      t.style.transition = SPRING_BACK
      t.style.transform = 'none'
    }
    if (sheenRef.current) sheenRef.current.style.opacity = '0'
    if (swayRef.current) swayRef.current.style.animationPlayState = 'running'
  }
  // Back at rest: drop the 3D context and the layer hint so the card is rasterized crisp again.
  const settle = (e: TransitionEvent<HTMLDivElement>) => {
    const t = tiltRef.current
    if (e.target !== t || !t || t.style.transform !== 'none') return
    t.style.transition = ''
    t.style.willChange = ''
    t.style.transform = ''
    if (perspRef.current) perspRef.current.style.perspective = ''
  }

  const dealStyle: CSSProperties = reduced
    ? { animation: 'fade-in 180ms ease-out backwards' }
    : deal
      ? ({
          // `backwards` (not `both`): once finished, no animation (and no layer) is left behind.
          animation: `card-deal ${CARD_MS.deal}ms cubic-bezier(0.2, 0.9, 0.3, 1) backwards`,
          '--deal-x': `${dealFrom?.x ?? -360}px`,
          '--deal-y': `${dealFrom?.y ?? 140}px`,
        } as CSSProperties)
      : {}
  const d3 = flipping ? ({ transformStyle: 'preserve-3d' } as const) : undefined

  return (
    <div className={className} style={dealStyle}>
      <div
        ref={swayRef}
        style={
          sway && !reduced
            ? {
                // Starts after the deal and flip have landed.
                animation: `card-sway 4.2s ease-in-out ${deal ? CARD_MS.deal + CARD_MS.flip : 0}ms infinite`,
              }
            : undefined
        }
      >
        <div
          ref={perspRef}
          onPointerMove={move}
          onPointerLeave={leave}
          style={flipping ? { perspective: 900 } : undefined}
        >
          <div ref={tiltRef} className="relative" onTransitionEnd={settle} style={d3}>
            <div ref={flipRef} className="relative" style={d3}>
              <div className="relative" style={flipping ? { backfaceVisibility: 'hidden' } : undefined}>
                {children}
                <div
                  ref={sheenRef}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 opacity-0"
                  style={{ borderRadius: radius, transition: 'opacity 160ms' }}
                />
              </div>
              {flipping && back && (
                <div
                  className="absolute inset-0"
                  style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                >
                  <CardBack color={back.color} edge={back.edge} label={back.label} radius={radius} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * A rubber stamp (SOLD, DEAL!, BANKRUPT, MORTGAGED) that slams in at 2.6x scale. Position it with
 * `className` (absolute inside a relative card). `shake` also jolts the parent for 300 ms (the
 * `translate` property, so it never fights a transform on the parent). Reduced motion: a fade.
 */
export function Stamp({
  word,
  color = '#e8463a',
  size = 44,
  rotate = -9,
  shake = false,
  bg = 'rgba(251,248,241,0.8)',
  className = '',
}: {
  word: string
  color?: string
  /** Font size in px; border and padding scale with it. */
  size?: number
  rotate?: number
  shake?: boolean
  bg?: string
  className?: string
}) {
  const reduced = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  // The slam-in is dropped once it should be over, so a stamp is never stuck invisible at the first
  // frame of its animation (a throttled tab runs no frames): a timer sets the resting state.
  const [landed, setLanded] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setLanded(true), (reduced ? 180 : CARD_MS.stamp) + 120)
    return () => window.clearTimeout(t)
  }, [reduced])
  useEffect(() => {
    const parent = ref.current?.parentElement
    if (!shake || reduced || !parent) return
    const a = parent.animate(
      [
        { translate: '0 0' },
        { translate: '-6px 3px', offset: 0.2 },
        { translate: '5px -4px', offset: 0.4 },
        { translate: '-3px 2px', offset: 0.6 },
        { translate: '2px -1px', offset: 0.8 },
        { translate: '0 0' },
      ],
      { duration: CARD_MS.shake, delay: 260, easing: 'ease-out' },
    )
    return () => a.cancel()
  }, [shake, reduced])
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={`pointer-events-none font-display font-bold whitespace-nowrap ${className}`}
      style={{
        color,
        background: bg,
        fontSize: size,
        lineHeight: 1.1,
        letterSpacing: '0.12em',
        padding: `${size * 0.18}px ${size * 0.5}px`,
        border: `${Math.max(2, size * 0.11)}px solid ${color}`,
        borderRadius: size * 0.23,
        rotate: `${rotate}deg`,
        animation: landed
          ? undefined
          : reduced
            ? 'fade-in 180ms ease-out backwards'
            : `card-stamp ${CARD_MS.stamp}ms cubic-bezier(0.2, 0.9, 0.3, 1.2) backwards`,
      }}
    >
      {word}
    </div>
  )
}
