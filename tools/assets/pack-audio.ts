/**
 * Packs the sound sources under tools/assets/audio/<pack>/ into apps/web/public/audio/<pack>.pack
 * (format: apps/web/src/audio/pack.ts). Run with `pnpm assets:audio` after adding or changing a
 * sound file; entries are named "<pack>/<file>.ogg", as the sound catalog refers to them.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { writePack } from '../../apps/web/src/audio/pack.ts'

const root = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const sources = join(root, 'tools/assets/audio')

for (const pack of readdirSync(sources)) {
  const dir = join(sources, pack)
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.ogg'))
    .toSorted()
    .map((f) => [`${pack}/${f}`, new Uint8Array(readFileSync(join(dir, f)))] as const)
  const out = join(root, 'apps/web/public/audio', `${pack}.pack`)
  const data = writePack(files)
  writeFileSync(out, data)
  console.log(`${pack}.pack: ${files.length} files, ${(data.byteLength / 1024).toFixed(0)} KB`)
}
