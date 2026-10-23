import { useEffect, useRef, useState, type ReactNode } from 'react'
import { GROUPS, SPACES, reduce, type Action, type Bundle } from '@skyline/engine'
import { sound } from '../../audio/engine.ts'
import { usePanelSound } from '../../audio/usePanelSound.ts'
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
import { groupColor, groupName } from '../../spaceInfo.ts'
import { Icon } from './icons.tsx'
import {
  Avatar,
  CardSlot,
  CashEditor,
  DealMeter,
  DealNotes,
  MiniCard,
  SetHeader,
  SpeechBubble,
  Stamp,
  type FlyRects,
} from './TradeParts.tsx'
import { Btn, Eyebrow, Money, Panel } from './ui.tsx'

/** How the trade table opens: fresh, or prefilled as a counter to an offer. */
export interface TradeDraft {
  partner?: number
  give?: Bundle
  get?: Bundle
  /** Counter-offer: this offer is declined when the new one is sent. */
  replaces?: number
}

/** How long the result stamp stays before the table closes (accepted) or reopens (declined). */
const STAMP_MS = 1500

/**
 * The trade table: your hand on the left, the partner's on the right, the deal in the middle.
 * Click cards to slide them onto the table. A bot partner reacts live (deal meter and a line in
 * its personality); sending shows its answer as a stamp.
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
  const s = snap.state
  const others = s.players.flatMap((p, i) => (i !== me && !p.bankrupt ? [i] : []))
  const [partner, setPartner] = useState(draft.partner ?? others[0] ?? -1)
  const [give, setGive] = useState<Bundle>(draft.give ?? emptyBundle())
  const [get, setGet] = useState<Bundle>(draft.get ?? emptyBundle())
  const [sent, setSent] = useState<number | null>(null)
  const [lastWord, setLastWord] = useState<string | null>(null)
  const fly = useRef(new Map<number, DOMRect>())

  const outcome = sent === null ? undefined : snap.tradeOutcomes[sent]
  // After the stamp: close on a deal; on a refusal, back to the table with the bot's last word.
  useEffect(() => {
    if (!outcome) return
    const t = setTimeout(() => {
      if (outcome === 'accepted') onClose()
      else {
        setSent(null)
        setLastWord(reaction(store.botName(partner), 'declined'))
      }
    }, STAMP_MS)
    return () => clearTimeout(t)
  }, [outcome, onClose, partner, store])

  if (partner < 0) return null
  const meP = s.players[me]!
  const them = s.players[partner]!
  const bot = store.seatKind(them.id) === 'bot'
  const personality = store.botName(partner)

  const action: Action = { type: 'PROPOSE_TRADE', to: them.id, give, get }
  const check = reduce(s, meP.id, action)
  const empty = isEmptyBundle(give) && isEmptyBundle(get)
  const problem = empty ? null : check.ok ? null : tradeProblem(check.error)
  const verdict = empty || problem ? null : store.tradeVerdict(s, me, partner, give, get)
  const mood = verdict?.kind === 'bot' ? verdict.mood : null
  const feeling = moodOf(empty ? null : mood)
  // A stable pick per deal shape, so the line does not flicker while you look at it.
  const pick = give.spaces.length + get.spaces.length * 3 + Math.floor((give.cash + get.cash) / 100)
  const line = sent !== null && !outcome ? null : (lastWord ?? reaction(personality, feeling, pick))

  const edit = (setter: (b: Bundle) => void, b: Bundle) => {
    setLastWord(null)
    setter(b)
  }
  const toggle = (side: 'give' | 'get', space: number, rect: DOMRect) => {
    fly.current.set(space, rect)
    sound.play('trade.card')
    const b = side === 'give' ? give : get
    const next = {
      ...b,
      spaces: b.spaces.includes(space) ? b.spaces.filter((x) => x !== space) : [...b.spaces, space],
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
    store.dispatch(meP.id, action)
    if (bot) setSent(id)
    else onClose()
  }

  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-table/65 p-4 backdrop-blur-sm">
      <Panel className="relative flex max-h-full w-full max-w-290 animate-pop flex-col overflow-hidden">
        {outcome && <Stamp outcome={outcome} />}

        <header className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-line px-5 py-3.5">
          <div>
            <Eyebrow className="text-accent">
              {draft.replaces !== undefined ? 'Counter-offer' : 'Trade'}
            </Eyebrow>
            <div className="text-lg font-bold">Trade with</div>
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
                  disabled={(draft.replaces !== undefined && !on) || sent !== null}
                  className={`flex items-center gap-2 rounded-full border py-1 pr-3.5 pl-1 text-sm font-semibold transition disabled:opacity-30 ${on ? 'border-accent bg-accent/10' : 'border-line bg-panel-2 hover:bg-white/10'}`}
                >
                  <Avatar name={p.name} color={store.setup.seats[seat]!.color} />
                  {p.name}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto rounded-lg p-1.5 text-ink-muted hover:bg-white/10 hover:text-ink"
          >
            <Icon name="close" />
          </button>
        </header>

        {suggestions.length > 0 && draft.replaces === undefined && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-2.5">
            <span className="text-xs font-semibold text-ink-muted">Suggested:</span>
            {suggestions.map((m) => (
              <button
                key={m.space}
                type="button"
                onClick={() => suggest(m.space, m.owner)}
                disabled={sent !== null}
                className="flex items-center gap-2 rounded-full border border-gold/40 bg-gold/5 px-3 py-1 text-xs font-semibold text-ink transition hover:bg-gold/15 active:scale-95"
              >
                <span className="size-2 rounded-full" style={{ background: groupColor(m.group) }} />
                Ask {s.players[m.owner]!.name} for {SPACES[m.space]!.name}
                <span className="text-gold">completes {groupName(m.group)}</span>
              </button>
            ))}
          </div>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[1fr_minmax(330px,380px)_1fr]">
          <Hand
            snap={snap}
            seat={me}
            name="Your cards"
            avatar={<Avatar name={meP.name} color={store.setup.seats[me]!.color} size="size-9" />}
            inDeal={give.spaces}
            onCard={(space, rect) => toggle('give', space, rect)}
            fly={fly}
            locked={sent !== null}
          />

          <section className="flex flex-col gap-3 border-y border-line bg-table/60 px-4 py-4 lg:border-x lg:border-y-0">
            <Tray
              title="You give"
              tone="text-alert"
              snap={snap}
              bundle={give}
              maxCash={meP.cash}
              maxCards={meP.jailCards.length}
              onCard={(space, rect) => toggle('give', space, rect)}
              onChange={(b) => edit(setGive, b)}
              fly={fly}
              locked={sent !== null}
              leave={outcome === 'accepted' ? 'right' : null}
            />
            <div className="flex justify-center text-ink-muted">
              <Icon name="trade" />
            </div>
            <Tray
              title="You get"
              tone="text-teal"
              snap={snap}
              bundle={get}
              maxCash={them.cash}
              maxCards={them.jailCards.length}
              onCard={(space, rect) => toggle('get', space, rect)}
              onChange={(b) => edit(setGet, b)}
              fly={fly}
              locked={sent !== null}
              leave={outcome === 'accepted' ? 'left' : null}
            />
          </section>

          <Hand
            snap={snap}
            seat={partner}
            name={`${them.name}'s cards`}
            avatar={<Avatar name={them.name} color={store.setup.seats[partner]!.color} size="size-9" />}
            tag={bot ? personality : null}
            bubble={
              bot ? (
                <SpeechBubble
                  text={line ?? ''}
                  mood={line === null ? 'thinking' : lastWord ? 'no' : feeling}
                />
              ) : null
            }
            inDeal={get.spaces}
            onCard={(space, rect) => toggle('get', space, rect)}
            fly={fly}
            locked={sent !== null}
          />
        </div>

        <footer className="flex flex-col gap-3 border-t border-line px-5 py-3.5">
          {/* The notes row keeps its height when empty, so the dialog does not jump. */}
          <div className="flex min-h-7 items-center">
            {empty ? (
              <span className="text-xs text-ink-muted">Set effects and fees show here.</span>
            ) : (
              <DealNotes
                s={s}
                me={me}
                them={partner}
                themName={them.name}
                give={give}
                get={get}
                fee={mortgageFee(s, get.spaces)}
              />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {bot ? (
              <div className="flex min-w-60 flex-1 items-center gap-4">
                <div className="max-w-80 flex-1">
                  <DealMeter mood={empty || problem ? null : mood} />
                </div>
                {verdict?.kind === 'bot' && !verdict.accepts && verdict.more !== null && !sent && (
                  <button
                    type="button"
                    onClick={() => edit(setGive, { ...give, cash: give.cash + verdict.more! })}
                    className="rounded-full border border-gold/50 px-3 py-1 text-xs font-semibold whitespace-nowrap text-gold hover:bg-gold/10"
                  >
                    Add <Money value={verdict.more} /> to make it work
                  </button>
                )}
              </div>
            ) : (
              <span className="flex-1 text-sm text-ink-muted">{them.name} decides when you send it.</span>
            )}
            {problem && <span className="text-sm font-semibold text-alert">{problem}</span>}
            <div className="ml-auto flex gap-2">
              <Btn kind="ghost" onClick={onClose}>
                Cancel
              </Btn>
              <Btn kind="primary" onClick={send} disabled={empty || !check.ok || sent !== null}>
                {sent !== null ? 'Waiting…' : 'Send offer'}
              </Btn>
            </div>
          </div>
        </footer>
      </Panel>
    </div>
  )
}

/** One player's properties, grouped by set; cards on the table leave an empty slot. */
function Hand({
  snap,
  seat,
  name,
  avatar,
  tag = null,
  bubble = null,
  inDeal,
  onCard,
  fly,
  locked,
}: {
  snap: Snapshot
  seat: number
  name: string
  avatar: ReactNode
  tag?: string | null
  bubble?: ReactNode
  inDeal: readonly number[]
  onCard: (space: number, rect: DOMRect) => void
  fly: FlyRects
  locked: boolean
}) {
  const s = snap.state
  const p = s.players[seat]!
  const spaces = tradeSpaces(s, seat)
  const groups = [...GROUPS.keys(), -1]
    .map((g) => ({ g, list: spaces.filter((x) => SPACES[x.space]!.group === g) }))
    .filter((x) => x.list.length > 0)
  return (
    <section className="flex min-w-0 flex-col gap-3 px-5 py-4">
      <div className="flex items-center gap-3">
        {avatar}
        <div className="min-w-0">
          <div className="truncate font-bold">{name}</div>
          <div className="text-xs text-ink-muted">
            <Money value={p.cash} /> cash
            {tag && <span className="ml-2 font-bold tracking-wider uppercase">{tag}</span>}
          </div>
        </div>
      </div>
      {bubble}
      {groups.length === 0 && <span className="text-sm text-ink-muted">No properties</span>}
      <div className="flex flex-col gap-3">
        {groups.map(({ g, list }) => (
          <div key={g} className="flex flex-col gap-1.5">
            <SetHeader s={s} seat={seat} group={g} />
            <div className="flex flex-wrap gap-2">
              {list.map((x) =>
                inDeal.includes(x.space) ? (
                  <CardSlot key={`slot${x.space}`} />
                ) : (
                  <MiniCard
                    key={`hand${x.space}`}
                    s={s}
                    space={x.space}
                    blocked={x.blocked}
                    fly={fly}
                    {...(locked ? {} : { onClick: (rect: DOMRect) => onCard(x.space, rect) })}
                  />
                ),
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

/** One side of the deal on the table: its cards, cash, and Lockup cards. */
function Tray({
  title,
  tone,
  snap,
  bundle,
  maxCash,
  maxCards,
  onCard,
  onChange,
  fly,
  locked,
  leave,
}: {
  title: string
  tone: string
  snap: Snapshot
  bundle: Bundle
  maxCash: number
  maxCards: number
  onCard: (space: number, rect: DOMRect) => void
  onChange: (b: Bundle) => void
  fly: FlyRects
  locked: boolean
  /** On a done deal, this side's cards slide off toward their new owner. */
  leave: 'left' | 'right' | null
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-line bg-panel px-3.5 py-3">
      <span className={`text-sm font-bold ${tone}`}>{title}</span>
      <div
        className="flex min-h-24 flex-wrap gap-2 transition-[transform,opacity] delay-300 duration-700 ease-in"
        style={
          leave ? { transform: `translateX(${leave === 'right' ? 360 : -360}px)`, opacity: 0 } : undefined
        }
      >
        {bundle.spaces.map((space) => (
          <MiniCard
            key={`tray${space}`}
            s={snap.state}
            space={space}
            fly={fly}
            {...(locked ? {} : { onClick: (rect: DOMRect) => onCard(space, rect) })}
          />
        ))}
        {bundle.spaces.length === 0 && (
          <span className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-line text-xs text-ink-muted">
            Click cards to add them
          </span>
        )}
      </div>
      <CashEditor
        label={`${title}: cash`}
        value={bundle.cash}
        max={locked ? bundle.cash : maxCash}
        onChange={(cash) => onChange({ ...bundle, cash })}
      />
      {maxCards > 0 && (
        <label className="flex items-center justify-between gap-2 text-xs text-ink-muted">
          <span className="flex items-center gap-1.5">
            <Icon name="lock" size={14} /> Lockup cards
          </span>
          <select
            value={bundle.jailCards}
            disabled={locked}
            onChange={(e) => onChange({ ...bundle, jailCards: Number(e.target.value) })}
            className="rounded-md border border-line bg-table px-2 py-1 text-ink"
          >
            {Array.from({ length: maxCards + 1 }, (_, n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}
