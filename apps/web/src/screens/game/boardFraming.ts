import { useEffect } from 'react'
import type { BoardHandle } from '@skyline/board'
import { insetsFrom } from '../../layout.ts'

/** Desktop framing: the board between the HUD and turn banner above and the action dock below. */
const WIDE_INSETS = { top: 130, right: 0, bottom: 110, left: 0 }

/**
 * Frames the board in the part of the screen the shell leaves free. Desktop keeps the tuned
 * insets; the compact layout measures the bars marked `data-inset="top"` / `"bottom"` (D64).
 */
export function useBoardFraming(handle: BoardHandle | null, compact: boolean): void {
  useEffect(() => {
    if (!handle) return
    if (!compact) {
      handle.board.setInsets(WIDE_INSETS)
      return
    }
    const canvas = handle.app.canvas
    const host = canvas.parentElement?.parentElement ?? canvas
    let last = ''
    const measure = () => {
      const span = (el: Element) => {
        const r = el.getBoundingClientRect()
        return { top: r.top, bottom: r.bottom }
      }
      const bars = (side: string) => [...host.querySelectorAll(`[data-inset="${side}"]`)].map(span)
      const insets = insetsFrom(span(canvas), bars('top'), bars('bottom'))
      const key = `${insets.top},${insets.bottom}`
      if (key === last) return
      last = key
      handle.board.setInsets(insets)
    }
    // At most one measurement a frame: mutations come in bursts while the shell animates.
    let frame = 0
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(() => ((frame = 0), measure()))
    }
    // Bars change size with the phase (dock buttons) and the screen (rotation, browser bars).
    const observer = new ResizeObserver(schedule)
    observer.observe(canvas)
    const watch = () => {
      for (const el of host.querySelectorAll('[data-inset]')) observer.observe(el)
      schedule()
    }
    measure()
    watch()
    // Bars mount and unmount with the phase: watch new ones as they appear.
    const mutations = new MutationObserver(watch)
    mutations.observe(host, { childList: true, subtree: true })
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      mutations.disconnect()
    }
  }, [handle, compact])
}
