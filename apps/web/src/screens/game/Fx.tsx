import { useEffect, useRef, useState } from 'react'
import type { Fx, GameStore } from '../../game/store.ts'
import { cssHex } from '../../spaceInfo.ts'
import { TIMINGS, coinCount } from '../../game/timings.ts'
import { osReducedMotion } from './cardEnv.tsx'

/**
 * Money feedback over the HUD: "+₵200" pops under a player card and coins flying from payer
 * to payee. Elements are created imperatively and animated with the Web Animations API
 * (transform and opacity only), so nothing per-frame touches React.
 */
export function FxLayer({ store }: { store: GameStore }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(
    () =>
      store.onFx((fx) => {
        const layer = ref.current
        if (!layer || store.settings.reducedMotion || osReducedMotion()) return
        const speed = store.settings.speed
        if (fx.kind === 'pop') pop(layer, fx.playerId, fx.delta, speed)
        else if (fx.kind === 'transfer') {
          pop(layer, fx.from, -fx.amount, speed)
          coins(layer, fx.from, fx.to, fx.amount, speed)
        }
      }),
    [store],
  )
  return <div ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-40 overflow-hidden" />
}

function card(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-seat-card="${CSS.escape(id)}"]`)
}

function pop(layer: HTMLElement, id: string, delta: number, speed: number): void {
  const el = card(id)
  if (!el || delta === 0) return
  const r = el.getBoundingClientRect()
  const label = document.createElement('div')
  label.textContent = `${delta > 0 ? '+' : '−'}₵${Math.abs(delta).toLocaleString()}`
  label.className = `absolute text-xl font-bold tabular-nums drop-shadow-[0_4px_10px_#000a] ${delta > 0 ? 'text-teal-300' : 'text-rose-400'}`
  label.style.left = `${r.left + r.width / 2}px`
  label.style.top = `${r.bottom}px`
  layer.append(label)
  label.animate(
    [
      { transform: 'translate(-50%, -8px) scale(0.5)', opacity: 0 },
      { transform: 'translate(-50%, 10px) scale(1.2)', opacity: 1, offset: 0.18 },
      { transform: 'translate(-50%, 18px) scale(1)', opacity: 1, offset: 0.6 },
      { transform: 'translate(-50%, 34px) scale(0.95)', opacity: 0 },
    ],
    { duration: TIMINGS.numberPop / speed, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' },
  ).onfinish = () => label.remove()
  el.animate(
    [
      { transform: 'scale(1)' },
      { transform: `scale(${delta > 0 ? 1.05 : 0.96})` },
      { transform: 'scale(1)' },
    ],
    { duration: 280 / speed, easing: 'ease-out' },
  )
}

function coins(layer: HTMLElement, from: string, to: string, amount: number, speed: number): void {
  const a = card(from)?.getBoundingClientRect()
  const b = card(to)?.getBoundingClientRect()
  if (!a || !b) return
  const count = coinCount(amount)
  // From under the payer's card to under the payee's, swinging down over the board in a smooth
  // curve (a quadratic Bezier), deeper for longer flights.
  const x0 = a.left + a.width / 2
  const y0 = a.bottom + 4
  const x1 = b.left + b.width / 2
  const y1 = b.bottom + 4
  const dip = 110 + Math.abs(x1 - x0) * 0.32
  const cx = (x0 + x1) / 2
  const cy = Math.max(y0, y1) + dip
  const duration = TIMINGS.coinFlight / speed
  const stagger = TIMINGS.coinStagger / speed

  // Faint dashed trail along the path, there for the length of the transfer.
  const trail = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  trail.setAttribute('class', 'absolute inset-0 size-full overflow-visible')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', `M${x0} ${y0} Q${cx} ${cy} ${x1} ${y1}`)
  path.setAttribute('fill', 'none')
  path.setAttribute('stroke', '#fbbf24')
  path.setAttribute('stroke-width', '2')
  path.setAttribute('stroke-dasharray', '3 9')
  path.setAttribute('stroke-linecap', 'round')
  trail.append(path)
  layer.append(trail)
  trail.animate(
    [{ opacity: 0 }, { opacity: 0.55, offset: 0.15 }, { opacity: 0.55, offset: 0.75 }, { opacity: 0 }],
    {
      duration: duration + stagger * (count - 1),
      easing: 'ease-out',
    },
  ).onfinish = () => trail.remove()

  // WAAPI interpolates keyframes in straight lines, so sample the curve finely. Easing goes into
  // the sampling (slow out, glide, slow in) and the animation itself runs linear.
  const STEPS = 24
  const frames: Keyframe[] = []
  for (let k = 0; k <= STEPS; k++) {
    const p = k / STEPS
    const t = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2
    const u = 1 - t
    const x = u * u * x0 + 2 * u * t * cx + t * t * x1
    const y = u * u * y0 + 2 * u * t * cy + t * t * y1
    const scale = 0.55 + 0.6 * Math.sin(Math.PI * t)
    const opacity = p < 0.08 ? p / 0.08 : p > 0.92 ? (1 - p) / 0.08 : 1
    frames.push({ transform: `translate(${x - x0}px, ${y - y0}px) scale(${scale})`, opacity, offset: p })
  }
  for (let i = 0; i < count; i++) {
    const coin = document.createElement('div')
    coin.className =
      'absolute size-6 rounded-full border-2 border-amber-600 bg-amber-300 shadow-md shadow-black/40'
    coin.style.left = `${x0 - 12}px`
    coin.style.top = `${y0 - 12}px`
    layer.append(coin)
    coin.animate(frames, { duration, delay: i * stagger, easing: 'linear', fill: 'backwards' }).onfinish =
      () => coin.remove()
  }
}

type Callout = Extract<Fx, { kind: 'callout' }> & { id: number }

/** Big-moment line in the middle of the screen: big rents, completed sets, bankruptcies. */
export function CalloutLayer({ store }: { store: GameStore }) {
  const [shown, setShown] = useState<Callout | null>(null)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let n = 0
    const off = store.onFx((fx) => {
      if (fx.kind !== 'callout') return
      clearTimeout(timer)
      setShown({ ...fx, id: ++n })
      timer = setTimeout(() => setShown(null), TIMINGS.callout / Math.min(store.settings.speed, 2))
    })
    return () => {
      off()
      clearTimeout(timer)
    }
  }, [store])
  if (!shown) return null
  const border = { good: 'border-teal/50', bad: 'border-alert/50', info: 'border-gold/50' }[shown.tone]
  const accent =
    shown.seat !== undefined && shown.seat >= 0 ? cssHex(store.setup.seats[shown.seat]!.color) : undefined
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[34%] flex justify-center px-4">
      <div
        key={shown.id}
        className={`flex animate-pop items-center gap-3.5 rounded-2xl border bg-panel/95 px-5 py-3.5 shadow-2xl shadow-black/50 backdrop-blur ${border}`}
      >
        {accent && <span className="h-11 w-1.5 rounded-full" style={{ background: accent }} />}
        <div className="flex flex-col gap-0.5">
          <span className="text-base font-bold">{shown.title}</span>
          {shown.detail && <span className="text-[13px] text-ink-muted">{shown.detail}</span>}
        </div>
      </div>
    </div>
  )
}
