import type { Action } from '../actions.ts'
import { HOTEL, SPACES, mortgageValue } from '../board.ts'
import { addCash, idOf, type Ctx } from '../core.ts'
import { BOARD_SIZE } from '../ring.ts'
import type { CashReason, GameState } from '../state.ts'

/**
 * Second Wind, the second half of the Comeback twist (DECISIONS.md D63): a player who owes more
 * than they hold may take a bank loan instead of mortgaging or selling. The bank pays the
 * creditor in full; the loan plus interest is repaid from a share of everything the player
 * earns. One loan at a time; each later loan costs more interest.
 */

/** Interest by loan number (first, second, third and later). */
const RATES = [0.1, 0.25, 0.5] as const
/** Share of each income that goes to an open loan. */
const REPAY_SHARE = 0.5
/** Income that repays a loan. Raising cash (mortgages, sales, trades) does not. */
const INCOME: ReadonlySet<CashReason> = new Set(['salary', 'underdog', 'rent', 'pot', 'card'])

const up10 = (n: number) => Math.ceil(n / 10) * 10

/** Interest on the loan `seat` would take next. */
export function loanRate(s: GameState, seat: number): number {
  return RATES[Math.min(s.players[seat]!.loans ?? 0, RATES.length - 1)]!
}

/** The most the bank lends: what the player's city is worth (properties and buildings). */
export function loanCap(s: GameState, seat: number): number {
  let total = 0
  for (let i = 0; i < BOARD_SIZE; i++) {
    if (s.owner[i] !== seat) continue
    total += s.mortgaged[i] ? mortgageValue(i) : SPACES[i]!.price
    const level = s.houses[i]!
    total += (level === HOTEL ? 5 : level) * SPACES[i]!.houseCost
  }
  return total
}

/** Cash `seat` is short of their queued debts. */
function shortfall(s: GameState, seat: number): number {
  const owed = s.debts.filter((d) => d.debtor === seat).reduce((t, d) => t + d.amount, 0)
  return owed - s.players[seat]!.cash
}

export function checkTakeLoan(s: GameState, seat: number): string | null {
  if (!s.config.secondWind) return 'loans are off'
  if (s.debts[0]?.debtor !== seat) return 'only a player who cannot pay may take a loan'
  if ((s.players[seat]!.loan ?? 0) > 0) return 'repay your loan first'
  if (up10(shortfall(s, seat)) > loanCap(s, seat)) return 'the bank will not lend that much'
  return null
}

export function applyTakeLoan(ctx: Ctx, seat: number): void {
  const s = ctx.s
  const p = s.players[seat]!
  const amount = up10(shortfall(s, seat))
  const rate = loanRate(s, seat)
  const owed = amount + up10(Math.round(amount * rate)) // round first: 1700 * 0.1 is 170.00000000000003
  addCash(ctx, seat, amount, 'loan', -1)
  p.loan = owed
  p.loans = (p.loans ?? 0) + 1
  ctx.events.push({ type: 'LOAN_TAKEN', playerId: p.id, amount, owed, rate })
  // reduce settles the debts right after, with the borrowed cash.
}

export function checkRepayLoan(s: GameState, seat: number): string | null {
  const p = s.players[seat]!
  if ((p.loan ?? 0) <= 0) return 'no loan to repay'
  if (p.cash <= 0) return 'no cash to repay with'
  if (s.debts.some((d) => d.debtor === seat)) return 'settle your debt first'
  return null
}

/** Pays as much of the loan as the player's cash allows. */
export function applyRepayLoan(ctx: Ctx, seat: number): void {
  const p = ctx.s.players[seat]!
  repay(ctx, seat, Math.min(p.cash, p.loan ?? 0))
}

/** After `delta` of income arrived, sends a share of it to an open loan. Called by addCash. */
export function repayFromIncome(ctx: Ctx, seat: number, delta: number, reason: CashReason): void {
  const loan = ctx.s.players[seat]!.loan ?? 0
  if (loan <= 0 || delta <= 0 || !INCOME.has(reason)) return
  repay(ctx, seat, Math.min(loan, Math.ceil(delta * REPAY_SHARE)))
}

function repay(ctx: Ctx, seat: number, amount: number): void {
  const p = ctx.s.players[seat]!
  addCash(ctx, seat, -amount, 'loanRepay', -1)
  p.loan = (p.loan ?? 0) - amount
  if (p.loan <= 0) {
    p.loan = 0
    ctx.events.push({ type: 'LOAN_REPAID', playerId: idOf(ctx.s, seat) })
  }
}

export function legalLoan(s: GameState, seat: number): Action[] {
  return [
    ...(checkTakeLoan(s, seat) ? [] : [{ type: 'TAKE_LOAN' } as const]),
    ...(checkRepayLoan(s, seat) ? [] : [{ type: 'REPAY_LOAN' } as const]),
  ]
}
