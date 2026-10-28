import { useEffect, useState } from 'react' // useEffect: hash listener, room socket
import { tokenColors } from '@skyline/board'
import { GameStore } from './game/store.ts'
import { ROLL_SCENES, SCENES, playToScene } from './game/scenes.ts'
import { clearSavedGame, type GameSetup, type SavedGame } from './game/setup.ts'
import { PlaygroundScreen } from './playground/PlaygroundScreen.tsx'
import { SoundBoard } from './playground/SoundBoard.tsx'
import { ArtScreen } from './playground/ArtScreen.tsx'
import { GameScreen } from './screens/GameScreen.tsx'
import { SetupScreen } from './screens/SetupScreen.tsx'
import { navigate, useRoute } from './net/route.ts'
import { closeRoom } from './net/session.ts'
import { OnlineMenu } from './screens/online/OnlineMenu.tsx'
import { RoomScreen } from './screens/online/RoomScreen.tsx'

function useHash(): string {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash
}

/**
 * Dev shortcuts (handy for watching and screenshots):
 * `?demo=bots` starts a four-bot game; `?demo=play` seats you against three bots, and
 * `&scene=buy|auction|debt|build|card` fast-forwards until you face that moment; `&speed=1` turns on
 * the Speed die (and `&scene=bus|triples|scout` waits for that roll).
 */
function demoStore(): GameStore | null {
  const params = new URLSearchParams(window.location.search)
  const demo = params.get('demo')
  if (demo !== 'bots' && demo !== 'play') return null
  const pieces = ['taxi', 'drone', 'balloon', 'bus'] as const
  const names = demo === 'play' ? ['You', 'Nova', 'Atlas', 'Juno'] : ['Nova', 'Atlas', 'Juno', 'Orion']
  const store = new GameStore({
    preset: 'standard',
    ...(params.get('speed') === '1' ? { twists: { speedDie: true } } : {}),
    seed: Number(params.get('seed') ?? 7),
    seats: pieces.map((piece, i) => ({
      id: `p${i + 1}`,
      name: names[i]!,
      kind: demo === 'play' && i === 0 ? 'human' : 'bot',
      piece,
      color: tokenColors[i]!,
    })),
  })
  const scene = SCENES.find((x) => x === params.get('scene'))
  if (scene) {
    store.setSettings({ instant: true })
    if (!playToScene(store, scene)) console.warn(`[skyline] scene "${scene}" not reached; try another seed`)
    store.setSettings({ instant: false })
    if (ROLL_SCENES.has(scene)) store.dispatch('p1', { type: 'ROLL' })
  }
  if (params.get('fast') === '1') store.setSettings({ speed: 4, fastBots: true })
  if (params.get('instant') === '1') store.setSettings({ instant: true, fastBots: true })
  return store
}

const freshSeed = () => Math.floor(Math.random() * 1_000_000)

export function App() {
  const hash = useHash()
  const route = useRoute()
  const [store, setStore] = useState<GameStore | null>(demoStore)
  // Browser Back out of a room closes its socket; the seat stays ours until we return.
  useEffect(() => {
    if (route.kind !== 'room') closeRoom()
  }, [route.kind])

  if (hash === '#playground') return <PlaygroundScreen />
  if (hash === '#sounds') return <SoundBoard />
  if (hash === '#art') return <ArtScreen />
  // Online play (DECISIONS.md D44): the room owns the game, this screen only shows it.
  if (route.kind === 'online')
    return <OnlineMenu onBack={() => navigate('/')} onRoom={(code) => navigate(`/r/${code}`)} />
  if (route.kind === 'room')
    return <RoomScreen key={route.code} code={route.code} onExit={() => navigate('/online')} />

  // Disposed only when the game is replaced, never in an effect cleanup (StrictMode re-runs those).
  const start = (setup: GameSetup, saved?: SavedGame) => {
    store?.dispose()
    setStore(new GameStore(setup, saved?.actions))
  }
  // Same players and mode, a fresh dice seed and a new city (UI only: picks seeds, not rules).
  const restart = () => {
    if (!store) return
    start({ ...store.setup, seed: freshSeed(), citySeed: freshSeed() })
  }
  const quit = () => {
    store?.dispose()
    clearSavedGame()
    setStore(null)
  }

  return store ? (
    <GameScreen key={store.setup.seed} store={store} onQuit={quit} onRestart={restart} />
  ) : (
    <SetupScreen onStart={start} onOnline={() => navigate('/online')} />
  )
}
