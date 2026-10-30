import { Container } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { Camera } from './camera.ts'

/** A 2:1 board 200 wide on a 400 x 800 portrait screen, settled. */
function setup() {
  const world = new Container()
  const cam = new Camera(world)
  cam.setViewport(400, 800)
  cam.setBounds({ minX: -100, minY: -50, maxX: 100, maxY: 50 })
  cam.recenter(true)
  const settle = () => {
    for (let i = 0; i < 200; i++) cam.update(16)
  }
  return { world, cam, settle }
}

describe('Camera (D68)', () => {
  it('fits the board width, or zooms past it by the overscan share', () => {
    const { world, cam, settle } = setup()
    settle()
    const fit = world.scale.x
    expect(fit).toBeCloseTo(400 / (200 * 1.04))
    cam.setOverscan(0.25)
    cam.recenter(true)
    expect(world.scale.x).toBeCloseTo(fit * 1.25)
  })

  it('keeps following, at the same zoom relative to the fit, when the insets change', () => {
    const { world, cam, settle } = setup()
    const fit = world.scale.x
    cam.setFollow(() => ({ x: 60, y: 20 }), 1.5)
    settle()
    expect(world.scale.x).toBeCloseTo(fit * 1.5)
    // A 200 px panel on the left halves the width the board fits in.
    cam.setInsets({ top: 0, right: 0, bottom: 0, left: 200 })
    settle()
    expect(cam.isFollowing).toBe(true)
    expect(world.scale.x).toBeCloseTo((fit / 2) * 1.5)
  })
})
