import { SPACES, type Action } from '@skyline/engine'
import type { Snapshot } from '../../game/store.ts'
import { setProgress } from './deed.ts'
import { TitleDeed } from './TitleDeed.tsx'
import type { TurnView } from './turn.ts'
import { Btn, Eyebrow, Kbd, Money, SetBar } from './ui.tsx'

/** Landed on an unowned space: the deed, what buying does to your cash and your set, Buy or Auction. */
export function BuyMoment({ snap, turn, onCity }: { snap: Snapshot; turn: TurnView; onCity: () => void }) {
  const s = snap.state
  if (turn.moment !== 'buy' || s.pending?.kind !== 'buy') return null
  const space = s.pending.space
  const sp = SPACES[space]!
  const me = s.players[turn.actorSeat]!
  const buy = turn.legal.find((a) => a.type === 'BUY')
  const decline = turn.legal.find((a) => a.type === 'DECLINE_BUY')
  const set = setProgress(s, turn.actorSeat, space)
  const after = me.cash - sp.price
  const act = (a: Action | undefined) => a && turn.act(a)

  return (
    <div className="pointer-events-auto absolute inset-x-0 top-24 bottom-0 flex items-start justify-center bg-table/55 px-4 pt-8">
      <div className="flex animate-rise flex-wrap items-stretch justify-center gap-8">
        <TitleDeed index={space} className="rotate-[-1.5deg]" />
        <div className="flex w-90 flex-col justify-center gap-4">
          <div>
            <Eyebrow className="text-gold">For sale</Eyebrow>
            <div className="mt-1 text-4xl leading-tight font-bold">Buy {sp.name}?</div>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-line bg-panel px-4 py-3.5">
            <div className="flex justify-between text-sm">
              <span className="text-ink-muted">Your cash</span>
              <span className="tabular-nums">
                <Money value={me.cash} className="text-ink-muted" /> →{' '}
                <Money value={after} className={`font-bold ${after < 0 ? 'text-alert' : ''}`} />
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-ink-muted">{set.name}</span>
                <span>
                  you'd own {set.mine} of {set.total}
                </span>
              </div>
              <SetBar total={set.total} filled={set.mine} color={set.color} />
              {set.note && (
                <div
                  className={`text-xs ${set.mine === set.total ? 'font-semibold text-gold' : 'text-ink-muted'}`}
                >
                  {set.note}
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2.5">
            <Btn
              kind="primary"
              disabled={!buy}
              onClick={() => act(buy)}
              className="h-15 flex-1 rounded-2xl text-lg"
            >
              Buy for <Money value={sp.price} />
              <Kbd onAccent>B</Kbd>
            </Btn>
            {decline && (
              <Btn onClick={() => act(decline)} className="h-15 rounded-2xl px-6 text-base">
                {s.config.auctionOnDecline ? 'Auction' : 'Pass'}
                <Kbd>A</Kbd>
              </Btn>
            )}
          </div>
          <div className="text-xs leading-relaxed text-ink-muted">
            {buy ? (
              s.config.auctionOnDecline && 'Auctioning lets everyone bid, including you.'
            ) : (
              <>
                You are <Money value={-after} /> short.{' '}
                <button type="button" onClick={onCity} className="font-semibold text-accent hover:underline">
                  Mortgage something in My city
                </button>{' '}
                first, or auction it.
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
