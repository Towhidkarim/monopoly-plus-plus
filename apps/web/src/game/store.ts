import {
  PRESETS,
  SPACES,
  createGame,
  expectedActor,
  observe,
  reduce,
  type Action,
  type GameEvent,
  type GameState,
} from '@skyline/engine'
import type { Board, BoardSnapshot } from '@skyline/board'

/** What the store needs from a board view (the Pixi Board satisfies it; tests use a stub). */
export type BoardPort = Pick<Board, 'setPlayers' | 'sync' | 'play' | 'setTuning' | 'skipAnimations'>
import { botRng, simpleBot, type Bot, type BotRng } from '@skyline/bots'
import { describe, type LogEntry } from './log.ts'
import { applyEvent, desyncs, presentFrom, type Presented } from './presented.ts'
import { saveGame, type GameSetup, type SavedGame } from './setup.ts'
import { BIG_RENT, TIMINGS } from './timings.ts'

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
  | { kind: 'callout'; tone: 'good' | 'bad' | 'info'; title: string; detail?: string; seat?: number }

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
  /** Increments on every roll so the dice tray can re-trigger its animation. */
  diceRoll: number
  card: CardShown | null
  /** Bot currently "thinking", for a UI hint. */
  thinking: string | null
  /**
   * Seat whose point of view the shell shows (My city, hints): the human the game is waiting
   * on, else the last such human. Null when no human is seated.
   */
  viewer: number | null
}

export interface StoreSettings {
  /** Animation speed multiplier. */
  speed: number
  /** Bots act almost instantly. */
  fastBots: boolean
  /** Skip all animations: the board snaps to each new state. */
  instant: boolean
}

const LOG_LIMIT = 200

/**
 * Local game: runs the engine in-process behind the same dispatch interface the network
 * adapter will use (ARCHITECTURE.md section 8). Framework-agnostic; React subscribes.
 */
export class GameStore {
  readonly setup: GameSetup
  readonly settings: StoreSettings = { speed: 1, fastBots: false, instant: false }
  private snap: Snapshot
  private readonly listeners = new Set<() => void>()
  private readonly fxListeners = new Set<(fx: Fx) => void>()
  private readonly actions: SavedGame['actions'] = []
  private readonly queue: GameEvent[] = []
  private pumping = false
  private skipping = false
  private cardAck: (() => void) | null = null
  private board: BoardPort | null = null
  private readonly bot: Bot = simpleBot
  private readonly rng: BotRng
  private botTimer: ReturnType<typeof setTimeout> | null = null
  private logId = 0
  private disposed = false

  constructor(setup: GameSetup, replay: SavedGame['actions'] = []) {
    this.setup = setup
    this.rng = botRng(setup.seed ^ 0x5bd1e995)
    let state = createGame(
      setup.seats.map((s) => ({ id: s.id, name: s.name })),
      setup.seed,
      PRESETS[setup.preset],
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
      diceRoll: 0,
      card: null,
      thinking: null,
      viewer: null,
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

  private set(patch: Partial<Snapshot>): void {
    this.snap = { ...this.snap, ...patch }
    for (const fn of this.listeners) fn()
  }

  private emit(fx: Fx): void {
    if (this.skipping) return
    for (const fn of this.fxListeners) fn(fx)
  }

  // ---- board --------------------------------------------------------------

  attach(board: BoardPort | null): void {
    this.board = board
    if (!board) return
    board.setPlayers(this.setup.seats.map((s) => ({ id: s.id, color: s.color, piece: s.piece })))
    board.sync(boardSnapshot(this.snap.state))
    this.scheduleBot()
  }

  // ---- actions ------------------------------------------------------------

  /** Applies an action for a player. Returns an error message if the engine rejects it. */
  dispatch(playerId: string, action: Action): string | null {
    if (this.disposed) return 'game closed'
    const r = reduce(this.snap.state, playerId, action)
    if (!r.ok) return r.error
    this.actions.push({ playerId, action })
    saveGame({ version: 1, setup: this.setup, actions: this.actions })
    this.snap = { ...this.snap, state: r.state, viewer: this.viewerFor(r.state) }
    this.queue.push(...r.events)
    void this.pump()
    return null
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

  /** Jump to the end of all pending animations (skip). */
  skip(): void {
    if (!this.pumping) return
    this.skipping = true
    this.board?.skipAnimations()
    this.cardAck?.()
  }

  setSettings(patch: Partial<StoreSettings>): void {
    Object.assign(this.settings, patch)
  }

  seatKind(playerId: string): 'human' | 'bot' {
    return this.setup.seats.find((s) => s.id === playerId)?.kind ?? 'human'
  }

  private seatIndex(id: string): number {
    return this.setup.seats.findIndex((x) => x.id === id)
  }

  private viewerFor(s: GameState): number | null {
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
  }

  // ---- event playback -----------------------------------------------------

  private async pump(): Promise<void> {
    if (this.pumping) return
    this.pumping = true
    if (this.settings.instant) this.skipping = true
    this.set({ busy: true })
    while (this.queue.length > 0 && !this.disposed) {
      const e = this.queue.shift()!
      if (!this.skipping) await this.play(e)
      else if (e.type === 'DICE_ROLLED') this.snap = { ...this.snap, dice: e.dice }
      const line = describe(e, this.nameOf)
      this.snap = { ...this.snap, presented: applyEvent(this.snap.presented, e) }
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
    if (e.type === 'DICE_ROLLED') {
      this.set({ dice: e.dice, diceRoll: this.snap.diceRoll + 1 })
      await wait(TIMINGS.dice / speed)
      return
    }
    if (e.type === 'CARD_DRAWN') {
      const waiting = this.seatKind(e.playerId) === 'human'
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
      this.board.setTuning({ speed })
      await this.board.play(e)
    }
  }

  /** The payer's cash drops as the coins leave; the payee's rises when they land. */
  private async playCash(e: Extract<GameEvent, { type: 'CASH_CHANGED' }>, speed: number): Promise<void> {
    const other = e.counterparty && e.counterparty !== 'bank' ? e.counterparty : null
    if (other && e.delta < 0) {
      this.emit({ kind: 'transfer', from: e.playerId, to: other, amount: -e.delta })
      if (e.reason === 'rent') this.rentCallout(e.playerId, other, -e.delta)
      return
    }
    if (other) await wait(TIMINGS.coinFlight / speed)
    this.emit({ kind: 'pop', playerId: e.playerId, delta: e.delta })
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
    } else if (e.type === 'FINAL_ROUND') {
      this.emit({ kind: 'callout', tone: 'info', title: 'Final round', detail: 'Highest net worth wins.' })
    }
  }

  private pushLog(entry: Omit<LogEntry, 'id' | 'at'>): void {
    const log = [{ ...entry, id: ++this.logId, at: Date.now() }, ...this.snap.log].slice(0, LOG_LIMIT)
    this.set({ log })
  }

  // ---- bots ---------------------------------------------------------------

  private scheduleBot(): void {
    if (this.botTimer || this.disposed || this.pumping || !this.board) return
    const s = this.snap.state
    if (s.phase === 'gameOver') return
    const actor = s.players[expectedActor(s)]!
    if (this.seatKind(actor.id) !== 'bot') return
    this.set({ thinking: actor.id })
    const delay = this.settings.fastBots
      ? TIMINGS.botFast
      : TIMINGS.botThink + this.rng() * TIMINGS.botThinkJitter
    this.botTimer = setTimeout(() => {
      this.botTimer = null
      this.set({ thinking: null })
      const now = this.snap.state
      const id = now.players[expectedActor(now)]!.id
      if (this.seatKind(id) !== 'bot' || now.phase === 'gameOver') return
      const action = this.bot.decide(observe(now, id), id, this.rng) ?? { type: 'TIMEOUT' as const }
      const err = this.dispatch(id, action)
      if (err) {
        console.warn('[skyline] bot action rejected', id, action, err)
        this.dispatch(id, { type: 'TIMEOUT' })
      }
    }, delay)
  }
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
