import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { GO_TO_JAIL_INDEX, JAIL_INDEX, walkPath, type GameEvent } from '@skyline/engine'
import { tokenColors, type Board, type PieceKind } from '@skyline/board'

export interface PlayerToken {
  id: string
  name: string
  color: number
  piece: PieceKind
}

export const PLAYERS: PlayerToken[] = [
  { id: 'p1', name: 'Coral', color: tokenColors[0], piece: 'taxi' },
  { id: 'p2', name: 'Cyan', color: tokenColors[1], piece: 'drone' },
  { id: 'p3', name: 'Amber', color: tokenColors[2], piece: 'balloon' },
  { id: 'p4', name: 'Violet', color: tokenColors[3], piece: 'bus' },
]

const rollDie = () => 1 + Math.floor(Math.random() * 6) // cosmetic playground only, not the engine

/**
 * Scripted events for the board playground (no rules engine yet). Positions are tracked here
 * the way the engine will later; the board only animates.
 */
export function usePlayground(board: Board | null) {
  const positions = useRef<Record<string, number>>({})
  const queue = useRef<Promise<void>>(Promise.resolve())
  const [active, setActive] = useState(0)
  const [dice, setDice] = useState<[number, number] | null>(null)
  const [auto, setAuto] = useState(false)
  const [pieces, setPieces] = useState<PieceKind[]>(() => PLAYERS.map((p) => p.piece))

  useEffect(() => {
    if (!board) return
    for (const p of PLAYERS) {
      positions.current[p.id] = 0
      board.addToken(p.id, p.color, 0, p.piece)
    }
  }, [board])

  const setPiece = (playerIndex: number, kind: PieceKind) => {
    setPieces((prev) => prev.map((k, i) => (i === playerIndex ? kind : k)))
    board?.setPiece(PLAYERS[playerIndex]!.id, kind)
  }

  /** Runs events one after another; resolves when this batch has finished playing. */
  const enqueue = (events: GameEvent[]): Promise<void> => {
    const run = async () => {
      if (board) for (const e of events) await board.play(e)
    }
    queue.current = queue.current.then(run)
    return queue.current
  }

  const moveBy = (playerIndex: number, steps: number): Promise<void> => {
    const player = PLAYERS[playerIndex]!
    const from = positions.current[player.id]!
    const path = walkPath(from, steps)
    const landing = path[path.length - 1]!
    const events: GameEvent[] = [{ type: 'MOVED', playerId: player.id, path, passedGo: landing < from }]
    if (landing === GO_TO_JAIL_INDEX) {
      events.push({ type: 'JUMPED', playerId: player.id, to: JAIL_INDEX })
      positions.current[player.id] = JAIL_INDEX
    } else {
      positions.current[player.id] = landing
    }
    return enqueue(events)
  }

  const roll = (fixed?: number, playerIndex = active): Promise<void> => {
    const d: [number, number] = fixed ? [Math.ceil(fixed / 2), Math.floor(fixed / 2)] : [rollDie(), rollDie()]
    setDice(d)
    return moveBy(playerIndex, d[0] + d[1])
  }

  const jumpToJail = (): Promise<void> => {
    const player = PLAYERS[active]!
    positions.current[player.id] = JAIL_INDEX
    return enqueue([{ type: 'JUMPED', playerId: player.id, to: JAIL_INDEX }])
  }

  const nextPlayer = () => setActive((a) => (a + 1) % PLAYERS.length)

  // Auto-play: each token rolls in turn until stopped.
  const autoTurn = useEffectEvent(async (playerIndex: number) => {
    setActive(playerIndex)
    await roll(undefined, playerIndex)
  })

  useEffect(() => {
    if (!auto || !board) return
    const run = { stopped: false }
    const loop = async () => {
      let player = 0
      while (!run.stopped) {
        await autoTurn(player)
        await new Promise((r) => setTimeout(r, 250))
        player = (player + 1) % PLAYERS.length
      }
    }
    void loop()
    return () => {
      run.stopped = true
    }
  }, [auto, board])

  return {
    active,
    setActive,
    dice,
    auto,
    setAuto,
    roll: (fixed?: number) => roll(fixed),
    jumpToJail,
    nextPlayer,
    pieces,
    setPiece,
  }
}
