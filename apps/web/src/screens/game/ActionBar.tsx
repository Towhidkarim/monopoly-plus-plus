import { useState, type ReactNode } from 'react'
import { SPACES, expectedActor, legalActions, mortgageValue, type Action } from '@skyline/engine'
import type { GameStore, Snapshot } from '../../game/store.ts'
import { cssHex } from '../../spaceInfo.ts'
import { Btn, Money, Panel } from './ui.tsx'

/**
 * Context actions for whoever the game is waiting on. Everything shown comes from
 * `legalActions`, so the UI can never offer an illegal move.
 */
export function ActionBar({ snap, store }: { snap: Snapshot; store: GameStore }) {
  const s = snap.state
  if (s.phase === 'gameOver') return null
  const actorSeat = expectedActor(s)
  const actor = s.players[actorSeat]!
  const color = cssHex(store.setup.seats[actorSeat]!.color)
  const human = store.seatKind(actor.id) === 'human'

  const header = (
    <div className="flex items-center gap-2 text-sm">
      <span className="size-2.5 rounded-full" style={{ background: color }} />
      <span className="font-semibold text-ink">{actor.name}</span>
      <span className="text-ink-muted">{label(snap)}</span>
    </div>
  )

  if (!human || snap.busy) {
    return (
      <Panel className="px-5 py-3">
        {header}
        {snap.busy ? null : <div className="mt-1 animate-pulse text-xs text-ink-muted">deciding…</div>}
      </Panel>
    )
  }

  const legal = legalActions(s, actor.id)
  const act = (a: Action) => store.dispatch(actor.id, a)

  if (s.pending?.kind === 'auction')
    return <AuctionControls snap={snap} legal={legal} act={act} header={header} />
  if (s.debts[0]?.debtor === actorSeat)
    return <DebtControls snap={snap} legal={legal} act={act} header={header} />

  const has = (t: Action['type']) => legal.find((a) => a.type === t)
  const buy = has('BUY')
  const decline = has('DECLINE_BUY')
  const pendingSpace = s.pending?.kind === 'buy' ? s.pending.space : null

  return (
    <Panel className="flex flex-col gap-3 px-5 py-4">
      {header}
      {pendingSpace !== null && (
        <div className="text-sm text-ink">
          <span className="font-semibold">{SPACES[pendingSpace]!.name}</span> is for sale for{' '}
          <Money value={SPACES[pendingSpace]!.price} className="font-semibold text-gold" />
          {!buy && <span className="text-alert"> (not enough cash; mortgage something or auction it)</span>}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {has('ROLL') && (
          <Btn kind="primary" onClick={() => act({ type: 'ROLL' })} className="px-8">
            {s.doubles > 0 ? 'Roll again' : 'Roll dice'}
          </Btn>
        )}
        {buy && (
          <Btn kind="primary" onClick={() => act(buy)}>
            Buy for ₵{SPACES[pendingSpace!]!.price}
          </Btn>
        )}
        {decline && (
          <Btn onClick={() => act(decline)}>{s.config.auctionOnDecline ? 'Auction it' : 'Pass'}</Btn>
        )}
        {has('PAY_JAIL_FINE') && (
          <Btn onClick={() => act({ type: 'PAY_JAIL_FINE' })}>Pay ₵{s.config.jailFine} fine</Btn>
        )}
        {has('USE_JAIL_CARD') && <Btn onClick={() => act({ type: 'USE_JAIL_CARD' })}>Use free card</Btn>}
        {has('END_TURN') && (
          <Btn kind="primary" onClick={() => act({ type: 'END_TURN' })} className="px-8">
            End turn
          </Btn>
        )}
      </div>
      {has('END_TURN') && (
        <div className="text-xs text-ink-muted">
          Tip: click your properties on the board to build or mortgage.
        </div>
      )}
    </Panel>
  )
}

function label(snap: Snapshot): string {
  const s = snap.state
  if (s.debts.length > 0) return 'must raise money'
  if (s.pending?.kind === 'auction') return 'is bidding'
  if (s.pending?.kind === 'buy') return 'is deciding whether to buy'
  if (s.players[s.current]!.inJail && s.phase === 'preRoll') return 'is in the Lockup'
  return s.phase === 'preRoll' ? 'to roll' : 'is finishing the turn'
}

interface ControlProps {
  snap: Snapshot
  legal: Action[]
  act: (a: Action) => string | null
  header: ReactNode
}

function AuctionControls({ snap, legal, act, header }: ControlProps) {
  const a = snap.state.pending
  const [custom, setCustom] = useState('')
  if (a?.kind !== 'auction') return null
  const bids = legal.filter((x): x is Extract<Action, { type: 'BID' }> => x.type === 'BID')
  const high = a.highBidder >= 0 ? snap.state.players[a.highBidder]!.name : null
  const submitCustom = () => {
    const amount = Number(custom)
    if (Number.isInteger(amount) && !act({ type: 'BID', amount })) setCustom('')
  }
  return (
    <Panel className="flex flex-col gap-3 px-5 py-4">
      {header}
      <div className="text-sm text-ink">
        Auction: <span className="font-semibold">{SPACES[a.space]!.name}</span> (list price ₵
        {SPACES[a.space]!.price}).{' '}
        {high ? (
          <>
            High bid <Money value={a.highBid} className="font-semibold text-gold" /> by {high}
          </>
        ) : (
          'No bids yet.'
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {bids.map((b) => (
          <Btn key={b.amount} kind="primary" onClick={() => act(b)}>
            Bid ₵{b.amount}
          </Btn>
        ))}
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && submitCustom()}
          placeholder="Custom"
          aria-label="Custom bid"
          className="w-24 rounded-lg bg-white/5 px-3 py-2 font-mono text-sm text-ink outline-none"
        />
        <Btn onClick={submitCustom} disabled={!custom}>
          Bid
        </Btn>
        <Btn kind="ghost" onClick={() => act({ type: 'PASS_BID' })}>
          Pass
        </Btn>
      </div>
    </Panel>
  )
}

function DebtControls({ snap, legal, act, header }: ControlProps) {
  const s = snap.state
  const debt = s.debts[0]!
  const me = s.players[debt.debtor]!
  const owedTo = debt.creditor >= 0 ? s.players[debt.creditor]!.name : 'the bank'
  const raise = legal.filter((a) => a.type === 'SELL_BUILDING' || a.type === 'MORTGAGE')
  const [confirm, setConfirm] = useState(false)
  return (
    <Panel className="flex max-w-xl flex-col gap-3 border-alert/40 px-5 py-4">
      {header}
      <div className="text-sm text-ink">
        You owe <Money value={debt.amount} className="font-semibold text-alert" /> to {owedTo} but have{' '}
        <Money value={me.cash} className="font-semibold" />. Sell buildings or mortgage properties to raise
        the money.
      </div>
      <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
        {raise.map((a) =>
          a.type === 'SELL_BUILDING' || a.type === 'MORTGAGE' ? (
            <Btn key={`${a.type}${a.space}`} onClick={() => act(a)}>
              {a.type === 'MORTGAGE' ? 'Mortgage' : 'Sell house on'} {SPACES[a.space]!.name} (+₵
              {a.type === 'MORTGAGE' ? mortgageValue(a.space) : SPACES[a.space]!.houseCost / 2})
            </Btn>
          ) : null,
        )}
        {raise.length === 0 && (
          <span className="text-sm text-ink-muted">Nothing left to sell or mortgage.</span>
        )}
      </div>
      <div className="flex gap-2">
        {confirm ? (
          <>
            <Btn kind="danger" onClick={() => act({ type: 'DECLARE_BANKRUPTCY' })}>
              Yes, declare bankruptcy
            </Btn>
            <Btn kind="ghost" onClick={() => setConfirm(false)}>
              Keep trying
            </Btn>
          </>
        ) : (
          <Btn kind="ghost" onClick={() => setConfirm(true)}>
            Declare bankruptcy…
          </Btn>
        )}
      </div>
    </Panel>
  )
}
