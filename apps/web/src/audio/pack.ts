/**
 * Sound pack: many small audio files in one binary, so the game makes one request instead of
 * dozens, and download managers (IDM and friends) do not grab each `.ogg` the page fetches.
 *
 * Layout: "SKYP" (4 bytes), header length (uint32 LE), header JSON
 * `{ "<name>": [offset, length] }` (offsets from the start of the data), then the data.
 * Written by `pnpm assets:audio` (tools/assets/pack-audio.ts).
 */

const MAGIC = 'SKYP'

export function writePack(files: readonly (readonly [string, Uint8Array])[]): Uint8Array<ArrayBuffer> {
  const index: Record<string, [number, number]> = {}
  let offset = 0
  for (const [name, data] of files) {
    index[name] = [offset, data.byteLength]
    offset += data.byteLength
  }
  const header = new TextEncoder().encode(JSON.stringify(index))
  const out = new Uint8Array(8 + header.byteLength + offset)
  out.set(new TextEncoder().encode(MAGIC), 0)
  new DataView(out.buffer).setUint32(4, header.byteLength, true)
  out.set(header, 8)
  let at = 8 + header.byteLength
  for (const [, data] of files) {
    out.set(data, at)
    at += data.byteLength
  }
  return out
}

/** Splits a pack into its files (each a fresh ArrayBuffer, as decodeAudioData detaches it). */
export function readPack(buf: ArrayBuffer): Map<string, ArrayBuffer> {
  const bytes = new Uint8Array(buf)
  if (new TextDecoder().decode(bytes.subarray(0, 4)) !== MAGIC) throw new Error('not a sound pack')
  const len = new DataView(buf).getUint32(4, true)
  const index: unknown = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + len)))
  const files = new Map<string, ArrayBuffer>()
  if (typeof index !== 'object' || index === null) return files
  const base = 8 + len
  for (const [name, range] of Object.entries(index)) {
    if (!Array.isArray(range)) continue
    const [offset, length] = range
    if (typeof offset !== 'number' || typeof length !== 'number') continue
    files.set(name, buf.slice(base + offset, base + offset + length))
  }
  return files
}
