import { reduce } from '@skyline/engine'
import { usePanelSound } from '../../audio/usePanelSound.ts'
import type { GameStore, Snapshot } from '../../game/store.ts'
import { mortgageFee, reaction } from '../../game/trade.ts'
import type { TradeDraft } from './TradeComposer.tsx'
import { Avatar, BundleCards, DealNotes, SpeechBubble } from './TradeParts.tsx'
import type { TurnView } from './turn.ts'
import { Btn, Eyebrow, Kbd, Panel } from './ui.tsx'

/**
 * An offer waiting on a human, laid out like the trade table: who offers, what they say, what
 * you get and give, what it does to sets, and Accept, Decline or Counter. Play waits for it.
 */
export function OfferPanel({
  snap,
  store,
  turn,
  onCounter,
}: {
  snap: Snapshot
  store: GameStore
  turn: TurnView
  onCounter: (draft: TradeDraft & { me: number }) => void
}) {
  const offer = turn.offer
  if (turn.moment !== 'offer' || !offer) return null
  return <OfferCard key={offer.id} snap={snap} store={store} offer={offer} onCounter={onCounter} />
}

function OfferCard({
  snap,
  store,
  offer,
  onCounter,
}: {
  snap: Snapshot
  store: GameStore
  offer: NonNullable<TurnView['offer']>
  onCounter: (draft: TradeDraft & { me: number }) => void
}) {
  usePanelSound()
  const s = snap.state
  const from = s.players[offer.from]!
  const to = s.players[offer.to]!
  const bot = store.seatKind(from.id) === 'bot'
  const solo = store.setup.seats.filter((x) => x.kind === 'human').length === 1
  const answer = (type: 'ACCEPT_TRADE' | 'REJECT_TRADE') => store.dispatch(to.id, { type, tradeId: offer.id })
  const canAccept = reduce(s, to.id, { type: 'ACCEPT_TRADE', tradeId: offer.id }).ok

  return (
    <div className="pointer-events-auto absolute inset-x-0 top-24 bottom-0 flex items-start justify-center bg-table/60 px-4 pt-8">
      <Panel className="flex w-200 max-w-full animate-rise flex-col overflow-hidden">
        <header className="flex flex-wrap items-start gap-4 border-b border-line px-5 py-4">
          <Avatar name={from.name} color={store.setup.seats[offer.from]!.color} size="size-11" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div>
              <Eyebrow className="text-gold">Trade offer</Eyebrow>
              <div className="text-xl font-bold">
                {from.name} offers {solo ? 'you' : to.name} a deal
              </div>
            </div>
            {bot && (
              <div className="self-start">
                <SpeechBubble text={reaction(store.botName(offer.from), 'offer', offer.id)} mood="empty" />
              </div>
            )}
          </div>
        </header>
        <div className="grid grid-cols-1 gap-3 bg-table/60 px-4 py-4 sm:grid-cols-2">
          <section className="flex flex-col gap-2.5 rounded-2xl border border-line bg-panel px-3.5 py-3">
            <span className="text-sm font-bold text-teal">{solo ? 'You get' : `${to.name} gets`}</span>
            <BundleCards s={s} bundle={offer.give} />
          </section>
          <section className="flex flex-col gap-2.5 rounded-2xl border border-line bg-panel px-3.5 py-3">
            <span className="text-sm font-bold text-alert">{solo ? 'You give' : `${to.name} gives`}</span>
            <BundleCards s={s} bundle={offer.get} />
          </section>
        </div>
        <footer className="flex flex-col gap-3 border-t border-line px-5 py-4">
          <DealNotes
            s={s}
            me={offer.to}
            them={offer.from}
            themName={from.name}
            give={offer.get}
            get={offer.give}
            fee={mortgageFee(s, offer.give.spaces)}
          />
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!canAccept && (
              <span className="mr-auto text-sm text-alert">Not enough cash to accept this.</span>
            )}
            <Btn
              kind="ghost"
              onClick={() =>
                onCounter({
                  me: offer.to,
                  partner: offer.from,
                  give: { ...offer.get, spaces: [...offer.get.spaces] },
                  get: { ...offer.give, spaces: [...offer.give.spaces] },
                  replaces: offer.id,
                })
              }
            >
              Counter
            </Btn>
            <Btn kind="secondary" onClick={() => answer('REJECT_TRADE')}>
              Decline <Kbd>N</Kbd>
            </Btn>
            <Btn kind="primary" onClick={() => answer('ACCEPT_TRADE')} disabled={!canAccept}>
              Accept <Kbd onAccent>Y</Kbd>
            </Btn>
          </div>
        </footer>
      </Panel>
    </div>
  )
}
