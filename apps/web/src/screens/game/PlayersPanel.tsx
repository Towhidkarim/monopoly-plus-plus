import { GROUP_COUNT, GROUPS, SPACES } from '@skyline/engine'
import { groupColors } from '@skyline/board'
import type { GameStore, Snapshot } from '../../game/store.ts'
import { cssHex } from '../../spaceInfo.ts'
import { Money } from './ui.tsx'

/** Everyone's cash, holdings, and status, from the presented state. */
export function PlayersPanel({ snap, store }: { snap: Snapshot; store: GameStore }) {
  const p = snap.presented
  return (
    <div className="flex flex-col gap-2">
      {p.players.map((pl, seat) => {
        const seatInfo = store.setup.seats[seat]!
        const active = p.current === seat && !p.over
        const owned = p.owner.flatMap((o, i) => (o === seat ? [i] : []))
        return (
          <div
            key={pl.id}
            className={`rounded-xl border px-3 py-2.5 transition-colors ${
              pl.bankrupt
                ? 'border-line opacity-40'
                : active
                  ? 'border-accent/60 bg-accent/5'
                  : 'border-line bg-white/[0.02]'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full" style={{ background: cssHex(seatInfo.color) }} />
              <span className="font-semibold text-ink">{pl.name}</span>
              {seatInfo.kind === 'bot' && (
                <span className="rounded bg-white/5 px-1.5 text-[10px] text-ink-muted">BOT</span>
              )}
              {snap.thinking === pl.id && (
                <span className="animate-pulse text-xs text-ink-muted">thinking…</span>
              )}
              <Money
                value={pl.cash}
                className={`ml-auto text-sm ${pl.cash < 100 ? 'text-alert' : 'text-ink'}`}
              />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {pl.inJail && (
                <span className="rounded bg-alert/15 px-1.5 text-[10px] font-medium text-alert">
                  IN LOCKUP
                </span>
              )}
              {pl.jailCards > 0 && (
                <span className="rounded bg-gold/15 px-1.5 text-[10px] text-gold">
                  FREE CARD ×{pl.jailCards}
                </span>
              )}
              {pl.bankrupt && <span className="text-[10px] font-medium text-alert">BANKRUPT</span>}
              <Holdings owned={owned} mortgaged={p.mortgaged} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** One chip per owned space, grouped by color; full sets get a ring. */
function Holdings({ owned, mortgaged }: { owned: number[]; mortgaged: boolean[] }) {
  if (owned.length === 0) return null
  const groups = Array.from({ length: GROUP_COUNT }, (_, g) => owned.filter((i) => SPACES[i]!.group === g))
  const others = owned.filter((i) => SPACES[i]!.group < 0)
  return (
    <div className="flex flex-wrap gap-1">
      {groups.map((spaces, g) =>
        spaces.length === 0 ? null : (
          <span
            key={g}
            className={`flex gap-px rounded-sm p-px ${spaces.length === GROUPS[g]!.length ? 'ring-1 ring-ink/70' : ''}`}
            title={spaces.map((i) => SPACES[i]!.name).join(', ')}
          >
            {spaces.map((i) => (
              <span
                key={i}
                className={`h-3 w-2 rounded-[2px] ${mortgaged[i] ? 'opacity-30' : ''}`}
                style={{ background: cssHex(groupColors[g]!) }}
              />
            ))}
          </span>
        ),
      )}
      {others.map((i) => (
        <span
          key={i}
          title={SPACES[i]!.name}
          className={`h-3 w-2 rounded-[2px] bg-ink-muted ${mortgaged[i] ? 'opacity-30' : ''}`}
        />
      ))}
    </div>
  )
}
