import { useEffect, useState, useSyncExternalStore } from 'react'
import { SPACES, isOwnable, rentFor } from '@skyline/engine'
import type { BoardHandle } from '@skyline/board'
import { BoardCanvas } from '../BoardCanvas.tsx'
import type { GameStore, Snapshot } from '../game/store.ts'
import { spaceInfo } from '../spaceInfo.ts'
import { ActionBar } from './game/ActionBar.tsx'
import { DiceTray } from './game/DiceTray.tsx'
import { CardPopup, EventLog, GameOver } from './game/Overlays.tsx'
import { PlayersPanel } from './game/PlayersPanel.tsx'
import { PropertyCard } from './game/PropertyCard.tsx'
import { Btn, Money } from './game/ui.tsx'

export function GameScreen({ store, onQuit }: { store: GameStore; onQuit: () => void }) {
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const [handle, setHandle] = useState<BoardHandle | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [speed, setSpeed] = useState(store.settings.speed)
  const [fastBots, setFastBots] = useState(store.settings.fastBots)
  const [instant, setInstant] = useState(store.settings.instant)
  const [confirmQuit, setConfirmQuit] = useState(false)

  useEffect(() => {
    store.attach(handle?.board ?? null)
    handle?.board.setListeners({ select: setSelected })
    return () => store.attach(null)
  }, [handle, store])

  const changeSpeed = (v: number) => {
    store.setSettings({ speed: v, instant: false })
    setSpeed(v)
    setInstant(false)
  }
  const goInstant = () => {
    store.setSettings({ instant: true })
    setInstant(true)
  }
  const toggleFastBots = () => {
    store.setSettings({ fastBots: !fastBots })
    setFastBots(!fastBots)
  }

  const s = snap.state
  const limit = s.config.roundLimit
  return (
    <div className="flex h-full">
      <BoardCanvas onReady={setHandle} renderTooltip={(i) => <GameTooltip index={i} snap={snap} />}>
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-4 left-4 flex flex-col gap-3">
            <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-line bg-panel/90 px-3 py-2 text-sm backdrop-blur">
              <span className="text-ink-muted">Round</span>
              <span className="font-semibold text-ink">
                {snap.presented.round}
                {limit > 0 && <span className="text-ink-muted"> / {limit}</span>}
              </span>
            </div>
            <DiceTray dice={snap.dice} roll={snap.diceRoll} />
          </div>

          <div className="pointer-events-auto absolute top-4 right-4 flex items-center gap-1 rounded-xl border border-line bg-panel/90 p-1 backdrop-blur">
            {[1, 2, 4].map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={!instant && speed === v}
                onClick={() => changeSpeed(v)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${!instant && speed === v ? 'bg-accent text-table' : 'text-ink-muted hover:text-ink'}`}
              >
                {v}×
              </button>
            ))}
            <button
              type="button"
              aria-pressed={instant}
              onClick={goInstant}
              title="Skip all animations"
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${instant ? 'bg-accent text-table' : 'text-ink-muted hover:text-ink'}`}
            >
              Instant
            </button>
            <button
              type="button"
              aria-pressed={fastBots}
              onClick={toggleFastBots}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${fastBots ? 'bg-accent text-table' : 'text-ink-muted hover:text-ink'}`}
            >
              Fast bots
            </button>
            <button
              type="button"
              disabled={!snap.busy}
              onClick={() => store.skip()}
              className="rounded-lg px-2.5 py-1 text-xs font-semibold text-ink-muted hover:text-ink disabled:opacity-30"
            >
              Skip ⏭
            </button>
          </div>

          <div className="absolute inset-x-0 bottom-5 flex justify-center px-4">
            <ActionBar snap={snap} store={store} />
          </div>
          <CardPopup snap={snap} store={store} />
        </div>
        <GameOver snap={snap} store={store} onQuit={onQuit} />
      </BoardCanvas>

      <aside className="flex w-80 shrink-0 flex-col border-l border-line bg-panel">
        <header className="flex items-center justify-between px-4 pt-4 pb-3">
          <h1 className="text-xl font-bold text-accent">Skyline</h1>
          {confirmQuit ? (
            <span className="flex gap-1">
              <Btn kind="danger" onClick={onQuit} className="px-2 py-1 text-xs">
                Quit game
              </Btn>
              <Btn kind="ghost" onClick={() => setConfirmQuit(false)} className="px-2 py-1 text-xs">
                Cancel
              </Btn>
            </span>
          ) : (
            <Btn kind="ghost" onClick={() => setConfirmQuit(true)} className="px-2 py-1 text-xs">
              New game
            </Btn>
          )}
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
          <PlayersPanel snap={snap} store={store} />
          {selected !== null ? (
            <PropertyCard index={selected} snap={snap} store={store} />
          ) : (
            <p className="rounded-xl border border-dashed border-line px-4 py-3 text-xs text-ink-muted">
              Click any tile to see its card. Drag to pan, scroll to zoom.
            </p>
          )}
          <div>
            <h2 className="mb-2 text-[11px] font-semibold tracking-widest text-ink-muted uppercase">Log</h2>
            <EventLog snap={snap} />
          </div>
        </div>
      </aside>
    </div>
  )
}

function GameTooltip({ index, snap }: { index: number; snap: Snapshot }) {
  const info = spaceInfo(index)
  const owner = snap.presented.owner[index]!
  const rent = isOwnable(index) && owner >= 0 ? rentFor(snap.state, index, 7) : 0
  return (
    <div className="-translate-x-1/2 -translate-y-[calc(100%+18px)]">
      <div className="min-w-44 overflow-hidden rounded-lg border border-line bg-panel/95 shadow-xl shadow-black/40 backdrop-blur">
        {info.color && <div className="h-2" style={{ background: info.color }} />}
        <div className="px-3 py-2">
          <div className="text-sm font-semibold text-ink">{info.name}</div>
          {isOwnable(index) ? (
            <div className="text-xs text-ink-muted">
              {owner >= 0 ? (
                <>
                  {snap.presented.players[owner]!.name}
                  {snap.presented.mortgaged[index] ? (
                    ' · mortgaged'
                  ) : SPACES[index]!.kind === 'utility' ? (
                    ' · dice × 4/10'
                  ) : (
                    <>
                      {' '}
                      · rent <Money value={rent} />
                    </>
                  )}
                </>
              ) : (
                <>
                  For sale · <Money value={SPACES[index]!.price} />
                </>
              )}
            </div>
          ) : (
            <div className="text-xs text-ink-muted">{info.kind}</div>
          )}
        </div>
      </div>
    </div>
  )
}
