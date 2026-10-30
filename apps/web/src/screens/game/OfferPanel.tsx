import { useEffect, useRef, useState } from 'react'
import { reduce, type GameState, type TradeOffer } from '@skyline/engine'
import { usePanelSound } from '../../audio/usePanelSound.ts'
import type { GameStore, Snapshot, TradeOutcome } from '../../game/store.ts'
import { mortgageFee, reaction } from '../../game/trade.ts'
import { cssHex } from '../../spaceInfo.ts'
import { useReducedMotion } from './cardEnv.tsx'
import { useDialogFocus } from './useDialogFocus.ts'
import { Sheet } from './Sheet.tsx'
import { Icon } from './icons.tsx'
import type { TradeDraft } from './TradeComposer.tsx'
import { BundleOnMat, DealNotes, Felt, Mat, ResultStamp, SpeechBubble } from './TradeParts.tsx'
import { HAND_SCALE, HOLD_MS, flyDeal, useResultHold } from './tradeFx.ts'
import type { TurnView } from './turn.ts'
import { Btn, Eyebrow, Kbd, Panel, TokenAvatar } from './ui.tsx'

const FADE_MS = 220

/** An offer on screen, with the state it was shown against (the deal changes the live state). */
interface Kept {
  offer: TradeOffer
  s0: GameState
  done: boolean
}

/**
 * An offer waiting on a human, laid out like the trade table: who offers, what they say, what
 * you get and give on felt mats, what it does to sets, and Accept, Decline or Counter. Play
 * waits for it. When it is answered the panel stays for the ending: its stamp holds long enough
 * to read (click or Esc skips that), then the cards fly to their new owners on Accept, or the
 * panel fades on Decline.
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
  const live = turn.moment === 'offer' ? turn.offer : null
  const [kept, setKept] = useState<Kept | null>(null)
  if (live && kept?.offer.id !== live.id) setKept({ offer: live, s0: snap.state, done: false })
  const shown = live ?? (kept && !kept.done ? kept.offer : null)
  // Gone without an answer of ours (busy, or withdrawn off screen): nothing to play out.
  const outcome = shown && !live ? snap.tradeOutcomes[shown.id] : undefined
  if (!shown || (!live && !outcome) || !kept) return null
  return (
    <OfferCard
      key={shown.id}
      store={store}
      offer={shown}
      s={live ? snap.state : kept.s0}
      leaving={outcome}
      onDone={() => setKept((k) => (k ? { ...k, done: true } : k))}
      onCounter={onCounter}
    />
  )
}

function OfferCard({
  store,
  offer,
  s,
  leaving,
  onDone,
  onCounter,
}: {
  store: GameStore
  offer: TradeOffer
  s: GameState
  leaving: TradeOutcome | undefined
  onDone: () => void
  onCounter: (draft: TradeDraft & { me: number }) => void
}) {
  usePanelSound()
  const reduced = useReducedMotion()
  const toId = s.players[offer.to]!.id
  const fromId = s.players[offer.from]!.id
  const seats = store.setup.seats
  const from = s.players[offer.from]!
  const to = s.players[offer.to]!
  const bot = store.seatKind(from.id) === 'bot'
  const solo = seats.filter((x) => x.kind === 'human').length === 1
  const answer = (type: 'ACCEPT_TRADE' | 'REJECT_TRADE') => store.dispatch(to.id, { type, tradeId: offer.id })
  const canAccept = leaving !== undefined || reduce(s, to.id, { type: 'ACCEPT_TRADE', tradeId: offer.id }).ok

  const rootRef = useRef<HTMLDivElement>(null)
  const dialog = useDialogFocus({ also: rootRef, active: leaving === undefined })
  /** Cards and coins on the mats: `in:` keys are what you receive, `out:` keys what you hand over. */
  const pieces = useRef(new Map<string, HTMLElement>())
  const reg = (side: 'in' | 'out') => (key: string, el: HTMLElement | null) => {
    if (el) pieces.current.set(`${side}:${key}`, el)
    else pieces.current.delete(`${side}:${key}`)
  }
  const doneRef = useRef(onDone)
  useEffect(() => {
    doneRef.current = onDone
  })

  // The ending: the stamp holds, then the cards fly (or not) and the panel fades. Every path
  // reaches `done` through timers, even if no animation frame ever runs.
  const [released, setReleased] = useState(false)
  const holdMs =
    leaving === 'accepted'
      ? reduced
        ? HOLD_MS.reducedDeal
        : HOLD_MS.deal
      : reduced
        ? HOLD_MS.reduced
        : HOLD_MS.declined
  useResultHold(leaving !== undefined && !released, holdMs, () => setReleased(true), rootRef)
  useEffect(() => {
    if (!leaving || !released) return
    const root = rootRef.current
    let cancelFly = () => {}
    let cancelFade = () => {}
    const fadeOut = () => {
      let finished = false
      const end = () => {
        if (finished) return
        finished = true
        if (root) root.style.opacity = '0'
        doneRef.current()
      }
      const a = root?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: 'ease-out' })
      if (a) a.onfinish = end
      const t = window.setTimeout(end, FADE_MS + 120)
      cancelFade = () => {
        finished = true
        window.clearTimeout(t)
        a?.cancel()
      }
    }
    if (leaving !== 'accepted') {
      fadeOut()
      return cancelFade
    }
    const list = [...pieces.current].map(([key, el]) => ({
      el,
      to: key.startsWith('in') ? toId : fromId,
    }))
    cancelFly = flyDeal(list, reduced, fadeOut)
    return () => {
      cancelFly()
      cancelFade()
    }
  }, [leaving, released, reduced, toId, fromId, pieces, rootRef, doneRef])

  const sender = seats[offer.from]!
  return (
    <Sheet
      as="section"
      {...dialog.props}
      className="pointer-events-auto absolute inset-x-0 top-24 bottom-0 flex items-center justify-center bg-table/60 p-3"
    >
      <Panel className="relative flex max-h-full w-140 max-w-full animate-rise flex-col overflow-hidden rounded-3xl!">
        {leaving && (
          <ResultStamp
            outcome={leaving}
            size={52}
            out={released}
            {...(leaving === 'accepted' ? {} : { outAfter: holdMs - 260 })}
          />
        )}
        <div className="flex items-start gap-3.5 px-5.5 pt-5 pb-3.5">
          <TokenAvatar color={cssHex(sender.color)} piece={sender.piece} size={46} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Eyebrow className="text-accent">
              <span id={dialog.titleId}>Trade offer</span>
            </Eyebrow>
            <div className="font-display text-[22px] leading-tight font-bold">
              {from.name} offers {solo ? 'you' : to.name} a deal
            </div>
            {bot && (
              <div className="self-start">
                <SpeechBubble
                  text={reaction(
                    store.botName(offer.from),
                    leaving === 'accepted' ? 'accepted' : 'offer',
                    offer.id,
                  )}
                  mood="empty"
                  tail="top"
                />
              </div>
            )}
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto">
          <Felt className="mx-4.5 rounded-[18px]! p-3.5">
            <div className="grid grid-cols-1 gap-3 min-[560px]:grid-cols-2">
              <Mat tone="get" label={solo ? 'You get' : `${to.name} gets`}>
                <BundleOnMat s={s} seats={seats} bundle={offer.give} k={HAND_SCALE} reg={reg('in')} />
              </Mat>
              <Mat tone="give" label={solo ? 'You give' : `${to.name} gives`}>
                <BundleOnMat s={s} seats={seats} bundle={offer.get} k={HAND_SCALE} reg={reg('out')} />
              </Mat>
            </div>
          </Felt>

          <div className="mx-4.5 mt-3 flex flex-col gap-2">
            <DealNotes
              s={s}
              me={offer.to}
              them={offer.from}
              themName={from.name}
              give={offer.get}
              get={offer.give}
              fee={mortgageFee(s, offer.give.spaces)}
            />
            {!canAccept && (
              <span className="flex items-center gap-1.5 text-sm font-bold text-alert">
                <Icon name="alert" size={16} /> Not enough cash to accept this.
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 px-4.5 pt-4 pb-5">
          <Btn
            kind="ghost"
            disabled={leaving !== undefined}
            className="h-[50px]! rounded-[14px]! text-ink! underline decoration-ink/50 underline-offset-4"
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
          <Btn
            kind="secondary"
            disabled={leaving !== undefined}
            className="h-[50px]! rounded-[14px]! px-[18px]! text-[15px]!"
            onClick={() => answer('REJECT_TRADE')}
          >
            Decline <Kbd>N</Kbd>
          </Btn>
          <Btn
            kind="primary"
            autofocus
            disabled={!canAccept || leaving !== undefined}
            className="h-[50px]! rounded-[14px]! px-[22px]! text-base!"
            onClick={() => answer('ACCEPT_TRADE')}
          >
            Accept <Kbd onAccent>Y</Kbd>
          </Btn>
        </div>
      </Panel>
    </Sheet>
  )
}
