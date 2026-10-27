import { Container, Text } from 'pixi.js'
import { shade } from '../palette.ts'

/** One space in the landing-odds overlay (computed by the shell from the game state). */
export interface OddsMark {
  space: number
  /** 0..1 chance of ending the roll here. */
  p: number
  /** Short text: the chance ("17%") or the rent due ("₵250"). */
  label: string
  /** Owner's color where rent is due; null for a plain chance. */
  color: number | null
}

const FONT = ['Sora Variable', 'Bricolage Grotesque Variable', 'system-ui', 'sans-serif']
const INK = 0x0b1426
/** Labels pop in one after another along the path, this far apart. */
const STAGGER_MS = 35

/**
 * The labels of the landing-odds overlay, floating above their tiles in world space (above
 * buildings, below the dice). Positions come from the board every frame (tiles bounce).
 */
export class OddsLabels {
  readonly container = new Container({ eventMode: 'none' })
  private labels: { space: number; text: Text; age: number; delay: number }[] = []
  private leaving = false

  set(marks: readonly OddsMark[] | null): void {
    if (!marks || marks.length === 0) {
      this.leaving = true
      return
    }
    this.clear()
    this.leaving = false
    marks.forEach((m, i) => {
      const rent = m.color !== null
      const text = new Text({
        text: m.label,
        resolution: 2,
        style: {
          fontFamily: FONT,
          fontWeight: '800',
          fontSize: rent ? 26 : 19,
          fill: rent ? 0xffffff : 0xf8fafc,
          stroke: { color: rent ? shade(m.color!, 0.3) : INK, width: rent ? 6 : 5, join: 'round' },
        },
      })
      text.anchor.set(0.5, 1)
      text.alpha = 0
      this.container.addChild(text)
      this.labels.push({ space: m.space, text, age: 0, delay: i * STAGGER_MS })
    })
  }

  /** Places each label at its tile top (`at`) with a little pop, or fades them all out. */
  update(dtMs: number, at: (space: number) => { x: number; y: number }, reduced: boolean): void {
    for (const l of this.labels) {
      l.age += dtMs
      const p = at(l.space)
      if (this.leaving) {
        l.text.alpha = Math.max(0, l.text.alpha - dtMs / 160)
      } else {
        const k = Math.min(1, Math.max(0, (l.age - l.delay) / 220))
        l.text.alpha = k
        // A small overshoot as it appears.
        const s = reduced ? 1 : 0.6 + 0.4 * k + 0.12 * Math.sin(Math.PI * k)
        l.text.scale.set(s)
      }
      l.text.position.set(p.x, p.y - 10)
    }
    if (this.leaving && this.labels.every((l) => l.text.alpha <= 0)) this.clear()
  }

  private clear(): void {
    for (const l of this.labels) l.text.destroy()
    this.labels = []
  }
}
