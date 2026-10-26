import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CATALOG, SOUND_IDS, sampleFiles, type SoundDef } from './catalog.ts'
import { CueMapper } from './cues.ts'
import { readPack, writePack } from './pack.ts'

const human = (id: string) => id === 'p1'

describe('CueMapper', () => {
  it('climbs a scale as a pawn hops, and ticks gently for vehicles', () => {
    const m = new CueMapper(human)
    const hops = [0, 1, 2, 3].map((step) => m.beat({ kind: 'step', piece: 'pawn', space: step, step })[0]!)
    expect(hops.map((c) => c.sound)).toEqual(['move.step', 'move.step', 'move.step', 'move.step'])
    expect(hops.map((c) => c.pitch)).toEqual([0, 2, 4, 5])
    const roll = m.beat({ kind: 'step', piece: 'taxi', space: 5, step: 3 })[0]!
    expect(roll.sound).toBe('move.roll')
    expect(roll.pitch).toBeLessThan(2)
  })

  it('adds a doubles sparkle after the dice land, sooner at higher speed', () => {
    const m = new CueMapper(human)
    const normal = m.event({ type: 'DICE_ROLLED', playerId: 'p1', dice: [3, 3] }, 1)
    const fast = m.event({ type: 'DICE_ROLLED', playerId: 'p1', dice: [3, 3] }, 4)
    expect(normal.map((c) => c.sound)).toEqual(['dice.roll', 'dice.doubles'])
    expect(fast[1]!.delay).toBeCloseTo(normal[1]!.delay! / 4)
    expect(m.event({ type: 'DICE_ROLLED', playerId: 'p1', dice: [3, 4] })).toHaveLength(1)
  })

  it('leaves dice sounds to the 3D throw: a recorded throw on touchdown, the pulse at rest', () => {
    const m = new CueMapper(human, undefined, () => true)
    expect(m.event({ type: 'DICE_ROLLED', playerId: 'p1', dice: [3, 3] })).toEqual([])
    expect(m.fx({ kind: 'diceHit', intensity: 1 }).map((c) => c.sound)).toEqual(['dice.roll'])
    const plain = m.fx({ kind: 'diceSettle', doubles: false, popInMs: 220 })
    expect(plain).toEqual([expect.objectContaining({ sound: 'set.pulse', delay: 220 })])
    const doubles = m.fx({ kind: 'diceSettle', doubles: true, popInMs: 220 }).map((c) => c.sound)
    expect(doubles).toEqual(['set.pulse', 'dice.doubles'])
  })

  it('chimes only when a human turn starts', () => {
    const m = new CueMapper(human)
    expect(m.event({ type: 'TURN_STARTED', playerId: 'p1', round: 1 })).toEqual([{ sound: 'turn.yours' }])
    expect(m.event({ type: 'TURN_STARTED', playerId: 'p2', round: 1 })).toEqual([])
  })

  it('raises the pitch through a building spree and resets after a pause', () => {
    let t = 0
    const m = new CueMapper(human, () => t)
    const build = () => m.beat({ kind: 'build', space: 1, level: 1 })[0]!
    expect(build().pitch).toBe(0)
    t += 300
    expect(build().pitch).toBe(2)
    t += 300
    expect(build().pitch).toBe(4)
    t += 5000
    expect(build().pitch).toBe(0)
    expect(m.beat({ kind: 'build', space: 1, level: 5 })[0]!.sound).toBe('build.hotel')
  })

  it('climbs with each bid and restarts for the next auction', () => {
    const m = new CueMapper(human)
    m.event({ type: 'AUCTION_STARTED', space: 1 })
    const a = m.event({ type: 'BID_PLACED', playerId: 'p1', amount: 10 })[0]!
    const b = m.event({ type: 'BID_PLACED', playerId: 'p2', amount: 20 })[0]!
    expect(b.pitch!).toBeGreaterThan(a.pitch!)
    m.event({ type: 'AUCTION_STARTED', space: 3 })
    expect(m.event({ type: 'BID_PLACED', playerId: 'p1', amount: 10 })[0]!.pitch).toBe(a.pitch)
  })

  it('ticks once per flying coin, timed to land, climbing in pitch', () => {
    const m = new CueMapper(human)
    const cues = m.fx({ kind: 'transfer', from: 'p1', to: 'p2', amount: 600 })
    const coins = cues.filter((c) => c.sound === 'money.coin')
    expect(cues[0]!.sound).toBe('money.pay')
    expect(coins.length).toBeGreaterThanOrEqual(3)
    for (let i = 1; i < coins.length; i++) {
      expect(coins[i]!.delay!).toBeGreaterThan(coins[i - 1]!.delay!)
      expect(coins[i]!.pitch!).toBeGreaterThan(coins[i - 1]!.pitch!)
    }
    expect(m.fx({ kind: 'pop', playerId: 'p2', delta: 200 })).toEqual([{ sound: 'money.gain' }])
    expect(m.fx({ kind: 'pop', playerId: 'p2', delta: -100 })).toEqual([{ sound: 'money.pay' }])
  })
})

describe('sound catalog', () => {
  const defs = Object.entries(CATALOG) as [string, SoundDef][]

  it('picks an existing variant for every sound', () => {
    expect(defs.filter(([, def]) => !def.variants[def.pick]).map(([id]) => id)).toEqual([])
    expect(SOUND_IDS.length).toBe(defs.length)
  })

  it('ships every sample file it refers to, in its pack', () => {
    const root = fileURLToPath(new URL('../../public/audio/', import.meta.url))
    const packs = new Map<string, Map<string, ArrayBuffer>>()
    const missing = sampleFiles(CATALOG).filter((f) => {
      const pack = f.split('/')[0]!
      if (!packs.has(pack)) {
        const bytes = readFileSync(`${root}${pack}.pack`)
        packs.set(pack, readPack(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)))
      }
      return !packs.get(pack)!.has(f)
    })
    expect(missing).toEqual([])
  })

  it('round-trips files through a pack', () => {
    const a = new Uint8Array([1, 2, 3])
    const b = new Uint8Array([9, 8])
    const out = writePack([
      ['x/a.ogg', a],
      ['x/b.ogg', b],
    ])
    const files = readPack(out.buffer.slice(0))
    expect([...new Uint8Array(files.get('x/a.ogg')!)]).toEqual([1, 2, 3])
    expect([...new Uint8Array(files.get('x/b.ogg')!)]).toEqual([9, 8])
  })

  it('keeps every layer short and within a sane level', () => {
    const bad = defs.flatMap(([id, def]) =>
      def.variants.flatMap((v) =>
        v.layers
          .filter((l) => (l.gain ?? 1) > 1 || (l.at ?? 0) >= 1000 || ('decayMs' in l && l.decayMs > 2500))
          .map(() => `${id} / ${v.name}`),
      ),
    )
    expect(bad).toEqual([])
  })
})
