import type { GameEvent, GameState } from '@skyline/engine'

/**
 * What the screen currently shows (ARCHITECTURE.md section 4). It lags the authoritative
 * state while animations play: each event is applied as it finishes animating, and the whole
 * thing is reconciled with the authoritative state when a batch ends.
 */
export interface PresentedPlayer {
  id: string
  name: string
  cash: number
  position: number
  inJail: boolean
  bankrupt: boolean
  jailCards: number
  /** Second Wind (D63): still owed on the open loan (0 when none), and what it came to. */
  loan: number
  loanTotal: number
}

export interface Presented {
  players: PresentedPlayer[]
  owner: number[]
  houses: number[]
  mortgaged: boolean[]
  current: number
  round: number
  pot: number
  winner: number
  over: boolean
}

export function presentFrom(s: GameState): Presented {
  return {
    players: s.players.map((p) => ({
      id: p.id,
      name: p.name,
      cash: p.cash,
      position: p.position,
      inJail: p.inJail,
      bankrupt: p.bankrupt,
      jailCards: p.jailCards.length,
      loan: p.loan ?? 0,
      loanTotal: p.loanTotal ?? 0,
    })),
    owner: [...s.owner],
    houses: [...s.houses],
    mortgaged: [...s.mortgaged],
    current: s.current,
    round: s.round,
    pot: s.pot,
    winner: s.winner,
    over: s.phase === 'gameOver',
  }
}

const setAt = <T>(arr: T[], i: number, v: T): T[] => arr.map((x, j) => (j === i ? v : x))

/** Returns a new Presented with one event applied. */
export function applyEvent(p: Presented, e: GameEvent): Presented {
  const seat = (id: string) => p.players.findIndex((x) => x.id === id)
  const player = (id: string, f: (x: PresentedPlayer) => PresentedPlayer): Presented => ({
    ...p,
    players: p.players.map((x) => (x.id === id ? f(x) : x)),
  })
  switch (e.type) {
    case 'CASH_CHANGED':
      return player(e.playerId, (x) => ({
        ...x,
        cash: x.cash + e.delta,
        loan: e.reason === 'loanRepay' ? Math.max(0, x.loan + e.delta) : x.loan,
      }))
    case 'LOAN_TAKEN':
      return player(e.playerId, (x) => ({ ...x, loan: e.owed, loanTotal: e.owed }))
    case 'MOVED':
      return player(e.playerId, (x) => ({ ...x, position: e.path.at(-1) ?? x.position }))
    case 'JUMPED':
      return player(e.playerId, (x) => ({ ...x, position: e.to }))
    case 'JAILED':
      return player(e.playerId, (x) => ({ ...x, inJail: true }))
    case 'RELEASED':
      return player(e.playerId, (x) => ({
        ...x,
        inJail: false,
        jailCards: e.how === 'card' ? x.jailCards - 1 : x.jailCards,
      }))
    case 'JAIL_CARD_GAINED': {
      const gained = player(e.playerId, (x) => ({ ...x, jailCards: x.jailCards + 1 }))
      return e.from === undefined
        ? gained
        : {
            ...gained,
            players: gained.players.map((x) => (x.id === e.from ? { ...x, jailCards: x.jailCards - 1 } : x)),
          }
    }
    case 'BANKRUPT':
      return player(e.playerId, (x) => ({
        ...x,
        bankrupt: true,
        cash: 0,
        inJail: false,
        jailCards: 0,
        loan: 0,
      }))
    case 'TURN_STARTED':
      return { ...p, current: seat(e.playerId), round: e.round }
    case 'PROPERTY_BOUGHT':
      return { ...p, owner: setAt(p.owner, e.space, seat(e.playerId)) }
    case 'AUCTION_ENDED':
      return e.winner ? { ...p, owner: setAt(p.owner, e.space, seat(e.winner)) } : p
    case 'PROPERTY_TRANSFERRED':
      if (e.to === 'bank') {
        return {
          ...p,
          owner: setAt(p.owner, e.space, -1),
          houses: setAt(p.houses, e.space, 0),
          mortgaged: setAt(p.mortgaged, e.space, false),
        }
      }
      return { ...p, owner: setAt(p.owner, e.space, seat(e.to)) }
    case 'BUILT':
    case 'SOLD_BUILDING':
      return { ...p, houses: setAt(p.houses, e.space, e.level) }
    case 'MORTGAGED':
    case 'UNMORTGAGED':
      return { ...p, mortgaged: setAt(p.mortgaged, e.space, e.type === 'MORTGAGED') }
    case 'POT_CHANGED':
      return { ...p, pot: e.amount }
    case 'GAME_OVER':
      return { ...p, over: true, winner: seat(e.winner) }
    default:
      return p
  }
}

/** Fields that must agree between presented and authoritative once a batch is done. */
export function desyncs(p: Presented, truth: Presented): string[] {
  const out: string[] = []
  p.players.forEach((x, i) => {
    const t = truth.players[i]!
    for (const k of ['cash', 'position', 'inJail', 'bankrupt', 'jailCards', 'loan'] as const) {
      if (x[k] !== t[k]) out.push(`${x.id}.${k}: shown ${String(x[k])}, actual ${String(t[k])}`)
    }
  })
  for (const k of ['owner', 'houses', 'mortgaged'] as const) {
    p[k].forEach((v, i) => {
      if (v !== truth[k][i]) out.push(`${k}[${i}]: shown ${String(v)}, actual ${String(truth[k][i])}`)
    })
  }
  if (p.current !== truth.current) out.push(`current: shown ${p.current}, actual ${truth.current}`)
  return out
}
