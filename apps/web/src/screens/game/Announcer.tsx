import { useEffect, useRef, useState } from 'react'
import type { GameStore, Snapshot } from '../../game/store.ts'
import { fmtMoney } from './format.ts'
import type { TurnView } from './turn.ts'

/** How long messages are gathered before they are spoken together. */
const BATCH_MS = 350

/**
 * The one polite live region for the game: whose turn it is and every money change or big
 * moment, in order. Messages that arrive close together are read as one. Everything visual
 * that also says these things (the turn banner, callouts, number pops) is not a live region,
 * so nothing is announced twice.
 */
export function Announcer({ snap, store, turn }: { snap: Snapshot; store: GameStore; turn: TurnView }) {
  const [text, setText] = useState('')
  const queue = useRef<string[]>([])
  const timer = useRef<number | undefined>(undefined)

  const say = useRef((line: string) => {
    queue.current.push(line)
    if (timer.current !== undefined) return
    timer.current = window.setTimeout(() => {
      timer.current = undefined
      setText(queue.current.splice(0).join('. '))
    }, BATCH_MS)
  })

  useEffect(() => {
    const name = (id: string) => store.getSnapshot().state.players.find((p) => p.id === id)?.name ?? id
    const off = store.onFx((fx) => {
      if (fx.kind === 'pop') {
        if (fx.delta !== 0)
          say.current(
            `${name(fx.playerId)} ${fx.delta > 0 ? 'gains' : 'pays'} ${fmtMoney(Math.abs(fx.delta))}`,
          )
      } else if (fx.kind === 'transfer') {
        say.current(`${name(fx.from)} pays ${name(fx.to)} ${fmtMoney(fx.amount)}`)
      } else if (fx.kind === 'callout') {
        say.current(fx.detail ? `${fx.title}. ${fx.detail}` : fx.title)
      }
    })
    return () => {
      off()
      window.clearTimeout(timer.current)
      timer.current = undefined
    }
  }, [store])

  // The turn changed hands (or a new round began).
  const turnKey = `${snap.presented.current}-${snap.presented.round}-${snap.presented.over}`
  const seen = useRef<string | null>(null)
  useEffect(() => {
    if (seen.current !== null && seen.current !== turnKey) {
      say.current(turn.subtitle ? `${turn.title}. ${turn.subtitle}` : turn.title)
    }
    seen.current = turnKey
    // Only a new turn speaks; later subtitle changes do not.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [turnKey])

  return (
    <output aria-live="polite" aria-atomic="true" className="sr-only">
      {text}
    </output>
  )
}
