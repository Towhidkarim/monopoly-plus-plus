import type { StoreSettings } from './store.ts'
import type { CursorPref } from '../cursors.ts'

const KEY = 'skyline.prefs'

/** Player preferences that outlive a game: speed, fast bots, reduced motion, bot offers, dice. */
export type Prefs = Pick<
  StoreSettings,
  | 'speed'
  | 'fastBots'
  | 'instant'
  | 'reducedMotion'
  | 'botOffers'
  | 'odds'
  | 'cityLife'
  | 'batterySaver'
  | 'sky'
  | 'cursor'
  | 'dice3d'
>

export function loadPrefs(): Partial<Prefs> {
  const saved: Partial<Prefs> = {}
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    if (isRecord(raw)) {
      const r = raw
      if (typeof r.speed === 'number' && r.speed > 0) saved.speed = r.speed
      if (typeof r.fastBots === 'boolean') saved.fastBots = r.fastBots
      if (typeof r.instant === 'boolean') saved.instant = r.instant
      if (typeof r.reducedMotion === 'boolean') saved.reducedMotion = r.reducedMotion
      if (typeof r.botOffers === 'boolean') saved.botOffers = r.botOffers
      if (typeof r.odds === 'boolean') saved.odds = r.odds
      if (typeof r.cityLife === 'boolean') saved.cityLife = r.cityLife
      if (typeof r.batterySaver === 'boolean') saved.batterySaver = r.batterySaver
      if (typeof r.dice3d === 'boolean') saved.dice3d = r.dice3d
      if (r.cursor === 'game' || r.cursor === 'system') saved.cursor = r.cursor satisfies CursorPref
      if (r.sky === 'auto' || r.sky === 'day' || r.sky === 'night') saved.sky = r.sky
    }
  } catch {
    // Storage blocked or corrupt: defaults.
  }
  // Follow the system setting until the player chooses.
  const system = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  // City life (cars and trains) is on unless reduced motion is, until the player chooses.
  const reducedMotion = saved.reducedMotion ?? system
  return { reducedMotion, cityLife: !reducedMotion, batterySaver: lowPowerDevice(), ...saved }
}

/**
 * Battery saver starts on for a touch device with little memory or few cores (D64), until the
 * player chooses. `deviceMemory` is Chromium only; elsewhere the core count decides.
 */
export function lowPowerDevice(): boolean {
  if (typeof matchMedia !== 'function' || !matchMedia('(pointer: coarse)').matches) return false
  const nav = navigator as Navigator & { deviceMemory?: number }
  return (nav.deviceMemory ?? 8) <= 4 || (navigator.hardwareConcurrency || 8) <= 4
}

/**
 * The one reduced-motion signal for CSS: `data-reduced-motion` on <html> is 'true' when the
 * setting or the operating system asks for less motion (index.css keys off it).
 */
export function syncReducedMotion(setting: boolean): void {
  const os = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  document.documentElement.dataset.reducedMotion = setting || os ? 'true' : 'false'
}

export function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    // Not persisted; fine.
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
