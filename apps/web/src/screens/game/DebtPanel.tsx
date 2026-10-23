import { useState } from 'react'
import { HOTEL, SPACES, rentFor, type Action } from '@skyline/engine'
import { liquidationValue, raisePlan, raiseValue } from '../../game/plans.ts'
import type { GameStore, Snapshot } from '../../game/store.ts'
import { familyColor, familyName } from './deed.ts'
import type { TurnView } from './turn.ts'
import { Btn, Eyebrow, Panel } from './ui.tsx'
import { fmtMoney } from './format.ts'

type Raise = Extract<Action, { type: 'SELL_BUILDING' | 'MORTGAGE' }>

const REASON: Record<string, string> = { rent: 'rent', tax: 'tax', card: 'for a card', jailFine: 'the fine' }

/** Owes more than they have: the gap, everything that can be sold or mortgaged, and one-click fixes. */
export function DebtPanel({ snap, store, turn }: { snap: Snapshot; store: GameStore; turn: TurnView }) {
  const [confirm, setConfirm] = useState(false)
  const s = snap.state
  if (turn.moment !== 'debt') return null
  const seat = turn.actorSeat
  const me = s.players[seat]!
  const mine = s.debts.filter((d) => d.debtor === seat)
  const owed = mine.reduce((t, d) => t + d.amount, 0)
  const first = mine[0]!
  const creditor = first.creditor >= 0 ? s.players[first.creditor]!.name : 'the bank'
  const need = owed - me.cash
  const liquid = liquidationValue(s, me.id)
  const enough = liquid >= need
  const plan = raisePlan(s, me.id, enough ? need : Infinity)
  const options = turn.legal.filter((a): a is Raise => a.type === 'SELL_BUILDING' || a.type === 'MORTGAGE')
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / owed) * 100))}%`

  return (
    <div className="pointer-events-auto absolute inset-x-0 top-24 bottom-0 flex items-start justify-center bg-table/55 px-4 pt-8">
      <Panel className="w-150 max-w-full animate-rise overflow-hidden border-alert/50">
        <div className="flex flex-col gap-3.5 px-6 pt-5 pb-4">
          <Eyebrow className="text-alert">
            You owe {creditor} {fmtMoney(owed)} {REASON[first.reason] ?? ''}
          </Eyebrow>
          <div className="text-[34px] leading-tight font-bold">Raise {fmtMoney(need)} to pay</div>
          <div className="flex flex-col gap-1.5">
            <div className="flex h-3 overflow-hidden rounded-full bg-line">
              <div className="bg-accent" style={{ width: pct(me.cash) }} />
              <div
                className="bg-[repeating-linear-gradient(45deg,#22d3ee73_0_6px,#22d3ee33_6px_12px)]"
                style={{ width: pct(Math.min(liquid, owed - me.cash)) }}
              />
            </div>
            <div className="flex justify-between text-[13px] text-ink-muted tabular-nums">
              <span>Cash {fmtMoney(me.cash)}</span>
              <span>Everything below: +{fmtMoney(liquid)}</span>
              <span>Owed {fmtMoney(owed)}</span>
            </div>
          </div>
        </div>

        <div className="max-h-64 overflow-y-auto border-t border-line">
          {options.map((a) => (
            <div
              key={`${a.type}${a.space}`}
              className="flex items-center gap-3 border-b border-line px-6 py-2.5"
            >
              <span className="size-3 shrink-0 rounded-[3px]" style={{ background: familyColor(a.space) }} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-semibold">
                  {a.type === 'MORTGAGE' ? 'Mortgage' : 'Sell a house on'} {SPACES[a.space]!.name}
                </span>
                <span className="text-xs text-ink-muted">{detail(snap, a)}</span>
              </div>
              <Btn onClick={() => turn.act(a)} className="h-10 text-teal tabular-nums">
                +{fmtMoney(raiseValue(a))}
              </Btn>
            </div>
          ))}
          {options.length === 0 && (
            <div className="px-6 py-3 text-sm text-ink-muted">Nothing left to sell or mortgage.</div>
          )}
        </div>

        <div className="flex flex-col gap-3.5 px-6 pt-4 pb-5">
          {!enough && (
            <div className="rounded-xl border border-alert/30 bg-alert/10 px-3.5 py-3 text-[13px] leading-relaxed">
              Even selling and mortgaging everything leaves you {fmtMoney(need - liquid)} short. A trade could
              still save you, once trading opens.
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2.5">
            {plan.actions.length > 0 && (
              <Btn
                kind={enough ? 'primary' : 'secondary'}
                onClick={() => store.run(me.id, plan.actions)}
                className="h-13 rounded-2xl px-5 text-base"
                title={
                  enough
                    ? 'Mortgages lone properties first, then sells houses where rent drops least'
                    : undefined
                }
              >
                {enough
                  ? `Raise ${fmtMoney(need)} automatically`
                  : `Raise everything (+${fmtMoney(plan.amount)})`}
              </Btn>
            )}
            <Btn
              disabled
              title="Trading arrives with the trade screen (Milestone 8)"
              className="h-13 rounded-2xl"
            >
              Offer a trade
            </Btn>
            <span className="ml-auto flex gap-1.5">
              {confirm ? (
                <>
                  <Btn kind="danger" onClick={() => turn.act({ type: 'DECLARE_BANKRUPTCY' })}>
                    Yes, go bankrupt
                  </Btn>
                  <Btn kind="ghost" onClick={() => setConfirm(false)}>
                    Keep playing
                  </Btn>
                </>
              ) : (
                <Btn kind="ghost" onClick={() => setConfirm(true)}>
                  Declare bankruptcy
                </Btn>
              )}
            </span>
          </div>
        </div>
      </Panel>
    </div>
  )
}

function detail(snap: Snapshot, a: Raise): string {
  const s = snap.state
  const sp = SPACES[a.space]!
  if (a.type === 'MORTGAGE') return `${familyName(a.space)} · earns no rent while mortgaged`
  const level = s.houses[a.space]!
  const after = level === HOTEL ? 'hotel becomes 4 houses' : `rent drops to ${fmtMoney(sp.rent[level - 1]!)}`
  return `${familyName(a.space)} · ${after} (now ${fmtMoney(rentFor(s, a.space, 7))})`
}
