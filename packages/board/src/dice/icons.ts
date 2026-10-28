import { Texture } from 'pixi.js'

/**
 * The Speed die's two icons, drawn in code (DECISIONS.md D62): a side-view bus and a map pin with
 * a star. One atlas, bus on the left half and pin on the right, as opaque ink on transparent;
 * the die shader reads the alpha and prints it in the pip color. The DOM tray draws the same
 * shapes as SVG (apps/web DiceTray).
 */
const CELL = 128

function bus(g: CanvasRenderingContext2D, x0: number): void {
  g.save()
  g.translate(x0, 0)
  g.fillStyle = '#000'
  // Body.
  g.beginPath()
  g.roundRect(8, 30, 112, 60, 12)
  g.fill()
  g.globalCompositeOperation = 'destination-out'
  // Windows: five in a row and a taller windshield at the front.
  for (let i = 0; i < 4; i++) g.fillRect(16 + i * 22, 40, 17, 19)
  g.beginPath()
  g.roundRect(100, 40, 14, 28, 4)
  g.fill()
  // Wheel arches, then the wheels with a hub gap.
  for (const cx of [36, 92]) {
    g.beginPath()
    g.arc(cx, 92, 19, 0, Math.PI * 2)
    g.fill()
  }
  g.globalCompositeOperation = 'source-over'
  for (const cx of [36, 92]) {
    g.beginPath()
    g.arc(cx, 92, 14, 0, Math.PI * 2)
    g.fill()
    g.globalCompositeOperation = 'destination-out'
    g.beginPath()
    g.arc(cx, 92, 5, 0, Math.PI * 2)
    g.fill()
    g.globalCompositeOperation = 'source-over'
  }
  g.restore()
}

function pin(g: CanvasRenderingContext2D, x0: number): void {
  g.save()
  g.translate(x0, 0)
  g.fillStyle = '#000'
  const cx = 64
  const cy = 50
  const r = 33
  const tip = 120
  const a = Math.acos(r / (tip - cy))
  g.beginPath()
  g.moveTo(cx, tip)
  g.lineTo(cx + r * Math.cos(Math.PI / 2 - a), cy + r * Math.sin(Math.PI / 2 - a))
  g.arc(cx, cy, r, Math.PI / 2 - a, Math.PI / 2 + a - Math.PI * 2, true)
  g.closePath()
  g.fill()
  // A star cut out of the head.
  g.globalCompositeOperation = 'destination-out'
  g.beginPath()
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? 17 : 7.5
    const ang = -Math.PI / 2 + (i * Math.PI) / 5
    g.lineTo(cx + rad * Math.cos(ang), cy + rad * Math.sin(ang))
  }
  g.closePath()
  g.fill()
  g.restore()
}

let atlas: Texture | null = null

/** The shared icon atlas (created on first use; needs a DOM canvas). */
export function speedIcons(): Texture {
  if (atlas) return atlas
  const canvas = document.createElement('canvas')
  canvas.width = CELL * 2
  canvas.height = CELL
  const g = canvas.getContext('2d')!
  bus(g, 0)
  pin(g, CELL)
  atlas = Texture.from(canvas)
  return atlas
}
