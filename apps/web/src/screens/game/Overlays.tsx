import { useState, useSyncExternalStore, type ReactNode } from 'react'
import { CHANCE_CARDS, CHEST_CARDS, netWorth } from '@skyline/engine'
import type { GameStore, Snapshot } from '../../game/store.ts'
import { sound } from '../../audio/engine.ts'
import { usePanelSound } from '../../audio/usePanelSound.ts'
import { cssHex } from '../../spaceInfo.ts'
import { Icon } from './icons.tsx'
import { SPEEDS, type SpeedChoice } from './format.ts'
import { Btn, Eyebrow, Kbd, Money, Panel } from './ui.tsx'

/** The drawn card. A human's card waits for Continue; a bot's closes by itself. */
export function CardPopup({ snap, store }: { snap: Snapshot; store: GameStore }) {
  const c = snap.card
  if (!c) return null
  const card = (c.deck === 'chance' ? CHANCE_CARDS : CHEST_CARDS)[c.cardId]
  const chance = c.deck === 'chance'
  return (
    <div
      className={`absolute inset-x-0 top-24 bottom-0 flex items-start justify-center px-4 pt-20 ${c.waiting ? 'pointer-events-auto bg-table/55' : 'pointer-events-none'}`}
    >
      <div className="flex animate-pop flex-col items-center gap-5">
        <div className="relative h-100 w-80">
          <div
            className={`absolute inset-0 translate-x-4 translate-y-2.5 rotate-6 rounded-[26px] opacity-55 ${chance ? 'bg-indigo-600' : 'bg-teal-600'}`}
          />
          <div className="absolute inset-0 flex -rotate-2 flex-col overflow-hidden rounded-[26px] bg-slate-50 text-table shadow-2xl shadow-black/60">
            <div
              className={`flex items-center gap-2.5 px-6 py-4 text-slate-50 ${chance ? 'bg-indigo' : 'bg-teal-600'}`}
            >
              <Icon name={chance ? 'chance' : 'fund'} />
              <span className="text-sm font-bold tracking-[0.14em] uppercase">
                {chance ? 'Opportunity' : 'City Fund'}
              </span>
            </div>
            <div className="flex flex-1 items-center justify-center px-7 text-center text-[26px] leading-snug font-bold">
              {card?.text}
            </div>
            <div className="border-t border-slate-200 px-6 py-3 text-[13px] text-slate-500">
              Drawn by {store.nameOf(c.playerId)}
            </div>
          </div>
        </div>
        {c.waiting ? (
          <button
            type="button"
            onClick={() => store.ackCard()}
            className="flex h-14 items-center gap-3 rounded-2xl bg-accent px-11 text-[17px] font-bold text-table shadow-lg shadow-accent/35 transition hover:brightness-110 active:scale-95"
          >
            Continue <Kbd onAccent>SPACE</Kbd>
          </button>
        ) : (
          <div className="text-xs text-ink-muted">Bot cards close by themselves.</div>
        )}
      </div>
    </div>
  )
}

export function GameOver({ snap, store, onQuit }: { snap: Snapshot; store: GameStore; onQuit: () => void }) {
  const s = snap.state
  if (!snap.presented.over || snap.busy) return null
  const standings = s.players
    .map((p, seat) => ({ p, seat, worth: p.bankrupt ? 0 : netWorth(s, seat) }))
    .toSorted((a, b) => b.worth - a.worth)
  const winner = s.players[s.winner]!
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-table/60 backdrop-blur-sm">
      <Panel className="w-96 animate-pop p-6 text-center">
        <Eyebrow className="text-ink-muted">Game over</Eyebrow>
        <div
          className="mt-2 text-3xl font-bold"
          style={{ color: cssHex(store.setup.seats[s.winner]!.color) }}
        >
          {winner.name} won!
        </div>
        <div className="mt-5 flex flex-col gap-1.5 text-left text-sm">
          {standings.map(({ p, seat, worth }, rank) => (
            <div key={p.id} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2">
              <span className="w-4 text-ink-muted">{rank + 1}</span>
              <span
                className="size-2.5 rounded-full"
                style={{ background: cssHex(store.setup.seats[seat]!.color) }}
              />
              <span className="text-ink">{p.name}</span>
              <span className="ml-auto">
                {p.bankrupt ? <span className="text-alert">bankrupt</span> : <Money value={worth} />}
              </span>
            </div>
          ))}
        </div>
        <Btn kind="primary" onClick={onQuit} className="mt-6 w-full py-3">
          New game
        </Btn>
      </Panel>
    </div>
  )
}

const SHORTCUTS: [string, string][] = [
  ['Space', 'Main action: roll, end turn, continue'],
  ['B / A', 'Buy / auction the space you landed on'],
  ['P / U', 'Pay the Lockup fine / use a free card'],
  ['C', 'Open or close My city'],
  ['L', 'Full game log'],
  ['S', 'Skip animations'],
  ['?', 'This help'],
  ['Esc', 'Close panels, clear the selected tile'],
]

/** Rules in brief plus keyboard shortcuts. */
export function HelpOverlay({ onClose }: { onClose: () => void }) {
  usePanelSound()
  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-table/60 p-4 backdrop-blur-sm">
      <Panel className="flex max-h-full w-180 max-w-full animate-pop flex-col overflow-hidden">
        <div className="flex items-center border-b border-line px-6 py-4">
          <span className="flex-1 text-2xl font-bold">How to play</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close help"
            className="flex size-10 items-center justify-center rounded-xl border border-line bg-panel-2 hover:bg-white/10"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="grid min-h-0 gap-6 overflow-y-auto px-6 py-5 sm:grid-cols-[1fr_15rem]">
          <div className="flex flex-col gap-4 text-sm leading-relaxed">
            <Rule title="Goal">
              Be the last player standing, or have the highest net worth when the round limit is reached.
            </Rule>
            <Rule title="Your turn">
              Roll and move. Land on a space for sale to buy it; if you pass, it goes to auction and everyone
              (you too) can bid. Doubles roll again; three doubles send you to the Lockup.
            </Rule>
            <Rule title="Rent and sets">
              Landing on someone's property costs rent. Own a whole color set to double its rent and to build
              houses, then a hotel. Build evenly: one click in My city puts a house on every property in the
              set.
            </Rule>
            <Rule title="Raising money">
              Mortgage a property for half its price (it earns no rent until you lift the mortgage, plus 10%).
              Sell houses back for half their cost. If you owe more than you can raise, you go bankrupt.
            </Rule>
            <Rule title="Any time">
              Build, sell and mortgage whenever you like, even on other players' turns.
            </Rule>
          </div>
          <div>
            <Eyebrow className="mb-2 text-ink-muted">Shortcuts</Eyebrow>
            <dl className="flex flex-col gap-2 text-[13px]">
              {SHORTCUTS.map(([key, what]) => (
                <div key={key} className="flex items-start gap-3">
                  <dt className="w-14 shrink-0">
                    <Kbd>{key}</Kbd>
                  </dt>
                  <dd className="text-ink-muted">{what}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </Panel>
    </div>
  )
}

function Rule({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="font-semibold text-ink">{title}</div>
      <p className="text-ink-muted">{children}</p>
    </div>
  )
}

const seg = (on: boolean) =>
  `flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold ${on ? 'bg-accent text-table' : 'text-ink-muted hover:text-ink'}`

/** Settings dropdown under the menu button. */
export function GameMenu({
  speed,
  fastBots,
  onSpeed,
  onFastBots,
  reducedMotion,
  onReducedMotion,
  onLog,
  onQuit,
  onClose,
}: {
  speed: SpeedChoice
  fastBots: boolean
  onSpeed: (v: SpeedChoice) => void
  onFastBots: () => void
  reducedMotion: boolean
  onReducedMotion: () => void
  onLog: () => void
  onQuit: () => void
  onClose: () => void
}) {
  usePanelSound()
  const [confirm, setConfirm] = useState(false)
  return (
    <>
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="pointer-events-auto absolute inset-0 z-20 cursor-default"
      />
      <Panel className="absolute top-18 right-5 z-20 flex w-72 animate-pop flex-col gap-3 p-4">
        <div>
          <Eyebrow className="mb-1.5 text-ink-muted">Animation speed</Eyebrow>
          <div className="flex gap-1 rounded-xl bg-table p-1">
            {SPEEDS.map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={speed === v}
                onClick={() => onSpeed(v)}
                className={seg(speed === v)}
              >
                {v === 'instant' ? 'Instant' : `${v}×`}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center justify-between text-sm">
          Fast bots
          <input type="checkbox" checked={fastBots} onChange={onFastBots} className="size-4 accent-accent" />
        </label>
        <label
          className="flex items-center justify-between text-sm"
          title="No shake, confetti, or flying coins"
        >
          Reduced motion
          <input
            type="checkbox"
            checked={reducedMotion}
            onChange={onReducedMotion}
            className="size-4 accent-accent"
          />
        </label>
        <SoundSettings />
        <Btn onClick={onLog} className="justify-start">
          Game log
        </Btn>
        {confirm ? (
          <div className="flex gap-2">
            <Btn kind="danger" onClick={onQuit} className="flex-1">
              Quit this game
            </Btn>
            <Btn kind="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Btn>
          </div>
        ) : (
          <Btn kind="ghost" onClick={() => setConfirm(true)} className="justify-start">
            New game…
          </Btn>
        )}
      </Panel>
    </>
  )
}

/** Volume and mute, straight on the sound engine (it saves its own settings). */
function SoundSettings() {
  useSyncExternalStore(sound.subscribe, sound.getVersion)
  const s = sound.settings
  return (
    <div className="flex flex-col gap-1.5">
      <Eyebrow className="text-ink-muted">Sound</Eyebrow>
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          aria-pressed={s.muted}
          onClick={() => sound.setSettings({ muted: !s.muted })}
          className={seg(!s.muted).replace('flex-1 ', '') + ' min-w-14 bg-table'}
        >
          {s.muted ? 'Off' : 'On'}
        </button>
        <input
          type="range"
          aria-label="Volume"
          min={0}
          max={1}
          step={0.01}
          value={s.master}
          disabled={s.muted}
          onChange={(e) => sound.setSettings({ master: Number(e.target.value) })}
          className="min-w-0 flex-1 accent-accent disabled:opacity-40"
        />
      </div>
      <a href="#sounds" className="text-xs text-ink-muted hover:text-ink">
        Sound board (try and pick sounds)
      </a>
    </div>
  )
}
