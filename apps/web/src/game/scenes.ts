import { expectedActor, legalActions, observe, reduce, type Action, type GameState } from '@skyline/engine'
import { botRng, simpleBot } from '@skyline/bots'
import { buildableGroups } from './plans.ts'
import type { GameStore } from './store.ts'

/**
 * Dev scenes (`?demo=play&scene=buy`): fast-forward a real game until the human seat faces a
 * given moment, so each decision screen can be reached and screenshotted on demand. Everyone,
 * the human included, plays the simple bot plus eager building (so rents and debts happen).
 */
export type Scene = 'buy' | 'auction' | 'debt' | 'build' | 'card'

export const SCENES: readonly Scene[] = ['buy', 'auction', 'debt', 'build', 'card']

const reached: Record<Scene, (s: GameState, human: number) => boolean> = {
  buy: (s, h) => s.pending?.kind === 'buy' && s.current === h,
  auction: (s, h) => s.pending?.kind === 'auction' && s.pending.bidders[s.pending.current] === h,
  debt: (s, h) => s.debts[0]?.debtor === h,
  build: (s, h) => s.phase === 'postRoll' && s.current === h && buildableGroups(s, s.players[h]!.id) > 0,
  // The human's next roll draws a card (the caller then rolls with animation on).
  card: (s, h) => {
    if (s.current !== h || s.phase !== 'preRoll' || s.players[h]!.inJail) return false
    const r = reduce(s, s.players[h]!.id, { type: 'ROLL' })
    return r.ok && r.events.some((e) => e.type === 'CARD_DRAWN')
  },
}

/** Returns false if the game ended (or the human went bankrupt) before the scene came up. */
export function playToScene(store: GameStore, scene: Scene, maxActions = 50_000): boolean {
  const human = store.setup.seats.findIndex((x) => x.kind === 'human')
  const rng = botRng(store.setup.seed)
  for (let n = 0; n < maxActions; n++) {
    const s = store.getSnapshot().state
    if (s.phase === 'gameOver' || s.players[human]!.bankrupt) return false
    // The human declines its first purchases so an auction comes up quickly.
    if (scene === 'auction' && s.pending?.kind === 'buy' && s.current === human) {
      store.dispatch(s.players[human]!.id, { type: 'DECLINE_BUY' })
      continue
    }
    if (reached[scene](s, human)) return true
    const seat = expectedActor(s)
    const id = s.players[seat]!.id
    const action = eagerBuild(s, id) ?? simpleBot.decide(observe(s, id), id, rng) ?? { type: 'TIMEOUT' }
    if (store.dispatch(id, action)) store.dispatch(id, { type: 'TIMEOUT' })
  }
  return false
}

function eagerBuild(s: GameState, id: string): Action | null {
  if (s.pending || s.debts.length > 0) return null
  const me = s.players.find((p) => p.id === id)!
  if (me.cash < 250) return null
  return legalActions(s, id).find((a) => a.type === 'BUILD') ?? null
}
