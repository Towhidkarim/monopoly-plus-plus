import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { encodePng, renderIcon } from './icon.ts'

describe('PWA icons', () => {
  it('draw the mark on the table color, centered', () => {
    const size = 64
    const px = renderIcon(size)
    const at = (x: number, y: number) => [...px.subarray((y * size + x) * 4, (y * size + x) * 4 + 4)]
    expect(at(0, 0)).toEqual([0x0b, 0x14, 0x26, 255]) // the corner is background
    expect(at(32, 32)).not.toEqual([0x0b, 0x14, 0x26, 255]) // the middle is the mark
  })

  it('encode a valid PNG that decodes back to the same pixels', () => {
    const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 9, 9, 9, 128])
    const png = encodePng(rgba, 2, 2)
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const view = new DataView(png.buffer)
    expect(view.getUint32(16)).toBe(2) // IHDR width
    expect(view.getUint32(20)).toBe(2) // IHDR height
    const idatLength = view.getUint32(33)
    const raw = inflateSync(png.subarray(41, 41 + idatLength))
    // Each row: a filter byte (0) and the row's pixels.
    expect([...raw]).toEqual([0, ...rgba.subarray(0, 8), 0, ...rgba.subarray(8)])
  })
})
