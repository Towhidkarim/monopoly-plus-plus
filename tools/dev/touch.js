// Dev helper for scripted touch input in Orca: pass this file's text to `orca eval --expression`,
// then call window.skylineTouch.tap(x, y) / .drag(x0, y0, x1, y1) / .cancel(x, y) / .hold(x, y, ms) (CSS px).
// Synthetic pointer events on the board canvas, as a finger sends them (D68).
const canvas = () => document.querySelector('canvas')
const send = (type, x, y, id) =>
  canvas().dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      clientX: x,
      clientY: y,
      pointerId: id,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
    }),
  )
const frame = () => new Promise((r) => requestAnimationFrame(r))

window.skylineTouch = {
  /** A finger resting still: down, a wait (ms), up. The tile opens before the release (D69). */
  async hold(x, y, ms = 600, id = 11) {
    send('pointerdown', x, y, id)
    await new Promise((r) => setTimeout(r, ms))
    const opened = window.skylineStore?.board?.selected ?? null
    send('pointerup', x, y, id)
    return opened
  },
  tap(x, y, id = 11) {
    send('pointerdown', x, y, id)
    send('pointerup', x, y, id)
  },
  /** A touch the browser takes back (edge swipe, system gesture): down, then cancel. */
  cancel(x, y, id = 12) {
    send('pointerdown', x, y, id)
    send('pointercancel', x, y, id)
  },
  async drag(x0, y0, x1, y1, id = 13) {
    send('pointerdown', x0, y0, id)
    for (let i = 1; i <= 10; i++) {
      send('pointermove', x0 + ((x1 - x0) * i) / 10, y0 + ((y1 - y0) * i) / 10, id)
      await frame()
    }
    send('pointerup', x1, y1, id)
  },
}
