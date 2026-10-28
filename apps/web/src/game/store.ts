import {
  SPACES,
  createGame,
  expectedActor,
  observe,
  reduce,
  validate,
  type Action,
  type GameEvent,
  type SpeedFace,
  type Bundle,
  type GameState,
} from '@skyline/engine'
import type { Board, BoardSnapshot, BoardTuning } from '@skyline/board'

/** What the store needs from a board view (the Pixi Board satisfies it; tests use a stub). */
export type BoardPort = Pick<
  Board,
  'setPlayers' | 'sync' | 'play' | 'setTuning' | 'skipAnimations' | 'punch'
> &
  Partial<Pick<Board, 'throwDice'>>
import {
  PERSONALITIES,
  botRng,
  createHeuristicBot,
  type Bot,
  type BotParams,
  type BotRng,
  tradeScore,
} from '@skyline/bots'
import { describeBundle } from './trade.ts'
import { describe, type LogEntry } from './log.ts'
import { applyEvent, desyncs, presentFrom, type Presented } from './presented.ts'
import { loadPrefs } from './prefs.ts'
import type { SkyPref } from './sky.ts'
import type { CursorPref } from '../cursors.ts'
import { configOf, saveGame, type GameSetup, type SavedGame, type SeatSetup } from './setup.ts'
import { gameResults, type GameResults } from './results.ts'
import { BIG_RENT, TIMINGS, coinsLandMs } from './timings.ts'

export interface CardShown {
  deck: 'chance' | 'chest'
  cardId: number
  playerId: string
  /** A human's card waits for `ackCard()`; a bot's closes by itself. */
  waiting: boolean
}

/** One-shot visual effects for the DOM layer (number pops, flying coins, callouts). */
export type Fx =
  | { kind: 'pop'; playerId: string; delta: number }
  | { kind: 'transfer'; from: string; to: string; amount: number }
  | {
      kind: 'callout'
      tone: 'good' | 'bad' | 'info'
      title: string
      detail?: string
      seat?: number
      /** A rubber stamp slammed above the line for the biggest moments ("SECOND WIND!"). */
      stamp?: string
    }
  /** 3D dice: first touchdown (intensity 0..1), and both dice at rest. */
  | { kind: 'diceHit'; intensity: number }
  | { kind: 'diceSettle'; doubles: boolean; popInMs: number }

/** Everything React reads. Replaced (never mutated) on every change, for useSyncExternalStore. */
export interface Snapshot {
  /** Latest engine output: use for legal actions (only when not busy). */
  state: GameState
  /** What the screen shows right now. */
  presented: Presented
  /** True while events are animating; human input waits. */
  busy: boolean
  log: LogEntry[]
  dice: readonly [number, number] | null
  /** The Speed die face of the last roll (twist, DECISIONS.md D62), shown as a third die. */
  speedFace: SpeedFace | null
  /** Increments on every roll so the dice tray can re-trigger its animation. */
  diceRoll: number
  /** 3D dice are on the board: the tray waits for them and does not show the result yet. */
  diceLanding: boolean
  card: CardShown | null
  /** Bot currently "thinking", for a UI hint. */
  thinking: string | null
  /** Fast-forwarding bot turns until a human here must act (skipToHuman). */
  fastForward: boolean
  /**
   * Seat whose point of view the shell shows (My city, hints): the human the game is waiting
   * on, else the last such human. Null when no human is seated.
   */
  viewer: number | null
  /** How finished offers ended, by trade id (for the trade screen's result stamp). */
  tradeOutcomes: Readonly<Record<number, TradeOutcome>>
}

export interface StoreSettings {
  /** Animation speed multiplier. */
  speed: number
  /** Bots act almost instantly. */
  fastBots: boolean
  /** Skip all animations: the board snaps to each new state. */
  instant: boolean
  /** No shake, hit-stop, confetti, flying coins, or big motion. */
  reducedMotion: boolean
  /** Bots may propose deals to human players. */
  botOffers: boolean
  /** Landing odds on the board before a human rolls. */
  odds: boolean
  /** Cars and trains moving on the board city (cosmetic). */
  cityLife: boolean
  /** Day/night: follow the round count, or hold day or night. */
  sky: SkyPref
  /** Custom game cursor, or the system one. */
  cursor: CursorPref
  /** Dice thrown onto the board in 3D (DECISIONS.md D38); off tumbles them in the tray. */
  dice3d: boolean
}

/** What a trade partner thinks of a deal before it is sent (bots only; humans decide live). */
export type TradeVerdict =
  | { kind: 'human' }
  | {
      kind: 'bot'
      accepts: boolean
      /** Least extra cash that would make the bot accept, or null if no affordable amount does. */
      more: number | null
      /** How the bot feels about it, 0..1; 0.5 is where it starts saying yes (for the deal meter). */
      mood: number
    }

/** How an offer ended, once it has (for the trade screen's result stamp). */
export type TradeOutcome = 'accepted' | 'declined' | 'withdrawn'

const TRADE_ENDS: Partial<Record<GameEvent['type'], TradeOutcome>> = {
  TRADE_ACCEPTED: 'accepted',
  TRADE_REJECTED: 'declined',
  TRADE_CANCELLED: 'withdrawn',
  TRADE_VOIDED: 'withdrawn',
}

/**
 * An online game (DECISIONS.md D40): the room is the authority. Actions go out through `send`;
 * what the room accepted comes back through `GameStore.receive`.
 */
export interface OnlineLink {
  /** This client's player id: the only seat this screen acts for and shows. */
  me: string
  /** The masked view the game starts (or resumes) from. */
  view: GameState
  send(action: Action): void
}

/** A bot makes a human at most one offer per this many rounds. */
const OFFER_GAP_ROUNDS = 2

const LOG_LIMIT = 200

/**
 * Local game: runs the engine in-process behind the same dispatch interface the network
 * adapter will use (ARCHITECTURE.md section 8). Framework-agnostic; React subscribes.
 */
export class GameStore {
  readonly setup: GameSetup
  readonly settings: StoreSettings = {
    speed: 1,
    fastBots: false,
    instant: false,
    reducedMotion: false,
    botOffers: true,
    odds: true,
    cityLife: true,
    sky: 'auto',
    cursor: 'game',
    dice3d: true,
  }
  private snap: Snapshot
  private readonly listeners = new Set<() => void>()
  private readonly fxListeners = new Set<(fx: Fx) => void>()
  private readonly eventListeners = new Set<(e: GameEvent) => void>()
  private readonly appliedListeners = new Set<(e: GameEvent) => void>()
  private readonly actions: SavedGame['actions'] = []
  private readonly queue: GameEvent[] = []
  private pumping = false
  private skipping = false
  private cardAck: (() => void) | null = null
  private board: BoardPort | null = null
  /** Where the 3D dice fly to: the DOM dice tray in canvas CSS px (set by the game screen). */
  private diceTray: (() => { x: number; y: number; size: number } | null) | null = null
  /** One brain per bot seat (null for humans), and its personality for trade verdicts. */
  private readonly bots: (Bot | null)[]
  private readonly botParams: (BotParams | null)[]
  /** Round of the last bot offer to each human, to keep offers occasional. */
  private readonly lastOfferTo = new Map<string, number>()
  /** Open offers as proposed, so an accepted deal can be described when it plays. */
  private readonly offers = new Map<number, { from: string; to: string; summary: string }>()
  private readonly rng: BotRng
  private botTimer: ReturnType<typeof setTimeout> | null = null
  private logId = 0
  private disposed = false
  private readonly online: OnlineLink | null

  constructor(setup: GameSetup, replay: SavedGame['actions'] = [], online: OnlineLink | null = null) {
    this.setup = setup
    this.online = online
    Object.assign(this.settings, loadPrefs())
    this.rng = botRng(setup.seed ^ 0x5bd1e995)
    // Bots trade freely among themselves; offers to humans are occasional and can be turned off.
    const canTradeWith = (id: string) => this.seatKind(id) === 'bot' || this.mayOfferTo(id)
    let botIndex = 0
    this.botParams = setup.seats.map((seat) =>
      seat.kind === 'bot'
        ? (PERSONALITIES[
            seat.personality ?? DEFAULT_PERSONALITIES[botIndex++ % DEFAULT_PERSONALITIES.length]!
          ] ?? PERSONALITIES.balanced!)
        : null,
    )
    // Online, bot seats are played by the room; here they only lend their names and verdicts.
    this.bots = this.botParams.map((p) => (p && !online ? createHeuristicBot(p, { canTradeWith }) : null))
    let state =
      online?.view ??
      createGame(
        setup.seats.map((s) => ({ id: s.id, name: s.name })),
        setup.seed,
        configOf(setup),
      )
    // Rebuild a saved game by replaying its action log (deterministic).
    for (const step of replay) {
      const r = reduce(state, step.playerId, step.action)
      if (!r.ok) break
      state = r.state
      this.actions.push(step)
    }
    this.snap = {
      state,
      presented: presentFrom(state),
      busy: false,
      log: [],
      dice: state.lastDice,
      speedFace: state.lastSpeed ?? null,
      diceRoll: 0,
      diceLanding: false,
      card: null,
      thinking: null,
      fastForward: false,
      viewer: null,
      tradeOutcomes: {},
    }
    this.snap.viewer = this.viewerFor(state)
    if (replay.length > 0) this.pushLog({ text: 'Game resumed', tone: 'muted' })
  }

  // ---- React binding ------------------------------------------------------

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getSnapshot = (): Snapshot => this.snap

  onFx = (fn: (fx: Fx) => void): (() => void) => {
    this.fxListeners.add(fn)
    return () => this.fxListeners.delete(fn)
  }

  /** Each event as it starts playing (not while skipping), for sound. */
  /**
   * Every event as it reaches the presented state, skipped or animated (onEvent only sees
   * animated ones, in step with the motion). For bookkeeping such as the turn recap.
   */
  onApplied = (fn: (e: GameEvent) => void): (() => void) => {
    this.appliedListeners.add(fn)
    return () => this.appliedListeners.delete(fn)
  }

  onEvent = (fn: (e: GameEvent) => void): (() => void) => {
    this.eventListeners.add(fn)
    return () => this.eventListeners.delete(fn)
  }

  private set(patch: Partial<Snapshot>): void {
    this.snap = { ...this.snap, ...patch }
    for (const fn of this.listeners) fn()
  }

  private emit(fx: Fx): void {
    if (this.skipping) return
    for (const fn of this.fxListeners) fn(fx)
  }

  // ---- board --------------------------------------------------------------

  setDiceTray(measure: (() => { x: number; y: number; size: number } | null) | null): void {
    this.diceTray = measure
  }

  attach(board: BoardPort | null): void {
    this.board = board
    if (!board) return
    board.setTuning(this.tuning(this.settings.speed))
    board.setPlayers(this.setup.seats.map((s) => ({ id: s.id, color: s.color, piece: s.piece })))
    board.sync(boardSnapshot(this.snap.state))
    this.scheduleBot()
  }

  // ---- actions ------------------------------------------------------------

  /** Applies an action for a player. Returns an error message if the engine rejects it. */
  dispatch(playerId: string, action: Action): string | null {
    if (this.disposed) return 'game closed'
    if (this.online) {
      // Checked here for an instant answer; the room checks again and has the last word.
      if (playerId !== this.online.me) return 'not your seat'
      const error = validate(this.snap.state, playerId, action)
      if (!error) this.online.send(action)
      return error
    }
    const r = reduce(this.snap.state, playerId, action)
    if (!r.ok) return r.error
    this.actions.push({ playerId, action })
    saveGame({ version: 1, setup: this.setup, actions: this.actions })
    this.apply(r.state, r.events)
    return null
  }

  /**
   * Online: events the room applied, with the view after them. Missed events replayed on a
   * reconnect come without a view (null) until the last one.
   */
  receive(events: readonly GameEvent[], view: GameState | null): void {
    if (this.disposed) return
    this.apply(view ?? this.snap.state, events)
  }

  /** Online: jumps to a fresh view from the room (reconnect after missed events, desync). */
  resync(view: GameState): void {
    if (this.disposed) return
    this.queue.length = 0
    this.snap = { ...this.snap, state: view, viewer: this.viewerFor(view) }
    if (this.pumping) return this.skip()
    this.board?.sync(boardSnapshot(view))
    this.set({ presented: presentFrom(view), busy: false, card: null })
  }

  /** Online: the room refused an action this client sent. */
  rejected(reason: string): void {
    this.emit({ kind: 'callout', tone: 'bad', title: 'Not allowed', detail: reason })
  }

  /** Whether this screen may act for a player: online only for our seat, locally any human. */
  canAct(playerId: string): boolean {
    return this.online ? playerId === this.online.me : this.seatKind(playerId) === 'human'
  }

  private apply(state: GameState, events: readonly GameEvent[]): void {
    let outcomes = this.snap.tradeOutcomes
    for (const e of events) {
      const ended = TRADE_ENDS[e.type]
      if (ended && 'tradeId' in e) outcomes = { ...outcomes, [e.tradeId]: ended }
      if (e.type !== 'TRADE_PROPOSED') continue
      const offer = state.trades.find((t) => t.id === e.tradeId)
      if (offer)
        this.offers.set(offer.id, { from: e.from, to: e.to, summary: summarize(offer.give, offer.get) })
      if (this.seatKind(e.from) === 'bot' && this.seatKind(e.to) === 'human')
        this.lastOfferTo.set(e.to, state.round)
    }
    this.snap = { ...this.snap, state, viewer: this.viewerFor(state), tradeOutcomes: outcomes }
    this.queue.push(...events)
    void this.pump()
  }

  /** Dispatches a planned sequence (Build evenly, Raise money); stops at the first rejection. */
  run(playerId: string, actions: readonly Action[]): string | null {
    for (const a of actions) {
      const err = this.dispatch(playerId, a)
      if (err) return err
    }
    return null
  }

  /** Closes a card that is waiting for its human drawer. */
  ackCard(): void {
    this.cardAck?.()
  }

  /**
   * The game's story for the results screen: net worth by round and per-seat stats, from a
   * replay of the action log (game/results.ts). Null online, where the log lives in the room.
   */
  results(): GameResults | null {
    if (this.online) return null
    const start = createGame(
      this.setup.seats.map((s) => ({ id: s.id, name: s.name })),
      this.setup.seed,
      configOf(this.setup),
    )
    return gameResults(start, this.actions)
  }

  /** Fast-forward possible: a local game (online bots play on the server) with a human seat. */
  get canFastForward(): boolean {
    return !this.online && this.setup.seats.some((x) => x.kind === 'human')
  }

  /**
   * Plays bot turns with no animation and no thinking time until a human on this screen has to
   * act (their turn, a bid, an offer to answer, a debt), then normal play resumes.
   */
  skipToHuman(): void {
    if (!this.canFastForward || this.snap.presented.over) return
    this.set({ fastForward: true })
    this.skip()
    // A bot already waiting out its thinking time goes now.
    if (this.botTimer) {
      clearTimeout(this.botTimer)
      this.botTimer = null
    }
    this.scheduleBot()
  }

  /** Jump to the end of all pending animations (skip). */
  skip(): void {
    if (!this.pumping) return
    this.skipping = true
    this.board?.skipAnimations()
    this.cardAck?.()
  }

  private tuning(speed: number): Pick<BoardTuning, 'speed' | 'reducedMotion' | 'ambient'> {
    // The setting or the OS preference, same as the shell (see useReducedMotion).
    const os = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    return { speed, reducedMotion: this.settings.reducedMotion || os, ambient: this.settings.cityLife }
  }

  setSettings(patch: Partial<StoreSettings>): void {
    Object.assign(this.settings, patch)
    this.board?.setTuning(this.tuning(this.settings.speed))
  }

  /**
   * How seat `to` would answer an offer from seat `from` (give/get from the proposer's side),
   * judged by the bot's own model on its own view. Also finds the least extra cash that would
   * turn a no into a yes.
   */
  tradeVerdict(s: GameState, from: number, to: number, give: Bundle, get: Bundle): TradeVerdict {
    const params = this.botParams[to]
    if (!params) return { kind: 'human' }
    const view = observe(s, s.players[to]!.id)
    const scoreWith = (extra: number) =>
      tradeScore(view, to, { from, to, give: { ...give, cash: give.cash + extra }, get }, params)
    const judge = (extra: number) => scoreWith(extra) > 0
    const score = scoreWith(0)
    // Logistic curve: about ₵150 either side of the bar spans most of the meter.
    const mood = score === -Infinity ? 0 : 1 / (1 + Math.exp(-score / 90))
    if (score > 0) return { kind: 'bot', accepts: true, more: null, mood }
    const room = s.players[from]!.cash - give.cash
    if (room < 10 || !judge(room)) return { kind: 'bot', accepts: false, more: null, mood }
    // Binary search in steps of 10 for the smallest extra that is accepted.
    let lo = 0
    let hi = Math.floor(room / 10)
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (judge(mid * 10)) hi = mid
      else lo = mid
    }
    return { kind: 'bot', accepts: false, more: hi * 10, mood }
  }

  /** Whether a bot may propose to human `id` now (setting, one open offer, rate limit). */
  private mayOfferTo(id: string): boolean {
    if (!this.settings.botOffers) return false
    const s = this.snap.state
    if (s.trades.some((t) => s.players[t.to]!.id === id)) return false
    const last = this.lastOfferTo.get(id)
    return last === undefined || s.round - last >= OFFER_GAP_ROUNDS
  }

  /** Personality name of a bot seat ("Tycoon"), or null for humans. */
  botName(seat: number): string | null {
    return this.botParams[seat]?.name ?? null
  }

  seatKind(playerId: string): SeatSetup['kind'] {
    return this.setup.seats.find((s) => s.id === playerId)?.kind ?? 'human'
  }

  private seatIndex(id: string): number {
    return this.setup.seats.findIndex((x) => x.id === id)
  }

  private viewerFor(s: GameState): number | null {
    if (this.online) return this.seatIndex(this.online.me)
    const actor = s.phase === 'gameOver' ? s.current : expectedActor(s)
    if (this.setup.seats[actor]?.kind === 'human') return actor
    const prev = this.snap?.viewer
    if (prev !== undefined && prev !== null) return prev
    const first = this.setup.seats.findIndex((x) => x.kind === 'human')
    return first >= 0 ? first : null
  }

  nameOf = (id: string): string =>
    id === 'bank' ? 'the bank' : (this.setup.seats.find((s) => s.id === id)?.name ?? id)

  dispose(): void {
    this.disposed = true
    if (this.botTimer) clearTimeout(this.botTimer)
    this.cardAck?.()
    this.listeners.clear()
    this.fxListeners.clear()
    this.eventListeners.clear()
    this.appliedListeners.clear()
  }

  // ---- event playback -----------------------------------------------------

  private async pump(): Promise<void> {
    if (this.pumping) return
    this.pumping = true
    if (this.settings.instant || this.snap.fastForward) this.skipping = true
    this.set({ busy: true })
    while (this.queue.length > 0 && !this.disposed) {
      const e = this.queue.shift()!
      if (!this.skipping) await this.play(e)
      else if (e.type === 'DICE_ROLLED')
        this.snap = { ...this.snap, dice: e.dice, speedFace: e.speed ?? null, diceLanding: false }
      const line = describe(e, this.nameOf)
      this.snap = { ...this.snap, presented: applyEvent(this.snap.presented, e) }
      for (const fn of this.appliedListeners) fn(e)
      if (line) this.pushLog(line)
      else this.set({})
    }
    // Reconcile: the screen must now match the engine exactly.
    const truth = presentFrom(this.snap.state)
    const drift = desyncs(this.snap.presented, truth)
    if (drift.length > 0 && !this.skipping) console.warn('[skyline] presented state drifted', drift)
    if (this.skipping) this.board?.sync(boardSnapshot(this.snap.state))
    this.skipping = false
    this.pumping = false
    this.set({ presented: truth, busy: false, card: null })
    this.scheduleBot()
  }

  private async play(e: GameEvent): Promise<void> {
    const speed = this.settings.speed
    for (const fn of this.eventListeners) fn(e)
    if (e.type === 'DICE_ROLLED') {
      const face = e.speed ?? null
      if (this.settings.dice3d && this.board?.throwDice) return this.throwDice(e.dice, face, speed)
      this.set({ dice: e.dice, speedFace: face, diceRoll: this.snap.diceRoll + 1 })
      await wait(TIMINGS.dice / speed)
      return
    }
    if (e.type === 'CARD_DRAWN') {
      const waiting = this.canAct(e.playerId)
      this.set({ card: { deck: e.deck, cardId: e.cardId, playerId: e.playerId, waiting } })
      if (waiting) await new Promise<void>((r) => (this.cardAck = r))
      else await wait(TIMINGS.botCard / speed)
      this.cardAck = null
      this.set({ card: null })
      return
    }
    if (e.type === 'CASH_CHANGED') return this.playCash(e, speed)
    this.callout(e)
    if (this.board) {
      this.board.setTuning(this.tuning(speed))
      await this.board.play(e)
    }
  }

  /**
   * 3D dice: the camera frames the throw, the dice tumble onto the engine's values, the total
   * pops, and the game moves on as the dice fly into the tray (which then shows them).
   */
  private async throwDice(
    dice: readonly [number, number],
    speedFace: SpeedFace | null,
    speed: number,
  ): Promise<void> {
    const board = this.board
    if (!board?.throwDice) return
    this.set({ dice, speedFace, diceRoll: this.snap.diceRoll + 1, diceLanding: true })
    board.setTuning(this.tuning(speed))
    const tray = this.diceTray?.()
    let first = true
    let flying!: () => void
    const fly = new Promise<void>((r) => (flying = r))
    const done = board
      .throwDice({
        values: dice,
        ...(speedFace ? { speedFace } : {}),
        speed,
        focus: true,
        ...(tray ? { tray } : {}),
        onBounce: (intensity) => {
          if (first) this.emit({ kind: 'diceHit', intensity })
          first = false
        },
        onSettle: (s) => this.emit({ kind: 'diceSettle', doubles: s.doubles, popInMs: s.popInMs }),
        onFly: flying,
      })
      .then(() => this.set({ diceLanding: false }))
    await Promise.race([fly, done])
  }

  /** The payer's cash drops as the coins leave; the payee's rises when they land. */
  private async playCash(e: Extract<GameEvent, { type: 'CASH_CHANGED' }>, speed: number): Promise<void> {
    const other = e.counterparty && e.counterparty !== 'bank' ? e.counterparty : null
    if (other && e.delta < 0) {
      this.emit({ kind: 'transfer', from: e.playerId, to: other, amount: -e.delta })
      if (e.reason === 'rent') this.rentCallout(e.playerId, other, -e.delta)
      return
    }
    if (other) await wait(coinsLandMs(e.delta) / speed)
    this.emit({ kind: 'pop', playerId: e.playerId, delta: e.delta })
    // A big rent lands with a jolt (hit-stop and shake, scaled by the amount).
    if (other && e.reason === 'rent' && e.delta >= BIG_RENT && !this.skipping)
      this.board?.punch(Math.min(1, e.delta / 800))
    if (!other && (e.reason === 'tax' || e.reason === 'rent')) await wait(TIMINGS.paymentBeat / speed)
  }

  private rentCallout(payer: string, payee: string, amount: number): void {
    const human = [payer, payee].some((id) => this.seatKind(id) === 'human')
    if (!human && amount < BIG_RENT) return
    const space = this.snap.presented.players.find((p) => p.id === payer)?.position ?? 0
    const level = this.snap.presented.houses[space] ?? 0
    const built = level === 5 ? ' · hotel' : level > 0 ? ` · ${level} house${level > 1 ? 's' : ''}` : ''
    this.emit({
      kind: 'callout',
      tone: this.seatKind(payer) === 'human' ? 'bad' : 'good',
      title: `${this.nameOf(payer)} paid ₵${amount.toLocaleString()} rent to ${this.nameOf(payee)}`,
      detail: `${SPACES[space]!.name}${built}`,
      seat: this.seatIndex(payee),
    })
  }

  private callout(e: GameEvent): void {
    if (e.type === 'MONOPOLY_COMPLETED') {
      this.emit({
        kind: 'callout',
        tone: 'good',
        title: `${this.nameOf(e.playerId)} completed a set!`,
        detail: 'Houses can be built there now.',
        seat: this.seatIndex(e.playerId),
      })
    } else if (e.type === 'BANKRUPT') {
      this.emit({ kind: 'callout', tone: 'bad', title: `${this.nameOf(e.playerId)} went bankrupt` })
    } else if (e.type === 'TRADE_REJECTED') {
      const deal = this.offers.get(e.tradeId)
      if (deal && this.seatKind(deal.from) === 'human') {
        this.emit({
          kind: 'callout',
          tone: 'bad',
          title: `${this.nameOf(deal.to)} declined the offer`,
          detail: `${this.nameOf(deal.from)} asked for ${deal.summary}`,
          seat: this.seatIndex(deal.to),
        })
      }
    } else if (e.type === 'TRADE_ACCEPTED') {
      const deal = this.offers.get(e.tradeId)
      if (deal) {
        this.emit({
          kind: 'callout',
          tone: 'info',
          title: `Deal: ${this.nameOf(deal.from)} and ${this.nameOf(deal.to)} traded`,
          detail: `${this.nameOf(deal.from)} ${this.nameOf(deal.from) === 'You' ? 'get' : 'gets'} ${deal.summary}`,
          seat: this.seatIndex(deal.from),
        })
      }
    } else if (e.type === 'LOAN_TAKEN') {
      this.emit({
        kind: 'callout',
        tone: 'info',
        stamp: 'SECOND WIND!',
        title: `${this.nameOf(e.playerId)} borrowed ₵${e.amount.toLocaleString()} from the bank`,
        detail: `The city stays standing. ₵${e.owed.toLocaleString()} to repay from half of every income.`,
        seat: this.seatIndex(e.playerId),
      })
    } else if (e.type === 'LOAN_REPAID') {
      this.emit({
        kind: 'callout',
        tone: 'good',
        stamp: 'DEBT FREE!',
        title: `${this.nameOf(e.playerId)} paid off the loan`,
        detail: `Every coin earned is ${this.nameOf(e.playerId) === 'You' ? 'yours' : 'theirs'} to keep again.`,
        seat: this.seatIndex(e.playerId),
      })
    } else if (e.type === 'FINAL_ROUND') {
      this.emit({ kind: 'callout', tone: 'info', title: 'Final round', detail: 'Highest net worth wins.' })
    }
  }

  private pushLog(entry: Omit<LogEntry, 'id' | 'at'>): void {
    const log = [{ ...entry, id: ++this.logId, at: Date.now() }, ...this.snap.log].slice(0, LOG_LIMIT)
    this.set({ log })
  }

  // ---- bots ---------------------------------------------------------------

  /**
   * The bot seat the game needs to hear from: one answering an offer first, else the expected
   * actor. While a human has an offer to answer, the bots wait.
   */
  private botToAct(s: GameState): number | null {
    if (s.phase === 'gameOver') return null
    const offer = s.trades.find((t) => this.bots[t.to] && !s.players[t.to]!.bankrupt)
    if (offer) return offer.to
    if (s.trades.some((t) => !this.bots[t.to] && !s.players[t.to]!.bankrupt)) return null
    const actor = expectedActor(s)
    return this.bots[actor] ? actor : null
  }

  private scheduleBot(): void {
    if (this.botTimer || this.disposed || this.pumping || !this.board) return
    const seat = this.botToAct(this.snap.state)
    if (seat === null) {
      // No bot to play: a human must act (or the game is over), so fast-forward ends here.
      if (this.snap.fastForward) this.set({ fastForward: false })
      return
    }
    this.set({ thinking: this.snap.state.players[seat]!.id })
    const delay = this.snap.fastForward
      ? 0
      : this.settings.fastBots
        ? TIMINGS.botFast
        : TIMINGS.botThink + this.rng() * TIMINGS.botThinkJitter
    this.botTimer = setTimeout(() => {
      this.botTimer = null
      this.set({ thinking: null })
      const now = this.snap.state
      const who = this.botToAct(now)
      if (who === null) return
      const id = now.players[who]!.id
      const isActor = who === expectedActor(now)
      const action =
        this.bots[who]!.decide(observe(now, id), id, this.rng) ??
        (isActor ? { type: 'TIMEOUT' as const } : null)
      const offer = now.trades.find((t) => t.to === who)
      const err = action ? this.dispatch(id, action) : 'no answer'
      if (err) {
        console.warn('[skyline] bot action rejected', id, action, err)
        // Never stall: an unanswered offer is declined, a stuck turn times out.
        if (offer) this.dispatch(id, { type: 'REJECT_TRADE', tradeId: offer.id })
        else this.dispatch(id, { type: 'TIMEOUT' })
      }
    }, delay)
  }
}

/** Bot personalities handed out to bot seats in order when the setup does not choose one. */
const DEFAULT_PERSONALITIES = ['balanced', 'tycoon', 'shark', 'banker']

/** "Bazaar Alley for ₵300" style summary of a trade, from the proposer's side. */
function summarize(give: Bundle, get: Bundle): string {
  return `${describeBundle(get)} for ${describeBundle(give)}`
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Maps engine state onto what the board draws. */
export function boardSnapshot(s: GameState): BoardSnapshot {
  return {
    positions: Object.fromEntries(s.players.map((p) => [p.id, p.position])),
    owner: s.owner.map((o) => (o >= 0 ? s.players[o]!.id : null)),
    houses: s.houses,
    mortgaged: s.mortgaged,
    bankrupt: s.players.filter((p) => p.bankrupt).map((p) => p.id),
  }
}
