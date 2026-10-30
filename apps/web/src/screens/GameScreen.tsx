import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { SPACES } from '@skyline/engine'
import type { BoardHandle } from '@skyline/board'
import { BoardCanvas } from '../BoardCanvas.tsx'
import { useLayout } from '../layout.ts'
import { connectSound } from '../audio/connect.ts'
import { CityAmbience } from '../audio/ambience.ts'
import { sound } from '../audio/engine.ts'
import { MusicPlayer } from '../audio/music.ts'
import { loadPrefs, savePrefs, syncReducedMotion } from '../game/prefs.ts'
import { buildableGroups } from '@skyline/bots'
import { cityOf } from '../game/setup.ts'
import { applyCursorPref, type CursorPref } from '../cursors.ts'
import { landingOdds } from '../game/odds.ts'
import { RecapTracker, type Recap } from '../game/recap.ts'
import { BarkMapper } from '../game/barks.ts'
import { skyLevel, type SkyPref } from '../game/sky.ts'
import type { GameStore } from '../game/store.ts'
import { ActionDock } from './game/ActionDock.tsx'
import { AuctionPanel } from './game/AuctionPanel.tsx'
import { bidAction, raiseOptions } from './game/auctionBids.ts'
import { BuyMoment } from './game/BuyMoment.tsx'
import { useBoardFraming } from './game/boardFraming.ts'
import { DebtPanel } from './game/DebtPanel.tsx'
import { BoardHandleContext } from './game/cardEnv.tsx'
import { Announcer } from './game/Announcer.tsx'
import { CalloutLayer, FxLayer } from './game/Fx.tsx'
import { GameTooltip } from './game/GameTooltip.tsx'
import { CompactHud, Hud } from './game/Hud.tsx'
import { MyCity } from './game/MyCity.tsx'
import { OfferPanel } from './game/OfferPanel.tsx'
import { TradeComposer, type TradeDraft } from './game/TradeComposer.tsx'
import { SPEEDS, fmtMoney, type SpeedChoice } from './game/format.ts'
import { CardPopup, GameMenu, GameOver, HelpOverlay } from './game/Overlays.tsx'
import { ActivityFeed, LeftColumn } from './game/SidePanels.tsx'
import { TurnBanner } from './game/TurnBanner.tsx'
import { turnView, type TurnView } from './game/turn.ts'

/** How long a bot's speech bubble stays up. */
const BARK_MS = 2600

/**
 * Text fields keep every key. A focused button keeps Enter (keyboard activation) but not Space:
 * Space is the main action, so clicking My city and then pressing Space still rolls. Inside a
 * dialog a focused button keeps Space too, so Tab to "Put it up for auction" and Space does that,
 * not the primary action.
 */
const ownsKey = (t: EventTarget | null, key: string) =>
  t instanceof HTMLElement &&
  (t.closest('input, textarea, select, [contenteditable]') !== null ||
    ((key === 'Enter' || (key === ' ' && t.closest('[role="dialog"]') !== null)) &&
      t.closest('button') !== null))

/** `?open=city`, `?open=help` or `?open=trade` opens a panel on load (dev and screenshots). */
const initialPanel = () => new URLSearchParams(window.location.search).get('open')

export function GameScreen({
  store,
  onQuit,
  onRestart,
}: {
  store: GameStore
  onQuit: () => void
  onRestart: () => void
}) {
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const [handle, setHandle] = useState<BoardHandle | null>(null)
  const { compact, landscape } = useLayout()
  useBoardFraming(handle, compact)
  const [selected, setSelected] = useState<number | null>(null)
  /** Speed die move choice: the destination under the pointer (dock button). */
  const [hoverSpace, setHoverSpace] = useState<number | null>(null)
  /** Chooses a clicked tile when it is a move option; set every render (latest turn). */
  const pickRef = useRef<(space: number | null) => boolean>(() => false)
  const [speed, setSpeed] = useState<SpeedChoice>(
    store.settings.instant ? 'instant' : (SPEEDS.find((v) => v === store.settings.speed) ?? 1),
  )
  const [fastBots, setFastBots] = useState(store.settings.fastBots)
  const [reducedMotion, setReducedMotion] = useState(store.settings.reducedMotion)
  const [botOffers, setBotOffers] = useState(store.settings.botOffers)
  const [odds, setOdds] = useState(store.settings.odds)
  const [cityLife, setCityLife] = useState(store.settings.cityLife)
  const [dice3d, setDice3d] = useState(store.settings.dice3d)
  const [sky, setSky] = useState<SkyPref>(store.settings.sky)
  const [cursor, setCursor] = useState<CursorPref>(store.settings.cursor)
  const [trade, setTrade] = useState<(TradeDraft & { me: number }) | null>(() =>
    initialPanel() === 'trade' ? { me: store.getSnapshot().viewer ?? 0 } : null,
  )
  const [cityOpen, setCityOpen] = useState(() => initialPanel() === 'city')
  const [help, setHelp] = useState(() => initialPanel() === 'help')
  const [menu, setMenu] = useState(false)
  const [showLog, setShowLog] = useState(false)

  // "While you waited": a recap when a human's turn on this screen comes back (game/recap.ts).
  const [recap, setRecap] = useState<Recap | null>(null)
  useEffect(() => {
    const tracker = new RecapTracker((id) => store.canAct(id))
    return store.onApplied((e) => {
      const r = tracker.push(e)
      if (e.type === 'TURN_STARTED') setRecap(r)
    })
  }, [store])

  // Bot lines in speech bubbles under their cards, in step with the animation (game/barks.ts).
  const [barks, setBarks] = useState<Record<string, { text: string; key: number }>>({})
  useEffect(() => {
    const styleOf = (id: string) => {
      const seat = store.setup.seats.findIndex((x) => x.id === id)
      return store.setup.seats[seat]?.kind === 'bot' ? (store.botName(seat) ?? 'Balanced') : null
    }
    const mapper = new BarkMapper(styleOf)
    const timers = new Set<ReturnType<typeof setTimeout>>()
    let key = 0
    const off = store.onEvent((e) => {
      const bark = mapper.event(e)
      if (!bark) return
      const k = ++key
      setBarks((b) => ({ ...b, [bark.playerId]: { text: bark.text, key: k } }))
      const t = setTimeout(() => {
        timers.delete(t)
        setBarks((b) => {
          if (b[bark.playerId]?.key !== k) return b
          const { [bark.playerId]: _, ...rest } = b
          return rest
        })
      }, BARK_MS)
      timers.add(t)
    })
    return () => {
      off()
      for (const t of timers) clearTimeout(t)
    }
  }, [store])

  const ambience = useRef<CityAmbience | null>(null)
  useEffect(() => {
    const audio = connectSound(store)
    const city = new CityAmbience(sound)
    city.start()
    ambience.current = city
    const music = new MusicPlayer(sound)
    music.start()
    // Dev console handle (and for scripted screenshots).
    if (import.meta.env.DEV) Object.assign(window, { skylineStore: store })
    store.attach(handle?.board ?? null)
    // The 3D dice fly into the DOM tray: its center and die size in canvas CSS px.
    store.setDiceTray(() => {
      const tray = document.querySelector('[data-dice-tray]')
      if (!tray || !handle) return null
      const r = tray.getBoundingClientRect()
      const c = handle.app.canvas.getBoundingClientRect()
      return { x: r.left + r.width / 2 - c.left, y: r.top + r.height / 2 - c.top, size: r.height }
    })
    // A click on a highlighted tile during the Speed die's move choice goes there instead.
    handle?.board.setListeners({ select: (i) => pickRef.current(i) || setSelected(i), beat: audio.beat })
    return () => {
      audio.disconnect()
      city.stop()
      music.stop()
      ambience.current = null
      store.setDiceTray(null)
      store.attach(null)
    }
  }, [handle, store])

  // The one reduced-motion signal for CSS (see index.css): the in-game setting or the OS preference.
  useEffect(() => {
    syncReducedMotion(reducedMotion)
    return () => syncReducedMotion(loadPrefs().reducedMotion ?? false)
  }, [reducedMotion])

  // The board eases the fade itself; resume and reload snap straight to the right sky.
  const round = snap.presented.round
  const skyDone = useRef(false)
  useEffect(() => {
    ambience.current?.setNight(skyLevel(round, sky))
    if (!handle) return
    handle.board.setNight(skyLevel(round, sky), !skyDone.current)
    skyDone.current = true
  }, [handle, round, sky])

  // Cards read the board (lot portraits), the sky and reduced motion from here.
  const night = skyLevel(round, sky) > 0.5
  const cardEnv = useMemo(() => ({ handle, night, reducedMotion }), [handle, night, reducedMotion])

  const turn = turnView(snap, store)
  const viewer = snap.viewer
  // A decision is open: buy, auction, debt or an incoming offer, or the trade composer.
  // (Not for the Speed die's move choice: it is made on the board and in the dock.)
  const focus = (turn.moment !== null && turn.moment !== 'move') || trade !== null
  const viewerId = viewer !== null ? snap.state.players[viewer]!.id : null

  // Your own move before the roll: landing odds and the recap of the others' turns show then.
  const preRoll = turn.canAct && turn.actorSeat === viewer && turn.legal.some((a) => a.type === 'ROLL')
  const rolling = odds && preRoll
  const state = snap.state
  useEffect(() => {
    if (!handle) return
    if (!rolling) return handle.board.setOdds(null)
    handle.board.setOdds(
      landingOdds(state, turn.actorSeat)
        .filter((o) => o.rent > 0)
        .map((o) => ({
          space: o.space,
          p: o.p,
          label: fmtMoney(o.rent),
          color: store.setup.seats[o.owner!]!.color,
        })),
    )
  }, [handle, rolling, state, turn.actorSeat, store])
  // The Speed die's Bus or triples: tag every shown destination on the board, the hovered one strongest.
  // turnView builds a fresh list every render; the board keeps identical tags instead of re-popping.
  const moves = turn.moment === 'move' ? turn.moves : null
  useEffect(() => {
    if (!handle || !moves) return
    handle.board.setOdds(
      moves.map((m) => ({
        space: m.space,
        p: hoverSpace === null || hoverSpace === m.space ? 1 / 6 : 1 / 14,
        label: m.tag,
        color: m.owner >= 0 ? store.setup.seats[m.owner]!.color : null,
      })),
    )
    return () => handle.board.setOdds(null)
  }, [handle, moves, hoverSpace, store])
  useEffect(() => {
    pickRef.current = (space) => {
      if (space === null || turn.moment !== 'move' || snap.state.pending?.kind !== 'move') return false
      if (!snap.state.pending.options.includes(space)) return false
      turn.act({ type: 'CHOOSE_MOVE', space })
      handle?.board.select(null)
      setHoverSpace(null)
      return true
    }
  })
  const cityBadge =
    viewerId && store.seatKind(viewerId) === 'human' ? buildableGroups(snap.state, viewerId) : 0
  const canTrade =
    viewer !== null &&
    viewerId !== null &&
    store.seatKind(viewerId) === 'human' &&
    !snap.state.players[viewer]!.bankrupt &&
    snap.state.phase !== 'gameOver' &&
    snap.state.players.some((p, i) => i !== viewer && !p.bankrupt)
  const openTrade = canTrade ? () => setTrade({ me: viewer }) : null

  /** Menu choices are remembered for the next game. */
  const persist = () => {
    const s = store.settings
    savePrefs({
      speed: s.speed,
      fastBots: s.fastBots,
      instant: s.instant,
      reducedMotion: s.reducedMotion,
      botOffers: s.botOffers,
      odds: s.odds,
      cityLife: s.cityLife,
      sky: s.sky,
      cursor: s.cursor,
      dice3d: s.dice3d,
    })
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
      // One layer per press, top-most first (help and the menu sit above the rest).
      return press(() => {
        if (help) setHelp(false)
        else if (menu) setMenu(false)
        else if (trade) setTrade(null)
        else if (snap.card?.waiting) return
        else if (cityOpen) setCityOpen(false)
        else if (showLog) setShowLog(false)
        else select(null)
      })
    }
    if (key === '?' || key === 'h') return press(() => setHelp((v) => !v))
    if (help || menu || trade) return
    if (key === ' ' || key === 'enter') {
      // Swallow Space even with no action, so it never clicks whatever button has focus.
      e.preventDefault()
      return turn.primary?.run()
    }
    if (key === 'c') return press(toggleCity)
    if (key === 't' && openTrade) return press(openTrade)
    if (key === 'l') return press(() => setShowLog((v) => !v))
    if (key === 's') return press(() => store.skip())
    if (key === 'f' && !turn.human) return press(() => store.skipToHuman())
    if (key === 'm') return press(() => sound.setSettings({ muted: !sound.settings.muted }))
    const hit =
      momentKey(turn, key, store) ?? turn.secondary.find((c) => c.hotkey?.toLowerCase() === key)?.run
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
    <BoardHandleContext.Provider value={cardEnv}>
      <div className="flex h-full">
        <BoardCanvas
          onReady={setHandle}
          citySeed={cityOf(store.setup)}
          renderTooltip={(i) => <GameTooltip index={i} snap={snap} store={store} />}
        >
          <div className="pointer-events-none absolute inset-0">
            {/* A button (not a #link: the hash is the router). Hidden until it has keyboard focus. */}
            <button
              type="button"
              onClick={() =>
                document
                  .querySelector<HTMLElement>('nav[aria-label="Actions"] button:not(:disabled)')
                  ?.focus()
              }
              className="pointer-events-auto sr-only z-50 rounded-xl bg-accent px-4 py-2 text-sm font-extrabold text-accent-ink focus:not-sr-only focus:absolute focus:top-2 focus:left-1/2 focus:-translate-x-1/2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-card"
            >
              Skip to actions
            </button>
            {compact ? (
              <CompactHud
                snap={snap}
                store={store}
                landscape={landscape}
                onHelp={() => setHelp(true)}
                onMenu={() => setMenu((v) => !v)}
                barks={barks}
                banner={<TurnBanner snap={snap} store={store} turn={turn} cityOpen={cityOpen} compact />}
              />
            ) : (
              <Hud
                snap={snap}
                store={store}
                speedLabel={speed === 'instant' ? 'Instant' : `${speed}×`}
                onSpeed={() => changeSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]!)}
                onHelp={() => setHelp(true)}
                onMenu={() => setMenu((v) => !v)}
                barks={barks}
              />
            )}
            <Announcer snap={snap} store={store} turn={turn} />
            {!compact && <TurnBanner snap={snap} store={store} turn={turn} cityOpen={cityOpen} />}
            {/* Focus mode: during a decision the side panels slide away so nothing overlaps it. */}
            {/* Phones: the side columns move into sheets (Milestone 14 step 3). */}
            {!compact && (
              <div
                className={`absolute inset-0 transition-[opacity,translate] duration-300 ease-out ${focus ? '-translate-x-4 opacity-0' : ''}`}
                {...(focus ? { inert: true } : {})}
              >
                <LeftColumn
                  snap={snap}
                  store={store}
                  selected={selected}
                  recap={preRoll ? recap : null}
                  onCity={() => setCityOpen(true)}
                  onDeselect={() => select(null)}
                  onCloseRecap={() => setRecap(null)}
                />
              </div>
            )}
            {!cityOpen && !compact && (
              <div
                className={`absolute inset-0 transition-[opacity,translate] duration-300 ease-out ${focus ? 'translate-x-4 opacity-0' : ''}`}
                {...(focus ? { inert: true } : {})}
              >
                <ActivityFeed
                  snap={snap}
                  store={store}
                  showLog={showLog}
                  onToggleLog={() => setShowLog((v) => !v)}
                />
              </div>
            )}
            <ActionDock
              snap={snap}
              store={store}
              turn={turn}
              cityBadge={cityBadge}
              cityOpen={cityOpen}
              onCity={toggleCity}
              onTrade={openTrade}
              hoverSpace={hoverSpace}
              onHoverSpace={setHoverSpace}
              compact={compact}
            />
            <CalloutLayer store={store} />
            <AuctionPanel snap={snap} store={store} turn={turn} />
            <BuyMoment snap={snap} store={store} turn={turn} onCity={() => setCityOpen(true)} />
            <DebtPanel snap={snap} store={store} turn={turn} onTrade={openTrade} />
            <OfferPanel snap={snap} store={store} turn={turn} onCounter={setTrade} />
            <CardPopup snap={snap} store={store} />
            {cityOpen && viewer !== null && (
              <MyCity
                snap={snap}
                store={store}
                seat={viewer}
                onClose={() => setCityOpen(false)}
                onFocus={(i) => select(i)}
                onAsk={
                  canTrade
                    ? (partner, space) =>
                        setTrade({ me: viewer, partner, get: { spaces: [space], cash: 0, jailCards: 0 } })
                    : null
                }
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
                  // City life follows reduced motion until the player flips it themselves.
                  store.setSettings({ reducedMotion: !reducedMotion, cityLife: reducedMotion })
                  setReducedMotion(!reducedMotion)
                  setCityLife(reducedMotion)
                  persist()
                }}
                dice3d={dice3d}
                onDice3d={() => {
                  store.setSettings({ dice3d: !dice3d })
                  setDice3d(!dice3d)
                  persist()
                }}
                cityLife={cityLife}
                onCityLife={() => {
                  store.setSettings({ cityLife: !cityLife })
                  setCityLife(!cityLife)
                  persist()
                }}
                sky={sky}
                onSky={(v) => {
                  store.setSettings({ sky: v })
                  setSky(v)
                  persist()
                }}
                cursor={cursor}
                onCursor={() => {
                  const next = cursor === 'game' ? 'system' : 'game'
                  store.setSettings({ cursor: next })
                  setCursor(next)
                  handle?.setCursors(applyCursorPref(next))
                  persist()
                }}
                odds={odds}
                onOdds={() => {
                  store.setSettings({ odds: !odds })
                  setOdds(!odds)
                  persist()
                }}
                botOffers={botOffers}
                onBotOffers={() => {
                  store.setSettings({ botOffers: !botOffers })
                  setBotOffers(!botOffers)
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
            {trade && (
              <TradeComposer
                snap={snap}
                store={store}
                me={trade.me}
                draft={trade}
                onClose={() => setTrade(null)}
              />
            )}
            {help && <HelpOverlay onClose={() => setHelp(false)} config={snap.state.config} />}
          </div>
          <GameOver snap={snap} store={store} onRestart={onRestart} onQuit={onQuit} />
        </BoardCanvas>
        <FxLayer store={store} />
      </div>
    </BoardHandleContext.Provider>
  )
}

/**
 * B and A answer the buy moment; Y and N answer an offer; in an auction 1 to 3 raise by the
 * steps (4 bids the list price while it is still above the high bid) and P passes.
 */
function momentKey(turn: TurnView, key: string, store: GameStore): (() => void) | undefined {
  const offer = turn.offer
  if (turn.moment === 'offer' && offer && (key === 'y' || key === 'n')) {
    const to = store.getSnapshot().state.players[offer.to]!.id
    const type = key === 'y' ? 'ACCEPT_TRADE' : 'REJECT_TRADE'
    return () => void store.dispatch(to, { type, tradeId: offer.id })
  }
  if (turn.moment === 'auction') {
    const a = store.getSnapshot().state.pending
    if (a?.kind !== 'auction' || !turn.canAct) return undefined
    if (key === 'p') return () => turn.act({ type: 'PASS_BID' })
    const cash = store.getSnapshot().state.players[turn.actorSeat]!.cash
    const raise = raiseOptions(a.highBid, SPACES[a.space]!.price, cash).find((r) => r.key === key)
    return raise ? () => turn.act(bidAction(raise.amount)) : undefined
  }
  if (turn.moment !== 'buy') return undefined
  const type = key === 'b' ? 'BUY' : key === 'a' ? 'DECLINE_BUY' : null
  const action = type && turn.legal.find((a) => a.type === type)
  return action ? () => turn.act(action) : undefined
}
