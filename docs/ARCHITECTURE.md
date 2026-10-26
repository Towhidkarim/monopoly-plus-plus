# Architecture

## 1. System overview

```
packages/engine  (pure TS: reduce, legalActions, events, seeded RNG)
        |  actions in, { state, events } out
        v
Client store
  - authoritative state  (latest engine output; bots and network use this)
  - event queue          (events not yet played)
  - presented state      (what the screen shows; advances as events finish playing)
        |
        +--> React shell  (apps/web, Tailwind: lobby, action buttons, panels, log, trade, settings)
        +--> Pixi world   (packages/board, no React: board, tokens, buildings, dice, particles, ambient life)
                 ^
                 | choreography: GSAP timelines + spring/ticker "juice"
```

Multiplayer adds a server that runs the same engine and broadcasts accepted actions (or resulting events) to clients. Clients replay events through the same queue.

## 2. Engine contract (`packages/engine`)

```ts
export type PlayerId = string;

export interface GameState {
  rngState: number[];          // seeded RNG state lives inside the state
  turn: { current: PlayerId; phase: Phase; doublesCount: number };
  players: Record<PlayerId, PlayerState>;
  spaces: SpaceState[];        // 40 entries, owner, houses, mortgaged
  decks: { chance: number[]; chest: number[] };  // order of remaining cards
  bank: { houses: number; hotels: number };
  pending: PendingDecision | null;  // auction, trade, payment owed, etc.
  log?: never;                 // logging is derived from events, not stored
}

export type Action =
  | { type: 'ROLL' }
  | { type: 'BUY' }
  | { type: 'DECLINE_BUY' }              // triggers auction
  | { type: 'BID'; amount: number }
  | { type: 'PASS_BID' }
  | { type: 'BUILD'; space: number }
  | { type: 'SELL_BUILDING'; space: number }
  | { type: 'MORTGAGE'; space: number }
  | { type: 'UNMORTGAGE'; space: number }
  | { type: 'PROPOSE_TRADE'; trade: Trade }   // any player, any time (D8)
  | { type: 'CANCEL_TRADE'; tradeId: number }
  | { type: 'ACCEPT_TRADE'; tradeId: number } // recipient only
  | { type: 'REJECT_TRADE'; tradeId: number }
  | { type: 'TIMEOUT' }                       // time is an input: emitted by server/client timers
  | { type: 'PAY_JAIL_FINE' }
  | { type: 'USE_JAIL_CARD' }
  | { type: 'END_TURN' }
  | { type: 'DECLARE_BANKRUPTCY' };

export type GameEvent =
  | { type: 'DICE_ROLLED'; playerId: PlayerId; dice: [number, number] }
  | { type: 'MOVED'; playerId: PlayerId; path: number[]; passedGo: boolean }
  | { type: 'JUMPED'; playerId: PlayerId; to: number }       // card / go-to-jail
  | { type: 'CARD_DRAWN'; deck: 'chance' | 'chest'; cardId: number; playerId: PlayerId }
  | { type: 'CASH_CHANGED'; playerId: PlayerId; delta: number; reason: CashReason; counterparty?: PlayerId | 'bank' }
  | { type: 'PROPERTY_BOUGHT'; playerId: PlayerId; space: number; price: number }
  | { type: 'BUILT'; space: number; level: number }          // level 5 = hotel
  | { type: 'SOLD_BUILDING'; space: number; level: number }
  | { type: 'MORTGAGED'; space: number }
  | { type: 'UNMORTGAGED'; space: number }
  | { type: 'MONOPOLY_COMPLETED'; playerId: PlayerId; group: number }
  | { type: 'AUCTION_STARTED'; space: number }
  | { type: 'BID_PLACED'; playerId: PlayerId; amount: number }
  | { type: 'AUCTION_WON'; playerId: PlayerId; space: number; amount: number }
  | { type: 'TRADE_PROPOSED' | 'TRADE_ACCEPTED' | 'TRADE_REJECTED'; trade: Trade }
  | { type: 'JAILED'; playerId: PlayerId }
  | { type: 'RELEASED'; playerId: PlayerId }
  | { type: 'BANKRUPT'; playerId: PlayerId; to: PlayerId | 'bank' }
  | { type: 'TURN_STARTED'; playerId: PlayerId }
  | { type: 'GAME_OVER'; winner: PlayerId };

export function createGame(config: GameConfig, seed: number): GameState;
export function legalActions(state: GameState, playerId: PlayerId): Action[];
export function reduce(
  state: GameState, playerId: PlayerId, action: Action
): { ok: true; state: GameState; events: GameEvent[] } | { ok: false; error: EngineError };  // never throws
export function observe(state: GameState, playerId: PlayerId): PlayerView;  // masked: no deck order, no RNG
```

The shape above is indicative; the implementation keeps state flat and compact (arrays indexed by space and player index) for fast simulation and future learned bots (DECISIONS.md D9). `GameState` also carries `round` (for round limits), `trades` (open offers, each with a snapshot of the involved assets), and `config`.

Any-time actions (DECISIONS.md D8): BUILD, SELL_BUILDING, MORTGAGE, UNMORTGAGE, PROPOSE_TRADE, CANCEL_TRADE are legal for any player except during an auction or after game over. Rent is settled inside the same `reduce` as the landing roll. Debt (owing more than cash) is the only blocking pending state.

Rules for the engine:

- State is plain serializable data (JSON-safe). No class instances, no functions, no `Map`/`Set` in state.
- `reduce` is pure. It returns a new state (structural sharing is fine, mutation of inputs is not).
- Every state change that the player should see produces an event. The view must be able to reconstruct the animation from events alone.
- Board data (names, prices, rents, groups, cards) lives in a data module, not hardcoded in logic, so the theme can be swapped.
- Rule options (house rules) are in `GameConfig`: free-parking pot, auction on decline, starting cash, double GO salary, even-build rule, jail rules, dealt properties, round limit, speed die. Presets: Standard (default), Turbo, Classic (DECISIONS.md D10).
- Rules are organized as small modules with hooks (`onLand`, `onRoundStart`, `rentModifier`, ...) so new "++" mechanics plug in without forking the engine.

Rules coverage that needs explicit tests: rent with monopoly and with houses, utility and railroad rent scaling, doubles and the three-doubles-to-jail rule, jail exit options, auctions (including all-pass), mortgage and unmortgage interest, even-building and house shortage, hotel replacing four houses, selling back at half price, trades including mortgaged property, bankruptcy to a player versus to the bank, and card effects (move-to, nearest-utility/railroad, repairs, get-out-of-jail).

## 3. The three spaces

| Space | Used for | Coordinates |
|---|---|---|
| Grid (logical) | Rules, paths, ownership, picking, tween targets | `col`, `row` in continuous board units (0..12.2, see `BOARD.md` section 2) and `z` (height). Ring tiles are rectangles with classic proportions, not unit cells |
| World (iso pixels) | Everything on the board | output of `project(pos)` |
| Overlay (screen px) | Property cards, Chance cards, dice tray, popups | plain screen coordinates, not panned or zoomed |

Only `project()` knows the camera angle.

```ts
export type Pos = { col: number; row: number; z: number };
export const TILE = { w: 128, h: 64, flat: 96 };  // measure h/w from the final art, do not assume 2:1
export const LEVEL = 10;                           // screen px per unit of z

export function project(p: Pos, t = viewT) {       // viewT: 0 = top-down, 1 = isometric
  const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
  return {
    x: lerp(p.col * TILE.flat, (p.col - p.row) * TILE.w / 2, t),
    y: lerp(p.row * TILE.flat, (p.col + p.row) * TILE.h / 2, t) - p.z * LEVEL,
  };
}

// Inverse for a known height (needed for picking). Valid at the endpoints viewT = 0 or 1.
export function unproject(x: number, y: number, z: number): { col: number; row: number };
```

- The ring mapping from space index 0..39 to a footprint rectangle (`ringFootprint`) lives in one function in `packages/board`, used by view, picking, and tests. GO is the bottom corner; spaces proceed clockwise visually.
- Tween logical values (`col`, `row`, `z`) and project each tick. Do not tween screen coordinates for board objects.
- The top-down view is a debug scaffold and an optional "tactical view". The product's default is isometric. A global `viewT` tween morphs between them.
- Hover and picking: invert at the tile's top-surface height. Lock hover while `0 < viewT < 1`.
- Depth sorting: `zIndex = col + row` plus a small bias for height or a sub-order. Set `sortableChildren` on the world container.
- Anchor every sprite at its footprint bottom-center.

## 4. Event queue and presented state

```ts
// Store (framework-agnostic)
interface Store {
  authoritative: GameState;
  presented: PresentedState;       // subset the UI reads: cash, positions, owners, buildings, etc.
  queue: GameEvent[];
  dispatch(action: Action): void;  // local or network; appends events to queue
  advancePresented(e: GameEvent): void;
  skipAll(): void;                 // clear queue, presented = authoritative, board.sync()
}
```

- Consumer loop: take event, `await board.play(event)` (returns a GSAP timeline), then `store.advancePresented(event)`. React panels and Pixi read `presented`.
- `BoardView.sync(presented)` snaps visuals with no animation (initial load, reconnect, skip).
- `BoardView.play(event)` choreographs one event. It must be safe to kill and fall back to `sync`.
- Bots and the network use `authoritative`. They never wait on animations, except that bot "thinking delay" is a UI concern.
- Settings: animation speed multiplier, skip-animations, reduced motion (respect `prefers-reduced-motion`), bots-fast mode.
- One-shot visual effects (money pops, coin transfers, callouts) are emitted by the store during playback (`onFx`) and animated by a DOM layer; a human's drawn card pauses the queue until acknowledged (DECISIONS.md D21).

## 5. Board view (Pixi)

Layers, back to front:

1. `sky/backdrop` (night tint overlay is above the world, see below)
2. `world` container (the camera target; sortable)
   - `base` (baked static city, plaza, rails; `cacheAsTexture`)
   - `lots` (40 lot objects, see section 6)
   - `props` (static buildings that stand on lots, houses and hotels)
   - `actors` (tokens, dice if on board, vehicles)
   - `lights` (window-light layer, additive blend)
   - `fx` (particles, glows)
3. `night` overlay (multiply tint, driven by `clock.night`)
4. `overlay` container (cards, dice tray, popups) outside the viewport transform

Camera: custom, in `packages/board` (DECISIONS.md D6): drag, pinch, wheel zoom, clamp, and spring-driven follow. Auto-follow the active token; any user drag pauses follow until the next turn.

All Pixi code lives in `packages/board`, exposed through `mountBoard(host)` and a small imperative handle (`sync`, `play`, input callbacks, `destroy`). Board layout, tile anatomy, buildings, and interaction details: `BOARD.md`.

Juice toolkit (`packages/board/src/juice/`):

- `Spring` and `smooth` (`anim/`), `Shake` (trauma squared times smooth noise, applied as a camera offset), hit-stop (`board.hitStop(ms)`: the world steps at 3% speed, the camera keeps running), `Particles` (pooled confetti, sparkles, dust), squash and idle bob on tokens.
- Every tuned number is in `juice/config.ts` (`DEFAULT_JUICE`); the playground's Juice tab edits a live copy (`board.setJuice`).
- One ticker loop drives tweens, springs, particles and the camera. Do not run two competing per-frame loops for the same object.
- The board emits **beats** (`BoardListeners.beat`) as motion reaches its moments (each hop, the landing, a house hitting its lot, each tile of a set lighting up) so the shell can play sounds in sync. Sound lives in `apps/web/src/audio/` (mixer, synth, catalog, event-to-sound map), never in `packages/board`.

Standard choreographies (each is `play(event) => Timeline`):

- `DICE_ROLLED`: dice lift, tumble (cosmetic faces), land on the engine's result with a shadow and squash.
- `MOVED`: per-step hop along the ring (linear on the grid, arc on `z`), landing squash, camera follow. Teleport arcs for `JUMPED`.
- `CASH_CHANGED`: numbers tick and pop; coins fly between panel and tile for rent and purchases.
- `PROPERTY_BOUGHT`: owner marker pops in, tile flashes.
- `BUILT`: building drops from above onto its slot, dust puff, small shake.
- `MONOPOLY_COMPLETED`: band pulse across the group, particles, brief hit-stop.
- `CARD_DRAWN`: card launches from its tile (world to overlay), flips, shows, returns.
- `JAILED`/`RELEASED`, `BANKRUPT`, `GAME_OVER`: dedicated sequences.

## 6. Property lots (tiles)

Each of the 40 spaces is a code-built container from grid geometry, not a picture:

- Layers: `walls` (extruded faces), `top` (rhombus at `z = thickness`), `band` (group color strip on the inner edge), optional `art` (light texture), `deco` (owner marker, mortgage overlay), `houses` (four slots or one hotel slot).
- Draw rhombi by projecting the four cell corners. Never rotate a square.
- Walls fade with `1 - viewT` (they collapse in top-down).
- Owned: tint the owner marker only, never the group band. Mortgaged: desaturate top and band. Hover: highlight rhombus at top height. Target: pulse the band.
- Group identity must not depend on color alone: add a distinct pattern or icon per group.
- No text on lots. Names, prices, and rents show in a React tooltip or the property card.
- Cache walls and top as a texture once built; keep owner marker and houses as separate children.

Cards (title deeds, Chance, Community Chest) are flat overlay UI, built as containers whose text comes from data. Group color bands come from the same palette as the tile bands.

## 7. Ambient life (cosmetic only)

Never touches the engine or event queue, except that some game events may trigger local flourishes.

- `clock.night` in 0..1 drives sky tint (multiply), window-light layer alpha (additive), and street lamps.
- Vehicles and trains: sprites advancing a distance along closed polylines of grid or world points, oriented to the tangent. Random start offsets and speeds.
- Blinking lights: sine alpha with random phase.
- Smoke, steam, sparks: pooled particle emitters with fixed caps.
- Cull offscreen updates. Provide an ambient-motion toggle independent of game-animation settings.
- Day/night art workflow is in `ART_GUIDE.md`.

## 8. Multiplayer

The full plan, including rooms, invites and free-plan limits, is DECISIONS.md D40.

```
Browser ── HTTP ──> Worker (Hono)                     apps/server (Cloudflare adapter)
                      POST /api/rooms           create a room, return code + seat token
                      GET  /api/rooms/:code     exists? free seat?
                      GET  /api/rooms/:code/ws  upgrade, forward to the room
                      everything else           the static Vite app
                            │
                            ▼
                     Room Durable Object ──> RoomCore (packages/room, pure TS)
                      sockets, alarms, SQLite     seats, seq numbers, reduce,
                      mapped onto the ports       observe() per player, timers, bots
```

- **The room is the authority.** It holds the only full `GameState`, runs `reduce` (which also rejects actions from the wrong player), and broadcasts events with a monotonically increasing sequence number. Clients never apply an action themselves.
- **Protocol** (`packages/protocol`, validated with Valibot on both sides): `join`, `ready`, `action`, `events`, `snapshot` (for reconnect), `error`, `ping`, `chat`, and room messages for the lobby (seats, settings, host).
- **Hidden information:** every outgoing message goes through `observe()` for its player. The room owns deck order and RNG state; clients receive card results via events, never the deck order or seed.
- **Reconnect:** the client sends the last sequence number it saw; the room replies with missed events (kept in memory; storage holds only actions) or a full snapshot, and the client calls `board.sync`.
- **Time and bots:** turn and auction timers and bot pacing run on the room's alarms, which feed `TIMEOUT` or a bot's `decide()` into `reduce`. A disconnected player's seat can be handed to a bot after a grace period.
- **Portable:** `RoomCore` only talks to `Connection`, `RoomStore` and `Scheduler` ports, so a Node server (Hono on Node, `ws`, a room map) can replace Cloudflare later; the client uses a plain `WebSocket`.
- Optional P2P (host-authoritative WebRTC via PeerJS) can share the same protocol package. Needs signaling and a TURN fallback, so it is not the default.
- Local hotseat and vs-bots modes run the engine in-process behind the same dispatch interface, so game code never branches on mode.

## 9. Bots (`packages/bots`)

```ts
export interface Bot {
  name: string;
  // view = observe(state, playerId): bots never see deck order or RNG state.
  // rng is the bot's own RNG, never the game's. null = nothing to do right now.
  // Called on every state change, so bots can act out of turn (trades, management).
  decide(view: PlayerView, playerId: PlayerId, rng: RNG): Action | null;  // non-null must be legal
}
```

Progression:

1. **Heuristic bot v1 (built, DECISIONS.md D22):** `packages/bots/src/heuristic/`. A position-value model (net worth plus expected rent from Markov landing odds plus set upside) drives every decision under a danger-scaled cash reserve: buying, auction bids (with denial value), building by rent gain per ₵, mortgaging to fund houses, jail timing, raising money (shared `plans.ts`), and trades (answering any time; proposing for a set's missing piece). Behaviour is `BotParams` data; personalities are presets. `match.ts` runs headless games and lets bots answer offers out of turn.
2. **Heuristic bot v2:** tuned parameters (reserve, aggression, trade willingness), structured trade evaluation (value-based).
3. **Simulation harness (`pnpm sim`):** N headless games per matchup with seeded RNG, win-rate and game-length stats. Used to tune parameters automatically (grid search or evolutionary tuning).
4. **Search bot:** determinized Monte Carlo (sample hidden deck order, rollout with heuristic policy), time-boxed per decision.
5. **Learned policy (stretch):** self-play with a value or policy network, using engine as the environment. Requires a fast, allocation-light engine; keep that in mind when designing state. The training plan (imitation, value head, self-play league, personality dials, opponent modeling, shipping as ONNX) is in `docs/LEARNED_BOTS.md`.

Trade negotiation: begin with structured proposals (give set A, get set B, cash delta). Bot accepts if its valuation delta exceeds a threshold. Free-form negotiation is out of scope.

## 10. Testing strategy

- **Engine unit tests:** per rule, as listed in section 2.
- **Property-based/fuzz tests:** random legal-action playouts for thousands of games with invariants: total money plus bank constant under known transfers, no negative houses, no property with two owners, every game terminates or hits a turn cap, `legalActions` is never empty for the active player.
- **Determinism test:** replaying the action log from a seed reproduces state and events exactly.
- **Serialization test:** `JSON.parse(JSON.stringify(state))` round-trips.
- **View tests:** projection and inverse round-trip; ring mapping covers all 40 cells with no duplicates; hit-test returns the expected cell.
- **Visual checks:** debug overlay (grid lines, cell indices, `(col,row)` labels) toggle; screenshots saved for review.
- **Perf budget:** 60 fps on a mid-range laptop and a mid-range Android phone during a full turn with ambient motion on. Track bundle size.

## 11. Accessibility and settings

- Group patterns in addition to colors; high-contrast option.
- Keyboard operable action buttons; focus states; screen-reader labels in the React shell.
- Reduced motion; animation speed; ambient motion toggle; mute and volume.
- Text is HTML, not canvas.
