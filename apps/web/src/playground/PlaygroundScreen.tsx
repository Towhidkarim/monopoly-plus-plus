import { useState } from 'react'
import type { BoardHandle } from '@skyline/board'
import { BoardCanvas } from '../BoardCanvas.tsx'
import { PlaygroundPanel } from './PlaygroundPanel.tsx'

/** Board feel playground (Milestone 1), reachable at #playground. */
export function PlaygroundScreen() {
  const [handle, setHandle] = useState<BoardHandle | null>(null)
  return (
    <div className="flex h-full">
      <BoardCanvas onReady={setHandle} />
      <PlaygroundPanel handle={handle} />
    </div>
  )
}
