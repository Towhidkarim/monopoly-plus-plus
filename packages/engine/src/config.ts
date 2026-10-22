/** Rule options (house rules) and presets. See DECISIONS.md D10. */

export interface GameConfig {
  startingCash: number
  /** Salary for passing (or landing on) GO. */
  goSalary: number
  /** Landing exactly on GO pays the salary a second time. */
  landOnGoBonus: boolean
  jailFine: number
  /** Failed doubles attempts before the fine is forced. */
  maxJailTurns: number
  /** Declining to buy starts an auction; otherwise the space stays unowned. */
  auctionOnDecline: boolean
  /** Taxes and fines go to a pot collected on the parking space. */
  freeParkingPot: boolean
  /** Houses must be built and sold evenly across a group. */
  evenBuild: boolean
  /** Random properties dealt to each player at the start. */
  dealtProperties: number
  /** Game ends after this many full rounds (highest net worth wins); 0 = no limit. */
  roundLimit: number
  /** Interest on unmortgaging and on receiving mortgaged property in trades. */
  mortgageInterest: number
  houses: number
  hotels: number
  /** Open outgoing trade offers per player. */
  maxOpenTrades: number
}

const CLASSIC: GameConfig = {
  startingCash: 1500,
  goSalary: 200,
  landOnGoBonus: false,
  jailFine: 50,
  maxJailTurns: 3,
  auctionOnDecline: true,
  freeParkingPot: false,
  evenBuild: true,
  dealtProperties: 0,
  roundLimit: 0,
  mortgageInterest: 0.1,
  houses: 32,
  hotels: 12,
  maxOpenTrades: 3,
}

export type PresetName = 'standard' | 'turbo' | 'classic'

/** Round limits are first guesses; the simulation harness tunes them toward target durations. */
export const PRESETS: Record<PresetName, GameConfig> = {
  classic: CLASSIC,
  standard: { ...CLASSIC, dealtProperties: 2, roundLimit: 30 },
  turbo: { ...CLASSIC, dealtProperties: 3, goSalary: 300, roundLimit: 16 },
}
