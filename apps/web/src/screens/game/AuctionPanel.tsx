import { useState } from 'react'
import { SPACES, type Action } from '@skyline/engine'
import type { GameStore, Snapshot } from '../../game/store.ts'
import { cssHex } from '../../spaceInfo.ts'
import { familyColor, setProgress } from './deed.ts'
import type { TurnView } from './turn.ts'
import { Btn, Eyebrow, Money, Panel } from './ui.tsx'

type Bid = Extract<Action, { type: 'BID' }>

/**
 * Bid suggestions that feel like real jumps: the minimum raise, a small step, and steps toward
 * the list price. The engine still validates every bid.
 */
function suggestedBids(high: number, price: number, cash: number): Bid[] {
  const round = (v: number) => Math.max(high + 1, Math.round(v / 10) * 10)
  const picks = [
    high + 1,
    round(high + 10),
    round(Math.max(high + 20, price * 0.6)),
    round(Math.max(high + 30, price)),
  ]
  return [...new Set(picks)]
    .filter((v) => v > high && v <= cash)
    .toSorted((a, b) => a - b)
    .map((amount) => ({ type: 'BID', amount }))
}

/** Live auction: high bid, every bidder's status, and bid controls when it is a human's bid. */
export function AuctionPanel({ snap, store, turn }: { snap: Snapshot; store: GameStore; turn: TurnView }) {
  const s = snap.state
  const a = s.pending
  const [custom, setCustom] = useState('')
  if (a?.kind !== 'auction') return null
  const sp = SPACES[a.space]!
  const myBid = turn.canAct && turn.moment === 'auction'
  const bids = myBid ? suggestedBids(a.highBid, sp.price, s.players[turn.actorSeat]!.cash) : []
  const leader = a.highBidder >= 0 ? s.players[a.highBidder]! : null
  const bidder = a.bidders[a.current]!
  const viewer = snap.viewer
  const set = viewer !== null ? setProgress(s, viewer, a.space) : null
  const submitCustom = () => {
    const amount = Number(custom)
    if (Number.isInteger(amount) && amount > 0 && !store.dispatch(turn.actorId, { type: 'BID', amount }))
      setCustom('')
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 top-28 flex justify-center px-4">
      <Panel className="w-160 max-w-full animate-rise overflow-hidden">
        <div className="flex items-center gap-4 border-b border-line px-6 py-4">
          <div className="h-16 w-13 shrink-0 overflow-hidden rounded-lg bg-slate-50">
            <div className="h-4.5" style={{ background: familyColor(a.space) }} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <Eyebrow className="text-gold">Auction</Eyebrow>
            <span className="truncate text-2xl font-bold">{sp.name}</span>
            <span className="text-[13px] text-ink-muted">
              List price <Money value={sp.price} />
              {set && ` · ${set.name}`}
            </span>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-xs text-ink-muted">High bid</span>
            <Money
              key={a.highBid}
              value={a.highBid}
              className="animate-pop text-4xl leading-none font-bold text-gold"
            />
            <span className="text-[13px] font-semibold text-accent">
              {leader ? `${leader.name} leads` : 'No bids yet'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(0,1fr))] gap-2.5 px-6 py-4">
          {s.players.map((pl, seat) => {
            if (pl.bankrupt) return null
            const color = cssHex(store.setup.seats[seat]!.color)
            const out = !a.bidders.includes(seat)
            const turnNow = bidder === seat
            const leads = a.highBidder === seat
            const status = out
              ? 'Passed'
              : turnNow
                ? myBid
                  ? 'Your bid'
                  : 'Bidding…'
                : leads
                  ? `Leading ₵${a.highBid}`
                  : 'Waiting'
            return (
              <div
                key={pl.id}
                className={`flex flex-col items-center gap-1.5 rounded-2xl border p-3 transition ${
                  out
                    ? 'border-line bg-panel opacity-45'
                    : leads
                      ? 'border-accent/40 bg-accent/10'
                      : 'border-line bg-panel'
                }`}
                style={turnNow ? { borderColor: color, background: 'var(--color-panel-2)' } : undefined}
              >
                <span
                  className="flex size-9 items-center justify-center rounded-full font-bold text-table"
                  style={{ background: color }}
                >
                  {pl.name.trim()[0]?.toUpperCase()}
                </span>
                <span className="text-sm font-semibold">{pl.name}</span>
                <span
                  className={`text-xs font-semibold ${turnNow && !myBid ? 'animate-pulse' : ''}`}
                  style={{
                    color: turnNow ? color : leads ? 'var(--color-accent)' : 'var(--color-ink-muted)',
                  }}
                >
                  {status}
                </span>
              </div>
            )
          })}
        </div>

        {set && (
          <div className="mx-6 rounded-xl border border-accent/25 bg-accent/5 px-3.5 py-3 text-[13px] leading-relaxed">
            {sp.name} would give you {set.mine} of {set.total} {set.name}. {set.note}
          </div>
        )}

        <div className="flex flex-col gap-3 px-6 pt-4 pb-5">
          {myBid ? (
            <>
              <div className="text-[13px] text-ink-muted">
                Your bid · you have <Money value={s.players[turn.actorSeat]!.cash} />
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                {bids.map((b) => (
                  <Btn
                    key={b.amount}
                    kind="primary"
                    onClick={() => turn.act(b)}
                    className="h-13 rounded-2xl px-5 text-base"
                  >
                    <Money value={b.amount} />
                  </Btn>
                ))}
                <label className="flex h-13 items-center gap-2 rounded-2xl border border-line bg-table px-3 text-[13px] text-ink-muted">
                  Custom
                  <input
                    value={custom}
                    inputMode="numeric"
                    onChange={(e) => setCustom(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={(e) => e.key === 'Enter' && submitCustom()}
                    placeholder="₵"
                    aria-label="Custom bid"
                    className="w-20 bg-transparent text-base font-semibold text-ink outline-none"
                  />
                </label>
                {custom && (
                  <Btn onClick={submitCustom} className="h-13 rounded-2xl">
                    Bid
                  </Btn>
                )}
                <Btn onClick={() => turn.act({ type: 'PASS_BID' })} className="ml-auto h-13 rounded-2xl px-5">
                  Pass
                </Btn>
              </div>
            </>
          ) : (
            <div className="text-center text-[13px] text-ink-muted">
              {s.players[bidder]!.name} is deciding…
            </div>
          )}
        </div>
      </Panel>
    </div>
  )
}
