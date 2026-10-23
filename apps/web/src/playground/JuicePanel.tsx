import { useRef, useState } from 'react'
import { GROUPS, SPACES, isOwnable } from '@skyline/engine'
import { DEFAULT_JUICE, cloneJuice, type Board, type JuiceConfig } from '@skyline/board'
import { Button, Section, Slider, Toggle } from './controls.tsx'

/** Section and key labels for the sliders: "celebrate.pulseStepMs" reads "Pulse step ms". */
const words = (key: string) => key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())

const isSection = (key: string): key is keyof JuiceConfig => key in DEFAULT_JUICE
const SECTIONS = Object.keys(DEFAULT_JUICE).filter(isSection)

/** Slider range from the default: up to 3x, integers step by 1. */
function range(def: number): { max: number; step: number } {
  const max = def === 0 ? 1 : def * 3
  return { max, step: Number.isInteger(def) && def >= 5 ? 1 : max / 100 }
}

/**
 * Juice playground: fire every board effect on its own and tune all of `JuiceConfig` live.
 * "Copy config" puts the current values on the clipboard to paste into juice/config.ts.
 */
export function JuicePanel({
  board,
  selected,
  playerId,
}: {
  board: Board | null
  selected: number | null
  playerId: string
}) {
  const [juice, setJuice] = useState<JuiceConfig>(() => cloneJuice())
  const [reduced, setReduced] = useState(false)
  const [copied, setCopied] = useState(false)
  const levels = useRef<number[]>(Array.from({ length: 40 }, () => 0))

  const space = selected !== null && isOwnable(selected) ? selected : 1
  const group = SPACES[space]!.group

  const tune = (section: keyof JuiceConfig, key: string, value: number) => {
    const next = { ...juice, [section]: { ...juice[section], [key]: value } }
    setJuice(next)
    board?.setJuice(next)
  }
  const reset = () => {
    const fresh = cloneJuice()
    setJuice(fresh)
    board?.setJuice(fresh)
  }
  const copy = () => {
    void navigator.clipboard?.writeText(JSON.stringify(juice, null, 2)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const build = (level: number) => {
    if (!board) return
    levels.current[space] = level
    void board.play({ type: 'BUILT', playerId, space, level })
  }

  return (
    <>
      <Section title="Effects">
        <p className="text-xs text-ink-muted">
          On <span className="text-ink">{SPACES[space]!.name}</span> (click a property to change).
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => void board?.play({ type: 'PROPERTY_BOUGHT', playerId, space, price: 0 })}>
            Buy
          </Button>
          <Button onClick={() => build(Math.min(4, (levels.current[space] ?? 0) + 1))}>Build house</Button>
          <Button onClick={() => build(5)}>Build hotel</Button>
          <Button
            onClick={() => {
              levels.current[space] = 0
              void board?.play({ type: 'SOLD_BUILDING', playerId, space, level: 0 })
            }}
          >
            Clear buildings
          </Button>
          <Button
            onClick={async () => {
              if (!board || group < 0) return
              for (const i of GROUPS[group]!)
                await board.play({ type: 'PROPERTY_TRANSFERRED', space: i, from: 'bank', to: playerId })
              await board.play({ type: 'MONOPOLY_COMPLETED', playerId, group })
            }}
          >
            Complete set
          </Button>
          <Button onClick={() => board?.punch(1)}>Big rent hit</Button>
          <Button onClick={() => board?.addTrauma(0.35)}>Shake</Button>
          <Button onClick={() => board?.hitStop(250)}>Hit-stop</Button>
        </div>
        <Toggle
          label="Reduced motion"
          checked={reduced}
          onChange={(v) => {
            setReduced(v)
            board?.setTuning({ reducedMotion: v })
          }}
        />
      </Section>

      {SECTIONS.map((section) => (
        <Section key={section} title={words(section)}>
          {Object.entries(DEFAULT_JUICE[section]).map(([key, def]) => {
            const { max, step } = range(def)
            const value = Object.entries(juice[section]).find(([k]) => k === key)?.[1] ?? def
            return (
              <Slider
                key={key}
                label={words(key)}
                value={value}
                min={0}
                max={max}
                step={step}
                onChange={(v) => tune(section, key, v)}
                format={(v) => (step >= 1 ? String(Math.round(v)) : v.toFixed(2))}
              />
            )
          })}
        </Section>
      ))}

      <Section title="Save">
        <div className="grid grid-cols-2 gap-2">
          <Button primary onClick={copy}>
            {copied ? 'Copied' : 'Copy config'}
          </Button>
          <Button onClick={reset}>Reset</Button>
        </div>
        <p className="text-xs text-ink-muted">Paste copied values into packages/board/src/juice/config.ts.</p>
      </Section>
    </>
  )
}
