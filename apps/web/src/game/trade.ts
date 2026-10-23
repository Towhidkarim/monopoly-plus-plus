import { GROUPS, SPACES, mortgageValue, type Bundle, type GameState } from '@skyline/engine'

/** Helpers for the trade screen and incoming offers (pure, unit-tested). */

export const emptyBundle = (): Bundle => ({ spaces: [], cash: 0, jailCards: 0 })

export const isEmptyBundle = (b: Bundle) => b.spaces.length === 0 && b.cash === 0 && b.jailCards === 0

export interface TradeSpace {
  space: number
  /** Why it cannot be traded right now, or null. */
  blocked: string | null
}

/** Everything `seat` owns, in board order, with a reason when it cannot change hands. */
export function tradeSpaces(s: GameState, seat: number): TradeSpace[] {
  const out: TradeSpace[] = []
  for (let i = 0; i < SPACES.length; i++) {
    if (s.owner[i] !== seat) continue
    const g = SPACES[i]!.group
    const built = g >= 0 && GROUPS[g]!.some((j) => s.houses[j]! > 0)
    out.push({ space: i, blocked: built ? 'Sell the buildings in this set first' : null })
  }
  return out
}

/** Groups `seat` would newly own in full if it gained `gain` and lost `lose`. */
export function setsCompleted(s: GameState, seat: number, gain: readonly number[], lose: readonly number[]) {
  const owns = (i: number) => (s.owner[i] === seat && !lose.includes(i)) || gain.includes(i)
  const out: number[] = []
  for (let g = 0; g < GROUPS.length; g++) {
    const spaces = GROUPS[g]!
    const before = spaces.every((i) => s.owner[i] === seat)
    if (!before && spaces.every(owns)) out.push(g)
  }
  return out
}

/** Groups `seat` owns in full now but would not after losing `lose`. */
export function setsBroken(s: GameState, seat: number, lose: readonly number[]) {
  return GROUPS.flatMap((spaces, g) =>
    spaces.every((i) => s.owner[i] === seat) && spaces.some((i) => lose.includes(i)) ? [g] : [],
  )
}

/** The fee for taking over mortgaged properties (the mortgage itself stays), as the engine charges it. */
export function mortgageFee(s: GameState, spaces: readonly number[]): number {
  const rate = s.config.mortgageInterest
  return spaces.reduce((sum, i) => sum + (s.mortgaged[i] ? Math.ceil(mortgageValue(i) * rate) : 0), 0)
}

/** "Bazaar Alley + ₵300" style description of one side of a deal. */
export function describeBundle(b: Bundle): string {
  return (
    [
      ...b.spaces.map((i) => SPACES[i]!.name),
      ...(b.cash > 0 ? [`₵${b.cash.toLocaleString()}`] : []),
      ...(b.jailCards > 0 ? [b.jailCards === 1 ? 'a free card' : `${b.jailCards} free cards`] : []),
    ].join(' + ') || 'nothing'
  )
}

/** Engine refusals in words a player understands. */
export function tradeProblem(error: string): string {
  if (/empty/.test(error)) return 'Add something to the deal.'
  if (/buildings/.test(error)) return 'Sell the buildings in that set first.'
  if (/cash/.test(error)) return 'Not enough cash for that.'
  if (/too many/.test(error)) return 'You already have three offers waiting.'
  if (/bankrupt/.test(error)) return 'That player is out of the game.'
  return error.charAt(0).toUpperCase() + error.slice(1) + '.'
}

/** A set the player owns all but one of, held by someone who could sell it. */
export interface MissingPiece {
  group: number
  space: number
  owner: number
}

/** Sets `seat` could finish with one trade (the most common reason to trade), best first. */
export function missingPieces(s: GameState, seat: number): MissingPiece[] {
  const out: MissingPiece[] = []
  for (let g = 0; g < GROUPS.length; g++) {
    const missing = GROUPS[g]!.filter((i) => s.owner[i] !== seat)
    if (missing.length !== 1) continue
    const space = missing[0]!
    const owner = s.owner[space]!
    if (owner < 0 || owner === seat || s.players[owner]!.bankrupt) continue
    if (GROUPS[g]!.some((i) => s.houses[i]! > 0)) continue
    out.push({ group: g, space, owner })
  }
  // Pricier sets earn more rent: suggest those first.
  return out.toSorted((a, b) => SPACES[b.space]!.price - SPACES[a.space]!.price)
}

export type Mood = 'empty' | 'no' | 'close' | 'yes'

/** Where a verdict mood (0..1, yes above 0.5) sits, in words the meter and the bot use. */
export function moodOf(mood: number | null): Mood {
  if (mood === null) return 'empty'
  if (mood > 0.5) return 'yes'
  if (mood > 0.3) return 'close'
  return 'no'
}

/** What each bot personality says at the trade table. Unknown personalities talk like Balanced. */
const LINES: Record<string, Record<Mood | 'offer' | 'accepted' | 'declined', readonly string[]>> = {
  Balanced: {
    empty: ['What did you have in mind?', 'Let us talk.'],
    no: ["That doesn't work for me.", 'Not at that price.'],
    close: ['Getting closer.', 'Almost there.'],
    yes: ['Sounds fair. Deal!', 'I can live with that.'],
    offer: ['I have an offer you might like.', 'How about a trade?'],
    accepted: ['Pleasure doing business.'],
    declined: ['Maybe another time.'],
  },
  Banker: {
    empty: ['Show me the numbers.', 'I am listening.'],
    no: ["The numbers don't add up.", 'Far too risky for me.'],
    close: ['Almost. Sweeten it a little.', 'A touch more and we have terms.'],
    yes: ['Acceptable terms.', 'That balances the books.'],
    offer: ['I have prepared a proposal.', 'Consider these terms.'],
    accepted: ['A sound investment.'],
    declined: ['Noted. My door stays open.'],
  },
  Tycoon: {
    empty: ['Go on, impress me.', 'What is the big idea?'],
    no: ['Think bigger.', 'You are wasting my time.'],
    close: ['Now we are talking… almost.', 'Close. Push a little more.'],
    yes: ["Let's make it happen!", 'Now that is a deal!'],
    offer: ['Big opportunity here. Interested?', 'I am expanding. Want in?'],
    accepted: ['The skyline grows!'],
    declined: ['Your loss.'],
  },
  Shark: {
    empty: ['Make it worth my while.', 'Well?'],
    no: ['You will have to do much better.', 'Is that a joke?'],
    close: ['Not yet. Keep going.', 'Closer. Not close enough.'],
    yes: ["Fine. You've got a deal.", 'Hmph. Agreed.'],
    offer: ['I am feeling generous. Briefly.', 'Take it or leave it.'],
    accepted: ['Smart move.'],
    declined: ['You will regret that.'],
  },
}

/** A reaction line for a personality; `pick` varies which of the lines is used. */
export function reaction(
  personality: string | null,
  moment: Mood | 'offer' | 'accepted' | 'declined',
  pick = 0,
): string {
  const lines = (LINES[personality ?? ''] ?? LINES.Balanced!)[moment]
  return lines[Math.abs(pick) % lines.length]!
}
