/** Shared motion for the end of a buy or an auction: the card flies to the new owner's chip. */

/** How long a SOLD stamp holds before the card leaves. */
export const SOLD_HOLD_MS = 450
export const FLY_MS = 520
export const FADE_MS = 240

const chipOf = (playerId: string): HTMLElement | null =>
  document.querySelector<HTMLElement>(`[data-seat-card="${CSS.escape(playerId)}"]`)

/** A small squash-and-bounce on a player's chip in the top bar. */
function bounceChip(playerId: string): void {
  chipOf(playerId)?.animate(
    [
      { transform: 'scale(1)' },
      { transform: 'scale(1.09)', offset: 0.35 },
      { transform: 'scale(0.97)', offset: 0.65 },
      { transform: 'scale(1)' },
    ],
    { duration: 380, easing: 'ease-out' },
  )
}

/**
 * Shrinks `el` and flies it to the chip of `playerId` (transform and opacity only), then bounces
 * the chip. With reduced motion, or when the chip is not on screen, it just fades. `done` always
 * runs once: if the animation never finishes (throttled tab) a timer calls it.
 * Returns a cancel function that calls neither.
 */
export function flyToChip(
  el: HTMLElement | null,
  playerId: string | null,
  reduced: boolean,
  done: () => void,
): () => void {
  const chip = playerId ? chipOf(playerId) : null
  let finished = false
  const end = () => {
    if (finished) return
    finished = true
    // The caller unmounts the card; hide it first so a late frame can't flash it back.
    if (el) el.style.opacity = '0'
    if (playerId && chip && !reduced) bounceChip(playerId)
    done()
  }
  if (!el) {
    end()
    return () => {
      finished = true
    }
  }
  let anim: Animation
  let ms = FADE_MS
  if (reduced || !chip) {
    anim = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: 'ease-out' })
  } else {
    ms = FLY_MS
    const a = el.getBoundingClientRect()
    const b = chip.getBoundingClientRect()
    const dx = b.left + b.width / 2 - (a.left + a.width / 2)
    const dy = b.top + b.height / 2 - (a.top + a.height / 2)
    anim = el.animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: 'translate(0, -18px) scale(1.04)', opacity: 1, offset: 0.18 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.12)`, opacity: 0.2 },
      ],
      { duration: FLY_MS, easing: 'cubic-bezier(0.5, 0, 0.75, 0.4)' },
    )
  }
  anim.onfinish = end
  const timer = window.setTimeout(end, ms + 120)
  return () => {
    finished = true
    window.clearTimeout(timer)
    anim.cancel()
  }
}
