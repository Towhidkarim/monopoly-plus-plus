import { useEffect, useRef, useState } from 'react'
import type { Fx, GameStore } from '../../game/store.ts'
import { cssHex } from '../../spaceInfo.ts'
import { TIMINGS } from '../../game/timings.ts'

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
        if (!layer || reducedMotion()) return
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

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

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
  const count = Math.max(3, Math.min(9, Math.round(3 + amount / 120)))
  const x0 = a.left + a.width / 2
  const y0 = a.top + a.height / 2
  const dx = b.left + b.width / 2 - x0
  const dy = b.top + b.height / 2 - y0
  // Arc down over the board (the HUD is at the top), deeper for longer flights.
  const sag = 70 + Math.abs(dx) * 0.18
  for (let i = 0; i < count; i++) {
    const coin = document.createElement('div')
    coin.className =
      'absolute size-5 rounded-full border-2 border-amber-700 bg-amber-300 shadow-md shadow-black/40'
    coin.style.left = `${x0 - 10}px`
    coin.style.top = `${y0 - 10}px`
    layer.append(coin)
    const jitter = (i - count / 2) * 6
    coin.animate(
      [
        { transform: 'translate(0, 0) scale(0.4)', opacity: 0 },
        { transform: `translate(${dx * 0.1}px, ${sag * 0.4}px) scale(1)`, opacity: 1, offset: 0.15 },
        { transform: `translate(${dx * 0.5 + jitter}px, ${dy * 0.5 + sag}px) scale(1.15)`, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.6)`, opacity: 0.2 },
      ],
      {
        duration: TIMINGS.coinFlight / speed,
        delay: (i * TIMINGS.coinStagger) / speed,
        easing: 'ease-in-out',
        fill: 'backwards',
      },
    ).onfinish = () => coin.remove()
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
    <div
      className="pointer-events-none absolute inset-x-0 top-[34%] flex justify-center px-4"
      aria-live="polite"
    >
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
