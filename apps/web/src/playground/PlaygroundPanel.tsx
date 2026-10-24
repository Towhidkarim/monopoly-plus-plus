import { useEffect, useState } from 'react'
import { DEFAULT_TUNING, PIECES, type BoardHandle, type BoardTuning } from '@skyline/board'
import { CueMapper } from '../audio/cues.ts'
import { playCues } from '../audio/connect.ts'
import { cssHex, spaceInfo } from '../spaceInfo.ts'
import { Button, Section, Slider, Toggle } from './controls.tsx'
import { JuicePanel } from './JuicePanel.tsx'
import { PLAYERS, usePlayground } from './usePlayground.ts'

/** The playground plays sound too, as if every piece were yours. */
const cues = new CueMapper(() => true)

const PIPS = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅']

/** Dev URL params for screenshots: ?view=top&debug=1&select=12 */
const params = new URLSearchParams(window.location.search)

/** Board playground: trigger scripted moves, toggle views, tune the feel live. */
export function PlaygroundPanel({ handle }: { handle: BoardHandle | null }) {
  const board = handle?.board ?? null
  const pg = usePlayground(board, (e) => playCues(cues.event(e)))
  const [tab, setTab] = useState<'board' | 'juice'>(params.get('tab') === 'juice' ? 'juice' : 'board')
  const { setAuto } = pg
  const [tuning, setTuning] = useState<BoardTuning>(DEFAULT_TUNING)
  const [iso, setIso] = useState(params.get('view') !== 'top')
  const [sky, setSky] = useState(0)
  const [debug, setDebug] = useState(params.get('debug') === '1')
  const [selected, setSelected] = useState<number | null>(null)

  useEffect(() => {
    if (!board) return
    // Dev console handle for poking at the board (and for scripted screenshots).
    if (import.meta.env.DEV) Object.assign(window, { skylineBoard: board })
    board.setListeners({ select: setSelected, beat: (b) => playCues(cues.beat(b)) })
    if (params.get('view') === 'top') void board.setIsometric(false)
    if (params.get('debug') === '1') board.setDebug(true)
    const sel = params.get('select')
    if (sel !== null) board.select(Number(sel))
    if (params.get('auto') === '1') setAuto(true)
    const focus = params.get('focus')
    if (focus !== null) board.focus(Number(focus), 3, true)
  }, [board, setAuto])

  // Polled twice a second; never per frame through React.
  const [fps, setFps] = useState(0)
  useEffect(() => {
    if (!board) return
    const id = setInterval(() => setFps(Math.round(board.fps)), 500)
    return () => clearInterval(id)
  }, [board])

  const tune = <K extends keyof BoardTuning>(key: K, value: BoardTuning[K]) => {
    const next = { ...tuning, [key]: value }
    setTuning(next)
    board?.setTuning(next)
  }

  const sel = selected === null ? null : spaceInfo(selected)

  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-line bg-panel">
      <header className="px-5 pt-5 pb-4">
        <h1 className="text-2xl font-semibold text-accent">Skyline</h1>
        <p className="flex justify-between text-sm text-ink-muted">
          Board playground
          <span className={`font-mono text-xs ${fps >= 55 ? 'text-teal' : 'text-alert'}`}>{fps} fps</span>
        </p>
        <nav className="mt-3 flex gap-1 rounded-lg bg-white/5 p-1 text-sm">
          {(['board', 'juice'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 rounded-md py-1 capitalize ${tab === t ? 'bg-accent font-semibold text-table' : 'text-ink hover:bg-white/10'}`}
            >
              {t}
            </button>
          ))}
          <a href="#art" className="flex-1 rounded-md py-1 text-center text-ink hover:bg-white/10">
            Art
          </a>
          <a href="#sounds" className="flex-1 rounded-md py-1 text-center text-ink hover:bg-white/10">
            Sounds
          </a>
        </nav>
      </header>

      {tab === 'juice' && <JuicePanel board={board} selected={selected} playerId={PLAYERS[pg.active]!.id} />}
      {tab === 'board' && (
        <>
          <Section title="Players">
            <div className="flex gap-2">
              {PLAYERS.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pg.setActive(i)}
                  title={p.name}
                  aria-label={`Select ${p.name} token`}
                  className={`size-9 rounded-full border-2 transition-transform ${
                    pg.active === i
                      ? 'scale-110 border-white'
                      : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                  style={{ background: cssHex(p.color) }}
                />
              ))}
            </div>
            <fieldset className="grid grid-cols-3 gap-1.5">
              <legend className="sr-only">Piece for the active player</legend>
              {PIECES.map((piece) => {
                const on = pg.pieces[pg.active] === piece.kind
                return (
                  <button
                    key={piece.kind}
                    type="button"
                    aria-pressed={on}
                    onClick={() => pg.setPiece(pg.active, piece.kind)}
                    className={`rounded-md px-2 py-1.5 text-xs font-medium transition-transform active:scale-95 ${
                      on ? 'bg-accent text-table' : 'border border-line bg-white/5 text-ink hover:bg-white/10'
                    }`}
                  >
                    {piece.label}
                  </button>
                )
              })}
            </fieldset>
            <div className="flex items-center gap-3">
              <span className="text-4xl leading-none text-ink">
                {pg.dice ? `${PIPS[pg.dice[0] - 1]}${PIPS[pg.dice[1] - 1]}` : '⚀⚀'}
              </span>
              <span className="text-sm text-ink-muted">
                {pg.dice ? `rolled ${pg.dice[0] + pg.dice[1]}` : 'not rolled'}
              </span>
            </div>
          </Section>

          <Section title="Moves">
            <Button primary onClick={() => void pg.roll()} disabled={pg.auto}>
              Roll dice
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => void pg.roll(7)} disabled={pg.auto}>
                Roll 7
              </Button>
              <Button onClick={() => void pg.roll(12)} disabled={pg.auto}>
                Roll 12
              </Button>
              <Button onClick={() => void pg.jumpToJail()} disabled={pg.auto}>
                Go to Lockup
              </Button>
              <Button onClick={pg.nextPlayer} disabled={pg.auto}>
                Next player
              </Button>
            </div>
            <Toggle label="Auto-play (all tokens)" checked={pg.auto} onChange={pg.setAuto} />
          </Section>

          <Section title="View">
            <Toggle
              label="Isometric"
              checked={iso}
              onChange={(v) => {
                setIso(v)
                void board?.setIsometric(v)
              }}
            />
            <Toggle
              label="Debug overlay"
              checked={debug}
              onChange={(v) => {
                setDebug(v)
                board?.setDebug(v)
              }}
            />
            <Toggle
              label="Camera follows token"
              checked={tuning.follow}
              onChange={(v) => tune('follow', v)}
            />
            <Toggle
              label="City life (cars, trains)"
              checked={tuning.ambient}
              onChange={(v) => tune('ambient', v)}
            />
            <Slider
              label="Sky"
              value={sky}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => {
                setSky(v)
                board?.setNight(v, true)
              }}
              format={(v) => v.toFixed(2)}
            />
            <Button onClick={() => board?.recenter()}>Recenter camera</Button>
          </Section>

          <Section title="Feel">
            <p className="text-xs text-ink-muted">Hop, squash, and every effect are on the Juice tab.</p>
            <Slider
              label="Speed"
              value={tuning.speed}
              min={0.25}
              max={3}
              step={0.05}
              onChange={(v) => tune('speed', v)}
              format={(v) => `${v.toFixed(2)}x`}
            />
          </Section>

          <Section title="Selected tile">
            {sel ? (
              <div className="overflow-hidden rounded-lg border border-line bg-white/5">
                {sel.color && <div className="h-2" style={{ background: sel.color }} />}
                <div className="px-3 py-2">
                  <div className="font-semibold text-ink">{sel.name}</div>
                  <div className="text-xs text-ink-muted">
                    {sel.kind} · #{selected}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink-muted">
                Click a tile on the board. Drag to pan, scroll to zoom.
              </p>
            )}
          </Section>
        </>
      )}
    </aside>
  )
}
