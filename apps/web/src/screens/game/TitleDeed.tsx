import { SPACES, mortgageValue } from '@skyline/engine'
import { groupName, spaceInfo } from '../../spaceInfo.ts'
import { fmtMoney } from './format.ts'

const HOUSE_ROWS = ['With 1 house', 'With 2 houses', 'With 3 houses', 'With 4 houses', 'With hotel']

/**
 * The printed card for an ownable space (light, like a real deed). `active` marks the row that
 * applies now: for properties 0 = base, 1 = full set, 2..6 = 1 house..hotel; for stations, the
 * number owned minus one; for utilities, 0 or 1.
 */
export function TitleDeed({
  index,
  active = -1,
  className = '',
}: {
  index: number
  active?: number
  className?: string
}) {
  const sp = SPACES[index]!
  const info = spaceInfo(index)
  const rows: [string, string][] =
    sp.kind === 'property'
      ? [
          ['Rent', fmtMoney(sp.rent[0]!)],
          ['Rent with full set', fmtMoney(sp.rent[0]! * 2)],
          ...HOUSE_ROWS.map((label, i): [string, string] => [label, fmtMoney(sp.rent[i + 1]!)]),
        ]
      : sp.kind === 'railroad'
        ? sp.rent.map((r, i): [string, string] => [`${i + 1} station${i ? 's' : ''} owned`, fmtMoney(r)])
        : [
            ['1 utility owned', '4 × dice'],
            ['2 utilities owned', '10 × dice'],
          ]
  const eyebrow =
    sp.kind === 'property'
      ? `Title deed · ${groupName(sp.group)}`
      : sp.kind === 'railroad'
        ? 'Station'
        : 'Utility'
  return (
    <div
      className={`w-80 overflow-hidden rounded-[20px] bg-slate-50 text-table shadow-2xl shadow-black/60 ${className}`}
    >
      <div className="px-5 py-4" style={{ background: info.color ?? '#94a3b8' }}>
        <div className="text-[11px] font-bold tracking-[0.12em] text-table/65 uppercase">{eyebrow}</div>
        <div className="mt-0.5 text-[28px] leading-tight font-bold">{sp.name}</div>
      </div>
      <div className="flex flex-col gap-1 px-5 pt-4 pb-5 text-sm">
        {rows.map(([label, value], i) => (
          <div
            key={label}
            className={`-mx-2 flex justify-between rounded-md px-2 py-0.5 ${i === active ? 'bg-amber-200/70 font-bold' : i === 1 && sp.kind === 'property' ? 'font-semibold text-amber-700' : ''}`}
          >
            <span className={i === active || (i === 1 && sp.kind === 'property') ? '' : 'text-slate-600'}>
              {label}
            </span>
            <span className="font-semibold tabular-nums">{value}</span>
          </div>
        ))}
        <div className="my-1.5 h-px bg-slate-200" />
        {sp.kind === 'property' && (
          <div className="flex justify-between text-[13px]">
            <span className="text-slate-600">House cost</span>
            <span className="tabular-nums">{fmtMoney(sp.houseCost)} each</span>
          </div>
        )}
        <div className="flex justify-between text-[13px]">
          <span className="text-slate-600">Mortgage value</span>
          <span className="tabular-nums">{fmtMoney(mortgageValue(index))}</span>
        </div>
      </div>
    </div>
  )
}
