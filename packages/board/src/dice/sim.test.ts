import { describe, expect, it } from 'vitest'
import { DEFAULT_JUICE } from '../juice/config.ts'
import { CORNERS, FACES, faceSwap, topFace } from './cube.ts'
import { qrot } from './math.ts'
import {
  DEFAULT_THROW_AREA,
  DEFAULT_THROW_FROM,
  poseAt,
  restingOverlap,
  solveThrow,
  STEP,
  type ThrowRequest,
} from './sim.ts'

const area = DEFAULT_THROW_AREA
const from = DEFAULT_THROW_FROM
const physics = DEFAULT_JUICE.dice

const request = (values: [number, number], seed: number): ThrowRequest => ({
  values,
  seed,
  area,
  from,
  physics,
})
const last = <T>(list: readonly T[]): T => list[list.length - 1]!

describe('faceSwap', () => {
  it('turns the wanted face to where the shown face was, and maps corners onto corners', () => {
    for (const want of FACES)
      for (const have of FACES) {
        const q = faceSwap(want.value, have.value)
        const n = qrot(q, want.n)
        expect(n.x).toBeCloseTo(have.n.x, 9)
        expect(n.y).toBeCloseTo(have.n.y, 9)
        expect(n.z).toBeCloseTo(have.n.z, 9)
        for (const c of CORNERS) {
          const r = qrot(q, c)
          const match = CORNERS.some(
            (k) => Math.abs(k.x - r.x) < 1e-9 && Math.abs(k.y - r.y) < 1e-9 && Math.abs(k.z - r.z) < 1e-9,
          )
          expect(match).toBe(true)
        }
      }
  })

  it('opposite faces sum to seven', () => {
    for (const f of FACES) {
      const opposite = FACES.find((g) => g.n.x === -f.n.x && g.n.y === -f.n.y && g.n.z === -f.n.z)!
      expect(f.value + opposite.value).toBe(7)
    }
  })
})

describe('solveThrow', () => {
  it('lands on every one of the 36 outcomes across seeds, flat on the board', () => {
    for (let a = 1; a <= 6; a++)
      for (let b = 1; b <= 6; b++)
        for (const seed of [1, 77, 4242, 90210]) {
          const track = solveThrow(request([a, b], seed))
          expect(track.faces).toEqual([a, b])
          for (const [i, want] of [
            [0, a],
            [1, b],
          ] as const) {
            const end = last(track.poses[i])
            expect(topFace(end.q).value).toBe(want)
            // Exactly face up, resting on the board.
            expect(qrot(end.q, topFace(end.q).n).z).toBeGreaterThan(0.9999)
            expect(end.p.z).toBeCloseTo(track.half, 6)
          }
        }
  })

  it('is deterministic: same seed and values give the same throw', () => {
    const a = solveThrow(request([4, 2], 31337))
    const b = solveThrow(request([4, 2], 31337))
    expect(b).toEqual(a)
    const c = solveThrow(request([4, 2], 31338))
    expect(last(c.poses[0]).p).not.toEqual(last(a.poses[0]).p)
  })

  it('the requested values never change the path, only which face is printed where', () => {
    const one = solveThrow(request([1, 1], 99))
    const six = solveThrow(request([6, 5], 99))
    expect(six.poses[0].length).toBe(one.poses[0].length)
    for (const i of [0, 1] as const)
      for (let f = 0; f < one.poses[i].length; f += 7) {
        const p = one.poses[i][f]!
        const q = six.poses[i][f]!
        expect(q.p).toEqual(p.p)
        // Same set of world corner positions.
        for (const c of CORNERS) {
          const w = qrot(q.q, c)
          const hit = CORNERS.some((k) => {
            const u = qrot(p.q, k)
            return Math.abs(u.x - w.x) < 1e-6 && Math.abs(u.y - w.y) < 1e-6 && Math.abs(u.z - w.z) < 1e-6
          })
          expect(hit).toBe(true)
        }
      }
    expect(six.hits).toEqual(one.hits)
  })

  it('comes to rest inside the throw area, apart, within the time window', () => {
    let inWindow = 0
    const seeds = 60
    for (let seed = 1; seed <= seeds; seed++) {
      const track = solveThrow(request([1 + (seed % 6), 1 + ((seed * 5) % 6)], seed))
      const h = track.half
      const ends = [last(track.poses[0]), last(track.poses[1])]
      for (const end of ends) {
        expect(end.p.x).toBeGreaterThanOrEqual(area.col0 + h - 1e-6)
        expect(end.p.x).toBeLessThanOrEqual(area.col1 - h + 1e-6)
        expect(end.p.y).toBeGreaterThanOrEqual(area.row0 + h - 1e-6)
        expect(end.p.y).toBeLessThanOrEqual(area.row1 - h + 1e-6)
      }
      expect(restingOverlap(ends[0]!, ends[1]!, h)).toBe(false)
      const ms = track.duration * 1000
      if (ms >= physics.minMs && ms <= physics.maxMs) inWindow++
      expect(ms).toBeLessThan(3300)
      expect(track.hits.some((x) => x.kind === 'floor')).toBe(true)
      for (let k = 1; k < track.hits.length; k++)
        expect(track.hits[k]!.t).toBeGreaterThanOrEqual(track.hits[k - 1]!.t)
    }
    expect(inWindow / seeds).toBeGreaterThan(0.9)
  })

  it('stays inside a different area thrown from another side', () => {
    const other = { col0: 3, row0: 3, col1: 5.5, row1: 5.5 }
    for (let seed = 1; seed <= 12; seed++) {
      const track = solveThrow({ ...request([3, 3], seed), area: other, from: { col: -2, row: 4 } })
      expect(track.faces).toEqual([3, 3])
      for (const i of [0, 1] as const) {
        const end = last(track.poses[i])
        expect(end.p.x).toBeGreaterThan(other.col0)
        expect(end.p.x).toBeLessThan(other.col1)
        expect(end.p.y).toBeGreaterThan(other.row0)
        expect(end.p.y).toBeLessThan(other.row1)
      }
    }
  })
})

describe('simulate', () => {
  it('never sinks into the board or flies off after touchdown', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const track = solveThrow(request([5, 1], seed))
      const h = track.half
      const touchdown = track.hits.find((x) => x.kind === 'floor')!.t
      for (const i of [0, 1] as const)
        for (const [f, pose] of track.poses[i].entries()) {
          let low = Infinity
          for (const c of CORNERS)
            low = Math.min(low, pose.p.z + qrot(pose.q, { x: c.x * h, y: c.y * h, z: c.z * h }).z)
          expect(low).toBeGreaterThan(-0.12)
          const limit = f * STEP > touchdown + 0.05 ? 1.6 : Infinity
          expect(pose.p.z).toBeLessThan(limit)
        }
    }
  })

  it('still lands the right faces with extreme tuning', () => {
    const wild = {
      ...physics,
      gravity: 12,
      restitution: 0.8,
      friction: 0.1,
      spin: 40,
      throwSpeed: 18,
      size: 0.9,
    }
    for (let seed = 1; seed <= 6; seed++)
      for (const values of [
        [1, 6],
        [4, 4],
      ] as [number, number][]) {
        const track = solveThrow({ ...request(values, seed), physics: wild })
        expect(track.faces).toEqual(values)
        expect(track.duration).toBeLessThan(3.3)
      }
  })
})

describe('poseAt', () => {
  it('interpolates between keyframes and clamps to the track', () => {
    const track = solveThrow(request([2, 5], 8))
    const out = { p: { x: 0, y: 0, z: 0 }, q: { w: 1, x: 0, y: 0, z: 0 } }
    const a = track.poses[0][10]!
    const b = track.poses[0][11]!
    poseAt(track, 0, 10.5 * STEP, out)
    expect(out.p.x).toBeCloseTo((a.p.x + b.p.x) / 2, 9)
    poseAt(track, 0, 99, out)
    expect(out.p).toEqual(last(track.poses[0]).p)
    poseAt(track, 1, -1, out)
    expect(out.p).toEqual(track.poses[1][0]!.p)
  })
})
