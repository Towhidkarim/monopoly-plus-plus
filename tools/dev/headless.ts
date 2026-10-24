/**
 * Fallback when Orca is not running: a scripted headless Chrome run over CDP. Software rendering
 * (about 5 fps), so allow long waits. Usage: `pnpm shot:headless <url> <steps.json> [port]`, where
 * steps are ["wait", ms] | ["eval", js] | ["click", buttonText] | ["shot", name]; shots land in
 * .shots/<name>.png. Prints console errors and exceptions from the page.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

type Step = ['wait', number] | ['eval', string] | ['click', string] | ['shot', string]
interface CdpMessage {
  id?: number
  method?: string
  params?: any
  result?: any
  error?: any
}

const root = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const [url, stepsFile, port = '9334'] = process.argv.slice(2)
if (!url || !stepsFile) throw new Error('usage: pnpm shot:headless <url> <steps.json> [port]')
const steps: Step[] = JSON.parse(readFileSync(stepsFile, 'utf8'))
const shots = join(root, '.shots')
mkdirSync(shots, { recursive: true })

const profile = mkdtempSync(join(tmpdir(), 'cdp-'))
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--autoplay-policy=no-user-gesture-required',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--hide-scrollbars',
  '--window-size=1440,900',
  'about:blank',
])
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let target: { type: string; webSocketDebuggerUrl: string } | undefined
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200)
  try {
    const list: NonNullable<typeof target>[] = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
    target = list.find((t) => t.type === 'page')
  } catch {
    // Chrome is still starting.
  }
}
if (!target) throw new Error('headless Chrome did not start')

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r, { once: true }))
let id = 0
const pending = new Map<number, (v: any) => void>()
ws.addEventListener('message', (m) => {
  const msg: CdpMessage = JSON.parse(String(m.data))
  if (msg.id && pending.has(msg.id)) pending.get(msg.id)!(msg.result ?? msg.error)
  if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type))
    console.log(
      `[console.${msg.params.type}]`,
      msg.params.args.map((a: any) => a.value ?? a.description).join(' '),
    )
  if (msg.method === 'Runtime.exceptionThrown')
    console.log(
      '[exception]',
      msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text,
    )
})
const send = (method: string, params: object = {}) =>
  new Promise<any>((r) => {
    pending.set(++id, r)
    ws.send(JSON.stringify({ id, method, params }))
  })

await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
})
await send('Page.navigate', { url })
for (const [kind, arg] of steps) {
  if (kind === 'wait') await sleep(arg)
  else if (kind === 'eval') {
    const r = await send('Runtime.evaluate', { expression: arg, returnByValue: true, awaitPromise: true })
    if (r?.result?.value !== undefined) console.log('[eval]', JSON.stringify(r.result.value))
    if (r?.exceptionDetails) console.log('[eval error]', r.exceptionDetails.exception?.description)
  } else if (kind === 'click') {
    const js = `(() => { const b = [...document.querySelectorAll('button,a')].find(e => e.textContent.trim().toLowerCase().startsWith(${JSON.stringify(arg.toLowerCase())})); if (!b) return 'not found'; b.click(); return 'ok' })()`
    const r = await send('Runtime.evaluate', { expression: js, returnByValue: true })
    if (r?.result?.value !== 'ok') console.log('[click]', arg, r?.result?.value)
  } else {
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    const out = join(shots, `${arg}.png`)
    writeFileSync(out, Buffer.from(shot.data, 'base64'))
    console.log('saved', out)
  }
}
ws.close()
chrome.kill()
await sleep(300)
try {
  rmSync(profile, { recursive: true, force: true })
} catch {
  // Chrome may still hold the profile; the OS temp cleanup gets it.
}
