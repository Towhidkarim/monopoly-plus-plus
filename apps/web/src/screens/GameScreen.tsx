import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { SPACES, isOwnable, rentFor } from '@skyline/engine'
import type { BoardHandle } from '@skyline/board'
import { BoardCanvas } from '../BoardCanvas.tsx'
import { connectSound } from '../audio/connect.ts'
import { sound } from '../audio/engine.ts'
import { savePrefs } from '../game/prefs.ts'
import { buildableGroups } from '@skyline/bots'
import type { GameStore, Snapshot } from '../game/store.ts'
import { spaceInfo } from '../spaceInfo.ts'
import { ActionDock } from './game/ActionDock.tsx'
import { AuctionPanel } from './game/AuctionPanel.tsx'
import { BuyMoment } from './game/BuyMoment.tsx'
import { DebtPanel } from './game/DebtPanel.tsx'
import { CalloutLayer, FxLayer } from './game/Fx.tsx'
import { Hud } from './game/Hud.tsx'
import { MyCity } from './game/MyCity.tsx'
import { SPEEDS, type SpeedChoice } from './game/format.ts'
import { CardPopup, GameMenu, GameOver, HelpOverlay } from './game/Overlays.tsx'
import { ActivityFeed, LeftColumn } from './game/SidePanels.tsx'
import { TurnBanner } from './game/TurnBanner.tsx'
import { turnView, type TurnView } from './game/turn.ts'
import { Money } from './game/ui.tsx'

/**
 * Text fields keep every key. A focused button keeps Enter (keyboard activation) but not Space:
 * Space is always the main action, so clicking My city and then pressing Space still rolls.
 */
const ownsKey = (t: EventTarget | null, key: string) =>
  t instanceof HTMLElement &&
  (t.closest('input, textarea, select, [contenteditable]') !== null ||
    (key === 'Enter' && t.closest('button') !== null))

/** `?open=city` or `?open=help` opens a panel on load (dev and screenshots). */
const initialPanel = () => new URLSearchParams(window.location.search).get('open')

export function GameScreen({ store, onQuit }: { store: GameStore; onQuit: () => void }) {
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const [handle, setHandle] = useState<BoardHandle | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [speed, setSpeed] = useState<SpeedChoice>(
    store.settings.instant ? 'instant' : (SPEEDS.find((v) => v === store.settings.speed) ?? 1),
  )
  const [fastBots, setFastBots] = useState(store.settings.fastBots)
  const [reducedMotion, setReducedMotion] = useState(store.settings.reducedMotion)
  const [cityOpen, setCityOpen] = useState(() => initialPanel() === 'city')
  const [help, setHelp] = useState(() => initialPanel() === 'help')
  const [menu, setMenu] = useState(false)
  const [showLog, setShowLog] = useState(false)

  useEffect(() => {
    const audio = connectSound(store)
    // Dev console handle (and for scripted screenshots).
    if (import.meta.env.DEV) Object.assign(window, { skylineStore: store })
    store.attach(handle?.board ?? null)
    handle?.board.setListeners({ select: setSelected, beat: audio.beat })
    // Frame the board between the HUD and turn banner above and the action dock below.
    handle?.board.setInsets({ top: 130, right: 0, bottom: 110, left: 0 })
    return () => {
      audio.disconnect()
      store.attach(null)
    }
  }, [handle, store])

  const turn = turnView(snap, store)
  const viewer = snap.viewer
  const viewerId = viewer !== null ? snap.state.players[viewer]!.id : null
  const cityBadge =
    viewerId && store.seatKind(viewerId) === 'human' ? buildableGroups(snap.state, viewerId) : 0

  /** Menu choices are remembered for the next game. */
  const persist = () => {
    const s = store.settings
    savePrefs({ speed: s.speed, fastBots: s.fastBots, instant: s.instant, reducedMotion: s.reducedMotion })
  }
  const changeSpeed = (v: SpeedChoice) => {
    store.setSettings(v === 'instant' ? { instant: true } : { speed: v, instant: false })
    setSpeed(v)
    persist()
  }
  const select = (space: number | null) => handle?.board.select(space)
  const toggleCity = () => viewer !== null && setCityOpen((v) => !v)

  const onKey = (e: KeyboardEvent) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key !== 'Escape' && ownsKey(e.target, e.key)) return
    const key = e.key.toLowerCase()
    const press = (fn: () => void) => {
      e.preventDefault()
      fn()
    }
    if (key === 'escape') {
      return press(() => {
        if (help) setHelp(false)
        else if (menu) setMenu(false)
        else if (cityOpen) setCityOpen(false)
        else if (showLog) setShowLog(false)
        else select(null)
      })
    }
    if (key === '?' || key === 'h') return press(() => setHelp((v) => !v))
    if (help || menu) return
    if (key === ' ' || key === 'enter') {
      // Swallow Space even with no action, so it never clicks whatever button has focus.
      e.preventDefault()
      return turn.primary?.run()
    }
    if (key === 'c') return press(toggleCity)
    if (key === 'l') return press(() => setShowLog((v) => !v))
    if (key === 's') return press(() => store.skip())
    if (key === 'm') return press(() => sound.setSettings({ muted: !sound.settings.muted }))
    const hit = momentKey(turn, key) ?? turn.secondary.find((c) => c.hotkey?.toLowerCase() === key)?.run
    if (hit) press(hit)
  }
  // Subscribe once; the listener always calls the latest handler (it closes over this render).
  const keyRef = useRef(onKey)
  useEffect(() => {
    keyRef.current = onKey
  })
  useEffect(() => {
    const listener = (e: KeyboardEvent) => keyRef.current(e)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  return (
    <div className="flex h-full">
      <BoardCanvas onReady={setHandle} renderTooltip={(i) => <GameTooltip index={i} snap={snap} />}>
        <div className="pointer-events-none absolute inset-0">
          <Hud
            snap={snap}
            store={store}
            speedLabel={speed === 'instant' ? 'Instant' : `${speed}×`}
            onSpeed={() => changeSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]!)}
            onHelp={() => setHelp(true)}
            onMenu={() => setMenu((v) => !v)}
          />
          <TurnBanner snap={snap} store={store} turn={turn} />
          <LeftColumn
            snap={snap}
            store={store}
            selected={selected}
            onCity={() => setCityOpen(true)}
            onDeselect={() => select(null)}
          />
          {!cityOpen && (
            <ActivityFeed snap={snap} showLog={showLog} onToggleLog={() => setShowLog((v) => !v)} />
          )}
          <ActionDock
            snap={snap}
            store={store}
            turn={turn}
            cityBadge={cityBadge}
            cityOpen={cityOpen}
            onCity={toggleCity}
          />
          <CalloutLayer store={store} />
          <AuctionPanel snap={snap} store={store} turn={turn} />
          <BuyMoment snap={snap} turn={turn} onCity={() => setCityOpen(true)} />
          <DebtPanel snap={snap} store={store} turn={turn} />
          <CardPopup snap={snap} store={store} />
          {cityOpen && viewer !== null && (
            <MyCity
              snap={snap}
              store={store}
              seat={viewer}
              onClose={() => setCityOpen(false)}
              onFocus={(i) => select(i)}
            />
          )}
          {menu && (
            <GameMenu
              speed={speed}
              fastBots={fastBots}
              onSpeed={changeSpeed}
              onFastBots={() => {
                store.setSettings({ fastBots: !fastBots })
                setFastBots(!fastBots)
                persist()
              }}
              reducedMotion={reducedMotion}
              onReducedMotion={() => {
                store.setSettings({ reducedMotion: !reducedMotion })
                setReducedMotion(!reducedMotion)
                persist()
              }}
              onLog={() => {
                setShowLog(true)
                setCityOpen(false)
                setMenu(false)
              }}
              onQuit={onQuit}
              onClose={() => setMenu(false)}
            />
          )}
          {help && <HelpOverlay onClose={() => setHelp(false)} />}
        </div>
        <GameOver snap={snap} store={store} onQuit={onQuit} />
      </BoardCanvas>
      <FxLayer store={store} />
    </div>
  )
}

/** B and A answer the buy moment. */
function momentKey(turn: TurnView, key: string): (() => void) | undefined {
  if (turn.moment !== 'buy') return undefined
  const type = key === 'b' ? 'BUY' : key === 'a' ? 'DECLINE_BUY' : null
  const action = type && turn.legal.find((a) => a.type === type)
  return action ? () => turn.act(action) : undefined
}

function GameTooltip({ index, snap }: { index: number; snap: Snapshot }) {
  const info = spaceInfo(index)
  const owner = snap.presented.owner[index]!
  const rent = isOwnable(index) && owner >= 0 ? rentFor(snap.state, index, 7) : 0
  return (
    <div className="-translate-x-1/2 -translate-y-[calc(100%+18px)]">
      <div className="min-w-48 overflow-hidden rounded-xl border border-line bg-panel/95 shadow-xl shadow-black/40 backdrop-blur">
        {info.color && <div className="h-1" style={{ background: info.color }} />}
        <div className="px-3.5 py-2.5">
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
              <div className="mt-0.5 text-[11px]">Click for the full card</div>
            </div>
          ) : (
            <div className="text-xs text-ink-muted">{info.kind}</div>
          )}
        </div>
      </div>
    </div>
  )
}
