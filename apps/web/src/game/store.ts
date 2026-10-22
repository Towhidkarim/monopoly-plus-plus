import {
  PRESETS,
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

export interface CardShown {
  deck: 'chance' | 'chest'
  cardId: number
  playerId: string
}

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
  private readonly actions: SavedGame['actions'] = []
  private readonly queue: GameEvent[] = []
  private pumping = false
  private skipping = false
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
    }
    if (replay.length > 0) this.pushLog({ text: 'Game resumed', tone: 'muted' })
  }

  // ---- React binding ------------------------------------------------------

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getSnapshot = (): Snapshot => this.snap

  private set(patch: Partial<Snapshot>): void {
    this.snap = { ...this.snap, ...patch }
    for (const fn of this.listeners) fn()
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
    this.snap = { ...this.snap, state: r.state }
    this.queue.push(...r.events)
    void this.pump()
    return null
  }

  /** Jump to the end of all pending animations (skip). */
  skip(): void {
    if (!this.pumping) return
    this.skipping = true
    this.board?.skipAnimations()
  }

  setSettings(patch: Partial<StoreSettings>): void {
    Object.assign(this.settings, patch)
  }

  seatKind(playerId: string): 'human' | 'bot' {
    return this.setup.seats.find((s) => s.id === playerId)?.kind ?? 'human'
  }

  nameOf = (id: string): string =>
    id === 'bank' ? 'the bank' : (this.setup.seats.find((s) => s.id === id)?.name ?? id)

  dispose(): void {
    this.disposed = true
    if (this.botTimer) clearTimeout(this.botTimer)
    this.listeners.clear()
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
      await wait(620 / speed)
      return
    }
    if (e.type === 'CARD_DRAWN') {
      this.set({ card: { deck: e.deck, cardId: e.cardId, playerId: e.playerId } })
      await wait(1900 / speed)
      this.set({ card: null })
      return
    }
    if (this.board) {
      this.board.setTuning({ speed })
      await this.board.play(e)
    }
    if (e.type === 'CASH_CHANGED' && (e.reason === 'rent' || e.reason === 'tax')) await wait(260 / speed)
  }

  private pushLog(entry: Omit<LogEntry, 'id'>): void {
    const log = [{ ...entry, id: ++this.logId }, ...this.snap.log].slice(0, LOG_LIMIT)
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
    const delay = this.settings.fastBots ? 40 : 380 + this.rng() * 420
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
