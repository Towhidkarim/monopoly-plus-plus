import { useState } from 'react'
import type { BoardHandle } from '@skyline/board'
import { BoardCanvas } from './BoardCanvas.tsx'
import { PlaygroundPanel } from './playground/PlaygroundPanel.tsx'

export function App() {
  const [handle, setHandle] = useState<BoardHandle | null>(null)
  return (
    <div className="flex h-full">
      <BoardCanvas onReady={setHandle} />
      <PlaygroundPanel handle={handle} />
    </div>
  )
}
