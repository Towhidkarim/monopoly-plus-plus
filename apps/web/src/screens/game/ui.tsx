import type { ReactNode } from 'react'

/** Small shared building blocks for the game screen. */

export function Btn({
  children,
  onClick,
  kind = 'secondary',
  disabled,
  className = '',
}: {
  children: ReactNode
  onClick: () => void
  kind?: 'primary' | 'secondary' | 'danger' | 'ghost'
  disabled?: boolean
  className?: string
}) {
  const styles = {
    primary: 'bg-accent text-table shadow-lg shadow-accent/25 hover:brightness-110',
    secondary: 'border border-line bg-white/5 text-ink hover:bg-white/10',
    danger: 'bg-alert/90 text-table hover:bg-alert',
    ghost: 'text-ink-muted hover:bg-white/5 hover:text-ink',
  }[kind]
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-4 py-2 text-sm font-semibold transition-transform duration-100 active:scale-95 disabled:pointer-events-none disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
    </button>
  )
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`pointer-events-auto rounded-2xl border border-line bg-panel/95 shadow-2xl shadow-black/40 backdrop-blur ${className}`}
    >
      {children}
    </div>
  )
}

export function Money({ value, className = '' }: { value: number; className?: string }) {
  return <span className={`font-mono tabular-nums ${className}`}>₵{value.toLocaleString()}</span>
}
