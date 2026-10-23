import type { BoardBeat } from '@skyline/board'
import type { GameStore } from '../game/store.ts'
import { CueMapper, type Cue } from './cues.ts'
import { sound, type SoundEngine } from './engine.ts'

export function playCues(list: readonly Cue[], engine: SoundEngine = sound): void {
  for (const { sound: id, ...o } of list) engine.play(id, o)
}

/**
 * Plays a game's sounds: events from the store as they animate, effects (coins, pops), and the
 * card closing. Returns the board beat handler (pass it to the board's listeners) and a
 * disconnect function.
 */
export function connectSound(
  store: GameStore,
  engine: SoundEngine = sound,
): { beat: (b: BoardBeat) => void; disconnect: () => void } {
  const cues = new CueMapper((id) => store.seatKind(id) === 'human')
  const speed = () => store.settings.speed
  let card = store.getSnapshot().card
  const offs = [
    store.onEvent((e) => playCues(cues.event(e, speed()), engine)),
    store.onFx((fx) => playCues(cues.fx(fx, speed()), engine)),
    store.subscribe(() => {
      const next = store.getSnapshot().card
      if (card && !next) engine.play('card.close')
      card = next
    }),
  ]
  return {
    beat: (b) => playCues(cues.beat(b), engine),
    disconnect: () => {
      for (const off of offs) off()
    },
  }
}
