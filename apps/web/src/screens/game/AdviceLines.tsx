import type { Advice } from '../../game/advice.ts'
import { Icon } from './icons.tsx'

const STYLE = {
  good: 'text-gold',
  info: 'text-ink-muted',
  warn: 'text-alert',
} as const

/** The buy advice lines (game/advice.ts) under a buy or auction decision. */
export function AdviceLines({ advice, className = '' }: { advice: readonly Advice[]; className?: string }) {
  if (advice.length === 0) return null
  return (
    <ul className={`flex flex-col gap-1.5 text-[13px] leading-snug ${className}`}>
      {advice.map((a) => (
        <li key={a.text} className={`flex items-start gap-2 ${STYLE[a.tone]}`}>
          <span className="mt-px shrink-0">
            <Icon name={a.tone === 'warn' ? 'alert' : 'bulb'} size={13} />
          </span>
          <span className={a.tone === 'good' ? 'font-semibold' : ''}>{a.text}</span>
        </li>
      ))}
    </ul>
  )
}
