import { CHANCE_CARDS, CHEST_CARDS } from './cards.ts'
import { GROUPS, SPACES } from './board.ts'
import { PRESETS, type GameConfig } from './config.ts'
import { randFrom, seedState, shuffleInPlace } from './rng.ts'
import { BOARD_SIZE } from './ring.ts'
import type { GameState, PlayerId } from './state.ts'

export interface PlayerSetup {
  id: PlayerId
  name: string
}

/** Creates a new game. Throws on an invalid setup (a programming error, not a game action). */
export function createGame(
  players: readonly PlayerSetup[],
  seed: number,
  config: GameConfig = PRESETS.standard,
): GameState {
  if (players.length < 2 || players.length > 6) throw new Error('2 to 6 players required')
  if (new Set(players.map((p) => p.id)).size !== players.length) throw new Error('player ids must be unique')
  if (players.some((p) => p.id === 'bank')) throw new Error('"bank" is a reserved id')

  const s: GameState = {
    config,
    rng: seedState(seed),
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      cash: config.startingCash,
      position: 0,
      inJail: false,
      jailTurns: 0,
      jailCards: [],
      bankrupt: false,
    })),
    current: 0,
    phase: 'preRoll',
    doubles: 0,
    round: 1,
    turnCount: 0,
    owner: Array.from({ length: BOARD_SIZE }, () => -1),
    houses: Array.from({ length: BOARD_SIZE }, () => 0),
    mortgaged: Array.from({ length: BOARD_SIZE }, () => false),
    bankHouses: config.houses,
    bankHotels: config.hotels,
    decks: { chance: [], chest: [] },
    pending: null,
    debts: [],
    trades: [],
    nextTradeId: 1,
    lastDice: null,
    lastSpeed: null,
    scoutDue: false,
    pot: 0,
    winner: -1,
  }
  const rand = randFrom(
    () => s.rng,
    (n) => (s.rng = n),
  )
  s.decks.chance = shuffleInPlace([...CHANCE_CARDS.keys()], rand)
  s.decks.chest = shuffleInPlace([...CHEST_CARDS.keys()], rand)
  dealProperties(s, rand)
  return s
}

/** Deals `config.dealtProperties` random color properties to each player, never a full group. */
function dealProperties(s: GameState, rand: ReturnType<typeof randFrom>): void {
  const perPlayer = s.config.dealtProperties
  if (perPlayer <= 0) return
  const pool = shuffleInPlace(
    SPACES.flatMap((sp, i) => (sp.kind === 'property' ? [i] : [])),
    rand,
  )
  for (let round = 0; round < perPlayer; round++) {
    for (let seat = 0; seat < s.players.length; seat++) {
      const pick = pool.findIndex((space) => {
        const group = GROUPS[SPACES[space]!.group]!
        return !group.every((i) => i === space || s.owner[i] === seat)
      })
      if (pick < 0) continue
      const [space] = pool.splice(pick, 1)
      s.owner[space!] = seat
    }
  }
}
