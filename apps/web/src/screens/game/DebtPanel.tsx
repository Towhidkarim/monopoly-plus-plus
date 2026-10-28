import { useEffect, useState, type ReactNode } from 'react'
import {
  CHANCE_CARDS,
  CHEST_CARDS,
  HOTEL,
  SPACES,
  loanCap,
  loanTerms,
  rentFor,
  type Action,
  type CashReason,
  type Deck,
  type GameState,
} from '@skyline/engine'
import { liquidationValue, raisePlan, raiseValue } from '@skyline/bots'
import { sound } from '../../audio/engine.ts'
import type { GameStore, Snapshot } from '../../game/store.ts'
import { cssHex } from '../../spaceInfo.ts'
import { useReducedMotion } from './cardEnv.tsx'
import { useDialogFocus } from './useDialogFocus.ts'
import { Stamp } from './cardMotion.tsx'
import { flavorOf } from './cardInfo.ts'
import { familyColor, familyName } from './deed.ts'
import { fmtMoney } from './format.ts'
import { HOLD_MS, useResultHold } from './tradeFx.ts'
import type { TurnView } from './turn.ts'
import { Btn, DeedSwatch, Eyebrow, Kbd, TokenAvatar, FX_BRIGHT } from './ui.tsx'
import type { PieceKind } from '@skyline/board'

type Raise = Extract<Action, { type: 'SELL_BUILDING' | 'MORTGAGE' }>

const REASON: Partial<Record<CashReason, string>> = {
  rent: 'rent',
  tax: 'tax',
  card: 'for a card',
  jailFine: 'the fine',
}
const BILL_TITLE: Partial<Record<CashReason, string>> = {
  rent: 'Rent due',
  tax: 'Tax due',
  card: 'Card due',
  jailFine: 'Fine due',
}

/** After its PAID or BANKRUPT stamp has been held (see HOLD_MS) the bill slides away. */
const SLIDE_MS = 380

/** Everything the bill and the options need, frozen so the bill can still show after the debt is gone. */
interface DebtView {
  seat: number
  owed: number
  cash: number
  liquid: number
  need: number
  enough: boolean
  reason: CashReason
  round: number
  creditor: { name: string; color: string; piece: PieceKind } | null
  lines: { label: string; amount: number }[]
  options: { a: Raise; title: string; detail: string }[]
  recommended: Action[]
  planAmount: number
  planActions: Action[]
  /** Second Wind (D63): the loan on offer, or why there is none; null when the twist is off. */
  loan: { amount: number; owed: number; rate: number; legal: boolean; blocked: string | null } | null
}

type Outcome = 'paid' | 'bankrupt'

function houseWords(level: number): string {
  if (level >= HOTEL) return ' · hotel'
  return level > 0 ? ` · ${level} ${level === 1 ? 'house' : 'houses'}` : ''
}

/** The card that was drawn last, as far as this client has seen (it is gone from the screen by the time the bill shows). */
interface DrawnCard {
  deck: Deck
  cardId: number
}

/** What a card bill is for: the card's title, or at least which deck it came from. */
function cardLabel(s: GameState, seat: number, card: DrawnCard | null): string {
  const found = card && (card.deck === 'chance' ? CHANCE_CARDS : CHEST_CARDS)[card.cardId]
  if (found) return flavorOf(found)
  const kind = SPACES[s.players[seat]!.position]!.kind
  return kind === 'chest' ? 'City Fund card' : 'Opportunity card'
}

function lineLabel(s: GameState, seat: number, reason: CashReason, card: DrawnCard | null): string {
  const pos = s.players[seat]!.position
  const name = SPACES[pos]!.name
  if (reason === 'rent') return `${name}${SPACES[pos]!.kind === 'property' ? houseWords(s.houses[pos]!) : ''}`
  if (reason === 'tax') return name
  if (reason === 'card') return cardLabel(s, seat, card)
  if (reason === 'jailFine') return 'Lockup fine'
  return 'Payment'
}

function buildView(snap: Snapshot, store: GameStore, turn: TurnView, card: DrawnCard | null): DebtView {
  const s = snap.state
  const seat = turn.actorSeat
  const me = s.players[seat]!
  const mine = s.debts.filter((d) => d.debtor === seat)
  const owed = mine.reduce((t, d) => t + d.amount, 0)
  const first = mine[0]!
  const seatInfo = first.creditor >= 0 ? store.setup.seats[first.creditor] : undefined
  const need = owed - me.cash
  const liquid = liquidationValue(s, me.id)
  const enough = liquid >= need
  const plan = raisePlan(s, me.id, enough ? need : Infinity)
  return {
    seat,
    owed,
    cash: me.cash,
    liquid,
    need,
    enough,
    reason: first.reason,
    round: s.round,
    creditor: seatInfo
      ? { name: s.players[first.creditor]!.name, color: cssHex(seatInfo.color), piece: seatInfo.piece }
      : null,
    lines: mine.map((d) => ({ label: lineLabel(s, seat, d.reason, card), amount: d.amount })),
    options: turn.legal
      .filter((a): a is Raise => a.type === 'SELL_BUILDING' || a.type === 'MORTGAGE')
      .map((a) => ({ a, title: optionTitle(s, a), detail: detail(s, a) })),
    recommended: plan.actions,
    planAmount: plan.amount,
    planActions: plan.actions,
    loan: s.config.secondWind ? loanOffer(s, seat, turn.legal) : null,
  }
}

/** The Second Wind loan on offer for the current shortfall, or why there is none. */
function loanOffer(s: GameState, seat: number, legal: readonly Action[]): DebtView['loan'] {
  const { amount, owed, rate } = loanTerms(s, seat)
  const open = s.players[seat]!.loan ?? 0
  const cap = loanCap(s, seat)
  const blocked =
    open > 0
      ? `Your loan is still open (${fmtMoney(open)} to go). Pay it off to borrow again.`
      : amount > cap
        ? `The bank lends up to what your city is worth, ${fmtMoney(cap)}.`
        : null
  return { amount, owed, rate, legal: legal.some((a) => a.type === 'TAKE_LOAN'), blocked }
}

/**
 * Owes more than they have: a printed bill on card stock beside the options (everything that can
 * be sold or mortgaged, one click each), a cash / assets / owed bar, an automatic fix, a trade and
 * a bankruptcy exit. When the debt clears the bill is stamped PAID (or BANKRUPT), slides away and
 * the coins fly to the creditor (the store's transfer effect).
 */
export function DebtPanel({
  snap,
  store,
  turn,
  onTrade,
}: {
  snap: Snapshot
  store: GameStore
  turn: TurnView
  onTrade: (() => void) | null
}) {
  const s = snap.state
  // Stay open while an action animates (turn.moment goes null then), until the debt is really gone.
  const owing = turn.human && s.debts[0]?.debtor === turn.actorSeat
  // The drawn card is remembered (adjusting state while rendering, no effect), for a card bill.
  const [drawn, setDrawn] = useState<DrawnCard | null>(null)
  if (snap.card && (snap.card.deck !== drawn?.deck || snap.card.cardId !== drawn.cardId))
    setDrawn({ deck: snap.card.deck, cardId: snap.card.cardId })
  const view = owing ? buildView(snap, store, turn, drawn) : null
  // The last live view is kept so the bill can still show once the debt is gone. Adjusting state
  // while rendering (keyed on the view's content) avoids an effect and a ref read in render.
  const [last, setLast] = useState<DebtView | null>(null)
  const key = view ? JSON.stringify(view) : null
  const [seen, setSeen] = useState<string | null>(null)
  if (key !== seen) {
    setSeen(key)
    if (view) setLast(view)
  }
  const [out, setOut] = useState(false)
  const reduced = useReducedMotion()

  // The debt is gone: the bill shows its stamp, holds it long enough to read (a click or Esc skips
  // the hold), slides away, then unmounts. Timers set the final state, so it ends right even when
  // no animation frame runs (hidden tab).
  const gone = view === null && last !== null
  const bankrupt = gone && s.players[last.seat]!.bankrupt
  const hold = bankrupt ? HOLD_MS.bankrupt : reduced ? HOLD_MS.reduced : HOLD_MS.paid
  useResultHold(gone && !out, hold, () => setOut(true))
  useEffect(() => {
    if (!out) return
    const t = window.setTimeout(() => {
      setLast(null)
      setOut(false)
    }, SLIDE_MS + 60)
    return () => clearTimeout(t)
  }, [out])

  const shown = view ?? last
  if (!shown) return null
  const live = view !== null && turn.moment === 'debt' && turn.canAct
  return (
    <Sheet
      v={shown}
      live={live}
      leave={gone ? { outcome: bankrupt ? 'bankrupt' : 'paid', out } : null}
      reduced={reduced}
      store={store}
      turn={turn}
      onTrade={onTrade}
    />
  )
}

function Sheet({
  v,
  live,
  leave,
  reduced,
  store,
  turn,
  onTrade,
}: {
  v: DebtView
  live: boolean
  leave: { outcome: Outcome; out: boolean } | null
  reduced: boolean
  store: GameStore
  turn: TurnView
  onTrade: (() => void) | null
}) {
  const [confirm, setConfirm] = useState(false)
  const dialog = useDialogFocus({ active: live })
  const creditorName = v.creditor?.name ?? 'the bank'
  const total = Math.max(v.owed, v.cash + v.liquid)
  const pct = (x: number) => `${Math.max(0, Math.min(100, (x / total) * 100))}%`
  const out = leave?.out ?? false
  const id = store.setup.seats[v.seat]!.id

  return (
    <div
      {...dialog.props}
      {...(leave ? { inert: true } : {})}
      className={`absolute inset-x-0 top-24 bottom-0 overflow-y-auto bg-table/55 px-4 pt-6 pb-6 ${leave ? 'pointer-events-none' : 'pointer-events-auto'} ${reduced ? '' : 'transition-opacity duration-300 ease-out'} ${out ? 'opacity-0' : ''}`}
    >
      <div
        className={`mx-auto flex w-fit max-w-full items-start gap-9 ${reduced ? '' : 'transition-[translate] duration-400 ease-in'} ${out ? '-translate-y-10' : ''}`}
      >
        <Bill v={v} creditorName={creditorName} outcome={leave?.outcome ?? null} reduced={reduced} />

        <section
          className={`flex max-h-[calc(100vh-9rem)] w-140 max-w-full shrink-0 animate-rise flex-col overflow-hidden rounded-3xl border border-alert/40 bg-panel shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_0_4px_rgba(251,113,133,0.08),0_28px_60px_rgba(2,6,16,0.65)] ${leave && !reduced ? 'transition-opacity duration-300' : ''} ${leave ? 'opacity-60' : ''}`}
        >
          <div className="flex flex-col gap-3.5 px-6 pt-5.5 pb-4">
            <Eyebrow className="text-xs text-rose-300">
              You owe {creditorName} {fmtMoney(v.owed)} {REASON[v.reason] ?? ''}
            </Eyebrow>
            <h2 id={dialog.titleId} className="font-display text-[32px] leading-tight font-bold">
              Raise {fmtMoney(Math.max(0, v.need))} to pay
            </h2>
            <div className="flex flex-col gap-1.5">
              <div aria-hidden="true" className="relative h-4 overflow-hidden rounded-lg bg-white/6">
                <span className="absolute inset-y-0 left-0 bg-accent" style={{ width: pct(v.cash) }} />
                <span
                  className="absolute inset-y-0 bg-[repeating-linear-gradient(135deg,rgba(94,234,212,0.55)_0_6px,rgba(94,234,212,0.2)_6px_12px]"
                  style={{ left: pct(v.cash), width: pct(Math.min(v.liquid, total - v.cash)) }}
                />
                <span
                  className="absolute -top-0.5 -bottom-0.5 w-[3px] bg-card shadow-[0_0_8px_rgba(255,255,255,0.7)]"
                  style={{ left: `calc(${pct(v.owed)} - 3px)` }}
                />
              </div>
              <div className="flex justify-between text-xs text-ink-muted tabular-nums">
                <strong className="font-bold text-gold">Cash {fmtMoney(v.cash)}</strong>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-3 w-[3px] rounded-full bg-card" />
                  Owed {fmtMoney(v.owed)}
                </span>
                <span>
                  Everything below <strong className="font-bold text-teal">+{fmtMoney(v.liquid)}</strong>
                </span>
              </div>
            </div>
          </div>

          {v.loan && <LoanOffer loan={v.loan} live={live} onTake={() => turn.act({ type: 'TAKE_LOAN' })} />}

          <div className="flex min-h-14 flex-1 flex-col gap-0.5 overflow-y-auto px-3">
            {v.options.map(({ a, title, detail: note }) => {
              const picked = v.recommended.some(
                (r) => r.type === a.type && 'space' in r && r.space === a.space,
              )
              return (
                <div
                  key={`${a.type}${a.space}`}
                  className={`flex shrink-0 items-center gap-3 rounded-[14px] px-3 py-2.5 ${picked && v.enough ? 'bg-teal/6' : ''}`}
                >
                  <DeedSwatch color={familyColor(a.space)} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-extrabold">{title}</span>
                    <span className="text-xs text-ink-muted">{note}</span>
                  </div>
                  <TealBtn disabled={!live} onClick={() => turn.act(a)}>
                    +{fmtMoney(raiseValue(a))}
                  </TealBtn>
                </div>
              )
            })}
            {v.options.length === 0 && (
              <div className="px-3 py-3 text-sm text-ink-muted">Nothing left to sell or mortgage.</div>
            )}
          </div>

          <div className="flex flex-col gap-3 px-6 pt-4 pb-5.5">
            {!v.enough && !v.loan?.legal && (
              <div className="rounded-xl border border-alert/30 bg-alert/10 px-3.5 py-3 text-[13px] leading-relaxed">
                Even selling and mortgaging everything leaves you {fmtMoney(v.need - v.liquid)} short. A trade
                could still save you.
              </div>
            )}
            {confirm ? (
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="mr-auto text-sm text-ink-muted">
                  Everything you own goes to {creditorName}. Sure?
                </span>
                <Btn
                  kind="danger"
                  disabled={!live}
                  onClick={() => turn.act({ type: 'DECLARE_BANKRUPTCY' })}
                  className="h-12 rounded-2xl"
                >
                  Yes, go bankrupt
                </Btn>
                <Btn kind="ghost" onClick={() => setConfirm(false)} className="h-12 rounded-2xl">
                  Keep playing
                </Btn>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                {v.planActions.length > 0 && (
                  <Btn
                    autofocus={!v.loan?.legal}
                    kind={v.enough && !v.loan?.legal ? 'primary' : 'secondary'}
                    disabled={!live}
                    onClick={() => store.run(id, v.planActions)}
                    className="h-14 min-w-0 flex-1 rounded-2xl px-5 text-base"
                    title={
                      v.enough
                        ? 'Mortgages lone properties first, then sells houses where rent drops least'
                        : undefined
                    }
                  >
                    {v.enough
                      ? `Raise ${fmtMoney(v.need)} automatically`
                      : `Raise everything (+${fmtMoney(v.planAmount)})`}
                  </Btn>
                )}
                <Btn
                  disabled={!live || !onTrade}
                  onClick={() => onTrade?.()}
                  className="h-14 rounded-2xl px-4.5 text-[15px]"
                >
                  Offer a trade <Kbd>T</Kbd>
                </Btn>
                <button
                  type="button"
                  disabled={!live}
                  onClick={() => setConfirm(true)}
                  className="h-14 rounded-2xl px-3.5 text-sm font-extrabold text-rose-300 underline underline-offset-4 transition hover:text-rose-200 disabled:opacity-40"
                >
                  Go bankrupt
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

/** The printed bill: perforated top edge, who to pay, line items, what is still short, a stamp. */
function Bill({
  v,
  creditorName,
  outcome,
  reduced,
}: {
  v: DebtView
  creditorName: string
  outcome: Outcome | null
  reduced: boolean
}) {
  const short = Math.max(0, v.need)
  return (
    <article
      aria-label="Bill"
      className={`relative mt-7.5 w-72.5 shrink-0 -rotate-3 rounded-t-md rounded-b-2xl bg-card font-card-body text-card-ink shadow-[0_24px_50px_rgba(2,6,16,0.6)] ${reduced ? '' : 'animate-banner'}`}
    >
      <div
        aria-hidden="true"
        className="h-3.5 bg-repeat-x"
        style={{
          backgroundImage: 'radial-gradient(circle at 7px 0, #0b1426 5px, rgba(0,0,0,0) 5.5px)',
          backgroundSize: '14px 14px',
        }}
      />
      <div className="flex flex-col gap-3.5 px-6 pt-2.5 pb-6">
        <span className="flex items-center justify-between">
          <span className="font-card text-[13px] font-extrabold tracking-[0.2em] text-card-muted uppercase">
            {BILL_TITLE[v.reason] ?? 'Bill'}
          </span>
          <span className="text-[11px] text-[#5f6778]">Round {v.round}</span>
        </span>
        <span className="flex items-center gap-2.5">
          {v.creditor ? (
            <TokenAvatar color={v.creditor.color} piece={v.creditor.piece} size={40} />
          ) : (
            <span
              aria-hidden="true"
              className="flex size-10 items-center justify-center rounded-full bg-coin font-display text-lg font-bold text-[#5a3a00] shadow-[inset_0_-3px_0_var(--color-coin-dark)]"
            >
              ₵
            </span>
          )}
          <span className="flex flex-col">
            <span className="text-xs text-card-muted">Pay to</span>
            <span className="font-card text-xl font-extrabold">{creditorName}</span>
          </span>
        </span>
        <div className="flex flex-col gap-1.5 border-y border-dashed border-[#d8cfbb] py-3 text-[13px]">
          {v.lines.map((l, i) => (
            <span key={i} className="flex justify-between gap-3">
              <span>{l.label}</span>
              <span className="font-bold tabular-nums">{fmtMoney(l.amount)}</span>
            </span>
          ))}
          <span className="flex justify-between text-card-muted">
            <span>Your cash</span>
            <span className="tabular-nums">{fmtMoney(v.cash)}</span>
          </span>
        </div>
        <span className="flex items-baseline justify-between">
          {outcome === 'paid' ? (
            <>
              <span className="text-[13px] font-bold text-card-money">Settled</span>
              <span className="font-card text-[34px] font-extrabold text-card-money">{fmtMoney(0)}</span>
            </>
          ) : (
            <>
              <span className="text-[13px] font-bold text-[#b42318]">Still short</span>
              <span className="font-card text-[34px] font-extrabold text-[#b42318] tabular-nums">
                {fmtMoney(short)}
              </span>
            </>
          )}
        </span>
      </div>
      {outcome === null ? (
        <Stamp
          key="due"
          word="DUE"
          color="#b42318"
          size={18}
          rotate={12}
          bg="transparent"
          className="absolute top-15.5 right-4.5"
        />
      ) : (
        <Stamp
          key={outcome}
          word={outcome === 'paid' ? 'PAID' : 'BANKRUPT'}
          color={outcome === 'paid' ? '#1d7354' : '#b42318'}
          size={outcome === 'paid' ? 34 : 26}
          rotate={outcome === 'paid' ? -10 : -8}
          bg="rgba(251,248,241,0.88)"
          className="absolute top-28 left-1/2 -ml-20"
        />
      )}
    </article>
  )
}

/** Teal "+₵N" action: the amount this option raises. */
function TealBtn({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode
  onClick: () => void
  disabled: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        sound.play('ui.click')
        onClick()
      }}
      className={`h-10 shrink-0 rounded-xl border border-teal/50 bg-teal/10 px-3.5 font-display text-[15px] font-bold text-teal tabular-nums ${FX_BRIGHT} enabled:hover:bg-teal/20 disabled:pointer-events-none disabled:opacity-40`}
    >
      {children}
    </button>
  )
}

function optionTitle(s: GameState, a: Raise): string {
  const name = SPACES[a.space]!.name
  if (a.type === 'MORTGAGE') return `Mortgage ${name}`
  return `${s.houses[a.space] === HOTEL ? 'Sell the hotel on' : 'Sell a house on'} ${name}`
}

function detail(s: GameState, a: Raise): string {
  const sp = SPACES[a.space]!
  if (a.type === 'MORTGAGE') return `${familyName(a.space)} · earns no rent while mortgaged`
  const level = s.houses[a.space]!
  const after = level === HOTEL ? 'hotel becomes 4 houses' : `rent drops to ${fmtMoney(sp.rent[level - 1]!)}`
  return `${familyName(a.space)} · ${after} (now ${fmtMoney(rentFor(s, a.space, 7))})`
}

/** Second Wind: the bank covers the whole bill now; half of every income pays it back. */
function LoanOffer({
  loan,
  live,
  onTake,
}: {
  loan: NonNullable<DebtView['loan']>
  live: boolean
  onTake: () => void
}) {
  if (!loan.legal)
    return (
      <div className="mx-6 mb-2 rounded-2xl border border-line px-4 py-3 text-[13px] leading-relaxed text-ink-muted">
        <strong className="font-display text-ink">Second Wind</strong> ·{' '}
        {loan.blocked ?? 'No loan right now.'}
      </div>
    )
  return (
    <div className="mx-6 mb-2 flex items-center gap-3.5 rounded-2xl border border-gold/50 bg-gold/8 px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      <span
        aria-hidden="true"
        className="flex size-11 shrink-0 animate-pop items-center justify-center rounded-full bg-coin font-display text-xl font-bold text-[#5a3a00] shadow-[inset_0_-3px_0_var(--color-coin-dark)]"
      >
        ₵
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-display text-base font-bold text-gold">
          Second Wind: borrow {fmtMoney(loan.amount)}
        </span>
        <span className="text-xs leading-snug text-ink-muted">
          The bank pays the bill and you keep every building. Repay {fmtMoney(loan.owed)} (
          {Math.round(loan.rate * 100)}% interest) from half of what you earn.
        </span>
      </div>
      <Btn
        autofocus
        kind="primary"
        disabled={!live}
        onClick={onTake}
        className="h-12 shrink-0 rounded-2xl px-4.5"
      >
        Take the loan
      </Btn>
    </div>
  )
}
