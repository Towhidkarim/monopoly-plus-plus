const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [0, 2],
    [2, 0],
    [2, 2],
  ],
  5: [
    [0, 0],
    [0, 2],
    [1, 1],
    [2, 0],
    [2, 2],
  ],
  6: [
    [0, 0],
    [0, 2],
    [1, 0],
    [1, 2],
    [2, 0],
    [2, 2],
  ],
}

function Die({ value, delay }: { value: number; delay: number }) {
  return (
    <div
      className="grid size-12 animate-dice grid-cols-3 grid-rows-3 gap-0.5 rounded-xl bg-ink p-2 shadow-lg shadow-black/50"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'backwards' }}
      aria-label={`Die showing ${value}`}
    >
      {PIPS[value]!.map(([r, c]) => (
        <span
          key={`${r}${c}`}
          className="size-2 place-self-center rounded-full bg-table"
          style={{ gridRow: r + 1, gridColumn: c + 1 }}
        />
      ))}
    </div>
  )
}

/** The engine already chose the dice; this only shows them (CLAUDE.md principle 3). */
export function DiceTray({ dice, roll }: { dice: readonly [number, number] | null; roll: number }) {
  if (!dice) return null
  return (
    <div key={roll} className="pointer-events-none flex gap-2">
      <Die value={dice[0]} delay={0} />
      <Die value={dice[1]} delay={70} />
    </div>
  )
}
