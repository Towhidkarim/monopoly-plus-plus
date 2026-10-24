/**
 * Art styles for the code-drawn city (Milestone 6). A style is data: the same modelling kit and
 * generators draw every style, so directions can be compared and mixed on the art page (#art).
 */

export interface ArtStyle {
  id: string
  name: string
  blurb: string
  /** Ground inside the ring, sidewalks, asphalt, lane marks. */
  ground: number
  sidewalk: number
  road: number
  roadLine: number
  park: number
  parkPath: number
  water: number
  /** Cool color mixed into shaded faces (shadows are tinted, not just darker). */
  shadow: number
  /** Opacity of contact shadows on the ground. */
  shadowAlpha: number
  /** Wall color families: glass towers, offices/plaster, brick, houses. */
  glass: readonly number[]
  plaster: readonly number[]
  brick: readonly number[]
  house: readonly number[]
  roofs: readonly number[]
  /** Window glass by day (on lit and shaded faces) and the warm color of lit windows. */
  window: number
  windowLit: number
  /** Share of windows lit (0 by day, more at dusk). */
  litShare: number
  trees: readonly number[]
  trunk: number
  /** Accents: awnings, signs, beacons, train livery. */
  accents: readonly number[]
  /** Toy-like chunkiness: thicker roofs, deeper overhangs, bigger windows (0..1). */
  chunk: number
}

export const STYLES: readonly ArtStyle[] = [
  {
    id: 'clean',
    name: 'A · Clean modern',
    blurb: 'Crisp daylight city: light streets, slate and teal buildings, coral and teal roofs.',
    ground: 0xd5dde8,
    sidewalk: 0xeef2f7,
    road: 0x7d8aa0,
    roadLine: 0xeef2f7,
    park: 0x3fb68f,
    parkPath: 0xf3ead2,
    water: 0x38bdf8,
    shadow: 0x23365c,
    shadowAlpha: 0.26,
    glass: [0x3f8fd1, 0x2f7fc4, 0x56a5de, 0x2a6fb0],
    plaster: [0xf4f6fa, 0xe3e9f1, 0x9fb3cc, 0x6d86a8],
    brick: [0x56708f, 0x47627f, 0x6a7f9c],
    house: [0xf8fafc, 0xdbe4ef, 0x5d7393, 0x47607f],
    roofs: [0xf26b5b, 0x16a99a, 0x2c4467, 0xf59e6b],
    window: 0x8fc2ec,
    windowLit: 0xfde68a,
    litShare: 0,
    trees: [0x1f9c76, 0x27b083, 0x16876a],
    trunk: 0x6b4f3a,
    accents: [0x14c3dd, 0x16a99a, 0x6366f1, 0xf26b5b],
    chunk: 0.2,
  },
  {
    id: 'calm',
    name: 'D · Calm modern',
    blurb: 'Matched to the reference: pale ground, dark slate buildings, teal glass, a few coral roofs.',
    ground: 0xe8ecf1,
    sidewalk: 0xf5f7fa,
    road: 0x5d6776,
    roadLine: 0xe8ecf1,
    park: 0x74b9a2,
    parkPath: 0xeef1f4,
    water: 0x4fb4c6,
    shadow: 0x3a4658,
    shadowAlpha: 0.2,
    glass: [0x3aa6b8, 0x4cbccb, 0x2f8ea2, 0x5b8ec2],
    plaster: [0x3e4b5d, 0x4c5a6c, 0x5f6d80, 0xa8b3c1],
    brick: [0x8c5a55, 0x7a504e, 0x9a6459],
    house: [0x3b4758, 0x4b5869, 0xd6dde5, 0x5e6b7c],
    roofs: [0xf06b4f, 0xf28a4b, 0x2f3a4a, 0x2fa79a],
    window: 0xb8e4ee,
    windowLit: 0xfde68a,
    litShare: 0,
    trees: [0x2f8f74, 0x3aa383, 0x277a64],
    trunk: 0x5c4a3c,
    accents: [0x22c1d6, 0xf06b4f, 0x5b5fc7, 0x2fa79a],
    chunk: 0.2,
  },
  {
    id: 'dusk',
    name: 'B · Dusk city',
    blurb: 'Blue hour: deep navy and slate, warm lit windows, coral and teal roofs.',
    ground: 0x2a3a55,
    sidewalk: 0x40536f,
    road: 0x223050,
    roadLine: 0x9fb2cc,
    park: 0x1e7a62,
    parkPath: 0x75869e,
    water: 0x2f7fc4,
    shadow: 0x070d1c,
    shadowAlpha: 0.36,
    glass: [0x2f6db0, 0x3b7fc4, 0x2a5c96, 0x4a8fd3],
    plaster: [0x5d7aa6, 0x6f8cb6, 0x4f6893, 0x8299c0],
    brick: [0xb05a5f, 0x9c4b55, 0xc0675f],
    house: [0x7d90b3, 0x6a7fa6, 0x93a3c2, 0x52688f],
    roofs: [0xff6b7a, 0xff8a5c, 0x12b5a0, 0x24344f],
    window: 0x45689a,
    windowLit: 0xffcf4a,
    litShare: 0.42,
    trees: [0x168a6c, 0x1d9c7a, 0x117058],
    trunk: 0x4a3a2c,
    accents: [0xffc23d, 0x22d3ee, 0xff6b7a, 0x12b5a0],
    chunk: 0.25,
  },
  {
    id: 'toy',
    name: 'C · Toy diorama',
    blurb: 'Sunny tabletop town: chunky shapes, warm whites, terracotta and blue roofs, bright trees.',
    ground: 0xe3d6b8,
    sidewalk: 0xf6efdf,
    road: 0x8a8f9a,
    roadLine: 0xfffaf0,
    park: 0x5cc25a,
    parkPath: 0xf5e2b8,
    water: 0x3fb7e6,
    shadow: 0x4a3566,
    shadowAlpha: 0.28,
    glass: [0x5aaee8, 0x4a9fe0, 0x72bdf0],
    plaster: [0xfff7ea, 0xf7e3c4, 0xe8f1fb, 0xffd8bf],
    brick: [0xd0583e, 0xbc4a35, 0xe0704f],
    house: [0xfffaf1, 0xfbe6c8, 0xe4eefb, 0xffd6c4],
    roofs: [0xe1452f, 0xf0723f, 0x3570d8, 0x2f8f6a],
    window: 0x6db7ea,
    windowLit: 0xffe08a,
    litShare: 0,
    trees: [0x43b649, 0x2fa44a, 0x6fcf4f],
    trunk: 0x86593a,
    accents: [0xffb020, 0xef4444, 0x3b82f6, 0x10b981],
    chunk: 0.8,
  },
]

export const styleById = (id: string): ArtStyle => STYLES.find((s) => s.id === id) ?? STYLES[0]!

/** The style the game board uses (DECISIONS.md D26). */
export const BOARD_STYLE: ArtStyle = styleById('calm')
