# Board layout and world

Target look: `docs/reference/board-layout-ref.png` (layout and mood only; colors are not final). Decision record: `DECISIONS.md` D13.

## 1. Overall shape

- Diamond isometric board on a dark table. GO is the **bottom corner**; spaces run clockwise on screen.
- Outer ring: 40 spaces. Inner area: a raised city plaza with skyscrapers, two crossing roads, a rail loop around the plaza with trains, a small park, and the two card decks (Chance and Chest) as card stacks on either side.
- Thin board slab with visible side walls (extruded edge), soft shadow on the table.

## 2. Board units and ring geometry

Logic uses space index `0..39`. The view converts an index to a footprint rectangle in continuous **board units** `(col, row)`; `project()` then maps board units to screen.

Classic proportions (tunable constants in one module):

| Constant | Value | Meaning |
|---|---|---|
| `SIDE_W` | 1.0 | width of a side tile along the edge |
| `DEPTH` | 1.6 | depth of a side tile (edge to inner city) and size of a corner |
| `BOARD` | `2 * DEPTH + 9 * SIDE_W` = 12.2 | full board side |

- Corners are `DEPTH x DEPTH` squares; side tiles are `SIDE_W x DEPTH` rectangles.
- Inner city occupies `[DEPTH, BOARD - DEPTH]` on both axes (9 x 9 units).
- `ringFootprint(index) => { col0, row0, col1, row1, side, inward }` is the single source of truth, used by view, picking, and tests. `side` is 0..3 (bottom, left, top, right edge in screen terms) and `inward` is the unit direction toward the city (for band placement and building orientation).
- Token anchor points: `anchor(index, slot)` gives up to 6 token positions per tile without overlap, and a `jailCell` / `justVisiting` split for the jail corner.

## 3. A property tile

Back to front, all code-drawn from the footprint:

1. Slab walls (only visible on outer-edge tiles; the ring is one slab).
2. Top surface (light concrete), subtle per-group pattern for color-blind support.
3. **Group band** on the inner edge (the strip facing the city), group color plus pattern.
4. Lot: the outer ~60% of the tile is the building plot.
5. Building: grows with development (see 4).
6. Decor: owner marker (small colored flag or roof tint chip), mortgage overlay (desaturate plus hatch).
7. Interaction overlays: hover rim, selection glow, target pulse, path preview.

No text on tiles. Names, prices, rents are React tooltips and cards.

## 4. Development grows the skyline

| Level | Visual |
|---|---|
| Unowned | Empty lot with a small "for sale" marker |
| Owned, 0 houses | Small low-rise in the owner's accent |
| 1 to 4 houses | Same building gains floors (and a setback at 3+) |
| Hotel | Replaced by a slim tower with a rooftop beacon (blinks at night) |

Each change is an animated event (`BUILT`, `SOLD_BUILDING`): floors drop in with squash and dust; hotel rises with a small shake.

## 5. Code-generated buildings

`isoBox(footprint, height, palette)` draws three faces (top, left, right) with fixed light from the top-left, plus:

- window grid on the side faces (rows by floor, columns by width), stored as geometry so night mode can light a random subset;
- roof variants: flat with HVAC boxes, setback, antenna, helipad (towers);
- seeded variation (height, window pattern, roof) so the city looks hand-built but is reproducible.

The plaza city is built once from a seeded layout and baked with `cacheAsTexture`. Window lights live on a separate additive layer.

## 6. Living world (cosmetic only)

- **Day/night:** `clock.night` 0..1 drives a multiply tint over the world and the alpha of the window-light layer; street lamps and beacons fade in.
- **Trains:** 2 to 3 trains on the rail loop polyline (around the plaza), oriented to the tangent, with headlights at night.
- **Cars:** small boxes on the cross roads, looping, pausing at the center intersection.
- **Small life:** blinking beacons, fountain shimmer in the park, occasional steam from rooftops (pooled, capped).
- All of this is off the event queue, culled offscreen, and switchable (ambient toggle, reduced motion).

## 7. Interaction model

- **Hover** a tile: rim highlight at top-surface height plus React tooltip with name, owner, rent.
- **Click/tap** a tile: select it (glow), open the property card in the shell.
- **Path preview:** when the active player is about to move, the landing tile pulses and the path tiles glow in sequence.
- **Camera:** drag to pan, wheel/pinch to zoom (clamped), double-click to recenter; auto-follow the moving token with a spring; any manual drag pauses follow until the next turn.
- **Tokens:** hop per tile (arc on `z`, squash on landing), slide into a free anchor slot, idle bob.
- **View morph:** `viewT` tween between top-down (debug/tactical) and isometric; hover locked mid-morph.
