import { useCallback, useEffect, useRef, useState } from 'react'
import { sound } from '../../audio/engine.ts'
import { confirmStep } from './confirmPress.ts'

/** How long the pointer may stay off the button before it disarms. */
const LEAVE_MS = 600

/**
 * Inline "press again" confirmation for actions that lose value. The first press arms, a second
 * press while armed runs `onConfirm`. It disarms on timeout (a real timer, so throttled tabs are
 * fine), Esc (swallowed so it does not also close the drawer), blur, the pointer staying away for
 * 600 ms, or `enabled` turning false. Spread `bind` on the button.
 */
export function useConfirmPress(
  onConfirm: () => void,
  { timeoutMs = 2500, enabled = true }: { timeoutMs?: number; enabled?: boolean } = {},
) {
  const [armed, setArmed] = useState(false)
  const armedRef = useRef(false)
  const confirmRef = useRef(onConfirm)
  useEffect(() => {
    confirmRef.current = onConfirm
  })
  const leaveTimer = useRef(0)

  const disarm = useCallback(() => {
    window.clearTimeout(leaveTimer.current)
    armedRef.current = false
    setArmed(false)
  }, [])

  const press = () => {
    const step = confirmStep(armedRef.current, 'press', enabled)
    armedRef.current = step.armed
    setArmed(step.armed)
    if (step.confirm) {
      sound.play('ui.click')
      confirmRef.current()
    } else if (step.armed) {
      // A softer, higher tick than the confirming click.
      sound.play('ui.click', { pitch: 5, gain: 0.55 })
    }
  }

  useEffect(() => {
    if (!enabled && armedRef.current) disarm()
  }, [enabled, disarm])

  useEffect(() => {
    if (!armed) return
    const timer = window.setTimeout(disarm, timeoutMs)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      e.preventDefault()
      disarm()
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [armed, timeoutMs, disarm])

  useEffect(() => () => window.clearTimeout(leaveTimer.current), [])

  const bind = {
    onBlur: disarm,
    onPointerEnter: () => window.clearTimeout(leaveTimer.current),
    onPointerLeave: () => {
      if (!armedRef.current) return
      window.clearTimeout(leaveTimer.current)
      leaveTimer.current = window.setTimeout(disarm, LEAVE_MS)
    },
  }
  return { armed, press, disarm, bind }
}
