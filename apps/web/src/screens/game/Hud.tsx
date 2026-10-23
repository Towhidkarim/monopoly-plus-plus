import type { ReactNode } from 'react'
import { GROUP_COUNT, GROUPS, SPACES } from '@skyline/engine'
import type { GameStore, Snapshot } from '../../game/store.ts'
import { cssHex, groupColor } from '../../spaceInfo.ts'
import { Icon } from './icons.tsx'
import { TickingMoney } from './ui.tsx'

const PRESET_LABEL = { standard: 'Standard', turbo: 'Turbo', classic: 'Classic' } as const

/** Top bar: title and round, a card per player, and speed/help/menu. */
export function Hud({
  snap,
  store,
  speedLabel,
  onSpeed,
  onHelp,
  onMenu,
}: {
  snap: Snapshot
  store: GameStore
  speedLabel: string
  onSpeed: () => void
  onHelp: () => void
  onMenu: () => void
}) {
  const p = snap.presented
  const limit = snap.state.config.roundLimit
  const solo = store.setup.seats.filter((x) => x.kind === 'human').length === 1
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start gap-4 bg-gradient-to-b from-table via-table/80 to-transparent px-5 pt-4 pb-8">
      <div className="pointer-events-auto flex w-44 shrink-0 flex-col gap-1">
        <div className="text-2xl font-bold tracking-tight text-accent">Skyline</div>
        <div className="flex gap-1.5 text-xs text-ink-muted">
          <span className="rounded-full bg-panel-2 px-2 py-0.5">{PRESET_LABEL[store.setup.preset]}</span>
          <span className="rounded-full bg-panel-2 px-2 py-0.5 tabular-nums">
            Round {p.round}
            {limit > 0 && ` / ${limit}`}
          </span>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 justify-center gap-2.5">
        {p.players.map((pl, seat) => {
          const info = store.setup.seats[seat]!
          const color = cssHex(info.color)
          const active = p.current === seat && !p.over
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
                  : ''
          return (
            <div
              key={pl.id}
              data-seat-card={pl.id}
              className={`pointer-events-auto flex w-48 min-w-0 flex-col gap-1.5 rounded-2xl border px-3 py-2.5 transition-[background-color,box-shadow,opacity] duration-300 ${
                pl.bankrupt
                  ? 'border-line bg-panel opacity-40'
                  : active
                    ? 'bg-panel-2'
                    : 'border-line bg-panel'
              }`}
              style={
                active
                  ? { borderColor: color, boxShadow: `0 0 0 3px ${color}22, 0 8px 24px #0006` }
                  : undefined
              }
            >
              <div className="flex items-center gap-2">
                <span
                  className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-table"
                  style={{ background: color }}
                >
                  {pl.name.trim()[0]?.toUpperCase()}
                </span>
                <span className="truncate text-sm font-semibold">{pl.name}</span>
                {info.kind === 'bot' && (
                  <span className="rounded bg-white/5 px-1 text-[10px] font-semibold text-ink-muted">
                    BOT
                  </span>
                )}
                <TickingMoney
                  value={pl.cash}
                  className={`ml-auto text-[15px] font-bold ${pl.cash < 150 && !pl.bankrupt ? 'text-alert' : 'text-ink'}`}
                />
              </div>
              <div className="flex h-3 items-center gap-1">
                <Holdings seat={seat} owner={p.owner} mortgaged={p.mortgaged} />
                {pl.jailCards > 0 && (
                  <span className="text-[10px] font-bold text-gold" title="Get out of the Lockup free">
                    +{pl.jailCards} card
                  </span>
                )}
                <span
                  className={`ml-auto text-[10px] font-bold tracking-wider ${tag === 'THINKING' ? 'animate-pulse' : ''}`}
                  style={{ color: pl.bankrupt || pl.inJail ? 'var(--color-alert)' : color }}
                >
                  {tag}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="pointer-events-auto flex w-44 shrink-0 justify-end gap-1.5">
        <HudButton onClick={onSpeed} label="Game speed" title="Animation speed (click to change)">
          <span className="text-[13px] font-semibold">{speedLabel}</span>
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
}: {
  children: ReactNode
  onClick: () => void
  label: string
  title: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      onClick={onClick}
      className="flex h-10 min-w-10 items-center justify-center rounded-xl border border-line bg-panel px-2.5 text-ink transition hover:bg-panel-2 active:scale-95"
    >
      {children}
    </button>
  )
}

/** One chip per owned space, grouped by color; mortgaged ones are faded. */
function Holdings({ seat, owner, mortgaged }: { seat: number; owner: number[]; mortgaged: boolean[] }) {
  const owned = owner.flatMap((o, i) => (o === seat ? [i] : []))
  const groups = Array.from({ length: GROUP_COUNT }, (_, g) => owned.filter((i) => SPACES[i]!.group === g))
  const others = owned.filter((i) => SPACES[i]!.group < 0)
  return (
    <div className="flex min-w-0 gap-1 overflow-hidden">
      {groups.map((spaces, g) =>
        spaces.length === 0 ? null : (
          <span
            key={g}
            className={`flex gap-px rounded-[3px] ${spaces.length === GROUPS[g]!.length ? 'ring-1 ring-ink/70 ring-offset-1 ring-offset-panel' : ''}`}
            title={spaces.map((i) => SPACES[i]!.name).join(', ')}
          >
            {spaces.map((i) => (
              <span
                key={i}
                className={`h-3 w-2 rounded-[2px] ${mortgaged[i] ? 'opacity-30' : ''}`}
                style={{ background: groupColor(g) }}
              />
            ))}
          </span>
        ),
      )}
      {others.map((i) => (
        <span
          key={i}
          title={SPACES[i]!.name}
          className={`h-3 w-2 shrink-0 rounded-[2px] bg-ink-muted ${mortgaged[i] ? 'opacity-30' : ''}`}
        />
      ))}
    </div>
  )
}
