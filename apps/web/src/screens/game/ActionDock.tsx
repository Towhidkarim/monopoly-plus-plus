import type { ReactNode } from 'react'
import type { GameStore, Snapshot } from '../../game/store.ts'
import { Icon } from './icons.tsx'
import type { TurnView } from './turn.ts'
import { Kbd } from './ui.tsx'

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
}: {
  snap: Snapshot
  store: GameStore
  turn: TurnView
  cityBadge: number
  cityOpen: boolean
  onCity: () => void
}) {
  // Buy, debt and a waiting card carry their own buttons.
  if (snap.presented.over || turn.moment === 'buy' || turn.moment === 'debt' || snap.card?.waiting)
    return null
  const { primary, secondary } = turn
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 flex flex-col items-center gap-2.5 px-4">
      <div className="pointer-events-auto flex items-center gap-3 rounded-[22px] border border-line bg-panel/95 p-3 shadow-2xl shadow-black/50 backdrop-blur">
        <DockButton onClick={onCity} active={cityOpen} badge={cityBadge} hotkey="C">
          <Icon name="city" />
          My city
        </DockButton>

        {primary ? (
          <button
            key={primary.label}
            type="button"
            onClick={primary.run}
            className="flex h-16 animate-pop items-center gap-3 rounded-2xl bg-accent px-10 text-lg font-bold text-table shadow-lg shadow-accent/35 transition hover:brightness-110 active:scale-95"
          >
            {primary.label.startsWith('Roll') && <Icon name="dice" size={24} />}
            {primary.label}
            {primary.hotkey && <Kbd onAccent>{primary.hotkey.toUpperCase()}</Kbd>}
          </button>
        ) : (
          <div className="flex h-16 min-w-64 items-center justify-center gap-3 rounded-2xl bg-panel-2 px-6 text-sm text-ink-muted">
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
                className="flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-ink hover:bg-white/10"
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

        <DockButton onClick={() => {}} disabled title="Trading arrives with the trade screen (Milestone 8)">
          <Icon name="trade" />
          Trade
        </DockButton>
      </div>
      <div className="text-xs text-ink-muted">
        {turn.canAct
          ? 'Build, mortgage or trade any time. Press ? for help.'
          : 'You can manage your city while others play.'}
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
      className={`relative flex h-14 items-center gap-2.5 rounded-2xl border px-4 text-[15px] font-semibold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${active ? 'border-accent/60 bg-accent/10 text-ink' : 'border-line bg-panel-2 text-ink hover:bg-white/10'}`}
    >
      {children}
      {hotkey && <Kbd>{hotkey}</Kbd>}
      {badge > 0 && (
        <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 animate-pop items-center justify-center rounded-full bg-gold px-1.5 text-[11px] font-bold text-table">
          {badge}
        </span>
      )}
    </button>
  )
}
