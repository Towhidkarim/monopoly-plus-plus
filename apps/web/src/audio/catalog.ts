/**
 * Every game sound in one place (ROADMAP Milestone 5). Each sound has a few variants to compare
 * on the sound board (#sounds); `pick` is the one the game plays. Variants are layers of
 * recorded samples (Kenney Casino Audio, CC0, see docs/ASSETS.md) and code-generated voices.
 *
 * Direction: toy-like and physical (dice, chips, cards on a table), warm and glassy chimes for
 * money and success, soft room reverb on everything. No raw square waves, nothing 8-bit.
 */

export type Bus = 'sfx' | 'ui'

interface LayerBase {
  /** Start offset in ms (stretched by the variant's `length`). */
  at?: number
  gain?: number
}

export type Layer = LayerBase &
  (
    | {
        kind: 'sample'
        /** Files under /audio/; one is picked at random each play. */
        files: readonly string[]
        /** Playback rate multiplier on top of the sound's pitch. */
        rate?: number
      }
    | {
        kind: 'tone'
        wave: OscillatorType
        freq: number
        /** Glide target frequency. */
        to?: number
        glideMs?: number
        attackMs?: number
        decayMs: number
        lowpass?: number
      }
    | {
        /** FM bell: integer `ratio` chimes, odd ratios clank. `index` is brightness. */
        kind: 'bell'
        freq: number
        ratio: number
        index: number
        decayMs: number
      }
    | {
        kind: 'noise'
        filter: BiquadFilterType
        freq: number
        to?: number
        q?: number
        attackMs?: number
        decayMs: number
      }
  )

/** Per-variant mix, the sliders on the sound board. */
export interface Mix {
  /** Output level, 0..2. */
  gain: number
  /** Semitones. */
  pitch: number
  /** Envelope and timing stretch, 0.5..2. */
  length: number
  /** Brightness 0..1 (a low-pass from 600 Hz to fully open). */
  tone: number
  /** Room reverb send, 0..1. */
  reverb: number
  /** Random pitch per play, +/- semitones, so repeats never sound identical. */
  vary: number
}

export const DEFAULT_MIX: Mix = { gain: 1, pitch: 0, length: 1, tone: 1, reverb: 0.18, vary: 0.4 }

export interface Variant {
  name: string
  layers: readonly Layer[]
  mix?: Partial<Mix>
}

export interface SoundDef {
  label: string
  group: string
  bus: Bus
  /** When it plays, shown on the sound board. */
  when: string
  variants: readonly Variant[]
  pick: number
}

// ---- building blocks -------------------------------------------------------

/** Frequency of a note `semi` semitones from C5. */
const n = (semi: number) => 523.25 * 2 ** (semi / 12)

const files = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, i) => `casino/${prefix}-${i + 1}.ogg`)

const DICE_THROW = files('dice-throw', 3)
const DIE_THROW = files('die-throw', 4)
const CHIP_LAY = files('chip-lay', 3)
const CHIPS_COLLIDE = files('chips-collide', 4)
const CHIPS_STACK = files('chips-stack', 6)
const CHIPS_HANDLE = files('chips-handle', 3)
const CARD_PLACE = files('card-place', 4)
const CARD_SLIDE = files('card-slide', 4)
const CARD_SHOVE = files('card-shove', 2)

const sample = (list: readonly string[], o: Partial<LayerBase> & { rate?: number } = {}): Layer => ({
  kind: 'sample',
  files: list,
  ...o,
})

/** Warm chime: near-harmonic FM, rings like a glass bell. */
const chime = (semi: number, at = 0, gain = 0.25, decayMs = 800): Layer => ({
  kind: 'bell',
  freq: n(semi),
  ratio: 3.01,
  index: 1.1,
  decayMs,
  at,
  gain,
})

/** Glassy ping: higher ratio, cleaner, shorter. */
const glass = (semi: number, at = 0, gain = 0.2, decayMs = 450): Layer => ({
  kind: 'bell',
  freq: n(semi),
  ratio: 5,
  index: 0.6,
  decayMs,
  at,
  gain,
})

/** Wooden mallet: a sine with a quick pitch drop and a click on top (marimba / wood block). */
const wood = (semi: number, at = 0, gain = 0.35, decayMs = 110): Layer[] => [
  { kind: 'tone', wave: 'sine', freq: n(semi), to: n(semi) * 0.94, glideMs: 40, decayMs, at, gain },
  { kind: 'bell', freq: n(semi), ratio: 4, index: 0.5, decayMs: decayMs * 0.5, at, gain: gain * 0.4 },
  { kind: 'noise', filter: 'bandpass', freq: 2400, q: 1.2, decayMs: 14, at, gain: gain * 0.35 },
]

/** Soft low thud, a token or block landing on the board. */
const thud = (at = 0, gain = 0.5, from = 170, to = 80, decayMs = 140): Layer => ({
  kind: 'tone',
  wave: 'sine',
  freq: from,
  to,
  glideMs: decayMs * 0.7,
  decayMs,
  at,
  gain,
})

const whoosh = (from: number, to: number, decayMs: number, gain = 0.18, at = 0): Layer => ({
  kind: 'noise',
  filter: 'bandpass',
  freq: from,
  to,
  q: 1.4,
  attackMs: decayMs * 0.35,
  decayMs,
  at,
  gain,
})

const shimmer = (at = 0, gain = 0.05, decayMs = 900): Layer => ({
  kind: 'noise',
  filter: 'highpass',
  freq: 6500,
  attackMs: 120,
  decayMs,
  at,
  gain,
})

const arp = (
  notes: readonly number[],
  stepMs: number,
  voice: (semi: number, at: number) => Layer | Layer[],
) => notes.flatMap((semi, i) => voice(semi, i * stepMs))

const OFF: Variant = { name: 'Off', layers: [] }

// ---- the catalog -----------------------------------------------------------

export const CATALOG = {
  // Dice
  'dice.roll': {
    label: 'Dice roll',
    group: 'Dice',
    bus: 'sfx',
    when: 'Dice tumble onto the table',
    pick: 1,
    variants: [
      { name: 'Pair throw', layers: [sample(DICE_THROW, { gain: 0.9 })] },
      {
        name: 'Two dice',
        layers: [sample(DIE_THROW, { gain: 0.8 }), sample(DIE_THROW, { at: 60, gain: 0.7, rate: 1.06 })],
      },
      {
        name: 'Throw + clack',
        layers: [
          sample(DICE_THROW, { gain: 0.8 }),
          { kind: 'noise', filter: 'bandpass', freq: 3200, q: 3, decayMs: 25, at: 420, gain: 0.12 },
        ],
      },
    ],
  },
  'dice.doubles': {
    label: 'Doubles',
    group: 'Dice',
    bus: 'sfx',
    when: 'Both dice match',
    pick: 0,
    variants: [
      {
        name: 'Sparkle run',
        layers: [...arp([12, 16, 19, 24], 60, (s, at) => glass(s, at, 0.2)), shimmer(0, 0.04)],
      },
      { name: 'Two chimes', layers: [chime(16, 0, 0.22), chime(23, 90, 0.2)] },
      OFF,
    ],
  },

  // Movement
  'move.step': {
    label: 'Hop step',
    group: 'Movement',
    bus: 'sfx',
    when: 'Each tile a hopping piece passes (rises in pitch)',
    pick: 0,
    variants: [
      { name: 'Wood tap', layers: wood(-5, 0, 0.3, 90), mix: { vary: 0.15 } },
      { name: 'Chip tap', layers: [sample(CHIP_LAY, { gain: 0.45, rate: 1.15 })], mix: { vary: 0.2 } },
      { name: 'Card tap', layers: [sample(CARD_PLACE, { gain: 0.4, rate: 1.5 })], mix: { vary: 0.2 } },
    ],
  },
  'move.roll': {
    label: 'Vehicle roll',
    group: 'Movement',
    bus: 'sfx',
    when: 'Each tile a taxi or bus rolls over',
    pick: 0,
    variants: [
      {
        name: 'Soft tick',
        layers: [
          { kind: 'noise', filter: 'bandpass', freq: 1300, q: 2, decayMs: 26, gain: 0.14 },
          { kind: 'tone', wave: 'triangle', freq: n(-12), decayMs: 40, gain: 0.08 },
        ],
        mix: { reverb: 0.1 },
      },
      { name: 'Card flick', layers: [sample(CARD_SLIDE, { gain: 0.22, rate: 1.8 })] },
      OFF,
    ],
  },
  'move.land': {
    label: 'Landing',
    group: 'Movement',
    bus: 'sfx',
    when: 'A piece arrives on its final tile',
    pick: 0,
    variants: [
      { name: 'Chip + thud', layers: [sample(CHIPS_STACK, { gain: 0.55 }), thud(0, 0.4)] },
      {
        name: 'Thud',
        layers: [thud(0, 0.6), { kind: 'noise', filter: 'lowpass', freq: 700, decayMs: 70, gain: 0.25 }],
      },
      { name: 'Card slap', layers: [sample(CARD_PLACE, { gain: 0.7, rate: 0.8 }), thud(0, 0.3)] },
    ],
  },
  'move.liftoff': {
    label: 'Lift-off',
    group: 'Movement',
    bus: 'sfx',
    when: 'A drone or balloon rises, or a piece jumps (cards, Lockup)',
    pick: 0,
    variants: [
      { name: 'Whoosh up', layers: [whoosh(400, 1800, 320, 0.16)] },
      {
        name: 'Soft rise',
        layers: [
          { kind: 'tone', wave: 'sine', freq: n(-12), to: n(0), decayMs: 300, attackMs: 80, gain: 0.12 },
          whoosh(600, 1600, 260, 0.08),
        ],
      },
      OFF,
    ],
  },

  // Money
  'money.gain': {
    label: 'Money in',
    group: 'Money',
    bus: 'sfx',
    when: 'You collect: salary, rent, card payouts',
    pick: 0,
    variants: [
      {
        name: 'Cha-ching',
        layers: [
          { kind: 'noise', filter: 'highpass', freq: 3000, decayMs: 40, gain: 0.2 },
          sample(CHIPS_COLLIDE, { gain: 0.5 }),
          chime(19, 60, 0.26, 700),
          chime(24, 130, 0.24, 900),
        ],
      },
      {
        name: 'Chips + glass',
        layers: [sample(CHIPS_STACK, { gain: 0.6 }), glass(16, 40, 0.18), glass(24, 110, 0.18)],
      },
      {
        name: 'Chips only',
        layers: [sample(CHIPS_COLLIDE, { gain: 0.6 }), sample(CHIPS_HANDLE, { at: 70, gain: 0.4 })],
      },
    ],
  },
  'money.pay': {
    label: 'Money out',
    group: 'Money',
    bus: 'sfx',
    when: 'You pay: rent, tax, fines',
    pick: 0,
    variants: [
      {
        name: 'Chips + low chime',
        layers: [sample(CHIPS_HANDLE, { gain: 0.55 }), chime(7, 40, 0.12, 400), chime(0, 120, 0.11, 500)],
      },
      { name: 'Chips only', layers: [sample(CHIPS_HANDLE, { gain: 0.6 })] },
      {
        name: 'Soft drop',
        layers: [sample(CHIP_LAY, { gain: 0.5, rate: 0.85 }), ...wood(-12, 30, 0.2, 140)],
      },
    ],
  },
  'money.coin': {
    label: 'Coin lands',
    group: 'Money',
    bus: 'sfx',
    when: 'Each flying coin reaches its player (rises in pitch)',
    pick: 0,
    variants: [
      { name: 'Chip tick', layers: [sample(CHIP_LAY, { gain: 0.3, rate: 1.3 })], mix: { vary: 0.1 } },
      { name: 'Glass ping', layers: [glass(24, 0, 0.12, 220)], mix: { vary: 0 } },
      {
        name: 'Chip + ping',
        layers: [sample(CHIP_LAY, { gain: 0.22, rate: 1.3 }), glass(24, 0, 0.07, 200)],
        mix: { vary: 0 },
      },
    ],
  },
  'money.big': {
    label: 'Big hit',
    group: 'Money',
    bus: 'sfx',
    when: 'Big rent changes hands (with screen shake)',
    pick: 0,
    variants: [
      {
        name: 'Boom + chips',
        layers: [
          thud(0, 0.7, 120, 50, 380),
          { kind: 'noise', filter: 'lowpass', freq: 1200, decayMs: 200, gain: 0.25 },
          sample(CHIPS_STACK, { at: 60, gain: 0.6 }),
          sample(CHIPS_COLLIDE, { at: 140, gain: 0.5 }),
        ],
      },
      {
        name: 'Gong',
        layers: [
          thud(0, 0.5, 110, 55, 300),
          { kind: 'bell', freq: n(-24), ratio: 1.4, index: 3, decayMs: 1100, gain: 0.3 },
        ],
      },
      OFF,
    ],
  },

  // Property
  'prop.buy': {
    label: 'Buy',
    group: 'Property',
    bus: 'sfx',
    when: 'A property changes owner (bought or won at auction)',
    pick: 0,
    variants: [
      {
        name: 'Stamp + chime',
        layers: [
          sample(CARD_PLACE, { gain: 0.7, rate: 0.9 }),
          { kind: 'noise', filter: 'lowpass', freq: 900, decayMs: 60, gain: 0.25 },
          ...arp([12, 16, 19], 70, (s, at) => chime(s, 80 + at, 0.2, 600)),
        ],
      },
      {
        name: 'Stamp + dyad',
        layers: [
          sample(CARD_PLACE, { gain: 0.7, rate: 0.9 }),
          chime(19, 70, 0.2, 900),
          chime(24, 70, 0.16, 900),
        ],
      },
      {
        name: 'Chips + run',
        layers: [
          sample(CHIPS_STACK, { gain: 0.6 }),
          ...arp([12, 16, 19], 70, (s, at) => glass(s, 60 + at, 0.18)),
        ],
      },
    ],
  },
  'auction.start': {
    label: 'Auction opens',
    group: 'Property',
    bus: 'sfx',
    when: 'A property goes to auction',
    pick: 0,
    variants: [
      {
        name: 'Two knocks',
        layers: [...wood(-17, 0, 0.45, 80), ...wood(-17, 130, 0.4, 80)],
        mix: { vary: 0 },
      },
      { name: 'Knock + bell', layers: [...wood(-17, 0, 0.45, 80), chime(12, 90, 0.18, 700)] },
    ],
  },
  'auction.bid': {
    label: 'Bid',
    group: 'Property',
    bus: 'sfx',
    when: 'Someone raises the bid (rises as bids climb)',
    pick: 0,
    variants: [
      { name: 'Chip', layers: [sample(CHIP_LAY, { gain: 0.5 })], mix: { vary: 0.1 } },
      { name: 'Wood tick', layers: wood(0, 0, 0.22, 70), mix: { vary: 0 } },
    ],
  },
  'auction.heart': {
    label: 'Bidding war',
    group: 'Property',
    bus: 'sfx',
    when: 'A soft heartbeat under each bid once the bidding heats up',
    pick: 0,
    variants: [
      {
        name: 'Lub-dub',
        layers: [thud(0, 0.42, 110, 55, 150), thud(170, 0.3, 100, 52, 170)],
        mix: { vary: 0 },
      },
      { name: 'Single beat', layers: [thud(0, 0.4, 120, 60, 190)], mix: { vary: 0 } },
    ],
  },
  'auction.sold': {
    label: 'Sold',
    group: 'Property',
    bus: 'sfx',
    when: 'The gavel falls',
    pick: 0,
    variants: [
      { name: 'Gavel', layers: [...wood(-19, 0, 0.6, 120), thud(0, 0.4, 150, 70, 120)], mix: { vary: 0 } },
      OFF,
    ],
  },
  'prop.mortgage': {
    label: 'Mortgage',
    group: 'Property',
    bus: 'sfx',
    when: 'A property is mortgaged',
    pick: 0,
    variants: [
      {
        name: 'Card + dip',
        layers: [
          sample(CARD_SHOVE, { gain: 0.5, rate: 0.85 }),
          { kind: 'tone', wave: 'triangle', freq: n(0), to: n(-7), glideMs: 200, decayMs: 260, gain: 0.1 },
        ],
      },
      { name: 'Card only', layers: [sample(CARD_SHOVE, { gain: 0.55, rate: 0.85 })] },
    ],
  },
  'prop.unmortgage': {
    label: 'Lift mortgage',
    group: 'Property',
    bus: 'sfx',
    when: 'A mortgage is paid off',
    pick: 0,
    variants: [
      {
        name: 'Card + rise',
        layers: [
          sample(CARD_SLIDE, { gain: 0.5 }),
          { kind: 'tone', wave: 'triangle', freq: n(-7), to: n(0), glideMs: 200, decayMs: 260, gain: 0.1 },
        ],
      },
      { name: 'Card + chime', layers: [sample(CARD_SLIDE, { gain: 0.5 }), chime(12, 60, 0.15, 500)] },
    ],
  },
  'trade.deal': {
    label: 'Deal',
    group: 'Property',
    bus: 'sfx',
    when: 'A trade is accepted',
    pick: 0,
    variants: [
      {
        name: 'Chips + dyad',
        layers: [sample(CHIPS_COLLIDE, { gain: 0.5 }), chime(12, 50, 0.18), chime(16, 50, 0.15)],
      },
      {
        name: 'Handshake',
        layers: [
          sample(CARD_PLACE, { gain: 0.5 }),
          sample(CARD_PLACE, { at: 120, gain: 0.5, rate: 1.1 }),
          glass(19, 160, 0.16),
        ],
      },
    ],
  },

  'trade.card': {
    label: 'Card to the table',
    group: 'Property',
    bus: 'ui',
    when: 'A card slides into or out of a trade',
    pick: 0,
    variants: [
      { name: 'Card slide', layers: [sample(CARD_SLIDE, { gain: 0.45, rate: 1.1 })], mix: { vary: 0.3 } },
      { name: 'Card place', layers: [sample(CARD_PLACE, { gain: 0.45 })], mix: { vary: 0.3 } },
      OFF,
    ],
  },
  'trade.declined': {
    label: 'Deal declined',
    group: 'Property',
    bus: 'sfx',
    when: 'A trade offer is turned down',
    pick: 0,
    variants: [
      { name: 'Soft no', layers: [...wood(-5, 0, 0.3, 110), ...wood(-10, 120, 0.28, 160)], mix: { vary: 0 } },
      { name: 'Card shove', layers: [sample(CARD_SHOVE, { gain: 0.5, rate: 0.8 })] },
      OFF,
    ],
  },

  // Building
  'build.house': {
    label: 'House',
    group: 'Building',
    bus: 'sfx',
    when: 'A house lands on its lot (rises in a building streak)',
    pick: 0,
    variants: [
      {
        name: 'Block plop',
        layers: [
          { kind: 'tone', wave: 'sine', freq: 520, to: 240, glideMs: 60, decayMs: 120, gain: 0.4 },
          { kind: 'noise', filter: 'bandpass', freq: 1500, decayMs: 30, gain: 0.18 },
          sample(CHIPS_STACK, { gain: 0.3, rate: 1.1 }),
        ],
      },
      {
        name: 'Card + thud',
        layers: [sample(CARD_PLACE, { gain: 0.6, rate: 0.7 }), thud(0, 0.45, 180, 90, 130)],
      },
      { name: 'Marimba', layers: [...wood(0, 0, 0.35, 160), thud(0, 0.25)] },
    ],
  },
  'build.hotel': {
    label: 'Hotel',
    group: 'Building',
    bus: 'sfx',
    when: 'A hotel lands',
    pick: 0,
    variants: [
      {
        name: 'Thud + run',
        layers: [
          thud(0, 0.65, 200, 70, 260),
          sample(CHIPS_STACK, { gain: 0.5 }),
          ...arp([12, 19, 24], 60, (s, at) => chime(s, 60 + at, 0.22, 800)),
        ],
      },
      {
        name: 'Thud + gong',
        layers: [
          thud(0, 0.65, 200, 70, 260),
          { kind: 'bell', freq: n(-12), ratio: 2, index: 1.5, decayMs: 1200, gain: 0.25 },
        ],
      },
    ],
  },
  'build.sell': {
    label: 'Sell building',
    group: 'Building',
    bus: 'sfx',
    when: 'A house or hotel is sold back',
    pick: 0,
    variants: [
      {
        name: 'Pop out',
        layers: [
          { kind: 'tone', wave: 'sine', freq: 300, to: 600, glideMs: 80, decayMs: 90, gain: 0.28 },
          sample(CHIP_LAY, { gain: 0.35 }),
        ],
      },
      { name: 'Chips', layers: [sample(CHIPS_HANDLE, { gain: 0.5 })] },
    ],
  },
  'set.complete': {
    label: 'Set complete',
    group: 'Building',
    bus: 'sfx',
    when: 'A player owns a whole color set',
    pick: 0,
    variants: [
      {
        name: 'Fanfare',
        layers: [
          thud(0, 0.35, 130, 65, 500),
          ...arp([0, 4, 7, 12], 95, (s, at) => chime(s, at, 0.22, 1200)),
          chime(24, 285, 0.14, 1400),
          shimmer(200, 0.05, 1000),
        ],
      },
      {
        name: 'Chord',
        layers: [
          chime(0, 0, 0.2, 1500),
          chime(4, 0, 0.18, 1500),
          chime(7, 0, 0.18, 1500),
          chime(12, 0, 0.15, 1500),
          shimmer(0, 0.05),
        ],
      },
    ],
  },
  'set.pulse': {
    label: 'Set tile pulse',
    group: 'Building',
    bus: 'sfx',
    when: 'Each tile of a completed set lights up',
    pick: 0,
    variants: [{ name: 'Glass ping', layers: [glass(19, 0, 0.12, 380)], mix: { vary: 0 } }, OFF],
  },

  // Cards and the Lockup
  'card.draw': {
    label: 'Card draw',
    group: 'Cards and Lockup',
    bus: 'sfx',
    when: 'A Chance or Community card is drawn',
    pick: 0,
    variants: [
      { name: 'Slide + air', layers: [sample(CARD_SLIDE, { gain: 0.7 }), whoosh(1200, 3000, 180, 0.07)] },
      { name: 'Fan', layers: [sample(['casino/card-fan-1.ogg'], { gain: 0.6 })] },
    ],
  },
  'card.close': {
    label: 'Card away',
    group: 'Cards and Lockup',
    bus: 'sfx',
    when: 'The card goes back to the deck',
    pick: 0,
    variants: [{ name: 'Shove', layers: [sample(CARD_SHOVE, { gain: 0.45 })] }, OFF],
  },
  'jail.sent': {
    label: 'To the Lockup',
    group: 'Cards and Lockup',
    bus: 'sfx',
    when: 'A player is sent to the Lockup',
    pick: 0,
    variants: [
      {
        name: 'Clank + womp',
        layers: [
          { kind: 'bell', freq: n(-12), ratio: 1.41, index: 4, decayMs: 700, gain: 0.3 },
          {
            kind: 'tone',
            wave: 'triangle',
            freq: n(7),
            to: n(-5),
            glideMs: 300,
            decayMs: 400,
            gain: 0.14,
            at: 60,
          },
          { kind: 'noise', filter: 'lowpass', freq: 800, decayMs: 120, gain: 0.2 },
        ],
      },
      {
        name: 'Two-tone',
        layers: [
          { kind: 'tone', wave: 'triangle', freq: n(7), decayMs: 200, gain: 0.14, lowpass: 2500 },
          { kind: 'tone', wave: 'triangle', freq: n(2), decayMs: 260, gain: 0.14, at: 220, lowpass: 2500 },
          { kind: 'bell', freq: n(-12), ratio: 1.41, index: 4, decayMs: 600, gain: 0.22, at: 220 },
        ],
      },
    ],
  },
  'jail.free': {
    label: 'Out of the Lockup',
    group: 'Cards and Lockup',
    bus: 'sfx',
    when: 'A player leaves the Lockup',
    pick: 0,
    variants: [
      { name: 'Rising wood', layers: [...wood(7, 0, 0.3, 120), ...wood(12, 110, 0.3, 160)] },
      { name: 'Chimes', layers: [chime(7, 0, 0.18), chime(12, 110, 0.18)] },
    ],
  },

  // Turns and the game
  'turn.yours': {
    label: 'Your turn',
    group: 'Game',
    bus: 'ui',
    when: "A human player's turn starts",
    pick: 0,
    variants: [
      { name: 'Two chimes', layers: [chime(7, 0, 0.16, 700), chime(12, 110, 0.16, 800)] },
      { name: 'Glass', layers: [glass(19, 0, 0.16, 600)] },
      OFF,
    ],
  },
  'game.finalRound': {
    label: 'Final round',
    group: 'Game',
    bus: 'sfx',
    when: 'The round limit is reached',
    pick: 0,
    variants: [
      {
        name: 'Clock bell',
        layers: [
          { kind: 'bell', freq: n(-5), ratio: 3.01, index: 2, decayMs: 1500, gain: 0.25 },
          { kind: 'bell', freq: n(-5), ratio: 3.01, index: 2, decayMs: 1500, gain: 0.22, at: 420 },
        ],
      },
    ],
  },
  'game.bankrupt': {
    label: 'Bankrupt',
    group: 'Game',
    bus: 'sfx',
    when: 'A player goes bankrupt',
    pick: 0,
    variants: [
      {
        name: 'Falling wood',
        layers: [
          sample(CHIPS_COLLIDE, { gain: 0.5, rate: 0.8 }),
          ...arp([7, 4, 0, -5], 140, (s, at) => wood(s, at, 0.28, 180)),
          thud(560, 0.4),
        ],
      },
      { name: 'Low chimes', layers: arp([7, 3, 0], 160, (s, at) => chime(s - 12, at, 0.2, 700)) },
    ],
  },
  'game.win': {
    label: 'Victory',
    group: 'Game',
    bus: 'sfx',
    when: 'Someone wins',
    pick: 0,
    variants: [
      {
        name: 'Big fanfare',
        layers: [
          ...arp([0, 4, 7, 12, 16, 19], 85, (s, at) => chime(s, at, 0.2, 1000)),
          chime(0, 560, 0.18, 2000),
          chime(4, 560, 0.16, 2000),
          chime(7, 560, 0.16, 2000),
          chime(24, 560, 0.12, 2200),
          sample(CHIPS_STACK, { at: 560, gain: 0.5 }),
          shimmer(500, 0.06, 1600),
        ],
      },
      {
        name: 'Chord',
        layers: [
          chime(0, 0, 0.2, 2200),
          chime(7, 0, 0.18, 2200),
          chime(16, 0, 0.16, 2200),
          shimmer(0, 0.05, 1600),
        ],
      },
    ],
  },

  // Interface
  'ui.click': {
    label: 'Button',
    group: 'Interface',
    bus: 'ui',
    when: 'Pressing a button',
    pick: 0,
    variants: [
      {
        name: 'Soft tick',
        layers: [
          { kind: 'tone', wave: 'sine', freq: 1800, to: 1200, glideMs: 30, decayMs: 45, gain: 0.18 },
          { kind: 'noise', filter: 'highpass', freq: 4000, decayMs: 18, gain: 0.06 },
        ],
        mix: { reverb: 0.05, vary: 0.2 },
      },
      { name: 'Card tap', layers: [sample(CARD_PLACE, { gain: 0.35, rate: 1.4 })], mix: { reverb: 0.05 } },
      { name: 'Wood', layers: wood(19, 0, 0.16, 70), mix: { reverb: 0.05 } },
      OFF,
    ],
  },
  'ui.open': {
    label: 'Panel open',
    group: 'Interface',
    bus: 'ui',
    when: 'A panel or popup slides in',
    pick: 0,
    variants: [
      {
        name: 'Air up',
        layers: [
          whoosh(800, 2400, 160, 0.12),
          { kind: 'tone', wave: 'sine', freq: n(12), decayMs: 120, gain: 0.05, at: 60 },
        ],
        mix: { reverb: 0.08 },
      },
      { name: 'Card slide', layers: [sample(CARD_SLIDE, { gain: 0.35, rate: 1.1 })] },
      OFF,
    ],
  },
  'ui.close': {
    label: 'Panel close',
    group: 'Interface',
    bus: 'ui',
    when: 'A panel closes',
    pick: 0,
    variants: [
      { name: 'Air down', layers: [whoosh(2400, 700, 140, 0.1)], mix: { reverb: 0.08 } },
      { name: 'Card shove', layers: [sample(CARD_SHOVE, { gain: 0.3, rate: 1.1 })] },
      OFF,
    ],
  },
} satisfies Record<string, SoundDef>

export type SoundId = keyof typeof CATALOG

export const isSoundId = (key: string): key is SoundId => key in CATALOG

export const SOUND_IDS: SoundId[] = Object.keys(CATALOG).filter(isSoundId)

/** Every sample file the catalog can play (preloaded after the first click). */
export function sampleFiles(catalog: Record<string, SoundDef>): string[] {
  const all = new Set<string>()
  for (const def of Object.values(catalog))
    for (const v of def.variants)
      for (const l of v.layers) if (l.kind === 'sample') for (const f of l.files) all.add(f)
  return [...all]
}
