import { deflateSync } from 'node:zlib'

/**
 * App icons for the PWA (D64), drawn from code at build time so no binary is committed: the
 * favicon's mark (an isometric block with a tower, 32-unit grid) on the table color, kept inside
 * the maskable safe zone. Imported by vite.config.ts only, never by the app bundle.
 */

type Pt = readonly [number, number]
interface Shape {
  points: readonly Pt[]
  color: readonly [number, number, number]
}

const BACKGROUND = [0x0b, 0x14, 0x26] as const
/** Same shapes as public/favicon.svg; the base is lighter so it reads on the dark background. */
const MARK: readonly Shape[] = [
  {
    points: [
      [16, 30],
      [2, 22],
      [2, 12],
      [16, 20],
      [30, 12],
      [30, 22],
    ],
    color: [0x3b, 0x4a, 0x66],
  },
  {
    points: [
      [16, 4],
      [30, 12],
      [16, 20],
      [2, 12],
    ],
    color: [0xcb, 0xd5, 0xe1],
  },
  {
    points: [
      [13, 6],
      [19, 6],
      [19, 14],
      [16, 16],
      [13, 14],
    ],
    color: [0x22, 0xd3, 0xee],
  },
]
/** The mark spans this share of the icon: inside the 80% circle maskable icons may be cropped to. */
const MARK_SHARE = 0.58
/** Samples per pixel side (4 x 4 supersampling for smooth edges). */
const SS = 4

function inside(x: number, y: number, pts: readonly Pt[]): boolean {
  let hit = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]!
    const [xj, yj] = pts[j]!
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

/** The icon as RGBA pixels, `size` x `size`. */
export function renderIcon(size: number): Uint8Array {
  const out = new Uint8Array(size * size * 4)
  const scale = (size * MARK_SHARE) / 28 // the mark spans x 2..30 and y 4..30 (28 x 26 units)
  const ox = size / 2 - 16 * scale
  const oy = size / 2 - 17 * scale
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0
      let g = 0
      let b = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS - ox) / scale
          const y = (py + (sy + 0.5) / SS - oy) / scale
          let c: readonly number[] = BACKGROUND
          for (const shape of MARK) if (inside(x, y, shape.points)) c = shape.color
          r += c[0]!
          g += c[1]!
          b += c[2]!
        }
      }
      const n = SS * SS
      const i = (py * size + px) * 4
      out[i] = Math.round(r / n)
      out[i + 1] = Math.round(g / n)
      out[i + 2] = Math.round(b / n)
      out[i + 3] = 255
    }
  }
  return out
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(new TextEncoder().encode(type), 4)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

/** A minimal PNG (8-bit RGBA, no filtering) from RGBA pixels. */
export function encodePng(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const header = new Uint8Array(13)
  const hv = new DataView(header.buffer)
  hv.setUint32(0, width)
  hv.setUint32(4, height)
  header.set([8, 6, 0, 0, 0], 8) // bit depth 8, color type RGBA, deflate, no filter, no interlace
  const raw = new Uint8Array(height * (width * 4 + 1))
  for (let y = 0; y < height; y++)
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1)
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array(0)),
  ]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/** Icon files the manifest and index.html point at: published path to PNG bytes. */
export function iconFiles(): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {}
  for (const [name, size] of [
    ['icons/icon-192.png', 192],
    ['icons/icon-512.png', 512],
    ['icons/apple-touch-icon.png', 180],
  ] as const)
    files[name] = encodePng(renderIcon(size), size, size)
  return files
}
