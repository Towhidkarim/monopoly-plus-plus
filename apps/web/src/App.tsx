import { useEffect, useState } from 'react' // useEffect: hash listener
import { tokenColors } from '@skyline/board'
import { GameStore } from './game/store.ts'
import { clearSavedGame, type GameSetup, type SavedGame } from './game/setup.ts'
import { PlaygroundScreen } from './playground/PlaygroundScreen.tsx'
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

/** `?demo=bots` starts a four-bot game straight away (handy for watching and screenshots). */
function demoStore(): GameStore | null {
  const params = new URLSearchParams(window.location.search)
  if (params.get('demo') !== 'bots') return null
  const pieces = ['taxi', 'drone', 'balloon', 'bus'] as const
  const names = ['Nova', 'Atlas', 'Juno', 'Orion']
  const store = new GameStore({
    preset: 'standard',
    seed: 7,
    seats: pieces.map((piece, i) => ({
      id: `p${i + 1}`,
      name: names[i]!,
      kind: 'bot',
      piece,
      color: tokenColors[i]!,
    })),
  })
  if (params.get('fast') === '1') store.setSettings({ speed: 4, fastBots: true })
  if (params.get('instant') === '1') store.setSettings({ instant: true, fastBots: true })
  return store
}

export function App() {
  const hash = useHash()
  const [store, setStore] = useState<GameStore | null>(demoStore)

  if (hash === '#playground') return <PlaygroundScreen />

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
