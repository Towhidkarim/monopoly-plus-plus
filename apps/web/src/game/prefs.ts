import type { StoreSettings } from './store.ts'

const KEY = 'skyline.prefs'

/** Player preferences that outlive a game: speed, fast bots, reduced motion, bot offers. */
export type Prefs = Pick<
  StoreSettings,
  'speed' | 'fastBots' | 'instant' | 'reducedMotion' | 'botOffers' | 'cityLife' | 'sky'
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
      if (typeof r.cityLife === 'boolean') saved.cityLife = r.cityLife
      if (r.sky === 'auto' || r.sky === 'day' || r.sky === 'night') saved.sky = r.sky
    }
  } catch {
    // Storage blocked or corrupt: defaults.
  }
  // Follow the system setting until the player chooses.
  const system = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  // City life (cars and trains) is on unless reduced motion is, until the player chooses.
  const reducedMotion = saved.reducedMotion ?? system
  return { reducedMotion, cityLife: !reducedMotion, ...saved }
}

export function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    // Not persisted; fine.
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
