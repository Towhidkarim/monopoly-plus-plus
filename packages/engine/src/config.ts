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
  /**
   * Twist (DECISIONS.md D61, D62): a third die with 1, 2, 3, Bus and two Scout faces.
   * Optional so configs saved before it existed still load (missing means off).
   */
  speedDie?: boolean
  /** Twist (D63): passing Start pays extra the further a player trails the leader in net worth. */
  underdogSalary?: boolean
  /** The most the underdog bonus adds, as a share of the salary (0.5 to 4; absent means 2). */
  underdogMax?: number
  /** Twist (D63): a player who cannot pay may take a bank loan, repaid from half of their income. */
  secondWind?: boolean
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

/**
 * Tuned with the heuristic bot (DECISIONS.md D22): Standard about 29 rounds (a fifth of games end
 * with one player left); Turbo deals 4 properties so sets and bankruptcies happen within 20 rounds.
 */
export const PRESETS: Record<PresetName, GameConfig> = {
  classic: CLASSIC,
  standard: { ...CLASSIC, dealtProperties: 2, roundLimit: 30 },
  turbo: { ...CLASSIC, dealtProperties: 4, goSalary: 300, roundLimit: 20 },
}
