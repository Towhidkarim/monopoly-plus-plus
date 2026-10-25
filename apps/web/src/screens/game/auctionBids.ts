import type { Action } from '@skyline/engine'

export interface Raise {
  /** The bid this button places. */
  amount: number
  /** Small label under the amount: "+10" or "list price". */
  step: string
  /** Keyboard shortcut (1 to 4). */
  key: string
}

/** Raise steps offered on top of the current high bid. */
export const RAISE_STEPS = [10, 25, 50] as const

/**
 * Bid buttons that step up from the high bid (+10, +25, +50) plus the list price while it is
 * still above the high bid. Steps the bidder can't afford are hidden. The engine accepts any
 * whole bid above the high bid up to the bidder's cash, so every option here is legal.
 */
export function raiseOptions(highBid: number, price: number, cash: number): Raise[] {
  const out: Raise[] = []
  RAISE_STEPS.forEach((step, i) => {
    const amount = highBid + step
    if (amount <= cash) out.push({ amount, step: `+${step}`, key: String(i + 1) })
  })
  if (price > highBid && price <= cash && !out.some((r) => r.amount === price))
    out.push({ amount: price, step: 'list price', key: '4' })
  return out
}

export const bidAction = (amount: number): Action => ({ type: 'BID', amount })
