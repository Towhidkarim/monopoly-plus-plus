import { useEffect, useRef, useState, type ReactNode } from 'react'
import { GROUPS, SPACES, reduce, type Action, type Bundle, type GameState } from '@skyline/engine'
import { sound } from '../../audio/engine.ts'
import { usePanelSound } from '../../audio/usePanelSound.ts'
import type { SeatSetup } from '../../game/setup.ts'
import type { GameStore, Snapshot } from '../../game/store.ts'
import {
  emptyBundle,
  isEmptyBundle,
  missingPieces,
  moodOf,
  mortgageFee,
  reaction,
  tradeProblem,
  tradeSpaces,
} from '../../game/trade.ts'
import { cssHex, groupName } from '../../spaceInfo.ts'
import { useReducedMotion } from './cardEnv.tsx'
import { Icon } from './icons.tsx'
import {
  CardSlot,
  CashEditor,
  CoinStack,
  DealMeter,
  DealNotes,
  Felt,
  HandCard,
  Mat,
  MatCard,
  ResultStamp,
  SetHeader,
  SpeechBubble,
  SwapArrows,
  type FlyRects,
} from './TradeParts.tsx'
import { HAND_SCALE, flyDeal, useWide } from './tradeFx.ts'
import { Btn, Eyebrow, Money, Panel, TokenAvatar } from './ui.tsx'

/** How the trade table opens: fresh, or prefilled as a counter to an offer. */
export interface TradeDraft {
  partner?: number
  give?: Bundle
  get?: Bundle
  /** Counter-offer: this offer is declined when the new one is sent. */
  replaces?: number
}

/** How long a refusal's stamp stays before the table reopens. */
const STAMP_MS = 1500
/** How long "Deal!" holds before the cards fly to their new owners. */
const DEAL_HOLD_MS = 800

/**
 * The trade table: your hand on the left, the partner's on the right, the deal on green felt in
 * the middle. Click cards to slide them onto their mat. A bot partner reacts live (deal meter and
 * a line in its personality); sending shows its answer as a stamp, and a done deal sends each
 * card and coin stack off to its new owner's chip.
 */
export function TradeComposer({
  snap,
  store,
  me,
  draft,
  onClose,
}: {
  snap: Snapshot
  store: GameStore
  me: number
  draft: TradeDraft
  onClose: () => void
}) {
  usePanelSound()
  const reduced = useReducedMotion()
  const wide = useWide()
  const s = snap.state
  const seats = store.setup.seats
  const others = s.players.flatMap((p, i) => (i !== me && !p.bankrupt ? [i] : []))
  const [partner, setPartner] = useState(draft.partner ?? others[0] ?? -1)
  const [give, setGive] = useState<Bundle>(draft.give ?? emptyBundle())
  const [get, setGet] = useState<Bundle>(draft.get ?? emptyBundle())
  const [sent, setSent] = useState<number | null>(null)
  /** The state when the offer went out, so set notes do not change once the deal has gone through. */
  const [atSend, setAtSend] = useState<GameState | null>(null)
  const [lastWord, setLastWord] = useState<string | null>(null)
  const fly = useRef(new Map<string, DOMRect>())
  /** Every card and coin stack on the mats, by `give:` or `get:` key, for the deal's flight. */
  const mats = useRef(new Map<string, HTMLElement>())
  const reg = (side: 'give' | 'get', key: string) => (el: HTMLElement | null) => {
    if (el) mats.current.set(`${side}:${key}`, el)
    else mats.current.delete(`${side}:${key}`)
  }
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  const outcome = sent === null ? undefined : snap.tradeOutcomes[sent]
  // After the stamp: a deal sends the cards off to their new owners and closes; a refusal goes
  // back to the table with the bot's last word.
  useEffect(() => {
    if (!outcome) return
    if (outcome !== 'accepted') {
      const t = setTimeout(() => {
        setSent(null)
        setAtSend(null)
        setLastWord(reaction(store.botName(partner), 'declined'))
      }, STAMP_MS)
      return () => clearTimeout(t)
    }
    let cancel = () => {}
    const t = setTimeout(
      () => {
        const players = store.getSnapshot().state.players
        const pieces = [...mats.current].map(([key, el]) => ({
          el,
          to: (key.startsWith('give') ? players[partner]! : players[me]!).id,
        }))
        cancel = flyDeal(pieces, reduced, () => closeRef.current())
      },
      reduced ? 500 : DEAL_HOLD_MS,
    )
    return () => {
      clearTimeout(t)
      cancel()
    }
  }, [outcome, reduced, partner, me, store, mats])

  if (partner < 0) return null
  const meP = s.players[me]!
  const them = s.players[partner]!
  const bot = store.seatKind(them.id) === 'bot'
  const personality = store.botName(partner)
  const settled = sent !== null

  const action: Action = { type: 'PROPOSE_TRADE', to: them.id, give, get }
  const check = reduce(s, meP.id, action)
  const empty = isEmptyBundle(give) && isEmptyBundle(get)
  const problem = empty || settled ? null : check.ok ? null : tradeProblem(check.error)
  const verdict = empty || problem || settled ? null : store.tradeVerdict(s, me, partner, give, get)
  const mood = verdict?.kind === 'bot' ? verdict.mood : null
  const feeling = moodOf(empty ? null : mood)
  // A stable pick per deal shape, so the line does not flicker while you look at it.
  const pick = give.spaces.length + get.spaces.length * 3 + Math.floor((give.cash + get.cash) / 100)
  const line = !settled
    ? (lastWord ?? reaction(personality, feeling, pick))
    : outcome === 'accepted'
      ? reaction(personality, 'accepted', sent)
      : outcome
        ? reaction(personality, 'declined', sent)
        : null
  const lineMood = !settled
    ? lastWord
      ? 'no'
      : feeling
    : outcome === 'accepted'
      ? 'yes'
      : outcome
        ? 'no'
        : 'thinking'
  // The knob jumps to the bot's answer when it comes.
  const meterMood = outcome === 'accepted' ? 0.96 : outcome ? 0.04 : empty || problem ? null : mood

  const edit = (setter: (b: Bundle) => void, b: Bundle) => {
    setLastWord(null)
    setter(b)
  }
  const toggle = (side: 'give' | 'get', space: number, rect: DOMRect) => {
    const b = side === 'give' ? give : get
    const adding = !b.spaces.includes(space)
    fly.current.set(`${adding ? 'in' : 'out'}:${space}`, rect)
    sound.play('trade.card')
    const next = {
      ...b,
      spaces: adding ? [...b.spaces, space] : b.spaces.filter((x) => x !== space),
    }
    edit(side === 'give' ? setGive : setGet, next)
  }
  const pickPartner = (seat: number) => {
    setPartner(seat)
    setGet(emptyBundle())
    setGive({ ...give, spaces: [] })
    setLastWord(null)
  }

  const suggestions = missingPieces(s, me).slice(0, 3)
  const suggest = (space: number, owner: number) => {
    const want: Bundle = { spaces: [space], cash: 0, jailCards: 0 }
    const v = store.tradeVerdict(s, me, owner, emptyBundle(), want)
    const fair = Math.round((SPACES[space]!.price * 1.5) / 10) * 10
    const cash = Math.min(meP.cash, v.kind === 'bot' ? (v.more ?? fair) : fair)
    setPartner(owner)
    setGive({ spaces: [], cash: Math.floor(cash / 10) * 10, jailCards: 0 })
    setGet(want)
    setLastWord(null)
    sound.play('trade.card')
  }

  const send = () => {
    if (!check.ok) return
    if (draft.replaces !== undefined)
      store.dispatch(meP.id, { type: 'REJECT_TRADE', tradeId: draft.replaces })
    const id = store.getSnapshot().state.nextTradeId
    setAtSend(s)
    store.dispatch(meP.id, action)
    if (bot) setSent(id)
    else onClose()
  }

  const matK = wide ? 1 : HAND_SCALE
  const matCards = (side: 'give' | 'get', bundle: Bundle) =>
    bundle.spaces.map((space) => (
      <MatCard
        key={space}
        s={s}
        seats={seats}
        space={space}
        k={matK}
        fly={fly}
        reg={reg(side, `space:${space}`)}
        {...(settled ? {} : { onClick: (rect: DOMRect) => toggle(side, space, rect) })}
      />
    ))
  const lockup = (side: 'give' | 'get', bundle: Bundle, max: number) =>
    max > 0 && (
      <label className="flex items-center justify-between gap-2 text-xs font-bold text-white/70">
        <span className="flex items-center gap-1.5">
          <Icon name="lock" size={14} /> Lockup cards
        </span>
        <select
          value={bundle.jailCards}
          disabled={settled}
          onChange={(e) =>
            edit(side === 'give' ? setGive : setGet, { ...bundle, jailCards: Number(e.target.value) })
          }
          className="rounded-lg bg-black/25 px-2 py-1 text-ink"
        >
          {Array.from({ length: max + 1 }, (_, n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
    )

  return (
    <section
      aria-label={`Trade with ${them.name}`}
      className="pointer-events-auto absolute inset-x-0 top-24 bottom-0 z-30 flex items-center justify-center bg-table/65 p-3 backdrop-blur-sm min-[1180px]:p-4"
    >
      <Panel className="relative flex max-h-full w-full max-w-340 animate-pop flex-col overflow-hidden rounded-[28px]!">
        {outcome && <ResultStamp outcome={outcome} size={wide ? 60 : 44} />}

        <header className="flex flex-wrap items-center gap-x-4 gap-y-2.5 border-b border-line px-5 py-3.5 min-[1180px]:px-6 min-[1180px]:py-4">
          <div className="flex flex-col gap-0.5">
            <Eyebrow className="text-accent">
              {draft.replaces !== undefined ? 'Counter-offer' : 'Trade'}
            </Eyebrow>
            <div className="font-display text-[22px] leading-tight font-bold">Trade with</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {others.map((seat) => {
              const p = s.players[seat]!
              const on = seat === partner
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => pickPartner(seat)}
                  disabled={(draft.replaces !== undefined && !on) || settled}
                  className={`flex h-10 items-center gap-2 rounded-full border-[1.5px] pr-3.5 pl-1.5 text-sm font-extrabold transition-[scale,background-color,border-color] duration-200 ease-spring active:scale-95 disabled:opacity-30 ${on ? 'border-accent bg-accent/12' : 'border-line hover:bg-white/5'}`}
                >
                  <TokenAvatar color={cssHex(seats[seat]!.color)} piece={seats[seat]!.piece} size={28} />
                  {p.name}
                </button>
              )
            })}
          </div>
          <span className="flex-1" />
          {draft.replaces === undefined &&
            suggestions.map((m) => (
              <button
                key={m.space}
                type="button"
                onClick={() => suggest(m.space, m.owner)}
                disabled={settled}
                className="flex h-9 items-center gap-2 rounded-full border border-dashed border-accent/60 bg-accent/8 px-3 text-[13px] font-bold text-gold transition-[scale,background-color] duration-200 ease-spring hover:bg-accent/16 active:scale-95 disabled:opacity-30"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                  <path
                    d="M7 1 L8.6 5.2 L13 5.4 L9.6 8.2 L10.8 12.6 L7 10.1 L3.2 12.6 L4.4 8.2 L1 5.4 L5.4 5.2 Z"
                    fill="currentColor"
                  />
                </svg>
                Ask {s.players[m.owner]!.name} for {SPACES[m.space]!.name}
                <span className="text-ink-muted">· completes {groupName(m.group)}</span>
              </button>
            ))}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-10 items-center justify-center rounded-xl border border-line text-ink transition-[scale,background-color] duration-200 ease-spring hover:bg-white/8 active:scale-90"
          >
            <Icon name="close" size={16} />
          </button>
        </header>

        {/* One scroll area for the whole table, so a card can fly from a hand to a mat unclipped. */}
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto min-[800px]:grid-cols-[274px_minmax(0,1fr)_274px] min-[1180px]:grid-cols-[300px_minmax(0,1fr)_300px]">
          <Hand
            s={s}
            seats={seats}
            seat={me}
            title="Your cards"
            avatar={<TokenAvatar color={cssHex(seats[me]!.color)} piece={seats[me]!.piece} size={32} />}
            inDeal={give.spaces}
            onCard={(space, rect) => toggle('give', space, rect)}
            fly={fly}
            locked={settled}
          />

          <div className="p-4 min-[1180px]:sticky min-[1180px]:top-0 min-[1180px]:self-start min-[1180px]:p-4.5">
            <Felt className="p-4 min-[1180px]:p-5">
              <div className="grid grid-cols-1 items-stretch min-[1180px]:grid-cols-[minmax(0,1fr)_54px_minmax(0,1fr)]">
                <Mat
                  tone="give"
                  footer={
                    <div className="flex flex-col gap-2.5">
                      {lockup('give', give, meP.jailCards.length)}
                      <CashEditor
                        label="You give: cash"
                        value={give.cash}
                        max={settled ? give.cash : meP.cash}
                        locked={settled}
                        onChange={(cash) => edit(setGive, { ...give, cash })}
                      />
                    </div>
                  }
                >
                  {matCards('give', give)}
                  {give.spaces.length === 0 && <CardSlot k={matK}>Click your cards to add them</CardSlot>}
                  {give.cash > 0 && <CoinStack value={give.cash} reg={reg('give', 'cash')} />}
                </Mat>
                <SwapArrows stacked={!wide} />
                <Mat
                  tone="get"
                  footer={
                    <div className="flex flex-col gap-2.5">
                      {lockup('get', get, them.jailCards.length)}
                      <CashEditor
                        label="You get: cash"
                        value={get.cash}
                        max={settled ? get.cash : them.cash}
                        locked={settled}
                        onChange={(cash) => edit(setGet, { ...get, cash })}
                      />
                    </div>
                  }
                >
                  {matCards('get', get)}
                  {get.spaces.length === 0 && (
                    <CardSlot k={matK}>Click {them.name}&apos;s cards to add them</CardSlot>
                  )}
                  {get.cash > 0 && <CoinStack value={get.cash} reg={reg('get', 'cash')} />}
                </Mat>
              </div>
            </Felt>
          </div>

          <Hand
            s={s}
            seats={seats}
            seat={partner}
            title={`${them.name}'s cards`}
            avatar={
              <TokenAvatar color={cssHex(seats[partner]!.color)} piece={seats[partner]!.piece} size={40} />
            }
            tag={bot ? `${personality ?? 'Balanced'} bot` : null}
            bubble={bot ? <SpeechBubble text={line ?? ''} mood={lineMood} /> : null}
            inDeal={get.spaces}
            onCard={(space, rect) => toggle('get', space, rect)}
            fly={fly}
            locked={settled}
          />
        </div>

        <footer className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-line bg-white/2 px-5 py-3.5 min-[1180px]:px-6 min-[1180px]:py-4">
          {/* The notes block keeps its width when empty, so the footer does not jump. */}
          <div className="flex min-h-9 w-60 flex-col justify-center">
            {empty ? (
              <span className="text-xs text-ink-muted">Set effects and fees show here.</span>
            ) : (
              <DealNotes
                s={atSend ?? s}
                me={me}
                them={partner}
                themName={them.name}
                give={give}
                get={get}
                fee={mortgageFee(atSend ?? s, get.spaces)}
                column
              />
            )}
          </div>
          {bot ? (
            <div className="mx-auto min-w-52 max-w-90 flex-1">
              <DealMeter mood={meterMood} />
            </div>
          ) : (
            <span className="flex-1 text-sm text-ink-muted">{them.name} decides when you send it.</span>
          )}
          {problem && <span className="text-sm font-bold text-alert">{problem}</span>}
          {verdict?.kind === 'bot' && !verdict.accepts && verdict.more !== null && (
            <button
              type="button"
              onClick={() => {
                sound.play('money.coin')
                edit(setGive, { ...give, cash: give.cash + verdict.more! })
              }}
              className="h-11 rounded-[14px] border border-accent/60 bg-accent/10 px-4 text-sm font-extrabold whitespace-nowrap text-gold transition-[scale,background-color] duration-200 ease-spring hover:bg-accent/20 active:scale-95"
            >
              Add <Money value={verdict.more} /> to make it work
            </button>
          )}
          <div className="ml-auto flex items-center gap-2.5">
            <Btn kind="secondary" onClick={onClose} className="h-13! rounded-2xl! px-5! text-[15px]!">
              Cancel
            </Btn>
            <Btn
              kind="primary"
              onClick={send}
              disabled={empty || !check.ok || settled}
              className="h-14! rounded-2xl! px-6.5! text-[17px]!"
            >
              {settled ? 'Waiting…' : 'Send offer'}
            </Btn>
          </div>
        </footer>
      </Panel>
    </section>
  )
}

/** One player's properties, grouped by set; cards on the table stay put, dimmed. */
function Hand({
  s,
  seats,
  seat,
  title,
  avatar,
  tag = null,
  bubble = null,
  inDeal,
  onCard,
  fly,
  locked,
}: {
  s: GameState
  seats: readonly SeatSetup[]
  seat: number
  title: string
  avatar: ReactNode
  tag?: string | null
  bubble?: ReactNode
  inDeal: readonly number[]
  onCard: (space: number, rect: DOMRect) => void
  fly: FlyRects
  locked: boolean
}) {
  const p = s.players[seat]!
  const spaces = tradeSpaces(s, seat)
  const groups = [...GROUPS.keys(), -1]
    .map((g) => ({ g, list: spaces.filter((x) => SPACES[x.space]!.group === g) }))
    .filter((x) => x.list.length > 0)
  return (
    <section
      aria-label={title}
      className="flex min-w-0 flex-col gap-3 px-5 py-4 max-[799px]:border-t max-[799px]:border-line"
    >
      <div className="flex items-center gap-2.5">
        {avatar}
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-display text-base font-bold">{title}</span>
          <span className="text-[11px] font-bold text-ink-muted">
            <Money value={p.cash} /> cash
            {tag && <span className="ml-2 tracking-[0.1em] uppercase">{tag}</span>}
          </span>
        </div>
      </div>
      {bubble}
      {groups.length === 0 && <span className="text-sm text-ink-muted">No properties</span>}
      <div className="flex flex-col gap-3.5">
        {groups.map(({ g, list }) => (
          <div key={g} className="flex flex-col gap-2">
            <SetHeader s={s} seat={seat} group={g} />
            <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2.5">
              {list.map((x) => (
                <HandCard
                  key={x.space}
                  s={s}
                  seats={seats}
                  space={x.space}
                  k={HAND_SCALE}
                  onTable={inDeal.includes(x.space)}
                  blocked={x.blocked}
                  fly={fly}
                  {...(locked ? {} : { onPick: (rect: DOMRect) => onCard(x.space, rect) })}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
