import { useSyncExternalStore, type ReactNode } from 'react'
import { GROUP_COUNT, GROUPS, SPACES, isOwnable, validate } from '@skyline/engine'
import { sound } from '../../audio/engine.ts'
import type { GameStore, Snapshot } from '../../game/store.ts'
import { cssHex, groupColor, groupName } from '../../spaceInfo.ts'
import { fmtMoney } from './format.ts'
import { Icon } from './icons.tsx'
import { TickingMoney, TokenAvatar, FX } from './ui.tsx'

const PRESET_LABEL = { standard: 'Standard', turbo: 'Turbo', classic: 'Classic' } as const

/** Stations and utilities: the "other" bar after the eight color sets. */
const OTHER_SPACES = SPACES.flatMap((s, i) => (s.group < 0 && isOwnable(i) ? [i] : []))

/** Cash below this reads as a warning (rose cash, "Low cash" tag). */
const LOW_CASH = 150

/** Top bar: wordmark and round, a chip per player, and speed/sound/help/menu. */
export function Hud({
  snap,
  store,
  speedLabel,
  onSpeed,
  onHelp,
  onMenu,
  barks = {},
}: {
  snap: Snapshot
  store: GameStore
  speedLabel: string
  onSpeed: () => void
  onHelp: () => void
  onMenu: () => void
  /** Bot lines showing now, by player id (`key` restarts the pop for a new line). */
  barks?: Readonly<Record<string, { text: string; key: number }>>
}) {
  const p = snap.presented
  const limit = snap.state.config.roundLimit
  const solo = store.setup.seats.filter((x) => x.kind === 'human').length === 1
  const { muted } = useSyncExternalStore(sound.subscribe, sound.getSettings)
  return (
    <div
      data-inset="top"
      className="pointer-events-none absolute inset-x-0 top-0 flex items-start gap-4 bg-linear-to-b from-table via-table/80 to-transparent px-5 pt-4 pb-8"
    >
      <div className="pointer-events-auto flex shrink-0 flex-col gap-2 min-[1100px]:w-50">
        <div className="flex items-center gap-2 font-display text-2xl font-bold">
          <Logo />
          <span className="max-[1100px]:hidden">Skyline</span>
          <span className="rounded-full border border-line bg-panel px-2 py-0.5 font-sans text-xs font-bold tabular-nums min-[1100px]:hidden">
            R{p.round}
            {limit > 0 && <span className="text-ink-muted">/{limit}</span>}
          </span>
        </div>
        <div className="flex gap-1.5 max-[1100px]:hidden">
          <span className="rounded-full border border-line bg-panel px-2.5 py-0.5 text-xs font-bold">
            {PRESET_LABEL[store.setup.preset]}
          </span>
          <span className="rounded-full border border-line bg-panel px-2.5 py-0.5 text-xs font-bold tabular-nums">
            Round {p.round}
            {limit > 0 && <span className="text-ink-muted"> / {limit}</span>}
          </span>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 justify-center gap-2.5">
        {p.players.map((pl, seat) => {
          const info = store.setup.seats[seat]!
          const color = cssHex(info.color)
          const { active, low, tag, botTag, tagInk, label } = seatStatus(snap, store, seat, solo)
          return (
            <div
              key={pl.id}
              data-seat-card={pl.id}
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a fieldset would bring form semantics and layout quirks
              role="group"
              aria-label={label}
              className={`pointer-events-auto relative flex w-60 min-w-0 shrink flex-col gap-1.5 rounded-2xl border-[1.5px] px-3 py-2.5 transition-[background-color,box-shadow,opacity,translate] duration-300 ease-spring ${
                pl.bankrupt
                  ? 'border-line bg-panel opacity-40'
                  : active
                    ? '-translate-y-0.5 border-accent bg-panel-2'
                    : `bg-panel ${low ? 'border-alert/45' : 'border-line'}`
              }`}
              style={{
                boxShadow: active
                  ? 'inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 4px rgba(245,181,74,0.14), 0 10px 24px rgba(2,6,16,0.5)'
                  : 'inset 0 1px 0 rgba(255,255,255,0.06)',
              }}
            >
              <div className="@container min-w-0">
                <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2.5 @max-[150px]:grid-cols-[auto_1fr]">
                  <span className="@max-[150px]:row-span-2">
                    <TokenAvatar
                      color={color}
                      piece={info.piece}
                      halo={active ? 'rgba(245,181,74,0.6)' : 'rgba(255,255,255,0.1)'}
                    />
                  </span>
                  <span
                    className="flex min-w-0 flex-col @max-[150px]:col-start-2 @max-[150px]:row-start-1"
                    title={`${pl.name}${tag || botTag ? `, ${(tag || botTag).toLowerCase()}` : ''}${pl.jailCards > 0 ? `, ${pl.jailCards} Lockup ${pl.jailCards === 1 ? 'card' : 'cards'}` : ''}`}
                  >
                    <span className="truncate font-display text-sm leading-tight font-bold">{pl.name}</span>
                    {/* A status wins the slot; otherwise a bot shows its personality. A chip too narrow for the
                        whole line drops it (the container query) rather than cutting words short. */}
                    <span
                      className={`flex min-w-0 gap-1.5 text-[9px] leading-tight font-extrabold tracking-widest whitespace-nowrap uppercase @max-[215px]:sr-only ${tag === 'THINKING' ? 'animate-pulse' : ''}`}
                      style={{ color: tagInk || (tag === 'THINKING' ? '#f5b54a' : 'var(--color-ink-muted)') }}
                      title={
                        info.kind === 'bot'
                          ? `Bot with the ${store.botName(seat) ?? 'Balanced'} personality`
                          : undefined
                      }
                    >
                      <span className="truncate">{tag || botTag || ' '}</span>
                      {pl.jailCards > 0 && (
                        <span className="shrink-0 text-gold" title="Get out of the Lockup free">
                          +{pl.jailCards} card
                        </span>
                      )}
                    </span>
                  </span>
                  <TickingMoney
                    value={pl.cash}
                    className={`shrink-0 font-display text-[17px] font-bold whitespace-nowrap @max-[215px]:text-[15px] @max-[150px]:col-start-2 @max-[150px]:row-start-2 @max-[150px]:leading-none ${low ? 'text-alert' : 'text-gold'}`}
                  />
                </div>
              </div>
              <SetBars seat={seat} owner={p.owner} mortgaged={p.mortgaged} />
              {pl.loan > 0 && !pl.bankrupt && (
                <LoanBar loan={pl.loan} total={pl.loanTotal} onRepay={repayOf(snap, store, seat)} />
              )}
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-4 -bottom-px h-[3px] rounded-[3px] bg-accent shadow-[0_0_12px_rgba(245,181,74,0.7)]"
                />
              )}
              {barks[pl.id] && (
                // A bot's line, popping out under its card (decoration: the log says what happened).
                <span
                  key={barks[pl.id]!.key}
                  aria-hidden="true"
                  className="pointer-events-none absolute top-full left-1/2 z-10 mt-2.5 -translate-x-1/2 origin-top animate-pop rounded-[14px] bg-card px-3 py-1.5 font-card-body text-[13px] font-semibold whitespace-nowrap text-card-ink shadow-[0_8px_18px_rgba(2,6,16,0.45)]"
                >
                  <span className="absolute -top-1.5 left-1/2 size-3 -translate-x-1/2 rotate-45 rounded-[2px] bg-card" />
                  <span className="relative">{barks[pl.id]!.text}</span>
                </span>
              )}
            </div>
          )
        })}
      </div>

      <div className="pointer-events-auto flex shrink-0 justify-end gap-2 max-[1100px]:gap-1.5 min-[1100px]:w-50">
        <HudButton onClick={onSpeed} label="Game speed" title="Animation speed (click to change)">
          <span className="font-display text-[13px] font-bold">{speedLabel}</span>
        </HudButton>
        <HudButton
          onClick={() => sound.setSettings({ muted: !muted })}
          label={muted ? 'Sound off' : 'Sound on'}
          title={muted ? 'Sound is off (M)' : 'Sound is on (M)'}
        >
          <Icon name={muted ? 'muted' : 'sound'} size={18} />
        </HudButton>
        <HudButton onClick={onHelp} label="Help and rules" title="Help (?)">
          <Icon name="help" size={18} />
        </HudButton>
        <HudButton onClick={onMenu} label="Menu" title="Menu">
          <Icon name="menu" size={18} />
        </HudButton>
      </div>
    </div>
  )
}

function HudButton({
  children,
  onClick,
  label,
  title,
  touch = false,
}: {
  children: ReactNode
  onClick: () => void
  label: string
  title: string
  /** Phone: always a 44 px touch target. */
  touch?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      onClick={onClick}
      className={`flex size-11 ${touch ? '' : 'max-[1100px]:size-9'} items-center justify-center rounded-[14px] border border-line bg-panel text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] ${FX} enabled:hover:bg-panel-2 enabled:hover:text-gold`}
    >
      {children}
    </button>
  )
}

function Logo() {
  return (
    <svg width="26" height="22" viewBox="0 0 26 22" aria-hidden="true">
      <path
        d="M1 21 V13 H6 V21 M8 21 V5 H14 V21 M16 21 V9 H21 V21 M23 21 V15 H25"
        fill="none"
        stroke="#f5b54a"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="11" cy="9" r="1" fill="#ffcf70" />
      <circle cx="11" cy="13" r="1" fill="#ffcf70" />
      <circle cx="18.5" cy="13" r="1" fill="#ffcf70" />
    </svg>
  )
}

/** What a player card says about a seat: its status tag, its colors, and the screen reader line. */
function seatStatus(snap: Snapshot, store: GameStore, seat: number, solo: boolean) {
  const p = snap.presented
  const pl = p.players[seat]!
  const info = store.setup.seats[seat]!
  const active = p.current === seat && !p.over
  const low = !pl.bankrupt && pl.cash < LOW_CASH
  const tag = pl.bankrupt
    ? 'BANKRUPT'
    : snap.thinking === pl.id
      ? 'THINKING'
      : active
        ? solo && info.kind === 'human'
          ? 'YOUR TURN'
          : 'PLAYING'
        : pl.inJail
          ? 'IN LOCKUP'
          : low
            ? 'LOW CASH'
            : ''
  const botTag = info.kind === 'bot' ? `${store.botName(seat) ?? ''} BOT`.trim() : ''
  const tagInk = pl.bankrupt || pl.inJail || (low && !active) ? '#fda4af' : active ? '#f5b54a' : ''
  const label = [
    pl.name,
    info.kind === 'bot' ? `${store.botName(seat) ?? ''} bot`.trim() : null,
    `${fmtMoney(pl.cash)} cash`,
    tag ? tag.toLowerCase() : null,
    pl.jailCards > 0 ? `${pl.jailCards} Lockup ${pl.jailCards === 1 ? 'card' : 'cards'}` : null,
    pl.loan > 0 ? `${fmtMoney(pl.loan)} loan to repay` : null,
  ]
    .filter(Boolean)
    .join(', ')
  return { active, low, tag, botTag, tagInk, label }
}

/** Pays off a seat's whole loan, or null when that is not allowed now. */
function repayOf(snap: Snapshot, store: GameStore, seat: number): (() => void) | null {
  const pl = snap.presented.players[seat]!
  // Only a full payoff: a partial one would empty the wallet in one click.
  return store.canAct(pl.id) &&
    !snap.busy &&
    pl.cash >= pl.loan &&
    validate(snap.state, pl.id, { type: 'REPAY_LOAN' }) === null
    ? () => store.run(pl.id, [{ type: 'REPAY_LOAN' }])
    : null
}

/**
 * The phone top bar (D64): round, sound, help and menu, then one chip per player (avatar, name,
 * cash, set bars). Held sideways it is a single row. The turn banner hangs under it, outside the
 * measured bar, so the board does not move each time the banner comes and goes.
 */
export function CompactHud({
  snap,
  store,
  landscape,
  onHelp,
  onMenu,
  barks = {},
  banner,
}: {
  snap: Snapshot
  store: GameStore
  landscape: boolean
  onHelp: () => void
  onMenu: () => void
  barks?: Readonly<Record<string, { text: string; key: number }>>
  banner?: ReactNode
}) {
  const p = snap.presented
  const limit = snap.state.config.roundLimit
  const solo = store.setup.seats.filter((x) => x.kind === 'human').length === 1
  const { muted } = useSyncExternalStore(sound.subscribe, sound.getSettings)
  // Chips per row: edge chips anchor bot lines to the screen side.
  const cols = landscape ? p.players.length : p.players.length > 4 ? 3 : p.players.length
  const round = (
    <span className="flex h-11 shrink-0 items-center rounded-full border border-line bg-panel px-3 text-xs font-bold tabular-nums">
      R{p.round}
      {limit > 0 && <span className="text-ink-muted">/{limit}</span>}
    </span>
  )
  const buttons = (
    <div className="pointer-events-auto flex shrink-0 gap-1.5">
      <HudButton
        touch
        onClick={() => sound.setSettings({ muted: !muted })}
        label={muted ? 'Sound off' : 'Sound on'}
        title={muted ? 'Sound is off' : 'Sound is on'}
      >
        <Icon name={muted ? 'muted' : 'sound'} size={18} />
      </HudButton>
      <HudButton touch onClick={onHelp} label="Help and rules" title="Help">
        <Icon name="help" size={18} />
      </HudButton>
      <HudButton touch onClick={onMenu} label="Menu" title="Menu">
        <Icon name="menu" size={18} />
      </HudButton>
    </div>
  )
  const chips = (
    // Portrait: one row up to four players, then two rows of three, so a chip keeps room for its cash.
    <div
      className={landscape ? 'flex min-w-0 flex-1 gap-1.5' : 'grid basis-full gap-1.5'}
      style={landscape ? undefined : { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {p.players.map((pl, seat) => {
        const info = store.setup.seats[seat]!
        const color = cssHex(info.color)
        const { active, low, tag, label } = seatStatus(snap, store, seat, solo)
        const bark = barks[pl.id]
        return (
          <div
            key={pl.id}
            data-seat-card={pl.id}
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a fieldset would bring form semantics and layout quirks
            role="group"
            aria-label={label}
            className={`pointer-events-auto relative flex min-w-0 flex-col gap-1 rounded-xl ${landscape ? 'max-w-48 flex-1' : ''} border-[1.5px] px-2 py-1.5 transition-[background-color,box-shadow,opacity] duration-300 ease-spring ${
              pl.bankrupt
                ? 'border-line bg-panel opacity-40'
                : active
                  ? 'border-accent bg-panel-2'
                  : `bg-panel ${low ? 'border-alert/45' : 'border-line'}`
            }`}
            style={{
              boxShadow: active
                ? 'inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 3px rgba(245,181,74,0.14)'
                : 'inset 0 1px 0 rgba(255,255,255,0.06)',
            }}
          >
            <div className="@container flex min-w-0 items-center gap-1.5">
              <TokenAvatar
                color={color}
                piece={info.piece}
                size={24}
                halo={active ? 'rgba(245,181,74,0.6)' : 'rgba(255,255,255,0.1)'}
                className={tag === 'THINKING' ? 'animate-pulse' : ''}
              />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[11px] leading-tight font-bold @max-[64px]:sr-only">
                  {pl.name}
                </span>
                <TickingMoney
                  value={pl.cash}
                  className={`font-display text-[13px] leading-tight font-bold whitespace-nowrap ${low ? 'text-alert' : 'text-gold'}`}
                />
              </span>
            </div>
            <SetBars seat={seat} owner={p.owner} mortgaged={p.mortgaged} />
            {pl.loan > 0 && !pl.bankrupt && (
              <LoanBar loan={pl.loan} total={pl.loanTotal} onRepay={null} compact />
            )}
            {active && (
              <span
                aria-hidden="true"
                className="absolute inset-x-3 -bottom-px h-[3px] rounded-[3px] bg-accent shadow-[0_0_12px_rgba(245,181,74,0.7)]"
              />
            )}
            {bark && (
              // Edge chips anchor their line to the screen side so it never runs off the screen.
              <span
                key={bark.key}
                aria-hidden="true"
                className={`pointer-events-none absolute top-full z-10 mt-2 w-max max-w-[60vw] animate-pop rounded-[14px] bg-card px-3 py-1.5 font-card-body text-[13px] font-semibold text-card-ink shadow-[0_8px_18px_rgba(2,6,16,0.45)] ${
                  seat % cols === 0
                    ? 'left-0 origin-top-left'
                    : seat % cols === cols - 1
                      ? 'right-0 origin-top-right'
                      : 'left-1/2 -translate-x-1/2 origin-top'
                }`}
              >
                {bark.text}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 px-safe pt-safe">
      <div
        data-inset="top"
        className={`flex gap-2 bg-linear-to-b from-table via-table/90 to-transparent px-3 pt-2 pb-3 ${landscape ? 'items-start' : 'flex-wrap items-center'}`}
      >
        {landscape ? (
          <>
            <span className="pointer-events-auto flex items-center gap-2">
              <Logo />
              {round}
            </span>
            {chips}
            {buttons}
          </>
        ) : (
          <>
            <span className="pointer-events-auto flex flex-1 items-center gap-2">
              <Logo />
              {round}
            </span>
            {buttons}
            {chips}
          </>
        )}
      </div>
      <div className="relative">{banner}</div>
    </div>
  )
}

/**
 * Ownership as thin bars, one per color set (then one for stations and utilities): full when the
 * set is complete, half when partly owned, faint when none. Mortgaged holdings dim the bar.
 */
function SetBars({ seat, owner, mortgaged }: { seat: number; owner: number[]; mortgaged: boolean[] }) {
  const bar = (spaces: readonly number[], color: string, name: string) => {
    const mine = spaces.filter((i) => owner[i] === seat)
    const full = mine.length === spaces.length
    const mort = mine.filter((i) => mortgaged[i]).length
    const opacity = mine.length === 0 ? 0.14 : (full ? 1 : 0.5) * (mort > 0 ? 0.6 : 1)
    return (
      <span
        key={name}
        className="h-[5px] flex-1 rounded-[3px] transition-opacity duration-300"
        style={{ background: color, opacity }}
        title={
          mine.length === 0
            ? undefined
            : `${name}: ${mine.map((i) => SPACES[i]!.name + (mortgaged[i] ? ' (mortgaged)' : '')).join(', ')}`
        }
      />
    )
  }
  return (
    <div className="flex gap-[3px]">
      {Array.from({ length: GROUP_COUNT }, (_, g) => bar(GROUPS[g]!, groupColor(g), groupName(g)))}
      {bar(OTHER_SPACES, '#94a3b8', 'Stations and utilities')}
    </div>
  )
}

/**
 * Second Wind (D63): what is left of the loan, a gold bar that drains as income repays it, and
 * on the player's own card a button to pay it off once their cash covers it.
 */
function LoanBar({
  loan,
  total,
  onRepay,
  compact = false,
}: {
  loan: number
  total: number
  onRepay: (() => void) | null
  /** Phone chip: the draining bar alone (paying off lives in the player sheet). */
  compact?: boolean
}) {
  const left = total > 0 ? Math.min(1, loan / total) : 1
  if (compact)
    return (
      <span className="relative block h-1 overflow-hidden rounded-full bg-white/8">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-[repeating-linear-gradient(135deg,#f5b54a_0_5px,#d9952c_5px_10px)] transition-[width] duration-500 ease-spring"
          style={{ width: `${left * 100}%` }}
        />
      </span>
    )
  return (
    <div className="flex items-center gap-2" title="Second Wind loan: half of every income goes to it">
      <span className="text-[9px] font-extrabold tracking-widest text-gold uppercase">Loan</span>
      <span className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/8">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-[repeating-linear-gradient(135deg,#f5b54a_0_5px,#d9952c_5px_10px)] transition-[width] duration-500 ease-spring"
          style={{ width: `${left * 100}%` }}
        />
      </span>
      <span className="text-[11px] font-bold text-gold tabular-nums">{fmtMoney(loan)}</span>
      {onRepay && (
        <button
          type="button"
          onClick={() => {
            sound.play('ui.click')
            onRepay()
          }}
          title={`Pay off the whole loan now (${fmtMoney(loan)})`}
          className={`rounded-md border border-gold/50 px-1.5 py-px text-[10px] font-extrabold text-gold ${FX} enabled:hover:bg-gold/15`}
        >
          Pay off
        </button>
      )}
    </div>
  )
}
