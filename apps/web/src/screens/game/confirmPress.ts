/** Timer-free core of the press-again confirmation (see useConfirmPress). */

export type ConfirmEvent = 'press' | 'disarm'

export interface ConfirmStep {
  armed: boolean
  /** True when this press is the confirming second one. */
  confirm: boolean
}

/**
 * First press arms, a second press while armed confirms and disarms, anything else disarms.
 * `enabled: false` (the action became illegal) always disarms and never confirms.
 */
export function confirmStep(armed: boolean, event: ConfirmEvent, enabled = true): ConfirmStep {
  if (!enabled || event === 'disarm') return { armed: false, confirm: false }
  return armed ? { armed: false, confirm: true } : { armed: true, confirm: false }
}
