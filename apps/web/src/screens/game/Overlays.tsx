import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  CHANCE_CARDS,
  CHEST_CARDS,
  GROUPS,
  HOTEL,
  SPACES,
  UNDERDOG_MAX,
  netWorth,
  ownsGroup,
  type GameConfig,
  type GameState,
} from '@skyline/engine'
import type { CursorPref } from '../../cursors.ts'
import type { SkyPref } from '../../game/sky.ts'
import type { GameStore, Snapshot } from '../../game/store.ts'
import { sound } from '../../audio/engine.ts'
import { usePanelSound } from '../../audio/usePanelSound.ts'
import { cssHex, groupName } from '../../spaceInfo.ts'
import { CardArt } from './cardArt.tsx'
import { DECK_STYLE, artOf, flavorOf, moneyOf, textParts } from './cardInfo.ts'
import { useReducedMotion } from './cardEnv.tsx'
import { useDialogFocus } from './useDialogFocus.ts'
import { CardStage, Stamp } from './cardMotion.tsx'
import { Confetti } from './Confetti.tsx'
import { WorthChart } from './WorthChart.tsx'
import { Icon } from './icons.tsx'
import { SPEEDS, type SpeedChoice } from './format.ts'
import { Btn, Eyebrow, Kbd, Money, Panel, TokenAvatar } from './ui.tsx'

/** The drawn card. A human's card waits for Continue; a bot's closes by itself. */
export function CardPopup({ snap, store }: { snap: Snapshot; store: GameStore }) {
  const c = snap.card
  const dialog = useDialogFocus({ active: c?.waiting === true })
  if (!c) return null
  const cards = c.deck === 'chance' ? CHANCE_CARDS : CHEST_CARDS
  const card = cards[c.cardId]
  const deck = DECK_STYLE[c.deck]
  const money = card ? moneyOf(card, snap.state.config.goSalary) : null
  return (
    <div
      {...dialog.props}
      // A phone held sideways (short screen, D64): centered and scaled down, the card is taller than the screen.
      className={`absolute inset-x-0 top-24 bottom-0 flex items-start justify-center px-4 pt-20 [@media(max-height:499px)]:top-0 [@media(max-height:499px)]:items-center [@media(max-height:499px)]:pt-0 ${c.waiting ? 'pointer-events-auto bg-table/55' : 'pointer-events-none'}`}
    >
      <div className="flex flex-col items-center gap-[18px] [@media(max-height:499px)]:scale-[0.62]">
        <div className="relative h-[440px] w-[300px]">
          {/* The deck behind the drawn card. */}
          <div
            aria-hidden="true"
            className="absolute inset-[8px_-4px_-4px_8px] rotate-[2.5deg] rounded-[22px] border-2"
            style={{ background: deck.back, borderColor: deck.backEdge }}
          />
          <div
            aria-hidden="true"
            className="absolute inset-[16px_-10px_-10px_16px] rotate-5 rounded-[18px] shadow-[0_14px_30px_rgba(2,6,16,0.5)]"
            style={{ background: deck.back }}
          />
          <CardStage
            deal
            radius={18}
            dealFrom={{ x: 30, y: 90 }}
            back={{ color: deck.back, edge: deck.backEdge }}
            className="absolute inset-0"
          >
            <article
              aria-label={`${deck.name} card`}
              className="relative h-[440px] w-[300px] paper overflow-hidden rounded-[18px] bg-card font-card-body text-card-ink shadow-card-lg"
            >
              <div
                className="relative h-[100px]"
                style={{
                  background: deck.band,
                  backgroundImage:
                    'repeating-linear-gradient(135deg, rgba(255,255,255,0.06) 0 10px, rgba(255,255,255,0) 10px 20px)',
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  aria-hidden="true"
                  className="absolute top-4 left-4"
                >
                  <path d={deck.pip} fill="#fff" />
                </svg>
                <span
                  id={dialog.titleId}
                  className="absolute inset-x-0 top-[18px] text-center text-xs font-bold tracking-[0.22em] text-white uppercase"
                >
                  {deck.name}
                </span>
                <div
                  className="absolute top-[46px] left-[105px] flex size-[90px] items-center justify-center rounded-full border-4 bg-card shadow-[0_6px_14px_rgba(20,16,8,0.25)]"
                  style={{ borderColor: deck.band }}
                >
                  {card && <CardArt kind={artOf(card)} band={deck.band} tint={rgba(deck.band, 0.18)} />}
                </div>
              </div>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-2 rounded-[15px] border-[1.5px]"
                style={{ borderColor: deck.band }}
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-3 rounded-xl border"
                style={{ borderColor: rgba(deck.band, 0.25) }}
              />
              <div className="flex flex-col items-center gap-3 px-7 pt-14 text-center">
                <span
                  className="font-card text-[13px] font-extrabold tracking-[0.12em] uppercase"
                  style={{ color: deck.band }}
                >
                  {card ? flavorOf(card) : ''}
                </span>
                <p className="m-0 font-card text-[23px] leading-[1.22] font-extrabold">
                  {card &&
                    textParts(card.text).map((p, i) =>
                      p.chip ? (
                        <span
                          key={i}
                          className="rounded-md px-1.5"
                          style={{ background: p.chip.bg, color: p.chip.ink }}
                        >
                          {p.text}
                        </span>
                      ) : (
                        p.text
                      ),
                    )}
                </p>
                {money && (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[15px] font-bold"
                    style={{
                      background: money.bad ? '#fbe9e7' : '#e9f3ec',
                      color: money.bad ? '#9b1c1c' : '#14513b',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className="flex size-[18px] items-center justify-center rounded-full bg-coin text-[10px] font-extrabold text-[#5a3a00] shadow-[inset_0_-2px_0_var(--color-coin-dark)]"
                    >
                      ₵
                    </span>
                    {money.text}
                  </span>
                )}
              </div>
              <span className="absolute inset-x-6 bottom-[22px] flex justify-between text-[11px] text-[#5f6778]">
                <span>Drawn by {store.nameOf(c.playerId)}</span>
                <span>
                  {deck.name} · {String(c.cardId + 1).padStart(2, '0')} / {cards.length}
                </span>
              </span>
            </article>
          </CardStage>
        </div>
        {c.waiting ? (
          <Btn
            kind="primary"
            autofocus
            onClick={() => store.ackCard()}
            className="h-[58px] rounded-[18px] px-[30px] text-lg"
          >
            Continue <Kbd>Space</Kbd>
          </Btn>
        ) : (
          <div className="text-xs text-ink-muted">Bot cards close by themselves.</div>
        )}
      </div>
    </div>
  )
}

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Short facts about the winner's city, from the final state (nothing is omitted by hand: zero counts are skipped). */
function winnerFacts(s: GameState, seat: number): string[] {
  const owned = SPACES.map((_, i) => i).filter((i) => s.owner[i] === seat)
  const hotels = owned.filter((i) => s.houses[i] === HOTEL).length
  const houses = owned.reduce((n, i) => n + (s.houses[i]! > 0 && s.houses[i]! < HOTEL ? s.houses[i]! : 0), 0)
  const sets = GROUPS.map((_, g) => g).filter((g) => ownsGroup(s, seat, g))
  const facts = [plural(owned.length, 'property', 'properties')]
  if (hotels > 0) facts.push(plural(hotels, 'hotel'))
  if (houses > 0) facts.push(plural(houses, 'house'))
  if (sets.length > 0)
    facts.push(sets.length <= 2 ? `Owns ${sets.map(groupName).join(' and ')}` : `${sets.length} full sets`)
  return facts
}

const ordinal = (n: number) =>
  `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`

const PODIUM = [
  { h: 116, block: '#f2c14e' },
  { h: 84, block: '#c9d1dc' },
  { h: 62, block: '#d99a6c' },
] as const

/** Game over: the winner's certificate on card stock, and the final standings on a Lamplight panel. */
export function GameOver({
  snap,
  store,
  onRestart,
  onQuit,
}: {
  snap: Snapshot
  store: GameStore
  onRestart: () => void
  onQuit: () => void
}) {
  const s = snap.state
  const reduced = useReducedMotion()
  const over = snap.presented.over && !snap.busy
  const dialog = useDialogFocus({ active: over })
  // The CITY HALL stamp lands a beat after the certificate does.
  const [stamped, setStamped] = useState(false)
  useEffect(() => {
    if (!over) return
    const t = window.setTimeout(() => setStamped(true), 650)
    return () => clearTimeout(t)
  }, [over])
  if (!over) return null

  const seats = store.setup.seats
  // The winner is always first; the rest follow by net worth (bankrupt players last).
  const standings = s.players
    .map((p, seat) => ({ p, seat, worth: p.bankrupt ? 0 : netWorth(s, seat) }))
    .toSorted((a, b) => (a.seat === s.winner ? -1 : b.seat === s.winner ? 1 : b.worth - a.worth))
  const winner = s.players[s.winner]!
  const winnerSeat = seats[s.winner]!
  const winnerWorth = standings[0]!.worth
  const you =
    snap.viewer !== null && snap.viewer !== s.winner ? standings.findIndex((r) => r.seat === snap.viewer) : -1
  const podium = [1, 0, 2].flatMap((rank) => {
    const row = standings[rank]
    return row ? [{ ...row, rank, ...PODIUM[rank]! }] : []
  })

  return (
    <div
      {...dialog.props}
      className="absolute inset-0 z-30 flex overflow-y-auto bg-[rgba(6,10,20,0.74)] p-4 backdrop-blur-[2px]"
    >
      {!reduced && <Confetti />}
      <div className="relative m-auto flex flex-wrap items-start justify-center gap-9">
        <article className="relative w-[440px] max-w-full animate-pop overflow-hidden rounded-[20px] bg-card font-card-body text-card-ink shadow-[0_30px_70px_rgba(2,6,16,0.7),0_3px_0_var(--color-card-edge)]">
          <div aria-hidden="true" className="absolute inset-2.5 rounded-[13px] border-2 border-coin-dark" />
          <div
            aria-hidden="true"
            className="absolute inset-[15px] rounded-[10px] border border-coin-dark/40"
          />
          <div className="relative flex flex-col items-center gap-3 px-10 pt-[38px] pb-[34px] text-center">
            <span className="font-card text-[13px] font-extrabold tracking-[0.24em] text-[#8a6318] uppercase">
              Game over · Round {s.round}
            </span>
            <div className="relative my-1.5 size-[110px]">
              <svg
                width="110"
                height="110"
                viewBox="0 0 110 110"
                aria-hidden="true"
                className="absolute inset-0"
              >
                <path
                  d="M55 4 L63 14 L76 10 L79 23 L92 26 L89 39 L100 47 L92 57 L98 69 L86 74 L86 88 L73 87 L66 99 L55 92 L44 99 L37 87 L24 88 L24 74 L12 69 L18 57 L10 47 L21 39 L18 26 L31 23 L34 10 L47 14 Z"
                  fill="#f2c14e"
                />
              </svg>
              <TokenAvatar
                color={cssHex(winnerSeat.color)}
                piece={winnerSeat.piece}
                size={76}
                shadow="inset 0 -5px 0 rgba(0,0,0,0.18)"
                className="absolute top-[17px] left-[17px] border-4 border-card"
              />
            </div>
            <span className="text-sm text-card-muted">The city has a new mayor</span>
            <h2 id={dialog.titleId} className="m-0 font-card text-[46px] leading-none font-extrabold">
              {winner.name} won!
            </h2>
            <span className="font-card text-[22px] font-extrabold text-card-money">
              Net worth <Money value={winnerWorth} />
            </span>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {winnerFacts(s, s.winner).map((f) => (
                <span key={f} className="rounded-full bg-[#f0eadc] px-2.5 py-1.5 text-xs font-bold">
                  {f}
                </span>
              ))}
            </div>
          </div>
          {stamped && (
            <Stamp
              word="CITY HALL"
              color="rgba(180,35,24,0.85)"
              size={13}
              rotate={-14}
              bg="transparent"
              className="absolute right-9 bottom-9"
            />
          )}
        </article>

        <Panel className="flex w-[420px] max-w-full animate-rise flex-col gap-4 rounded-3xl p-6 shadow-panel-lg [animation-delay:140ms] [animation-fill-mode:backwards]">
          <Eyebrow className="text-ink-muted">Final standings</Eyebrow>
          <div className="flex h-[170px] items-end justify-center gap-2.5">
            {podium.map((p) => (
              <div key={p.p.id} className="flex w-[104px] flex-col items-center gap-2">
                <TokenAvatar color={cssHex(seats[p.seat]!.color)} piece={seats[p.seat]!.piece} size={40} />
                <div
                  className="box-border flex w-full justify-center rounded-t-xl rounded-b-[4px] pt-2 font-display text-[22px] font-bold text-accent-ink shadow-[inset_0_2px_0_rgba(255,255,255,0.25),inset_0_-6px_0_rgba(0,0,0,0.15)]"
                  style={{ height: p.h, background: p.block }}
                >
                  {p.rank + 1}
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            {standings.map(({ p, seat, worth }, rank) => (
              <div
                key={p.id}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2 ${
                  rank === 0 ? 'bg-accent/10' : p.bankrupt ? 'bg-alert/[0.06]' : 'bg-white/[0.03]'
                }`}
              >
                <span className="w-[22px] font-display font-bold text-ink-muted">{rank + 1}</span>
                <span className="size-3 rounded-full" style={{ background: cssHex(seats[seat]!.color) }} />
                <span className="flex-1 truncate font-extrabold">{p.name}</span>
                {p.bankrupt ? (
                  <span className="font-display font-bold text-[#fda4af]">Bankrupt</span>
                ) : (
                  <Money
                    value={worth}
                    className={`font-display font-bold ${rank === 0 ? 'text-gold' : ''}`}
                  />
                )}
              </div>
            ))}
          </div>
          {you >= 0 && (
            <p className="m-0 rounded-xl bg-white/[0.04] px-3 py-2.5 text-center text-sm text-ink-muted">
              {standings[you]!.p.bankrupt ? (
                'You gave it a good go. The city will remember it.'
              ) : (
                <>
                  You placed <strong className="text-ink">{ordinal(you + 1)}</strong> ·{' '}
                  <Money value={standings[you]!.worth} className="font-bold text-gold" />. A fine city.
                </>
              )}
            </p>
          )}
          <div className="flex gap-2.5">
            <Btn kind="primary" autofocus onClick={onRestart} className="h-14 flex-1 rounded-2xl text-[17px]">
              Play again
            </Btn>
            <Btn onClick={onQuit} className="h-14 rounded-2xl border-line px-[18px] text-[15px]">
              New game
            </Btn>
          </div>
        </Panel>

        <GameStory snap={snap} store={store} />
      </div>
    </div>
  )
}

/**
 * How the game went: net worth by round (with the winner's turning point) and a stats table.
 * Rebuilt from the action log, so it is exact; absent online (the log lives in the room).
 */
function GameStory({ snap, store }: { snap: Snapshot; store: GameStore }) {
  const results = store.results()
  if (!results || results.rounds.length < 2) return null
  const s = snap.state
  const seats = store.setup.seats
  const winner = s.players[s.winner]!
  const series = s.players.map((p, seat) => ({
    name: p.name,
    color: cssHex(seats[seat]!.color),
    values: results.worth.map((row) => row[seat] ?? 0),
  }))
  const order = s.players
    .map((p, seat) => ({ p, seat }))
    .toSorted((a, b) => (results.worth.at(-1)![b.seat] ?? 0) - (results.worth.at(-1)![a.seat] ?? 0))
  return (
    <Panel className="flex w-[896px] max-w-full animate-rise flex-col gap-4 rounded-3xl p-6 shadow-panel-lg [animation-delay:260ms] [animation-fill-mode:backwards]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Eyebrow className="text-ink-muted">How the game went</Eyebrow>
        <span className="text-sm text-ink-muted">
          {results.turningPoint === null ? (
            <>
              <strong className="text-ink">{winner.name}</strong> led from the start.
            </>
          ) : (
            <>
              <strong className="text-ink">{winner.name}</strong> took the lead for good in round{' '}
              <strong className="text-accent">{results.turningPoint}</strong>.
            </>
          )}
        </span>
      </div>
      <WorthChart series={series} rounds={results.rounds} mark={results.turningPoint} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <caption className="sr-only">Game statistics per player</caption>
          <thead>
            <tr className="text-[11px] tracking-[0.1em] text-ink-muted uppercase">
              <th scope="col" className="py-1.5 font-bold">
                Player
              </th>
              <th scope="col" className="py-1.5 text-right font-bold">
                Rent in
              </th>
              <th scope="col" className="py-1.5 text-right font-bold">
                Rent out
              </th>
              <th scope="col" className="py-1.5 text-right font-bold">
                Bought
              </th>
              <th scope="col" className="py-1.5 text-right font-bold">
                Built
              </th>
              <th scope="col" className="py-1.5 text-right font-bold">
                Trades
              </th>
              <th scope="col" className="py-1.5 pl-4 font-bold">
                Best earner
              </th>
            </tr>
          </thead>
          <tbody>
            {order.map(({ p, seat }) => {
              const st = results.stats[seat]!
              return (
                <tr key={p.id} className="border-t border-line/60">
                  <th scope="row" className="py-2 font-extrabold">
                    <span className="flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ background: cssHex(seats[seat]!.color) }}
                      />
                      {p.name}
                    </span>
                  </th>
                  <td className="py-2 text-right font-bold text-teal tabular-nums">
                    <Money value={st.rentCollected} />
                  </td>
                  <td className="py-2 text-right text-ink-muted tabular-nums">
                    <Money value={st.rentPaid} />
                  </td>
                  <td className="py-2 text-right tabular-nums">{st.bought}</td>
                  <td className="py-2 text-right tabular-nums">{st.built}</td>
                  <td className="py-2 text-right tabular-nums">{st.trades}</td>
                  <td className="py-2 pl-4 text-ink-muted">
                    {st.bestSpace ? (
                      <>
                        {SPACES[st.bestSpace.space]!.name} · <Money value={st.bestSpace.rent} />
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

/** Shortcuts, as printed in the rulebook. Every row matches a handler in GameScreen. */
const SHORTCUTS: [string[], string][] = [
  [['Space'], 'Roll, end turn or continue'],
  [['B', 'A'], 'Buy, or send it to auction'],
  [['1–4'], 'Auction: raise the bid, or bid the list price. Speed die: where to go'],
  [['P'], 'Pass in an auction'],
  [['P', 'U'], 'Pay the Lockup fine, or use a free card'],
  [['C'], 'My city'],
  [['T'], 'Propose a trade'],
  [['Y', 'N'], 'Accept or decline an offer'],
  [['M'], 'Sound on or off'],
  [['L'], 'Game log'],
  [['S'], 'Skip animations'],
  [['F'], 'Skip to your turn'],
  [['?'], 'This help'],
  [['Esc'], 'Close the top panel, clear the selected tile'],
]

const RULES: [string, string][] = [
  ['Goal', 'Own the richest city when the rounds run out, or be the last one standing.'],
  [
    'Your turn',
    'Roll and move, then buy what you land on, or send it to auction where everyone can bid. Doubles roll again; three doubles send you to the Lockup.',
  ],
  [
    'Rent and sets',
    'Landing on someone’s property costs rent. Own a whole color set to double its rent and start building houses, then a hotel. Building is even: one click in My city adds a house to every property in the set.',
  ],
  [
    'Raising money',
    'Short on cash? Sell houses back for half their cost or mortgage property for half its price (lifting it costs 10% extra). Mortgaged lots earn no rent. If you still owe more than you can raise, you go bankrupt.',
  ],
  ['Any time', 'Build, mortgage and trade whenever you like, even on other players’ turns.'],
]

/** Who gets a bankrupt player's city (D65). */
const bankruptcyRule = (config?: GameConfig): [string, string] =>
  config?.bankTakesEstate
    ? [
        'Bankruptcy',
        'The bank pays everyone a bankrupt player owed, in full. Their properties go back to the bank, free of mortgages and for sale again.',
      ]
    : [
        'Bankruptcy',
        'Go bankrupt to a player and they take all your cash and properties. Go bankrupt to the bank and your properties are for sale again.',
      ]

/** Rules for twists, shown when the game has them on (DECISIONS.md D61). */
const underdogRule = (config: GameConfig): [string, string] => [
  'Comeback',
  `Behind the leader? Your Launch salary grows with the gap: up to +${Math.round((config.underdogMax ?? UNDERDOG_MAX) * 100)}% extra for whoever trails two thirds behind or more. The leader gets the normal salary.`,
]
const SECOND_WIND_RULE: [string, string] = [
  'Second Wind',
  "Can't pay a bill? Take a bank loan instead of selling. The bank pays it at once and you keep every building. Half of what you earn repays it, plus interest: 10% the first time, 25% the second, then 50%. You can borrow up to what your city is worth, one loan at a time.",
]
const SPEED_DIE_RULE: [string, string] = [
  'Speed die',
  'A third die rolls with yours. 1–3 adds to your move. The Bus lets you move by one die or both: pick on the board. The Scout moves you as usual, then on to the nearest lot for sale. Triples: go to any space.',
]

const cap =
  'flex h-[26px] min-w-[22px] items-center justify-center rounded-md border border-[#d8cfbb] bg-white px-[7px] font-display text-xs font-bold shadow-[0_3px_0_#d8cfbb]'

/** The rulebook: rules on the left page, shortcuts on the right. */
export function HelpOverlay({ onClose, config }: { onClose: () => void; config?: GameConfig }) {
  const rules = [
    ...RULES,
    bankruptcyRule(config),
    ...(config?.speedDie ? [SPEED_DIE_RULE] : []),
    ...(config?.underdogSalary ? [underdogRule(config)] : []),
    ...(config?.secondWind ? [SECOND_WIND_RULE] : []),
  ]
  usePanelSound()
  const dialog = useDialogFocus()
  return (
    <div
      {...dialog.props}
      className="pointer-events-auto absolute inset-0 z-30 flex overflow-y-auto bg-[rgba(6,10,20,0.66)] p-4"
    >
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <article className="relative m-auto grid w-[900px] max-w-full animate-pop grid-cols-1 overflow-hidden rounded-[20px] bg-card font-card-body text-card-ink shadow-[0_30px_70px_rgba(2,6,16,0.7),0_3px_0_var(--color-card-edge)] md:grid-cols-2">
        <div className="flex flex-col gap-3.5 border-b-2 border-[#ece4d2] px-[30px] pt-[30px] pb-7 shadow-[inset_-14px_0_20px_-18px_rgba(60,40,10,0.35)] md:border-r-2 md:border-b-0">
          <span className="font-card text-[13px] font-extrabold tracking-[0.22em] text-[#8a6318] uppercase">
            Rulebook
          </span>
          <h2 id={dialog.titleId} className="m-0 font-card text-[34px] font-extrabold">
            How to play
          </h2>
          {rules.map(([title, body], i) => (
            <div key={title} className="flex gap-3">
              <span className="flex size-7 flex-none items-center justify-center rounded-full bg-card-ink font-display text-[13px] font-bold text-card">
                {i + 1}
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="font-card text-base font-extrabold">{title}</span>
                <span className="text-[13px] leading-[1.45] text-[#3d4757]">{body}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="relative flex flex-col gap-3 px-[30px] pt-[30px] pb-7">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close help"
            data-autofocus
            className="absolute top-[18px] right-[18px] flex size-9 items-center justify-center rounded-[10px] border border-card-edge text-card-ink transition-[background-color,scale] duration-200 ease-spring hover:bg-black/[0.07] active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Icon name="close" size={14} />
          </button>
          <span className="font-card text-[13px] font-extrabold tracking-[0.22em] text-[#8a6318] uppercase">
            Shortcuts
          </span>
          <dl className="m-0 flex flex-col gap-[7px]">
            {SHORTCUTS.map(([caps, what]) => (
              <div
                key={caps.join() + what}
                className="flex items-center gap-3 border-b border-dashed border-[#e7dfcd] pb-[7px]"
              >
                <dt className="flex w-[74px] flex-none gap-1">
                  {caps.map((c) => (
                    <kbd key={c} className={cap}>
                      {c}
                    </kbd>
                  ))}
                </dt>
                <dd className="m-0 text-[13px] text-[#3d4757]">{what}</dd>
              </div>
            ))}
          </dl>
        </div>
      </article>
    </div>
  )
}

const seg = (on: boolean) =>
  `h-8 flex-1 rounded-[9px] text-[13px] font-extrabold transition-[background-color,color,scale] duration-200 ease-spring active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? 'bg-accent text-accent-ink' : 'text-ink-muted hover:bg-white/5 hover:text-ink'}`

const SKY_CHOICES: readonly (readonly [SkyPref, string])[] = [
  ['auto', 'Auto'],
  ['day', 'Day'],
  ['night', 'Night'],
]

/** A labelled on/off switch (a real checkbox underneath). The knob moves with transform. */
function Switch({
  label,
  hint,
  on,
  onChange,
}: {
  label: string
  hint: string
  on: boolean
  onChange: () => void
}) {
  return (
    <label
      aria-label={label}
      className="flex items-center justify-between gap-2.5 rounded-xl px-1.5 py-2 transition-colors hover:bg-white/5"
    >
      <span className="flex flex-col">
        <span className="text-sm font-bold">{label}</span>
        <span className="text-[11px] text-ink-muted">{hint}</span>
      </span>
      <input type="checkbox" checked={on} onChange={onChange} className="peer sr-only" />
      <span
        aria-hidden="true"
        className="relative h-[26px] w-11 flex-none rounded-full bg-white/[0.14] transition-colors peer-checked:bg-accent peer-checked:[&>span]:translate-x-[18px] peer-focus-visible:ring-2 peer-focus-visible:ring-accent/60"
      >
        <span className="absolute top-[3px] left-[3px] size-5 rounded-full bg-card shadow-[0_2px_4px_rgba(0,0,0,0.35)] transition-transform duration-200 ease-spring" />
      </span>
    </label>
  )
}

/** Settings panel under the menu button. */
export function GameMenu({
  speed,
  fastBots,
  onSpeed,
  onFastBots,
  reducedMotion,
  onReducedMotion,
  cityLife,
  onCityLife,
  batterySaver,
  onBatterySaver,
  dice3d,
  onDice3d,
  sky,
  onSky,
  cursor,
  onCursor,
  odds,
  onOdds,
  botOffers,
  onBotOffers,
  onLog,
  onQuit,
  onClose,
}: {
  speed: SpeedChoice
  fastBots: boolean
  onSpeed: (v: SpeedChoice) => void
  onFastBots: () => void
  reducedMotion: boolean
  onReducedMotion: () => void
  cityLife: boolean
  onCityLife: () => void
  batterySaver: boolean
  onBatterySaver: () => void
  dice3d: boolean
  onDice3d: () => void
  sky: SkyPref
  onSky: (v: SkyPref) => void
  cursor: CursorPref
  onCursor: () => void
  odds: boolean
  onOdds: () => void
  botOffers: boolean
  onBotOffers: () => void
  onLog: () => void
  onQuit: () => void
  onClose: () => void
}) {
  usePanelSound()
  const audio = useSyncExternalStore(sound.subscribe, sound.getSettings)
  const [confirm, setConfirm] = useState(false)
  const dialog = useDialogFocus()
  return (
    <>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        aria-label="Close menu"
        onClick={onClose}
        className="pointer-events-auto absolute inset-0 z-50 cursor-default"
      />
      <Panel
        {...dialog.props}
        className="absolute top-[92px] right-5 z-50 flex max-h-[calc(100%-108px)] w-[330px] animate-pop flex-col gap-1 overflow-y-auto rounded-[22px] bg-panel! p-3.5 shadow-panel-lg backdrop-blur-none!"
      >
        <Eyebrow className="px-1.5 pt-1 pb-2 text-ink-muted">
          <span id={dialog.titleId}>Game settings</span>
        </Eyebrow>
        <div className="flex flex-col gap-2 px-1.5 py-2">
          <span className="text-sm font-bold">Animation speed</span>
          <div className="flex gap-[3px] rounded-xl bg-table p-[3px]">
            {SPEEDS.map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={speed === v}
                onClick={() => onSpeed(v)}
                className={`${seg(speed === v)} font-display`}
              >
                {v === 'instant' ? 'Instant' : `${v}×`}
              </button>
            ))}
          </div>
        </div>
        <fieldset className="m-0 flex flex-col gap-2 border-0 px-1.5 py-2">
          <legend className="float-left mb-2 text-sm font-bold">Sky</legend>
          <div className="flex w-full gap-[3px] rounded-xl bg-table p-[3px]">
            {SKY_CHOICES.map(([v, label]) => (
              <button
                key={v}
                type="button"
                aria-pressed={sky === v}
                onClick={() => onSky(v)}
                className={seg(sky === v)}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        <Switch label="Fast bots" hint="Bots decide without pausing" on={fastBots} onChange={onFastBots} />
        <Switch
          label="Reduced motion"
          hint="No shake, confetti or flying coins"
          on={reducedMotion}
          onChange={onReducedMotion}
        />
        <Switch label="City life" hint="Cars and trains in the city" on={cityLife} onChange={onCityLife} />
        <Switch
          label="Battery saver"
          hint="Fewer pixels and a calmer frame rate between moves"
          on={batterySaver}
          onChange={onBatterySaver}
        />
        <Switch
          label="3D dice"
          hint="Thrown onto the board; off rolls in the tray"
          on={dice3d}
          onChange={onDice3d}
        />
        <Switch
          label="Game cursor"
          hint="Off uses your system cursor"
          on={cursor === 'game'}
          onChange={onCursor}
        />
        <Switch
          label="Landing odds"
          hint="Before you roll, mark rents you could land on"
          on={odds}
          onChange={onOdds}
        />
        <Switch
          label="Offers from bots"
          hint="Bots may propose deals to you"
          on={botOffers}
          onChange={onBotOffers}
        />
        <Switch
          label="Sound"
          hint="Sound effects"
          on={!audio.muted}
          onChange={() => sound.setSettings({ muted: !audio.muted })}
        />
        <div className="flex items-center gap-2.5 px-1.5 py-2">
          <span className="w-16 text-sm font-bold">Volume</span>
          <input
            type="range"
            aria-label="Volume"
            min={0}
            max={1}
            step={0.01}
            value={audio.master}
            disabled={audio.muted}
            onChange={(e) => sound.setSettings({ master: Number(e.target.value) })}
            className="min-w-0 flex-1 accent-accent disabled:opacity-40"
          />
        </div>
        <div className="flex items-center gap-2.5 px-1.5 py-2">
          <span className="w-16 text-sm font-bold">Music</span>
          <input
            type="range"
            aria-label="Music volume"
            min={0}
            max={1}
            step={0.01}
            value={audio.music}
            disabled={audio.muted}
            onChange={(e) => sound.setSettings({ music: Number(e.target.value) })}
            className="min-w-0 flex-1 accent-accent disabled:opacity-40"
          />
        </div>
        <div className="flex items-center gap-2.5 px-1.5 py-2">
          <span className="w-16 text-sm font-bold">City</span>
          <input
            type="range"
            aria-label="City sounds volume"
            min={0}
            max={1}
            step={0.01}
            value={audio.ambience}
            disabled={audio.muted}
            onChange={(e) => sound.setSettings({ ambience: Number(e.target.value) })}
            className="min-w-0 flex-1 accent-accent disabled:opacity-40"
          />
        </div>
        <div className="mx-0 my-1.5 h-px bg-line" />
        <Btn onClick={onLog} className="h-[42px] rounded-xl border-line text-sm">
          Game log <Kbd>L</Kbd>
        </Btn>
        {confirm ? (
          <div className="mt-1 flex flex-col gap-2 rounded-xl bg-alert/[0.08] p-2.5">
            <span className="text-center text-xs text-ink-muted">Leave this game and go back to setup?</span>
            <div className="flex gap-2">
              <Btn kind="danger" onClick={onQuit} className="h-10 flex-1">
                New game
              </Btn>
              <Btn kind="ghost" onClick={() => setConfirm(false)} className="h-10">
                Cancel
              </Btn>
            </div>
          </div>
        ) : (
          <Btn
            kind="ghost"
            onClick={() => setConfirm(true)}
            className="h-[42px] rounded-xl text-sm text-[#fda4af] hover:text-[#fda4af]"
          >
            New game…
          </Btn>
        )}
      </Panel>
    </>
  )
}
