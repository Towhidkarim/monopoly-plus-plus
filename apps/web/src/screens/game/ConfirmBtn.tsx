import type { ReactNode } from 'react'
import { FX_BRIGHT } from './ui.tsx'
import { useConfirmPress } from './useConfirmPress.ts'

/** Calm alert tint shared by every armed confirmation. */
export const ARMED = 'border-alert/50 bg-alert/10 text-alert'

/** Thin countdown bar along the bottom edge; it exists only while armed, so nothing lingers. */
export function ConfirmBar({ ms }: { ms: number }) {
  return (
    <span
      aria-hidden="true"
      className="confirm-bar pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-alert"
      style={{ ['--confirm-ms' as string]: `${ms}ms` }}
    />
  )
}

/**
 * A button that needs a second press to act. Idle it shows `children`; armed it shows
 * `armedLabel` ("Sell? +₵75") in the alert tint with a countdown bar. Both labels share one grid
 * cell, so the width is that of the longer one and the layout never jumps.
 */
export function ConfirmBtn({
  children,
  armedLabel,
  onConfirm,
  disabled,
  title,
  ariaLabel,
  armedAriaLabel,
  className = '',
  idleClass,
  timeoutMs = 2500,
}: {
  children: ReactNode
  armedLabel: string
  onConfirm: () => void
  disabled?: boolean
  title?: string | undefined
  ariaLabel?: string
  armedAriaLabel: string
  /** Size and shape, always applied. */
  className?: string
  /** Colors while idle (replaced by the alert tint while armed). */
  idleClass: string
  timeoutMs?: number
}) {
  const { armed, press, bind } = useConfirmPress(onConfirm, { timeoutMs, enabled: !disabled })
  return (
    <button
      type="button"
      {...bind}
      onClick={press}
      disabled={disabled}
      title={armed ? undefined : title}
      aria-label={armed ? armedAriaLabel : ariaLabel}
      data-armed={armed || undefined}
      className={`relative inline-flex items-center justify-center overflow-hidden border font-extrabold tabular-nums ${FX_BRIGHT} disabled:pointer-events-none disabled:opacity-35 ${armed ? `confirm-nudge ${ARMED}` : idleClass} ${className}`}
    >
      <span className="grid">
        <span className={`col-start-1 row-start-1 ${armed ? 'invisible' : ''}`} aria-hidden={armed}>
          {children}
        </span>
        <span className={`col-start-1 row-start-1 ${armed ? '' : 'invisible'}`} aria-hidden={!armed}>
          {armedLabel}
        </span>
      </span>
      {armed && <ConfirmBar ms={timeoutMs} />}
    </button>
  )
}
