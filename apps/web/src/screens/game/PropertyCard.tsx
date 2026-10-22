import { SPACES, isOwnable, legalActions, mortgageValue, type Action } from '@skyline/engine'
import type { GameStore, Snapshot } from '../../game/store.ts'
import { spaceInfo } from '../../spaceInfo.ts'
import { Btn, Money } from './ui.tsx'

const RENT_LABELS = ['Rent', 'With 1 house', 'With 2 houses', 'With 3 houses', 'With 4 houses', 'With hotel']

/** Title deed for the selected tile, with build/sell/mortgage controls for its human owner. */
export function PropertyCard({ index, snap, store }: { index: number; snap: Snapshot; store: GameStore }) {
  const info = spaceInfo(index)
  const sp = SPACES[index]!
  const p = snap.presented
  const ownerSeat = p.owner[index]!
  const owner = ownerSeat >= 0 ? p.players[ownerSeat]! : null
  const level = p.houses[index]!

  const ownerId = owner?.id
  const canManage = ownerId !== undefined && store.seatKind(ownerId) === 'human' && !snap.busy
  const options = canManage
    ? legalActions(snap.state, ownerId).filter(
        (a): a is Extract<Action, { space: number }> => 'space' in a && a.space === index,
      )
    : []
  const labelFor = (a: Extract<Action, { space: number }>) => {
    switch (a.type) {
      case 'BUILD':
        return level === 4 ? `Build hotel (₵${sp.houseCost})` : `Build house (₵${sp.houseCost})`
      case 'SELL_BUILDING':
        return `Sell building (+₵${sp.houseCost / 2})`
      case 'MORTGAGE':
        return `Mortgage (+₵${mortgageValue(index)})`
      case 'UNMORTGAGE':
        return `Lift mortgage (₵${mortgageValue(index) + Math.ceil(mortgageValue(index) * snap.state.config.mortgageInterest)})`
    }
  }

  return (
    <div className="animate-rise overflow-hidden rounded-xl border border-line bg-white/[0.03]">
      <div className="px-4 py-3" style={{ background: info.color ?? '#1e293b' }}>
        <div
          className={`text-[10px] font-semibold tracking-widest uppercase ${info.color ? 'text-table/70' : 'text-ink-muted'}`}
        >
          {info.kind}
        </div>
        <div className={`text-lg font-bold ${info.color ? 'text-table' : 'text-ink'}`}>{info.name}</div>
      </div>
      <div className="px-4 py-3 text-sm">
        {isOwnable(index) ? (
          <>
            <Row label="Price" value={<Money value={sp.price} />} />
            {sp.kind === 'property' &&
              sp.rent.map((r, i) => (
                <Row
                  key={i}
                  label={RENT_LABELS[i]!}
                  value={<Money value={r} />}
                  highlight={owner !== null && level === i}
                />
              ))}
            {sp.kind === 'railroad' &&
              sp.rent.map((r, i) => (
                <Row key={i} label={`${i + 1} station${i ? 's' : ''} owned`} value={<Money value={r} />} />
              ))}
            {sp.kind === 'utility' && (
              <>
                <Row label="1 utility owned" value="4 × dice" />
                <Row label="2 utilities owned" value="10 × dice" />
              </>
            )}
            {sp.kind === 'property' && <Row label="House cost" value={<Money value={sp.houseCost} />} />}
            <Row label="Mortgage value" value={<Money value={mortgageValue(index)} />} />
            <div className="mt-3 border-t border-line pt-3 text-ink-muted">
              {owner ? (
                <>
                  Owned by <span className="font-semibold text-ink">{owner.name}</span>
                  {p.mortgaged[index] && <span className="text-alert"> · mortgaged</span>}
                </>
              ) : (
                'For sale'
              )}
            </div>
            {options.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {options.map((a) => (
                  <Btn key={a.type} onClick={() => store.dispatch(ownerId!, a)}>
                    {labelFor(a)}
                  </Btn>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-ink-muted">{describeSpace(index, snap)}</p>
        )}
      </div>
    </div>
  )
}

function Row({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={`flex justify-between py-0.5 ${highlight ? 'font-semibold text-gold' : 'text-ink'}`}>
      <span className={highlight ? '' : 'text-ink-muted'}>{label}</span>
      {value}
    </div>
  )
}

function describeSpace(index: number, snap: Snapshot): string {
  const sp = SPACES[index]!
  const c = snap.state.config
  switch (sp.kind) {
    case 'go':
      return `Collect ₵${c.goSalary} every time you pass.`
    case 'tax':
      return `Pay ₵${sp.tax} to the bank.`
    case 'chance':
      return 'Draw an Opportunity card.'
    case 'chest':
      return 'Draw a City Fund card.'
    case 'jail':
      return `Just visiting, unless you were sent here. Leave by rolling doubles, paying ₵${c.jailFine}, or using a free card.`
    case 'parking':
      return c.freeParkingPot ? `Collect the pot (₵${snap.presented.pot}).` : 'A free rest. Nothing happens.'
    case 'goToJail':
      return 'Go directly to the Lockup. Do not pass Launch.'
    default:
      return ''
  }
}
