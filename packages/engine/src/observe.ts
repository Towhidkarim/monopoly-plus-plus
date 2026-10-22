import { cloneState, type GameState, type PlayerId } from './state.ts'

/**
 * What a player (or a bot, or an online client) is allowed to see: everything except the
 * RNG state and the order of the card decks. Deck sizes are kept (cards hidden as -1),
 * so the view has the same shape as GameState and works with `legalActions`.
 */
export type PlayerView = GameState

export function observe(state: GameState, _playerId: PlayerId): PlayerView {
  const view = cloneState(state)
  view.rng = 0
  view.decks = {
    chance: view.decks.chance.map(() => -1),
    chest: view.decks.chest.map(() => -1),
  }
  return view
}
