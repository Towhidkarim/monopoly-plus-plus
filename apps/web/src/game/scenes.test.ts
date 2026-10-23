import { describe, expect, it } from 'vitest'
import { GROUPS, SPACES, legalActions } from '@skyline/engine'
import { buildEvenlyPlan, liquidationValue, raisePlan } from '@skyline/bots'
import { playToScene, type Scene } from './scenes.ts'
import { GameStore } from './store.ts'

/** Same table as `?demo=play`: you plus three bots. */
function sceneStore(seed: number, scene: Scene): GameStore {
  const store = new GameStore({
    preset: 'standard',
    seed,
    seats: ['You', 'Nova', 'Atlas', 'Juno'].map((name, i) => ({
      id: `p${i + 1}`,
      name,
      kind: i === 0 ? 'human' : 'bot',
      piece: 'taxi',
      color: 0xffffff,
    })),
  })
  store.setSettings({ instant: true })
  expect(playToScene(store, scene)).toBe(true)
  return store
}

describe('dev scenes and one-click plans through the store', () => {
  it('reaches the buy and auction moments', () => {
    expect(sceneStore(7, 'buy').getSnapshot().state.pending?.kind).toBe('buy')
    expect(sceneStore(7, 'auction').getSnapshot().state.pending?.kind).toBe('auction')
  })

  it('Build evenly puts one house on every property of the set', () => {
    const store = sceneStore(17, 'build')
    const s = store.getSnapshot().state
    const group = SPACES[legalActions(s, 'p1').find((a) => a.type === 'BUILD')!.space]!.group
    const before = GROUPS[group]!.map((i) => s.houses[i]!)
    const plan = buildEvenlyPlan(s, 'p1', group)
    expect(store.run('p1', plan.actions)).toBeNull()
    const after = GROUPS[group]!.map((i) => store.getSnapshot().state.houses[i]!)
    expect(Math.min(...after)).toBe(Math.min(...before) + 1)
    expect(Math.max(...after) - Math.min(...after)).toBeLessThanOrEqual(1)
  })

  it('the automatic raise pays the debt when enough can be raised', () => {
    const store = sceneStore(17, 'debt')
    const s = store.getSnapshot().state
    const owed = s.debts.filter((d) => d.debtor === 0).reduce((t, d) => t + d.amount, 0)
    const need = owed - s.players[0]!.cash
    expect(liquidationValue(s, 'p1')).toBeGreaterThanOrEqual(need) // this seed can pay
    const plan = raisePlan(s, 'p1', need)
    expect(plan.amount).toBeGreaterThanOrEqual(need)
    expect(store.run('p1', plan.actions)).toBeNull()
    expect(store.getSnapshot().state.debts.some((d) => d.debtor === 0)).toBe(false)
  })
})
