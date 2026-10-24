/**
 * Screenshot of a tab in Orca's built-in browser (real GPU, about a second). Needs Orca running
 * with a tab open on the dev server. Usage: `pnpm shot [name] [--page <browserPageId>]`; the PNG
 * lands in .shots/<name>.png (gitignored). `orca tab list --json` lists the page ids.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const args = process.argv.slice(2)
const pageAt = args.indexOf('--page')
const page = pageAt === -1 ? undefined : args[pageAt + 1]
const name = args.find((a, i) => !a.startsWith('--') && (pageAt === -1 || i !== pageAt + 1)) ?? 'shot'

const raw = execFileSync(
  'orca',
  ['screenshot', '--format', 'png', '--json', ...(page ? ['--page', page] : [])],
  {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  },
)
const res: { ok: boolean; result?: { data: string }; error?: unknown } = JSON.parse(raw)
if (!res.ok || !res.result) throw new Error(`orca screenshot failed: ${JSON.stringify(res.error ?? res)}`)

const dir = join(root, '.shots')
mkdirSync(dir, { recursive: true })
const out = join(dir, `${name}.png`)
writeFileSync(out, Buffer.from(res.result.data, 'base64'))
console.log('saved', out)
