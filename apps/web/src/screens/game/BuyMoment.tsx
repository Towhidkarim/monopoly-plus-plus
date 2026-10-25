import { useEffect, useRef, useState } from 'react'
import { SPACES, type Action } from '@skyline/engine'
import type { GameStore, Snapshot } from '../../game/store.ts'
import { cssHex } from '../../spaceInfo.ts'
import { useReducedMotion } from './cardEnv.tsx'
import { familyOf, inkOn, rgba, setProgress } from './deed.ts'
import { FADE_MS, FLY_MS, SOLD_HOLD_MS, flyToChip } from './finale.ts'
import { GavelIcon, TagIcon } from './icons.tsx'
import { DeedCard } from './TitleDeed.tsx'
import type { TurnView } from './turn.ts'
import { Btn, Eyebrow, Kbd, Money, Panel } from './ui.tsx'

/** What was on screen when the decision closed, so the finale can finish the story. */
interface Seen {
  space: number
  seat: number
  id: string
}
interface Finale extends Seen {
  kind: 'sold' | 'auction' | 'pass'
}

/**
 * Landed on an unowned space: the deed beside what buying does to your cash and your set, then
 * Buy or Auction. Buying stamps the deed SOLD, holds a beat and flies it to your chip in the top
 * bar; choosing the auction fades the layout into the auction panel.
 */
export function BuyMoment({
  snap,
  store,
  turn,
  onCity,
}: {
  snap: Snapshot
  store: GameStore
  turn: TurnView
  onCity: () => void
}) {
  const s = snap.state
  const reduced = useReducedMotion()
  const live: Seen | null =
    turn.moment === 'buy' && s.pending?.kind === 'buy'
      ? { space: s.pending.space, seat: turn.actorSeat, id: turn.actorId }
      : null

  // Remember the open decision; when it closes, work out how it ended (state set during render).
  const [seen, setSeen] = useState<Seen | null>(null)
  const [fin, setFin] = useState<Finale | null>(null)
  if (live && (seen?.space !== live.space || seen.seat !== live.seat)) setSeen(live)
  if (!live && seen) {
    setSeen(null)
    const kind =
      s.owner[seen.space] === seen.seat
        ? 'sold'
        : s.pending?.kind === 'auction'
          ? 'auction'
          : s.pending?.kind === 'buy'
            ? null
            : 'pass'
    if (kind) setFin({ ...seen, kind })
  }
  if (live && fin) setFin(null)

  const flyRef = useRef<HTMLDivElement>(null)
  const dimRef = useRef<HTMLDivElement>(null)
  const kind = fin?.kind
  const finId = fin?.id
  useEffect(() => {
    if (!kind) return
    const clear = () => setFin(null)
    if (kind === 'sold') {
      let cancel: (() => void) | undefined
      const t = window.setTimeout(
        () => {
          dimRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: reduced ? FADE_MS : FLY_MS,
            fill: 'forwards',
          })
          cancel = flyToChip(flyRef.current, finId ?? null, reduced, clear)
        },
        reduced ? 250 : SOLD_HOLD_MS,
      )
      return () => {
        window.clearTimeout(t)
        cancel?.()
      }
    }
    // Declined: the layout fades out while the auction (or the next step) comes in.
    dimRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'forwards' })
    flyRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'forwards' })
    const t = window.setTimeout(clear, 200)
    return () => window.clearTimeout(t)
  }, [kind, finId, reduced])

  const shown = live ?? fin
  if (!shown) return null
  const space = shown.space
  const sp = SPACES[space]!
  const me = s.players[shown.seat]!
  const buy = turn.legal.find((a) => a.type === 'BUY')
  const decline = turn.legal.find((a) => a.type === 'DECLINE_BUY')
  const set = setProgress(s, shown.seat, space)
  const after = me.cash - sp.price
  const act = (a: Action | undefined) => a && turn.act(a)
  const solo = store.setup.seats.filter((x) => x.kind === 'human').length === 1
  const ownerLabel = (seat: number) =>
    seat === shown.seat && solo ? 'You own' : `${s.players[seat]!.name} owns`

  return (
    <div
      className={`absolute inset-0 z-10 flex items-center justify-center px-4 pt-20 ${fin ? 'pointer-events-none' : 'pointer-events-auto'}`}
    >
      <div ref={dimRef} aria-hidden="true" className="absolute inset-0 bg-table/55" />
      <section
        aria-label={`Buy ${sp.name}`}
        className="relative flex animate-rise flex-wrap items-center justify-center gap-11"
      >
        <div ref={flyRef}>
          <DeedCard
            index={space}
            state="forSale"
            setOwned={set.mine - 1}
            moment
            dealFrom={{ x: -120, y: 80 }}
            stamp={fin?.kind === 'sold' ? 'SOLD' : undefined}
          />
        </div>
        {fin ? (
          <div className="w-100" aria-hidden="true" />
        ) : (
          <Panel className="flex w-100 max-w-full flex-col gap-4.5 rounded-3xl bg-panel p-6.5 shadow-panel-lg">
            <Eyebrow className="flex items-center gap-2 text-xs text-accent">
              <TagIcon color="var(--color-accent)" />
              For sale
            </Eyebrow>
            <h2 className="font-display text-[32px] leading-[1.1] font-bold">Buy {sp.name}?</h2>

            <div className="flex items-center justify-between rounded-2xl border border-line bg-white/4 px-4 py-3.5">
              <div className="flex flex-col gap-0.5">
                <Eyebrow className="text-ink-muted">Your cash</Eyebrow>
                <div className="flex items-center gap-2.5 font-display text-[22px] font-bold">
                  <Money value={me.cash} className="text-ink-muted line-through decoration-ink-muted/60" />
                  <svg width="20" height="12" viewBox="0 0 20 12" aria-hidden="true">
                    <path
                      d="M1 6 H17 M13 2 L18 6 L13 10"
                      fill="none"
                      stroke="var(--color-accent)"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <Money value={after} className={after < 0 ? 'text-alert' : 'text-gold'} />
                </div>
              </div>
              <span className="rounded-full bg-alert/14 px-2.5 py-1 text-[13px] font-extrabold text-[#fda4af]">
                −<Money value={sp.price} />
              </span>
            </div>

            <div className="flex flex-col gap-2.5 rounded-2xl border border-line bg-white/4 px-4 py-3.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-bold">
                  <span className="size-3 rounded-[3px]" style={{ background: set.color }} />
                  {set.name}
                </span>
                <span className="text-[13px] text-ink-muted">
                  you'd own {set.mine} of {set.total}
                </span>
              </div>
              <div className="flex gap-2">
                {familyOf(space).map((i) => {
                  const owner = s.owner[i]!
                  const here = i === space
                  const ownerColor = owner >= 0 ? cssHex(store.setup.seats[owner]!.color) : null
                  return (
                    <span key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                      <span
                        className="flex h-8.5 w-full items-center justify-center overflow-hidden rounded-lg px-1 text-[11px]"
                        style={
                          here
                            ? {
                                background: set.color,
                                color: inkOn(set.color),
                                fontWeight: 800,
                                boxShadow: 'inset 0 0 0 2px var(--color-card)',
                              }
                            : ownerColor
                              ? { background: rgba(ownerColor, 0.2), border: `1.5px solid ${ownerColor}` }
                              : {
                                  border: `1.5px dashed ${rgba(set.color, 0.6)}`,
                                  color: 'var(--color-ink-muted)',
                                }
                        }
                      >
                        <span className="truncate">{SPACES[i]!.name}</span>
                      </span>
                      <span
                        className={`max-w-full truncate text-[11px] ${here ? 'font-bold text-gold' : 'text-ink-muted'}`}
                        style={!here && ownerColor ? { color: ownerColor } : undefined}
                      >
                        {here ? 'This one' : owner >= 0 ? ownerLabel(owner) : 'For sale'}
                      </span>
                    </span>
                  )
                })}
              </div>
              {set.note && (
                <div
                  className={`text-[13px] leading-snug ${set.mine === set.total ? 'font-semibold text-gold' : 'text-ink-muted'}`}
                >
                  {set.note}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2.5">
              <Btn
                kind="primary"
                disabled={!buy}
                onClick={() => act(buy)}
                className="h-15.5 rounded-[18px] text-[19px] shadow-gold-lg"
              >
                Buy for <Money value={sp.price} />
                <Kbd>B</Kbd>
              </Btn>
              {decline && (
                <Btn onClick={() => act(decline)} className="h-13 rounded-2xl text-[15px]">
                  {s.config.auctionOnDecline && <GavelIcon />}
                  {s.config.auctionOnDecline ? 'Put it up for auction' : 'Pass'}
                  <Kbd>A</Kbd>
                </Btn>
              )}
            </div>
            <div className="text-center text-xs leading-relaxed text-ink-muted">
              {buy ? (
                s.config.auctionOnDecline && 'Auctioning lets everyone bid, including you.'
              ) : (
                <>
                  You are <Money value={-after} /> short.{' '}
                  <button
                    type="button"
                    onClick={onCity}
                    className="font-semibold text-accent hover:underline"
                  >
                    Mortgage something in My city
                  </button>{' '}
                  first, or auction it.
                </>
              )}
            </div>
          </Panel>
        )}
      </section>
    </div>
  )
}
