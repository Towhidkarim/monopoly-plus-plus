import { SPACES, expectedActor, legalActions, type Action, type TradeOffer } from '@skyline/engine'
import type { GameStore, Snapshot } from '../../game/store.ts'
import { moveOptions, type MoveOption } from './moveChoice.ts'

/** A button the shell offers for the current decision. */
export interface Choice {
  label: string
  /** Key shown on the button and bound globally. */
  hotkey?: string
  run: () => void
}

/**
 * What the game is waiting for, derived once per render and shared by the banner, the dock,
 * the decision panels and the keyboard handler, so they can never disagree.
 */
export interface TurnView {
  actorSeat: number
  actorId: string
  /** The player the game waits on is a human at this screen. */
  human: boolean
  /** A human can act now (nothing is animating). */
  canAct: boolean
  legal: Action[]
  /** Dispatches for the waiting player. The UI only offers legal actions, so errors are ignored. */
  act: (a: Action) => void
  /** Which decision panel is open, if any (`move`: the Speed die's Bus or triples choice). */
  moment: 'buy' | 'auction' | 'debt' | 'offer' | 'move' | null
  /** The destinations to offer while `moment` is `move` (hotkeys 1, 2, 3, 4 in this order). */
  moves: MoveOption[]
  /** An offer a human must answer before play goes on (the bots wait too). */
  offer: TradeOffer | null
  primary: Choice | null
  secondary: Choice[]
  title: string
  subtitle: string
}

export function turnView(snap: Snapshot, store: GameStore): TurnView {
  const s = snap.state
  const p = snap.presented
  const solo = store.setup.seats.filter((x) => x.kind === 'human').length === 1
  const shownSeat = p.current
  const shownName = p.players[shownSeat]!.name
  const shownHuman = store.setup.seats[shownSeat]!.kind === 'human'
  const title = p.over ? 'Game over' : shownHuman && solo ? 'Your turn' : `${shownName}'s turn`

  const actorSeat = s.phase === 'gameOver' ? s.current : expectedActor(s)
  const actor = s.players[actorSeat]!
  const human = store.seatKind(actor.id) === 'human'
  const canAct = human && !snap.busy && s.phase !== 'gameOver'
  const legal = canAct ? legalActions(s, actor.id) : []
  const dispatch = (a: Action) => void store.dispatch(actor.id, a)
  const act = (a: Action) => () => dispatch(a)
  const find = <T extends Action['type']>(t: T) =>
    legal.find((a): a is Extract<Action, { type: T }> => a.type === t)

  const base = {
    actorSeat,
    actorId: actor.id,
    human,
    canAct,
    legal,
    act: dispatch,
    title,
    offer: null,
    moves: [],
  }

  // A human's drawn card waits for a click, even while the rest of the batch is queued.
  if (snap.card?.waiting) {
    return {
      ...base,
      moment: null,
      primary: { label: 'Continue', hotkey: 'Space', run: () => store.ackCard() },
      secondary: [],
      subtitle: 'Read your card, then continue.',
    }
  }

  const offer = snap.busy
    ? undefined
    : s.trades.find((t) => store.setup.seats[t.to]?.kind === 'human' && !s.players[t.to]!.bankrupt)
  if (offer) {
    return {
      ...base,
      offer,
      moment: 'offer',
      primary: null,
      secondary: [],
      subtitle: `${s.players[offer.to]!.name} has an offer to answer.`,
    }
  }

  const moment =
    s.pending?.kind === 'auction'
      ? 'auction'
      : canAct && s.debts[0]?.debtor === actorSeat
        ? 'debt'
        : canAct && s.pending?.kind === 'buy'
          ? 'buy'
          : canAct && s.pending?.kind === 'move'
            ? 'move'
            : null

  if (!canAct) {
    const subtitle = snap.busy
      ? (snap.log[0]?.text ?? '')
      : s.phase === 'gameOver'
        ? ''
        : s.debts.length > 0
          ? `${actor.name} must raise money.`
          : s.pending?.kind === 'auction'
            ? `${actor.name} is bidding.`
            : s.pending?.kind === 'move'
              ? `${actor.name} is choosing where to go.`
              : `${actor.name} is thinking…`
    return { ...base, moment, primary: null, secondary: [], subtitle }
  }

  if (moment === 'move' && s.pending?.kind === 'move') {
    const bus = s.pending.reason === 'bus'
    const moves = moveOptions(s, actorSeat)
    const secondary = moves.map((m, i) => ({
      label: `Move ${m.steps}`,
      hotkey: String(i + 1),
      run: act({ type: 'CHOOSE_MOVE', space: m.space }),
    }))
    return {
      ...base,
      moment,
      moves,
      // Space takes the first option (the normal move); the dock shows every option itself.
      primary: secondary[0] ?? null,
      secondary,
      subtitle: bus
        ? 'Bus! Move by one die or both.'
        : 'Triples! Pick any space on the board, or one of these.',
    }
  }

  const roll = find('ROLL')
  const end = find('END_TURN')
  const secondary: Choice[] = []
  const fine = find('PAY_JAIL_FINE')
  if (fine) secondary.push({ label: `Pay ₵${s.config.jailFine}`, hotkey: 'P', run: act(fine) })
  const card = find('USE_JAIL_CARD')
  if (card) secondary.push({ label: 'Use free card', hotkey: 'U', run: act(card) })

  const here = SPACES[p.players[actorSeat]!.position]!.name
  if (roll) {
    const jailed = actor.inJail
    return {
      ...base,
      moment,
      primary: {
        label: jailed ? 'Roll for doubles' : s.doubles > 0 ? 'Roll again' : 'Roll dice',
        hotkey: 'Space',
        run: act(roll),
      },
      secondary,
      subtitle: jailed
        ? `In the Lockup. Roll doubles, pay ₵${s.config.jailFine}, or use a free card.`
        : s.doubles > 0
          ? 'Doubles! Roll again.'
          : `On ${here}. Roll to move.`,
    }
  }
  if (end) {
    return {
      ...base,
      moment,
      primary: { label: 'End turn', hotkey: 'Space', run: act(end) },
      secondary,
      subtitle: 'Build, mortgage or trade, then end your turn.',
    }
  }
  const subtitle =
    moment === 'buy'
      ? `Buy ${SPACES[s.pending?.kind === 'buy' ? s.pending.space : 0]!.name} or put it up for auction.`
      : moment === 'debt'
        ? 'Raise money to pay what you owe.'
        : moment === 'auction'
          ? 'Your bid.'
          : ''
  return { ...base, moment, primary: null, secondary, subtitle }
}
