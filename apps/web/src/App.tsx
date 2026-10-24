import { useEffect, useState } from 'react' // useEffect: hash listener
import { tokenColors } from '@skyline/board'
import { GameStore } from './game/store.ts'
import { SCENES, playToScene } from './game/scenes.ts'
import { clearSavedGame, type GameSetup, type SavedGame } from './game/setup.ts'
import { PlaygroundScreen } from './playground/PlaygroundScreen.tsx'
import { SoundBoard } from './playground/SoundBoard.tsx'
import { ArtScreen } from './playground/ArtScreen.tsx'
import { GameScreen } from './screens/GameScreen.tsx'
import { SetupScreen } from './screens/SetupScreen.tsx'

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
 * `&scene=buy|auction|debt|build` fast-forwards until you face that moment.
 */
function demoStore(): GameStore | null {
  const params = new URLSearchParams(window.location.search)
  const demo = params.get('demo')
  if (demo !== 'bots' && demo !== 'play') return null
  const pieces = ['taxi', 'drone', 'balloon', 'bus'] as const
  const names = demo === 'play' ? ['You', 'Nova', 'Atlas', 'Juno'] : ['Nova', 'Atlas', 'Juno', 'Orion']
  const store = new GameStore({
    preset: 'standard',
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
    if (scene === 'card') store.dispatch('p1', { type: 'ROLL' })
  }
  if (params.get('fast') === '1') store.setSettings({ speed: 4, fastBots: true })
  if (params.get('instant') === '1') store.setSettings({ instant: true, fastBots: true })
  return store
}

export function App() {
  const hash = useHash()
  const [store, setStore] = useState<GameStore | null>(demoStore)

  if (hash === '#playground') return <PlaygroundScreen />
  if (hash === '#sounds') return <SoundBoard />
  if (hash === '#art') return <ArtScreen />

  // Disposed only when the game is replaced, never in an effect cleanup (StrictMode re-runs those).
  const start = (setup: GameSetup, saved?: SavedGame) => {
    store?.dispose()
    setStore(new GameStore(setup, saved?.actions))
  }
  const quit = () => {
    store?.dispose()
    clearSavedGame()
    setStore(null)
  }

  return store ? (
    <GameScreen key={store.setup.seed} store={store} onQuit={quit} />
  ) : (
    <SetupScreen onStart={start} />
  )
}
