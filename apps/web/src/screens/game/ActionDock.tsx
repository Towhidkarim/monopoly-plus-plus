import type { ReactNode } from 'react'
import type { GameStore, Snapshot } from '../../game/store.ts'
import { Icon } from './icons.tsx'
import type { TurnView } from './turn.ts'
import { Kbd, FX, FX_BRIGHT } from './ui.tsx'

/**
 * Bottom dock: one big primary action (Space), My city on the left, Trade on the right.
 * While a bot plays or animations run, the primary slot becomes a status with Skip.
 */
export function ActionDock({
  snap,
  store,
  turn,
  cityBadge,
  cityOpen,
  onCity,
  onTrade,
}: {
  snap: Snapshot
  store: GameStore
  turn: TurnView
  cityBadge: number
  cityOpen: boolean
  onCity: () => void
  /** Opens the trade screen, or null when the viewer cannot trade. */
  onTrade: (() => void) | null
}) {
  // Buy, debt, an offer and a waiting card carry their own buttons.
  if (
    snap.presented.over ||
    turn.moment === 'buy' ||
    turn.moment === 'debt' ||
    turn.moment === 'offer' ||
    snap.card?.waiting
  )
    return null
  const { primary, secondary } = turn
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 flex flex-col items-center gap-2 px-4">
      <nav
        aria-label="Actions"
        className="pointer-events-auto flex items-center gap-2.5 rounded-3xl border border-line bg-panel/95 p-2.5 shadow-panel-lg backdrop-blur"
      >
        <DockButton onClick={onCity} active={cityOpen} badge={cityBadge} hotkey="C">
          <Icon name="city" />
          My city
        </DockButton>

        {primary ? (
          // The wrapper pops in on each new primary; the button inside breathes while it waits.
          <span key={primary.label} className="inline-flex animate-pop">
            <button
              type="button"
              onClick={primary.run}
              className={`flex h-[66px] items-center gap-3 rounded-[18px] bg-accent px-8.5 font-display text-xl font-bold text-accent-ink shadow-gold-lg ${FX_BRIGHT} ${store.settings.reducedMotion ? '' : 'animate-breathe'}`}
            >
              {primary.label.startsWith('Roll') && <Icon name="dice" size={24} />}
              {primary.label}
              {primary.hotkey && (
                <span className="rounded-md bg-card px-2 py-[3px] font-sans text-[11px] font-extrabold text-card-ink shadow-keycap">
                  {primary.hotkey.length === 1 ? primary.hotkey.toUpperCase() : primary.hotkey}
                </span>
              )}
            </button>
          </span>
        ) : (
          <div className="flex h-[66px] min-w-64 items-center justify-center gap-3 rounded-[18px] bg-panel-2 px-6 text-sm text-ink-muted">
            <span className="size-2 animate-pulse rounded-full bg-ink-muted" />
            {turn.human
              ? turn.moment === 'auction'
                ? 'Your bid is open above'
                : snap.busy
                  ? 'Playing…'
                  : 'Waiting…'
              : `${snap.presented.players[turn.actorSeat]?.name} is playing`}
            {snap.busy && (
              <button
                type="button"
                onClick={() => store.skip()}
                title="Skip animations (S)"
                className={`flex items-center gap-1 rounded-lg px-2 py-1 font-bold text-ink ${FX} enabled:hover:bg-white/10`}
              >
                <Icon name="skip" size={14} /> Skip
              </button>
            )}
          </div>
        )}

        {secondary.map((c) => (
          <DockButton key={c.label} onClick={c.run} hotkey={c.hotkey}>
            {c.label}
          </DockButton>
        ))}

        <DockButton
          onClick={onTrade ?? (() => {})}
          disabled={!onTrade}
          hotkey="T"
          title={onTrade ? 'Propose a trade (T)' : 'No one to trade with'}
        >
          <Icon name="trade" />
          Trade
        </DockButton>
      </nav>
      <div className="flex items-center gap-1.5 text-xs text-ink-muted">
        {turn.canAct ? (
          <>
            Build, mortgage or trade any time · Press <Kbd>?</Kbd> for help
          </>
        ) : (
          'You can manage your city while others play.'
        )}
      </div>
    </div>
  )
}

function DockButton({
  children,
  onClick,
  badge = 0,
  active = false,
  disabled = false,
  hotkey,
  title,
}: {
  children: ReactNode
  onClick: () => void
  badge?: number
  active?: boolean
  disabled?: boolean
  hotkey?: string | undefined
  title?: string | undefined
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active || undefined}
      className={`relative flex h-[58px] items-center gap-2.5 rounded-2xl border px-[18px] font-sans text-[15px] font-extrabold text-ink ${FX} disabled:pointer-events-none disabled:opacity-40 ${active ? 'border-accent bg-accent/10 enabled:hover:bg-accent/15' : 'border-line bg-transparent enabled:hover:bg-white/5'}`}
    >
      {children}
      {hotkey && <Kbd>{hotkey}</Kbd>}
      {badge > 0 && (
        // Keyed by the count, so the badge pops again whenever it changes.
        <span
          key={badge}
          aria-label={`${badge} ${badge === 1 ? 'set' : 'sets'} ready to build`}
          className="absolute -top-2 -right-1.5 flex h-[22px] min-w-[22px] animate-pop items-center justify-center rounded-full bg-accent px-1.5 text-xs font-extrabold text-accent-ink shadow-[0_0_0_3px_var(--color-panel)]"
        >
          {badge}
        </span>
      )}
    </button>
  )
}
