import { useEffect, useRef, useState } from 'react'
import { buyAdvice } from '../../game/advice.ts'
import { AdviceLines } from './AdviceLines.tsx'
import { SPACES } from '@skyline/engine'
import type { GameState } from '@skyline/engine'
import type { GameStore, Snapshot } from '../../game/store.ts'
import { cssHex } from '../../spaceInfo.ts'
import { useReducedMotion } from './cardEnv.tsx'
import { useDialogFocus } from './useDialogFocus.ts'
import { useLayout } from '../../layout.ts'
import { Sheet } from './Sheet.tsx'
import { bidAction, raiseOptions } from './auctionBids.ts'
import { familyName, familyOf, rgba, setProgress } from './deed.ts'
import { FADE_MS, FLY_MS, SOLD_HOLD_MS, flyToChip } from './finale.ts'
import { fmtMoney } from './format.ts'
import { GavelIcon } from './icons.tsx'
import { Stamp } from './cardMotion.tsx'
import { DeedCard } from './TitleDeed.tsx'
import type { TurnView } from './turn.ts'
import { Btn, Eyebrow, Kbd, Money, Panel, TokenAvatar } from './ui.tsx'

type Auction = Extract<NonNullable<GameState['pending']>, { kind: 'auction' }>

interface Bid {
  seat: number
  amount: number
}

/** The auction as last seen live (a copy, the engine mutates its own), kept for the finale. */
interface Seen {
  key: string
  a: Auction
}
interface Finale {
  a: Auction
  kind: 'sold' | 'nosale'
  winner: number
  amount: number
}

const keyOf = (a: Auction) => `${a.space}:${a.highBid}:${a.highBidder}:${a.current}:${a.bidders.join(',')}`
const copyOf = (a: Auction): Auction => ({ ...a, bidders: [...a.bidders] })

/** How many bids the header remembers. */
const HISTORY = 4

/**
 * Live auction: the deed and the bidding so far, the high bid, every bidder's status and bid
 * buttons when it is a human's turn. When it ends the panel stays a moment: a SOLD stamp, then
 * the deed flies to the winner's chip (or "No sale" and a fade).
 */
export function AuctionPanel({ snap, store, turn }: { snap: Snapshot; store: GameStore; turn: TurnView }) {
  const s = snap.state
  const reduced = useReducedMotion()
  const livePending = s.pending?.kind === 'auction' ? s.pending : null
  const [custom, setCustom] = useState('')

  const [seen, setSeen] = useState<Seen | null>(null)
  const [fin, setFin] = useState<Finale | null>(null)
  const [hist, setHist] = useState<{ space: number; list: Bid[] }>({ space: -1, list: [] })
  const [ghost, setGhost] = useState<{ left: number; top: number } | null>(null)

  if (livePending) {
    const key = keyOf(livePending)
    if (seen?.key !== key) setSeen({ key, a: copyOf(livePending) })
    if (fin) setFin(null)
    if (ghost) setGhost(null)
    if (!seen || hist.space !== livePending.space) {
      setHist({
        space: livePending.space,
        list:
          livePending.highBidder >= 0 ? [{ seat: livePending.highBidder, amount: livePending.highBid }] : [],
      })
    } else if (livePending.highBidder >= 0 && hist.list.at(-1)?.amount !== livePending.highBid) {
      setHist({
        space: hist.space,
        list: [...hist.list, { seat: livePending.highBidder, amount: livePending.highBid }].slice(-HISTORY),
      })
    }
  } else if (seen) {
    setSeen(null)
    const owner = s.owner[seen.a.space]!
    setFin(
      owner >= 0
        ? { a: seen.a, kind: 'sold', winner: owner, amount: seen.a.highBid }
        : { a: seen.a, kind: 'nosale', winner: -1, amount: 0 },
    )
  }

  const a = livePending ?? fin?.a ?? null
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const dimRef = useRef<HTMLDivElement>(null)
  const { compact } = useLayout()
  const deedRef = useRef<HTMLDivElement>(null)
  const ghostRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({})

  // Whoever just bid bounces.
  const lastBid = useRef<number | null>(null)
  const highBid = livePending?.highBid ?? null
  const highBidder = livePending?.highBidder ?? -1
  useEffect(() => {
    const prev = lastBid.current
    lastBid.current = highBid
    if (reduced || prev === null || highBid === null || highBid === prev || highBidder < 0) return
    cardRefs.current[highBidder]?.animate(
      [
        { transform: 'translateY(0) scale(1)' },
        { transform: 'translateY(-7px) scale(1.05)', offset: 0.3 },
        { transform: 'translateY(1px) scale(0.99)', offset: 0.62 },
        { transform: 'translateY(0) scale(1)' },
      ],
      { duration: 420, easing: 'ease-out' },
    )
  }, [highBid, highBidder, reduced])

  // The finale: stamp, hold, then the deed flies to the winner (or the panel just fades).
  const finKind = fin?.kind
  const finWinner = fin?.winner ?? -1
  const winnerId = finWinner >= 0 ? s.players[finWinner]!.id : null
  useEffect(() => {
    if (!finKind) return
    const fade = (el: Element | null, ms: number) =>
      el?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, fill: 'forwards' })
    const done = () => setFin(null)
    if (finKind === 'nosale') {
      const t1 = window.setTimeout(() => {
        fade(panelRef.current, 300)
        fade(dimRef.current, 300)
      }, 650)
      const t2 = window.setTimeout(done, 650 + 340)
      return () => {
        window.clearTimeout(t1)
        window.clearTimeout(t2)
      }
    }
    if (!reduced) {
      panelRef.current?.animate(
        [
          { translate: '0 0' },
          { translate: '-5px 3px', offset: 0.2 },
          { translate: '4px -3px', offset: 0.4 },
          { translate: '-2px 2px', offset: 0.6 },
          { translate: '0 0' },
        ],
        { duration: 300, delay: 260, easing: 'ease-out' },
      )
    }
    const t = window.setTimeout(
      () => {
        const root = rootRef.current?.getBoundingClientRect()
        const slot = deedRef.current?.getBoundingClientRect()
        const ms = reduced ? FADE_MS : FLY_MS
        fade(panelRef.current, ms)
        fade(dimRef.current, ms)
        if (root && slot) {
          if (deedRef.current) deedRef.current.style.visibility = 'hidden'
          const el = deedRef.current
          setGhost({
            left: slot.left + slot.width / 2 - (el?.offsetWidth ?? slot.width) / 2 - root.left,
            top: slot.top + slot.height / 2 - (el?.offsetHeight ?? slot.height) / 2 - root.top,
          })
        } else {
          window.setTimeout(done, ms)
        }
      },
      reduced ? 300 : SOLD_HOLD_MS + 250,
    )
    return () => window.clearTimeout(t)
  }, [finKind, reduced])
  // Once the ghost card is mounted over the deed, it flies. Cleanup of the board happens in done.
  const hasGhost = ghost !== null
  useEffect(() => {
    if (!hasGhost) return
    return flyToChip(ghostRef.current, winnerId, reduced, () => {
      setFin(null)
      setGhost(null)
    })
  }, [hasGhost, winnerId, reduced])

  const dialog = useDialogFocus({ active: a !== null && !fin })
  if (!a) return null
  const sp = SPACES[a.space]!
  const solo = store.setup.seats.filter((x) => x.kind === 'human').length === 1
  const human = (seat: number) => store.seatKind(s.players[seat]!.id) === 'human'
  const nameOf = (seat: number) => (solo && human(seat) ? 'You' : s.players[seat]!.name)
  const colorOf = (seat: number) => cssHex(store.setup.seats[seat]!.color)

  const sold = fin?.kind === 'sold'
  const shownHigh = sold ? fin.amount : a.highBid
  const shownLeader = sold ? fin.winner : a.highBidder
  const myBid = !fin && turn.canAct && turn.moment === 'auction'
  const myCash = s.players[turn.actorSeat]!.cash
  const raises = myBid ? raiseOptions(a.highBid, sp.price, myCash) : []
  const bidder = a.bidders[a.current]!
  const viewer = snap.viewer
  const set = viewer !== null ? setProgress(s, viewer, a.space) : null
  const family = familyOf(a.space)
  const groupColor = setProgress(s, turn.actorSeat, a.space).color
  const seats = s.players.map((pl, seat) => ({ pl, seat })).filter((x) => !x.pl.bankrupt)

  const typed = Number(custom)
  const typedOk = custom !== '' && Number.isInteger(typed) && typed > a.highBid && typed <= myCash
  const submitCustom = () => {
    if (typedOk && !store.dispatch(turn.actorId, bidAction(typed))) setCustom('')
  }
  const placeBid = (amount: number) => turn.act(bidAction(amount))

  const panel = (
    <div ref={panelRef} className="flex max-h-full w-195 max-w-full">
      <Panel
        className={`relative flex w-full flex-col overflow-hidden ${compact ? 'rounded-none! border-0! bg-transparent! shadow-none! backdrop-blur-none!' : 'animate-rise rounded-[26px] bg-panel shadow-panel-lg'}`}
      >
        <section {...dialog.props} className="flex min-h-0 flex-1 flex-col" {...(fin ? { inert: true } : {})}>
          <div className="flex items-center gap-5.5 border-b border-line bg-white/3 px-6.5 py-5.5 [@media(max-height:760px)]:py-3.5">
            <div ref={deedRef} className="shrink-0 rotate-[-4deg]">
              <DeedCard index={a.space} variant="compact" state="forSale" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Eyebrow className="flex items-center gap-2 text-xs tracking-[0.16em] text-accent">
                <GavelIcon color="var(--color-accent)" />
                Auction
              </Eyebrow>
              <h2
                id={dialog.titleId}
                className="truncate font-display text-[30px] leading-tight font-bold max-[767px]:text-[24px] max-[767px]:whitespace-normal"
              >
                {sp.name}
              </h2>
              <span className="text-sm text-ink-muted">
                List price <Money value={sp.price} /> · {familyName(a.space)}, {family.indexOf(a.space) + 1}{' '}
                of {family.length}
              </span>
              <span className="mt-1.5 flex min-h-6 flex-wrap gap-1.5 text-xs text-ink-muted">
                {hist.space === a.space &&
                  hist.list.map((b, i) => (
                    <span
                      key={`${b.amount}:${b.seat}`}
                      className={`rounded-full px-2 py-0.75 ${i === hist.list.length - 1 ? 'animate-tag-pop bg-accent/16 font-bold text-gold' : 'bg-white/5'}`}
                    >
                      {nameOf(b.seat)} {fmtMoney(b.amount)}
                    </span>
                  ))}
              </span>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex items-center justify-between gap-4 px-6.5 pt-5 pb-1.5">
              <span className="flex items-center gap-3">
                {shownLeader >= 0 ? (
                  <TokenAvatar
                    key={shownLeader}
                    color={colorOf(shownLeader)}
                    piece={store.setup.seats[shownLeader]!.piece}
                    size={44}
                    className="animate-tag-pop"
                    shadow="inset 0 -3px 0 rgba(0,0,0,0.18), 0 0 0 4px rgba(245,181,74,0.55), 0 0 22px rgba(245,181,74,0.35)"
                  />
                ) : (
                  <span className="flex size-11 items-center justify-center rounded-full border-[1.5px] border-dashed border-line text-ink-muted">
                    <GavelIcon />
                  </span>
                )}
                <span className="flex flex-col">
                  <span className="text-xs text-ink-muted">High bid</span>
                  <span className="text-base font-extrabold">
                    {shownLeader < 0
                      ? 'No bids yet'
                      : `${nameOf(shownLeader)} ${nameOf(shownLeader) === 'You' ? 'lead' : 'leads'}`}
                  </span>
                </span>
              </span>
              <Money
                key={shownHigh}
                value={shownHigh}
                className={`animate-pop font-display text-[52px] leading-none font-bold [text-shadow:0_0_24px_rgba(255,207,112,0.4)] ${shownLeader < 0 ? 'text-ink-muted' : 'text-gold'}`}
              />
            </div>

            <div
              className="grid gap-2.5 px-6.5 py-3"
              style={{ gridTemplateColumns: `repeat(${Math.min(seats.length, 6)}, minmax(0, 1fr))` }}
            >
              {seats.map(({ pl, seat }) => {
                const color = colorOf(seat)
                const won = sold && seat === fin.winner
                const out = fin ? !won : !a.bidders.includes(seat)
                const turnNow = !fin && bidder === seat
                const leads = shownLeader === seat
                const status = won
                  ? 'Winner'
                  : out
                    ? 'Passed'
                    : turnNow
                      ? human(seat)
                        ? solo
                          ? 'Your bid'
                          : 'Bidding'
                        : 'Thinking…'
                      : leads
                        ? `Leading ${fmtMoney(a.highBid)}`
                        : 'Waiting'
                const pill =
                  won || (turnNow && human(seat))
                    ? 'bg-accent text-accent-ink'
                    : leads && !out
                      ? 'bg-accent/18 text-gold'
                      : 'bg-white/7 text-ink-muted'
                return (
                  <div
                    key={pl.id}
                    ref={(el) => {
                      cardRefs.current[seat] = el
                    }}
                    className={`@container flex min-w-0 flex-col items-center gap-2 rounded-[18px] border-[1.5px] px-2.5 py-3.5 max-[767px]:px-1 transition-[opacity,translate,background-color,border-color] duration-300 ${
                      out ? 'translate-y-1 border-line bg-white/3 opacity-45' : 'border-line bg-white/3'
                    }`}
                    style={
                      turnNow || won
                        ? { borderColor: 'var(--color-accent)', background: 'rgba(245,181,74,0.08)' }
                        : leads && !out
                          ? { borderColor: 'rgba(245,181,74,0.45)' }
                          : undefined
                    }
                  >
                    <TokenAvatar color={color} piece={store.setup.seats[seat]!.piece} size={38} />
                    <span className="max-w-full truncate font-display text-sm font-bold">{nameOf(seat)}</span>
                    <span
                      // Narrow cards (phones): tighter and allowed to wrap, so a state is never cut short.
                      className={`max-w-full rounded-full px-2.5 py-1 text-center text-[11px] leading-tight font-extrabold whitespace-nowrap @max-[110px]:rounded-xl @max-[110px]:px-1.5 @max-[110px]:text-[10px] @max-[110px]:whitespace-normal ${pill} ${turnNow && !human(seat) ? 'animate-pulse' : ''}`}
                    >
                      {status}
                    </span>
                  </div>
                )
              })}
            </div>

            {set && (
              <div
                className="mx-6.5 mt-1.5 flex items-center gap-2.5 rounded-[14px] border px-3.5 py-3 text-[13px] leading-snug"
                style={{ background: rgba(groupColor, 0.1), borderColor: rgba(groupColor, 0.3) }}
              >
                <span className="size-3 shrink-0 rounded-[3px]" style={{ background: groupColor }} />
                <span>
                  {sp.name} would give you {set.mine} of {set.total} {set.name}.{' '}
                  {set.mine < set.total ? set.note : ''}
                </span>
              </div>
            )}
            {viewer !== null && !fin && (
              <AdviceLines
                advice={buyAdvice(s, viewer, a.space, Math.max(a.highBid, 1))}
                className="mx-6.5 mt-2.5"
              />
            )}
          </div>

          {/* The bid row stays put; only the middle scrolls on a short window. */}
          <div className="flex shrink-0 flex-col gap-3 border-t border-line/60 px-6.5 pt-4 pb-5">
            {myBid ? (
              <>
                <Eyebrow className="text-ink-muted">
                  Your bid · you have <Money value={myCash} className="text-gold" />
                </Eyebrow>
                <div className="flex flex-wrap gap-2.5">
                  {raises.map((r, i) => (
                    <Btn
                      key={r.key}
                      kind="primary"
                      autofocus={i === 0}
                      onClick={() => placeBid(r.amount)}
                      className="h-14 min-w-24 flex-1 flex-col gap-0! rounded-2xl px-2"
                    >
                      <Money value={r.amount} className="font-display text-[17px] leading-tight" />
                      <span className="flex items-center gap-1.5 text-[11px] leading-tight font-extrabold opacity-75">
                        {r.step}
                        <Kbd>{r.key}</Kbd>
                      </span>
                    </Btn>
                  ))}
                  <label className="flex h-14 min-w-32 flex-[1.3] items-center gap-1.5 rounded-2xl border border-line bg-table px-3.5 focus-within:border-accent">
                    <span className="font-display text-ink-muted">₵</span>
                    <input
                      value={custom}
                      inputMode="numeric"
                      onChange={(e) => setCustom(e.target.value.replace(/\D/g, '').slice(0, 7))}
                      onKeyDown={(e) => e.key === 'Enter' && submitCustom()}
                      placeholder="Custom"
                      aria-label="Custom bid"
                      className={`w-full min-w-0 bg-transparent font-display text-[17px] outline-none placeholder:text-ink-muted/70 ${custom && !typedOk ? 'text-alert' : 'text-ink'}`}
                    />
                  </label>
                  {custom && (
                    <Btn
                      kind="primary"
                      disabled={!typedOk}
                      onClick={submitCustom}
                      className="h-14 rounded-2xl px-5"
                    >
                      Bid
                    </Btn>
                  )}
                  <Btn
                    onClick={() => turn.act({ type: 'PASS_BID' })}
                    className="h-14 w-23 rounded-2xl text-[15px]"
                  >
                    Pass
                    <Kbd>P</Kbd>
                  </Btn>
                </div>
              </>
            ) : fin ? (
              <div className="py-2 text-center text-[13px] text-ink-muted">
                {sold
                  ? `${nameOf(fin.winner)} won it for ${fmtMoney(fin.amount)}.`
                  : 'Nobody wanted it. It stays on the market.'}
              </div>
            ) : (
              <div className="py-2 text-center text-[13px] text-ink-muted">
                {s.players[bidder]!.name} is deciding…
              </div>
            )}
          </div>
        </section>

        {fin && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-9 flex justify-center"
          >
            {sold ? (
              <Stamp word={`SOLD to ${nameOf(fin.winner)} · ${fmtMoney(fin.amount)}`} size={26} rotate={-7} />
            ) : (
              <Stamp word="NO SALE" color="#64748b" size={30} rotate={-7} />
            )}
          </div>
        )}
      </Panel>
    </div>
  )
  const ghostCard = ghost && (
    <div ref={ghostRef} className="absolute z-20" style={{ left: ghost.left, top: ghost.top }}>
      <div className="rotate-[-4deg]">
        <DeedCard index={a.space} variant="compact" state="forSale" />
      </div>
    </div>
  )

  // Phones: a sheet; the sold card's ghost flies from the sheet over everything to the winner's chip.
  if (compact)
    return (
      <Sheet ref={rootRef} dimRef={dimRef} overlay={ghostCard}>
        {panel}
      </Sheet>
    )
  return (
    <div
      ref={rootRef}
      className={`pointer-events-none absolute inset-0 z-10 flex justify-center px-4 pt-28 pb-4`}
    >
      <div ref={dimRef} aria-hidden="true" className="absolute inset-0 animate-fade bg-table/55" />
      {panel}
      {ghostCard}
    </div>
  )
}
