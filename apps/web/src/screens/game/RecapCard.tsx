import { SPACES } from '@skyline/engine'
import type { GameStore } from '../../game/store.ts'
import type { PlayerRecap, Recap } from '../../game/recap.ts'
import { cssHex, groupColor, groupName, spaceInfo } from '../../spaceInfo.ts'
import { fmtMoney } from './format.ts'
import { Icon, PieceIcon } from './icons.tsx'
import { Eyebrow, Panel } from './ui.tsx'

/**
 * "While you waited": what the others did since your last turn, one row each, tagged bot or
 * player. Sits in the left column, never takes focus, and goes away when you roll or close it.
 */
export function RecapCard({
  recap,
  store,
  onClose,
}: {
  recap: Recap
  store: GameStore
  onClose: () => void
}) {
  return (
    <Panel className="pointer-events-auto relative flex animate-rise flex-col gap-2.5 px-4 pt-3.5 pb-3">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close the summary"
        className="absolute top-2.5 right-2.5 flex size-7 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-white/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
      >
        <Icon name="close" size={14} />
      </button>
      <Eyebrow className="text-accent">While you waited</Eyebrow>
      {(recap.earned > 0 || recap.paid > 0) && (
        <p className="text-sm font-semibold">
          {recap.earned > 0 && (
            <span className="text-teal">You collected {fmtMoney(recap.earned)} in rent. </span>
          )}
          {recap.paid > 0 && <span className="text-alert">You paid {fmtMoney(recap.paid)} in rent.</span>}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {recap.players.map((r) => (
          <Row key={r.id} r={r} store={store} />
        ))}
      </ul>
    </Panel>
  )
}

function Row({ r, store }: { r: PlayerRecap; store: GameStore }) {
  const seat = store.setup.seats.findIndex((x) => x.id === r.id)
  const info = store.setup.seats[seat]!
  const bot = info.kind === 'bot'
  const notes = notesFor(r)
  return (
    <li className="flex gap-2.5 rounded-xl bg-white/[0.03] px-2.5 py-2">
      <span
        className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full"
        style={{ background: cssHex(info.color) }}
      >
        <PieceIcon piece={info.piece} size={15} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-bold">{info.name}</span>
          <span
            className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-extrabold tracking-[0.08em] uppercase ${bot ? 'bg-white/8 text-ink-muted' : 'bg-accent/15 text-accent'}`}
          >
            {bot ? 'Bot' : 'Player'}
          </span>
          {r.cash !== 0 && (
            <span
              className={`ml-auto shrink-0 font-display text-sm font-bold ${r.cash > 0 ? 'text-teal' : 'text-alert'}`}
            >
              {r.cash > 0 ? '+' : '−'}
              {fmtMoney(Math.abs(r.cash))}
            </span>
          )}
        </div>
        {notes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {notes.map((n) => (
              <span
                key={n.text}
                className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${TONE[n.tone]}`}
              >
                {n.dot && <span className="size-2 rounded-full" style={{ background: n.dot }} />}
                {n.text}
              </span>
            ))}
          </div>
        )}
      </div>
    </li>
  )
}

const TONE = {
  muted: 'bg-white/5 text-ink-muted',
  normal: 'bg-white/8 text-ink',
  gold: 'bg-accent/15 text-accent',
  bad: 'bg-alert/12 text-alert',
} as const

interface Note {
  text: string
  tone: keyof typeof TONE
  dot?: string | null
}

/** The most telling things first: losing, completing a set, buying, building, trading, moving. */
function notesFor(r: PlayerRecap): Note[] {
  const out: Note[] = []
  if (r.bankrupt) out.push({ text: 'Went bankrupt', tone: 'bad' })
  for (const g of r.sets) out.push({ text: `Completed ${groupName(g)}`, tone: 'gold', dot: groupColor(g) })
  for (const s of r.bought.slice(0, 2))
    out.push({ text: `Bought ${SPACES[s]!.name}`, tone: 'normal', dot: spaceInfo(s).color })
  if (r.bought.length > 2) out.push({ text: `+${r.bought.length - 2} more`, tone: 'normal' })
  if (r.built > 0)
    out.push({ text: `Built ${r.built} ${r.built === 1 ? 'house' : 'houses'}`, tone: 'normal' })
  if (r.trades > 0)
    out.push({ text: r.trades === 1 ? 'Made a trade' : `Made ${r.trades} trades`, tone: 'normal' })
  if (r.jailed && !r.bankrupt) out.push({ text: 'Sent to the Lockup', tone: 'muted' })
  else if (r.landed !== null && !r.bankrupt && r.bought.at(-1) !== r.landed)
    out.push({ text: `On ${SPACES[r.landed]!.name}`, tone: 'muted' })
  return out
}
