import { useRef, type ReactNode } from 'react'
import { SPACES } from '@skyline/engine'
import { cssHex } from '../../spaceInfo.ts'
import type { GameStore, Snapshot } from '../../game/store.ts'
import { Icon } from './icons.tsx'
import type { MoveOption } from './moveChoice.ts'
import type { TurnView } from './turn.ts'
import { Kbd, FX, FX_BRIGHT } from './ui.tsx'

/**
 * Bottom dock: one big primary action (Space), My city on the left, Trade on the right.
 * While a bot plays or animations run, the primary slot becomes a status with Skip.
 * Compact (phones, D64): a fixed-height bar in the thumb zone above the home bar; secondary
 * actions and the Speed die's choices float above it, outside the measured bar, so the board
 * does not move when they come and go.
 */
export function ActionDock({
  snap,
  store,
  turn,
  cityBadge,
  cityOpen,
  onCity,
  onTrade,
  hoverSpace = null,
  onHoverSpace,
  compact = false,
  tray,
}: {
  snap: Snapshot
  store: GameStore
  turn: TurnView
  /** Speed die move choice: the destination under the pointer (button or tile). */
  hoverSpace?: number | null
  onHoverSpace?: (space: number | null) => void
  cityBadge: number
  cityOpen: boolean
  onCity: () => void
  /** Opens the trade screen, or null when the viewer cannot trade. */
  onTrade: (() => void) | null
  compact?: boolean
  /** Phones: the dice tray, at the end of the floating row. */
  tray?: ReactNode
}) {
  // The primary button is replaced (new key) whenever the action changes, for example Roll to End
  // turn. If keyboard focus was on it, put focus on its successor instead of dropping it on <body>.
  const primaryHadFocus = useRef(false)
  const adoptFocus = (el: HTMLButtonElement | null) => {
    const lost = !document.activeElement || document.activeElement === document.body
    if (el && primaryHadFocus.current && lost) el.focus({ preventScroll: true })
  }
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
  const moves = turn.moves.map((m, i) => (
    <MoveButton
      key={m.space}
      move={m}
      hotkey={compact ? null : String(i + 1)}
      hot={hoverSpace === m.space}
      ownerColor={m.owner >= 0 ? cssHex(store.setup.seats[m.owner]!.color) : null}
      onHover={(on) => onHoverSpace?.(on ? m.space : null)}
      onClick={turn.secondary[i]!.run}
    />
  ))
  if (compact) {
    const extras = turn.moment === 'move' || secondary.length > 0
    return (
      <div data-inset="bottom" className="pointer-events-none absolute inset-x-0 bottom-0 px-safe pb-safe">
        <div className="relative mx-auto max-w-lg px-3 pb-3">
          {(extras || tray) && (
            // The floating row: secondary actions or the Speed die's choices, and the dice tray.
            <div className="pointer-events-none absolute inset-x-3 bottom-full mb-2 flex items-end gap-2">
              <div className="pointer-events-auto flex min-w-0 flex-1 flex-col gap-2">
                {!extras ? null : turn.moment === 'move' ? (
                  <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                    <legend className="sr-only">Where to go</legend>
                    {moves}
                  </fieldset>
                ) : (
                  <div className="flex gap-2">
                    {secondary.map((c) => (
                      <DockButton key={c.label} onClick={c.run} compact>
                        {c.label}
                      </DockButton>
                    ))}
                  </div>
                )}
              </div>
              {tray}
            </div>
          )}
          <nav
            aria-label="Actions"
            className="pointer-events-auto flex items-center gap-2 rounded-3xl border border-line bg-panel/95 p-2 shadow-panel-lg backdrop-blur"
          >
            <TileButton onClick={onCity} active={cityOpen} badge={cityBadge} icon="city" label="City" />
            {primary && turn.moment !== 'move' ? (
              <span key={primary.label} className="flex min-w-0 flex-1 animate-pop">
                <button
                  ref={adoptFocus}
                  type="button"
                  onFocus={() => (primaryHadFocus.current = true)}
                  onBlur={(e) => {
                    if (e.relatedTarget) primaryHadFocus.current = false
                  }}
                  onClick={primary.run}
                  className={`flex h-14 min-w-0 flex-1 items-center justify-center gap-2 rounded-[18px] bg-accent px-4 font-display text-lg font-bold text-accent-ink shadow-gold ${FX_BRIGHT} ${store.settings.reducedMotion ? '' : 'animate-breathe'}`}
                >
                  {primary.label.startsWith('Roll') && <Icon name="dice" size={22} />}
                  <span className="truncate">{primary.label}</span>
                </button>
              </span>
            ) : (
              <div className="flex h-14 min-w-0 flex-1 items-center justify-center gap-2 rounded-[18px] bg-panel-2 px-3 text-xs text-ink-muted">
                <span className="size-2 shrink-0 animate-pulse rounded-full bg-ink-muted" />
                <span className="truncate">
                  {turn.moment === 'move'
                    ? 'Pick where to go'
                    : snap.fastForward
                      ? 'Skipping to your turn…'
                      : turn.human
                        ? turn.moment === 'auction'
                          ? 'Your bid is open above'
                          : snap.busy
                            ? 'Playing…'
                            : 'Waiting…'
                        : `${snap.presented.players[turn.actorSeat]?.name} is playing`}
                </span>
                {!turn.human && !snap.fastForward && store.canFastForward ? (
                  <button
                    type="button"
                    onClick={() => store.skipToHuman()}
                    className={`flex h-11 shrink-0 items-center gap-1 rounded-xl px-2.5 font-bold text-ink ${FX} enabled:hover:bg-white/10`}
                  >
                    <Icon name="skip" size={14} /> My turn
                  </button>
                ) : (
                  snap.busy &&
                  !snap.fastForward && (
                    <button
                      type="button"
                      onClick={() => store.skip()}
                      className={`flex h-11 shrink-0 items-center gap-1 rounded-xl px-2.5 font-bold text-ink ${FX} enabled:hover:bg-white/10`}
                    >
                      <Icon name="skip" size={14} /> Skip
                    </button>
                  )
                )}
              </div>
            )}
            <TileButton
              onClick={onTrade ?? (() => {})}
              disabled={!onTrade}
              icon="trade"
              label="Trade"
              title={onTrade ? 'Propose a trade' : 'No one to trade with'}
            />
          </nav>
        </div>
      </div>
    )
  }
  return (
    <div
      data-inset="bottom"
      className="pointer-events-none absolute inset-x-0 bottom-6 flex flex-col items-center gap-2 px-4"
    >
      <nav
        aria-label="Actions"
        className="pointer-events-auto flex items-center gap-2.5 rounded-3xl border border-line bg-panel/95 p-2.5 shadow-panel-lg backdrop-blur"
      >
        <DockButton onClick={onCity} active={cityOpen} badge={cityBadge} hotkey="C">
          <Icon name="city" />
          My city
        </DockButton>

        {turn.moment === 'move' ? (
          <fieldset className="m-0 flex items-center gap-2 border-0 p-0">
            <legend className="sr-only">Where to go</legend>
            {moves}
          </fieldset>
        ) : primary ? (
          // The wrapper pops in on each new primary; the button inside breathes while it waits.
          <span key={primary.label} className="inline-flex animate-pop">
            <button
              ref={adoptFocus}
              type="button"
              onFocus={() => (primaryHadFocus.current = true)}
              onBlur={(e) => {
                // Moving focus elsewhere clears it; the button being removed (no target) keeps it.
                if (e.relatedTarget) primaryHadFocus.current = false
              }}
              onClick={primary.run}
              className={`flex h-[66px] items-center gap-3 rounded-[18px] bg-accent px-8.5 font-display text-xl font-bold text-accent-ink shadow-gold-lg ${FX_BRIGHT} ${store.settings.reducedMotion ? '' : 'animate-breathe'}`}
            >
              {primary.label.startsWith('Roll') && <Icon name="dice" size={24} />}
              {primary.label}
              {primary.hotkey && (
                <span className="rounded-md bg-card px-2 py-[3px] pointer-coarse:hidden font-sans text-[11px] font-extrabold text-card-ink shadow-keycap">
                  {primary.hotkey.length === 1 ? primary.hotkey.toUpperCase() : primary.hotkey}
                </span>
              )}
            </button>
          </span>
        ) : (
          <div className="flex h-[66px] min-w-64 items-center justify-center gap-3 rounded-[18px] bg-panel-2 px-6 text-sm text-ink-muted">
            <span className="size-2 animate-pulse rounded-full bg-ink-muted" />
            {snap.fastForward
              ? 'Skipping to your turn…'
              : turn.human
                ? turn.moment === 'auction'
                  ? 'Your bid is open above'
                  : snap.busy
                    ? 'Playing…'
                    : 'Waiting…'
                : `${snap.presented.players[turn.actorSeat]?.name} is playing`}
            {!turn.human && !snap.fastForward && store.canFastForward ? (
              <button
                type="button"
                onClick={() => store.skipToHuman()}
                title="Skip the bots' turns until you have to act (F)"
                className={`flex items-center gap-1.5 rounded-lg px-2 py-1 font-bold text-ink ${FX} enabled:hover:bg-white/10`}
              >
                <Icon name="skip" size={14} /> To my turn
                <span className="rounded-md bg-card px-1.5 py-px font-sans text-[10px] font-extrabold text-card-ink shadow-keycap">
                  F
                </span>
              </button>
            ) : (
              snap.busy &&
              !snap.fastForward && (
                <button
                  type="button"
                  onClick={() => store.skip()}
                  title="Skip animations (S)"
                  className={`flex items-center gap-1 rounded-lg px-2 py-1 font-bold text-ink ${FX} enabled:hover:bg-white/10`}
                >
                  <Icon name="skip" size={14} /> Skip
                </button>
              )
            )}
          </div>
        )}

        {turn.moment !== 'move' &&
          secondary.map((c) => (
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

const TONE: Record<MoveOption['tone'], string> = {
  rent: 'text-alert',
  buy: 'text-teal',
  bad: 'text-alert',
  plain: 'text-ink-muted',
}

/** One Speed die destination: the steps, the space, and what landing there means. */
function MoveButton({
  move,
  hotkey,
  hot,
  ownerColor,
  onHover,
  onClick,
}: {
  move: MoveOption
  /** Null on phones (no keyboard). */
  hotkey: string | null
  hot: boolean
  ownerColor: string | null
  onHover: (on: boolean) => void
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      className={`flex h-[66px] min-w-36 items-center gap-3 rounded-[18px] border px-4 text-left ${FX} ${hot ? '-translate-y-0.5 border-accent bg-accent/15' : 'border-line bg-panel-2 enabled:hover:bg-white/5'}`}
    >
      <span className="font-display text-[28px] leading-none font-bold text-accent tabular-nums">
        {move.steps}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="max-w-40 truncate text-sm font-extrabold text-ink">{SPACES[move.space]!.name}</span>
        <span className={`flex items-center gap-1.5 text-xs font-bold ${TONE[move.tone]}`}>
          {ownerColor && <span className="size-2 rounded-full" style={{ background: ownerColor }} />}
          {move.tag}
        </span>
      </span>
      {hotkey && <Kbd>{hotkey}</Kbd>}
    </button>
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
  compact = false,
}: {
  children: ReactNode
  onClick: () => void
  badge?: number
  active?: boolean
  disabled?: boolean
  hotkey?: string | undefined
  title?: string | undefined
  /** Phone: a floating button that shares the row with its siblings, no keycap. */
  compact?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active || undefined}
      className={`relative flex items-center gap-2.5 rounded-2xl border font-sans font-extrabold text-ink ${FX} disabled:pointer-events-none disabled:opacity-40 ${compact ? 'h-12 min-w-0 flex-1 justify-center bg-panel/95 px-3 text-sm shadow-panel backdrop-blur' : 'h-[58px] px-[18px] text-[15px]'} ${active ? 'border-accent bg-accent/10 enabled:hover:bg-accent/15' : `border-line ${compact ? '' : 'bg-transparent'} enabled:hover:bg-white/5`}`}
    >
      {children}
      {hotkey && !compact && <Kbd>{hotkey}</Kbd>}
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

/** Phone dock side button: an icon over a short label, a 56 px square. */
function TileButton({
  onClick,
  icon,
  label,
  badge = 0,
  active = false,
  disabled = false,
  title,
}: {
  onClick: () => void
  icon: 'city' | 'trade'
  label: string
  badge?: number
  active?: boolean
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active || undefined}
      className={`relative flex size-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border text-[11px] font-extrabold text-ink ${FX} disabled:pointer-events-none disabled:opacity-40 ${active ? 'border-accent bg-accent/10' : 'border-line enabled:hover:bg-white/5'}`}
    >
      <Icon name={icon} size={20} />
      {label}
      {badge > 0 && (
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
