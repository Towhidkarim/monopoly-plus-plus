import { useCallback, useEffect, useId, useLayoutEffect, useState, type RefObject } from 'react'

/**
 * Focus handling shared by every dialog layer (buy, auction, trade, offer, debt, My city, help,
 * menu, game over, card popup).
 *
 * - On open, focus moves inside: the element marked `data-autofocus`, else the first control,
 *   else the dialog itself (it gets `tabIndex={-1}`).
 * - While `modal`, Tab and Shift+Tab wrap inside the dialog.
 * - On close, focus returns to whatever had it before the dialog opened (if that is still on
 *   the page).
 *
 * Escape is not handled here: GameScreen owns one handler that closes only the top-most
 * closable layer (see `closeTopLayer`).
 */

const TABBABLE =
  'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

/** Tabbable descendants of `root`, in DOM order, skipping hidden and inert ones. */
export function tabbables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    (el) =>
      el.tabIndex >= 0 &&
      !el.closest('[inert], [hidden], [aria-hidden="true"]') &&
      (el.offsetParent !== null || el.getClientRects().length > 0),
  )
}

/** Where Tab goes from `current` in a list of `n` stops: wraps at both ends. Pure, for tests. */
export function nextTabIndex(current: number, n: number, back: boolean): number {
  if (n <= 0) return -1
  if (current < 0) return back ? n - 1 : 0
  return (current + (back ? n - 1 : 1)) % n
}

/** Open modal dialogs, oldest first: only the last one traps Tab. */
const modalStack: HTMLElement[] = []

export interface DialogProps {
  ref: (el: HTMLElement | null) => void
  /** Left out while the layer is not a dialog (`active: false`). */
  role?: 'dialog'
  'aria-modal'?: true
  'aria-labelledby'?: string
  tabIndex: -1
}

/**
 * Spread the result on the dialog's root: `<section {...dialog.props}>`, and give the title
 * element `id={dialog.titleId}`. `active: false` skips everything (for layers that are only
 * sometimes a dialog, like the card popup).
 */
export function useDialogFocus({
  modal = true,
  active = true,
  also,
}: {
  modal?: boolean
  active?: boolean
  /** An existing ref to the same element, kept in step. */
  also?: RefObject<HTMLElement | null>
} = {}): {
  props: DialogProps
  titleId: string
} {
  // A state, not a ref: panels stay mounted and render nothing until they open, so the effect
  // must run when the element appears.
  const [root, setRoot] = useState<HTMLElement | null>(null)
  const titleId = useId()
  // Stable, or React would detach and re-attach it on every render.
  const ref = useCallback((el: HTMLElement | null) => setRoot(el), [])
  useLayoutEffect(() => {
    if (also) also.current = root
  }, [also, root])

  useEffect(() => {
    if (!active || !root) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const first =
      root.querySelector<HTMLElement>('[data-autofocus]:not(:disabled)') ?? tabbables(root)[0] ?? root
    first.focus({ preventScroll: true })

    if (modal) modalStack.push(root)
    const onKey = (e: KeyboardEvent) => {
      if (!modal || e.key !== 'Tab' || modalStack[modalStack.length - 1] !== root) return
      const list = tabbables(root)
      if (list.length === 0) {
        e.preventDefault()
        root.focus({ preventScroll: true })
        return
      }
      const here = document.activeElement
      const at = here instanceof HTMLElement ? list.indexOf(here) : -1
      const edge = e.shiftKey ? at <= 0 : at === list.length - 1
      if (at < 0 || edge) {
        e.preventDefault()
        list[nextTabIndex(at, list.length, e.shiftKey)]!.focus({ preventScroll: true })
      }
    }
    // On the document, so Tab also comes back in when focus was lost (a clicked backdrop, a removed button).
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      const at = modalStack.indexOf(root)
      if (at >= 0) modalStack.splice(at, 1)
      // Only give focus back if it was left inside the dialog (or nowhere); never steal it from a newer dialog.
      const now = document.activeElement
      const lost = !now || now === document.body || root.contains(now)
      if (lost && opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [active, modal, root])

  return {
    props: {
      ref,
      ...(active
        ? {
            role: 'dialog' as const,
            ...(modal ? { 'aria-modal': true as const } : {}),
            'aria-labelledby': titleId,
          }
        : {}),
      tabIndex: -1,
    },
    titleId,
  }
}
