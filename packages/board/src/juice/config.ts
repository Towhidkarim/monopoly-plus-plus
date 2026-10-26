/**
 * Every tuned board-feel number in one place (ROADMAP Milestone 5). The playground edits a live
 * copy; when a value feels right, paste it back here. Heights are in z units (1 = one tile
 * depth), distances in world pixels at zoom 1, times in milliseconds at 1x speed.
 */
export const DEFAULT_JUICE = {
  hop: {
    /** Peak hop height. */
    height: 0.45,
    /** Duration of one tile hop. */
    stepMs: 190,
    /** Squash and stretch strength (0 = rigid). */
    squash: 1,
  },
  shake: {
    /** Largest offset at full trauma. Felt offset is trauma squared, so small hits stay subtle. */
    maxPx: 14,
    /** Trauma lost per second. */
    decay: 2.2,
    /** Wobble speed. */
    hz: 18,
  },
  purchase: {
    /** Upward kick of the tile spring when it changes hands. */
    lift: 3.2,
    /** Sparkles thrown from the tile in the buyer's color. */
    sparkles: 14,
    trauma: 0.12,
  },
  build: {
    /** A new house falls from this height onto its slot. */
    dropHeight: 1.3,
    /** Fall acceleration in z units per second squared. */
    gravity: 16,
    /** Fraction of speed kept on the first bounce. */
    bounce: 0.28,
    dust: 9,
    trauma: 0.18,
    hotelTrauma: 0.34,
  },
  land: {
    /** Trauma from a long jump landing (cards, go to the Lockup). */
    jumpTrauma: 0.22,
  },
  celebrate: {
    /** Delay between tiles in the set lighting up one after another. */
    pulseStepMs: 110,
    /** Tile spring kick per pulse. */
    lift: 3.6,
    /** Confetti pieces per tile. */
    confetti: 22,
    hitStopMs: 130,
    trauma: 0.32,
    /** Hold after the last pulse before play continues. */
    holdMs: 420,
  },
  punch: {
    /** Big rent: hit-stop and shake scale with how big the hit was (0..1). */
    hitStopMs: 110,
    trauma: 0.42,
  },
  particles: {
    gravity: 1500,
    /** Upward launch speed range. */
    speed: 900,
    lifeMs: 1100,
  },
  dice: {
    /** Fall acceleration, board units per second squared (1 unit = a tile's short side). */
    gravity: 40,
    /** Fraction of impact speed kept on a bounce. */
    restitution: 0.4,
    /** Grip against the board (Coulomb friction). */
    friction: 0.55,
    /** Initial spin, radians per second. */
    spin: 14,
    /** Horizontal throw speed, board units per second. */
    throwSpeed: 9,
    /** Edge length of a die in board units. */
    size: 0.62,
    /** Edge and corner radius as a fraction of the half edge (0 = sharp). */
    round: 0.24,
    /** Release-to-rest window at 1x; the solver picks a throw that fits it. */
    minMs: 1100,
    maxMs: 1600,
    /** Hit-stop and shake on the first hard impact. */
    hitStopMs: 50,
    trauma: 0.12,
    /** Pause at rest before the total pops, how long it shows, and the flight to the tray. */
    settleMs: 220,
    popMs: 700,
    flyMs: 520,
    /** Camera zoom on the throw area in the game, relative to fitting the whole board. */
    focusZoom: 1.7,
  },
  camera: {
    /** Follow zoom while a token travels, relative to fitting the whole board. */
    followZoom: 1.5,
  },
}

export type JuiceConfig = typeof DEFAULT_JUICE

/** Deep copy of the defaults (configs are mutated live by the playground). */
export function cloneJuice(base: JuiceConfig = DEFAULT_JUICE): JuiceConfig {
  return structuredClone(base)
}
