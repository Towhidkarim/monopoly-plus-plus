# Roadmap

Work top to bottom. Each milestone has acceptance criteria; do not start the next until they pass. Items marked (spike) are time-boxed experiments to retire a risk early.

Order changed on 2026-10-23 (DECISIONS.md D12): the board view comes before the full rules engine, because seeing and touching the board early is a top priority. The board depends only on grid math and event types, not on rule logic.

## Milestone 0: Project scaffold (done 2026-10-23)

- pnpm workspace: `packages/engine`, `packages/bots`, `packages/protocol`, `packages/board`, `apps/web`, `tools/assets`.
- TypeScript 7 strict, Vite 8, Vitest 5, oxlint (type-aware), oxfmt, Tailwind v4 for the shell. `pnpm check` runs format check, lint, typecheck, test.
- `docs/ASSETS.md`, `docs/DECISIONS.md`, `docs/BOARD.md`.
- PixiJS agent skills installed via pnpm (`.claude/skills/pnpm-pixi.js-*`).

Acceptance: `pnpm dev` shows a Pixi canvas next to a React panel; `pnpm test` runs a trivial test; engine purity enforced by lint (imports, timers, `Math.random`, `Date.now`) and by an engine tsconfig without DOM or Node types.

## Milestone 1: Board feel (visual foundations, spike-heavy) — done 2026-10-23

Status 2026-10-23: items 1 to 7 implemented (geometry with tests, slab/tiles/icons, placeholder city, custom camera, hover/select with tooltip, token hops and jumps, playground with tuning sliders and auto-play, iso/top-down morph, debug overlay, FPS readout). Pending: real-GPU frame-time check (item 8) and the developer's feel review. Screenshots: `docs/screenshots/m1-*.png`.

Everything in `docs/BOARD.md` sections 2, 3, and 7, with code-drawn placeholder visuals.

1. `packages/board/src/geometry/`: board units, `ringFootprint`, token `anchor` slots, `project`/`unproject`, `viewT` morph. Unit tests: footprints cover the ring with no overlap, round-trips, picking returns the expected tile.
2. Board slab, 40 tiles (corners, side tiles, group bands with patterns), inner city area placeholder, debug overlay (grid lines, indices) toggle.
3. Custom camera: pan, wheel/pinch zoom with clamp, recenter, spring follow.
4. Hover rim and click-to-select using top-surface picking; React tooltip fed by a small event bridge from the board.
5. Tokens: per-tile hop along the ring with arc and landing squash, anchor slots for several tokens, teleport arc for jumps.
6. Minimal event types in `packages/engine` (`DICE_ROLLED`, `MOVED`, `JUMPED`) and a **playground page** that plays scripted events ("roll 7", "go to jail", "4 tokens race") with live tuning sliders (hop height, speed, squash).
7. Top-down to isometric morph via `viewT`, hover locked mid-morph.
8. (spike) Frame time with 40 tiles + 4 tokens + a few hundred placeholder city boxes.

Acceptance: hovering any tile highlights exactly that tile in both views; tokens hop smoothly around the full ring; camera follow feels good; 60 fps on desktop; screenshots in `docs/screenshots` reviewed against `docs/BOARD.md`.

## Milestone 2: Rules engine (no UI) — done 2026-10-23

Status: all rule areas implemented and tested (126 tests), fuzz and determinism tests pass, `pnpm sim` 10,000 games with zero violations (DECISIONS.md D18, D19). Speed die deferred.

1. Board data module: 40 spaces, groups, prices, rent tables, house costs, cards (placeholder names).
2. Seeded RNG (small, fast, serializable, e.g. mulberry32 or xoshiro128) and deterministic shuffle.
3. State, actions, events as in `ARCHITECTURE.md`. `createGame`, `reduce` (result type), `legalActions`, `observe`.
4. Implement in this order: turn flow and movement, buying and rent, cards, jail, doubles, building (even-build, shortages), mortgages, auctions, debt, trades (non-blocking, any time), bankruptcy and win condition, round limit and net-worth win.
5. Config presets: Standard, Turbo, Classic (DECISIONS.md D10). Rule modules with hooks.
6. Test suite: unit tests per rule, fuzz playouts, determinism and serialization tests.
7. CLI runner (`pnpm sim --games 1000`) that plays random-legal-action games and reports invariants and game lengths.

Acceptance: 10,000 random-playout games finish with zero invariant violations; replay from seed reproduces identical final state; every rule listed in `ARCHITECTURE.md` section 2 has a test.

## Milestone 3: Heuristic bot and simulation harness (done 2026-10-23)

Status: heuristic bot with personalities, Markov landing odds, basic bot-to-bot trades (pulled forward from Milestone 10), `pnpm sim` matchups with seat rotation, stats, length estimates and CSV. Beats random 99.9% over 1,000 games; 7,700+ games/min. Turbo retuned. See DECISIONS.md D22.

- `Bot` interface (`decide(view, playerId, rng) => Action | null`); random-legal bot (baseline); heuristic bot v1.
- Simulation harness: seeded matchups, win rates, average game length (in turns and estimated minutes), per-bot stats, CSV output.
- Parameterized bot (reserve cash, build aggression, trade threshold) loadable from JSON.
- Measure preset game lengths and tune Standard and Turbo toward their targets.

Acceptance: heuristic bot beats the random bot decisively over 1,000 games; games terminate; harness runs thousands of games per minute (record the number in `docs/DECISIONS.md`).

## Milestone 4: Playable hotseat game with basic animation — done 2026-10-23 (before Milestone 3, see DECISIONS.md D20)

Status: setup screen, hotseat play with humans and bots, action bar from `legalActions`, auctions, debt flow, property cards with build/sell/mortgage, card popups, dice tray, event log, game over, resume from save, speed/skip/instant. Trades UI is in Milestone 8. Bot seats use a simple stand-in bot until Milestone 3.

- Client store: authoritative state, event queue, presented state, `skipAll`.
- `BoardView.sync` and `BoardView.play` for: `DICE_ROLLED`, `MOVED`, `JUMPED`, `CASH_CHANGED`, `PROPERTY_BOUGHT`, `BUILT`, `JAILED`.
- React shell (Tailwind): setup screen (mode preset, player count, human or bot per seat, seed), action bar driven by `legalActions`, player panels reading presented state, event log, property tooltip. TanStack Router once there are multiple screens.
- Local game mode runs engine in-process behind the same `dispatch` interface planned for network play.
- Bots play automatically with an artificial think delay and a fast mode.

Acceptance: a full game (humans and bots) can be played start to finish; no desync between panels and board; skip-animations leaves the board correct; reload with the same seed and action log reproduces the game.

## Milestone 4.5: UX pass (added 2026-10-23)

Status 2026-10-23: done and approved by the developer (DECISIONS.md D21). Items 2 to 8 implemented; Trade stays disabled until Milestone 8; no auction countdown in local play. Screenshots: `docs/screenshots/m45-*.png`. Dev scenes: `?demo=play&scene=buy|auction|debt|build|card`.

Pulls the most important UX from Milestones 5 and 8 forward, because it is what every game feels like.

1. Design mockup first, approved by the developer (canvas: "Skyline game screen UX", https://claude.ai/artifact/S7MPiETs7dKw335qkyXb2x, private to the developer's account). Layout and flow are what it fixes; its board drawing and visual style are placeholders.
2. Top HUD with player cards (cash, holdings, turn state) and a turn banner.
3. Bottom action dock: one primary action with keyboard hint (Space), My city, Trade.
4. Decision moments: buy (title deed + cash preview + set progress), live auction panel, raising-money panel.
5. My city drawer: sets with progress, house pips, rent now/next, one-click "Build evenly", mortgage controls.
6. Feedback: activity toasts, money flying between player cards, number pops, low-cash warnings, hints.
7. Cards wait for a click (bots' cards auto-close); keyboard shortcuts; help/rules overlay.
8. All timings in one config file for tuning.

Acceptance: the developer approves the mockup and then the built screens; every decision has a clear moment; building a full set takes one click; the build matches the approved design.

## Milestone 5: Juice pass 1 (feel)

Status 2026-10-23: implemented (DECISIONS.md D23), awaiting the developer's feel and sound review. Juice toolkit, effects, playground Juice tab, sound system with Kenney CC0 samples plus code-generated sounds, sound board at `#sounds`, reduced motion. Pending: real-GPU 60 fps check with a 4-bot game. Screenshots: `docs/screenshots/m5-*.png`.

- Juice toolkit: `Spring`, smoothing, shake, hit-stop, squash, number pop, idle bob.
- Tune: token hop, landing squash, dice tumble with shadow, number ticks, purchase pop, build drop with dust, monopoly celebration (particles, band pulse, hit-stop), camera follow.
- Extend the playground page with every effect in isolation and live tuning sliders.
- Sound hooks (even if silent): event to sound-cue map with pitch variation for streaks.
- Settings: animation speed, reduced motion, skip animations.

Acceptance: each effect has tuned parameters stored in one config file; a 4-bot game runs at 60 fps on target hardware with effects enabled; reduced motion disables shake, hit-stop, and large motion.

## Milestone 6: City and art pass 1

Status 2026-10-24: step 1 done, the art style page is at `#art` (`packages/board/src/art/`: style presets, modelling kit, building generators, lot growth in four families, a 3x3-block district with real block layouts, train). Style chosen: **D · Calm modern** (DECISIONS.md D26). Steps 2 to 4 done: the art kit draws the property lots on the real board (for sale, owned, 1 to 4 houses, hotel; one family per group: cottage, brick, modern, glass from cheap to expensive), and new buildings drop in with the existing juice. Step 5 done (DECISIONS.md D27): the board centre is a seeded city in style D (outer belt of houses and parks, rail loop with four stations by the railroad tiles and a parked train, a raised 2x2-block downtown cut by the cross roads with the landmark in front), `citySeed` in GameSetup with "New city" on the setup screen, layout plan tested in `view/cityPlan.test.ts`. Setup screen shows the next game's city as a live backdrop (left-column panel on wide screens, "New city" rerolls in place). Acceptance review 2026-10-24: 12 rerolled cities all pass the layout rules (`docs/screenshots/m6-city-12-rerolls.png`); groups readable in grayscale after darker, larger pattern marks (`m6-grayscale.png`). Step 6: the ring tiles, slab and tokens already sit well with style D next to the city, so no repaint was needed; revisit with the Milestone 8 UI polish. Pending: the developer's real-GPU 60 fps check with a 4-bot game (playground FPS readout, tab focused) and feel review. Screenshots: `docs/screenshots/m6-art-*.png`.

1. **Art style page** (`#art`): the real renderer draws one lot growing through every level, a corner tile, a city block and a train on a short track, in 2 or 3 style directions side by side, with a Reroll button. The developer picks or mixes the direction before anything is scaled up.
2. **Modelling kit** (`docs/BOARD.md` section 5): shaded boxes with contact shadows, pitched roofs, cylinders, low-poly trees, window grids as data, roads/sidewalks/crosswalks/rails/park pieces, all driven by a style object.
3. **Building generators** (seeded): gable house, townhouse row, brick walk-up with water tower, office block, glass tower, landmark.
4. **Development visuals:** for-sale lot, owned house, terrace, apartment block with setback, hotel tower with beacon; each step drops in with the existing juice.
5. **Dynamic seeded city** (DECISIONS.md D25): a different central city every game from a city seed saved with the game (separate from the dice seed, cosmetic only). Layout, building mix, landmark and each group's lot architecture vary; ring, corners, cross roads and rail loop stay fixed. Setup screen preview with a "New city" button. Every generated city must look as neat as the reference image (`docs/reference/board-layout-ref.png`), enforced by the layout rules in BOARD.md section 5.
6. Group patterns, corner tiles, owner markers, mortgage overlay, tokens and dice in the chosen palette.
7. Optional AI art for hero pieces only (see `ART_GUIDE.md`); not planned.

Acceptance: the board looks coherent in the chosen style and at least as neat as the reference image; a sheet of 12 rerolled cities is reviewed and every one passes the layout rules (no overlaps, clear streets, tall-in-the-middle skyline); every group is distinguishable with color removed (grayscale screenshot); a 4-bot game stays at 60 fps with the full city; asset sources logged in `docs/ASSETS.md`.

## Milestone 7: Living board

Status 2026-10-25: traffic and trains on the board with a "City life" toggle (D29); day/night (D28): an 8-round auto cycle with a Sky preference (Auto / Day / Night), a golden-hour dusk into a blue night, lit windows with soft halos, street-lamp pools, headlights and tail lights, lit train cars, floodlit landmark base, blinking beacons on tower tips and hotels (owner color), light pools under tokens; tiles and pieces stay readable. Screenshots: `docs/screenshots/m7-*.png`. Also done (2026-10-25): windows switching on and off through the night, a new building's windows flare on at impact (fully for a hotel), a light pulse in the owner's color runs around the ring when a set completes, and pieces stand on a strip in front of buildings (D30). Pending: the developer's real-GPU frame-time check and feel review.

- `clock.night` driven day/night cycle: multiply tint plus additive window-light layer (from the known window geometry).
- Night lights (faked 2D lighting, no real-time shadows): street-lamp glow pools on the ground, car headlights and tail lights that move with traffic, lit train windows, landmark floodlights, windows switching on and off over time. Lights fade in at dusk.
- Trains on the rail loop; cars on the cross roads; blinking beacons; rooftop steam with caps.
- Street traffic (prototyped on #art, `art/traffic.ts`): cars, taxis, vans and buses loop around blocks in their lanes, brake for the vehicle ahead, and are depth-sorted between blocks. Moves onto the board with the seeded city.
- Ambient toggle and reduced-motion behavior; offscreen culling.
- Event-driven flourishes: hotel built lights up windows, monopoly completion sends a light pulse around the ring.

Acceptance: ambient adds less than a defined frame-time budget (record it); toggle fully disables traffic and blinking.

## Milestone 8: Cards, auctions, trades, polish UI

References for the card and UI look: `docs/reference/UI_REFS.md`.

Build plan (2026-10-25, look approved: DECISIONS.md D32, design sources in `docs/design/m8/`). Each step is committed on its own; the developer may improve anything spotted along the way, aiming for fun, cozy and visible juice:

1. Foundation and game chrome: theme tokens, fonts, shared primitives (panel, buttons, keycaps, token avatars, money with coin), top bar, turn ribbon, dice tray, hint, activity toasts, action dock. In parallel: board framing (warmer slab sides with a light rim, a soft table vignette, a subtle day/night table shift).
2. Cards: rich deed (full and compact, real building art from the board), Opportunity and City Fund cards with emblems, card motion (idle sway, tilt, deal, flip, stamps).
3. Buy moment and auction (raise steps from the current bid, bidder cards, bid history).
4. Trade table (felt mats, coin stacks, bot mood) and incoming offers.
5. Raise money (bill) and the My city drawer.
6. Setup, game over (certificate, podium), menu, rulebook help, tooltip, callouts; copy fixes (stale trade text, dev links).
7. Smaller windows (no overlap), keyboard and accessibility pass.

After Milestone 8: 3D dice thrown onto the board (Pixi cubes, tumble solved backward to the engine's result), tried on `#playground` first.

Status 2026-10-24: the structured trade screen (offers both ways, bot verdicts, counter-offers, bot offers to humans) was pulled forward and is done (DECISIONS.md D24). The rest of this milestone, including the card-styled look of the trade screen, is still to do.

Status 2026-10-26: all 7 build steps done and reviewed (steps 1-7, D32-D36): lamplight theme and fonts, card-stock deeds with lot portraits, buy moment and auction, felt trade table and offers, raise-money bill, My city drawer, setup, game over, menu and rulebook, custom cursor, fit at 950×800 to 1440×900, dialog focus, keyboard play, one live region, reduced motion everywhere. Pending: the developer's hands-on play review (real Tab traversal and screen reader not verified).

- Flat overlay cards: title deeds, Chance/Chest draw with launch from the deck stack, flip, reveal, return.
- Auction UI with bid animations and timers (`TIMEOUT` actions); structured trade UI (offer sets, cash, accept/reject, counter).
- Property management panel (build, sell, mortgage) usable any time, with even-build feedback.
- Bankruptcy and endgame sequences; "final round" banner; results screen.
- Accessibility pass: keyboard control, labels, high-contrast patterns.

Acceptance: every engine action is reachable through the UI; all pending-decision states (auction, trade, debt) have a clear UI path; keyboard-only play works for core actions.

## Milestone 9: Online multiplayer

Plan: DECISIONS.md D40 (Hono on one Cloudflare Worker, a SQLite-backed Durable Object per room, a portable `RoomCore`, room codes as invites).

1. `packages/protocol`: message types, versioning, Valibot validation shared by client and server.
2. `packages/room`: `RoomCore` behind `Connection`, `RoomStore` and `Scheduler` ports; seats, lobby, ready and start; authoritative `reduce`; events with sequence numbers; `observe()` per player (hidden info stays in the room); timers as `TIMEOUT`; per-turn saving: actions not events, one checkpoint row per turn. Tested in plain Vitest with fake connections.
3. `apps/server`: Hono routes (`POST /api/rooms`, `GET /api/rooms/:code`, the socket upgrade) and the room Durable Object (hibernating sockets, alarms, SQLite) as a thin adapter; Cloudflare's Vite plugin in `pnpm dev`; one deploy with the static app.
4. Client: network transport behind the same `dispatch` interface; TanStack Router with `/r/:code`; Play online (create, join by code), lobby (seats, bots, settings, ready, copy invite link).
5. Reconnect via sequence numbers and snapshot (seat token in `localStorage`); presented state resync with `board.sync`; dev-mode view checksums at turn ends.
6. Bot seats in the room; optional bot takeover of disconnected seats; host handover; room expiry and creation rate limit.
7. (spike, optional) P2P host-authoritative WebRTC, or a Node adapter, using the same protocol.

Acceptance: four browsers play a full game through a room; refreshing a tab mid-game rejoins correctly; invalid actions are rejected server-side; two clients never diverge (state checksum compared at turn ends in dev mode).

Status 2026-10-26: steps 1 to 6 done (DECISIONS.md D41 to D46). Acceptance run on the dev server (Worker plus Durable Object): four tabs played a full Turbo game (20 rounds, 80 turns) through one room, one tab reloaded mid-game and rejoined, all four ended on the identical state with no checksum warnings, and `pnpm room:smoke` showed the room rejecting an out-of-turn action. Step 7 (P2P WebRTC or a Node adapter) is kept for later. Pending: the first real deploy (`wrangler login`, `pnpm deploy`) and a play session across real machines.

## Milestone 13: Twists, modern modes for "++" (planned 2026-10-28)

Order (the developer, 2026-10-28): this comes soon, right after the current UX batch in `docs/NEXT.md` and before Milestone 10 and the learned bots. It is numbered 13 only because it was planned after 12. Moves the strongest ideas from `docs/IDEAS.md` into a plan. Design rules: DECISIONS.md D61.

**Goals**

- **More control:** the player makes a real choice on most turns, not only "buy or pass".
- **Less waiting:** things to do or react to when it is not your turn.
- **Shorter, closer games:** fewer runaway leaders, no players knocked out with nothing to do.
- **Variety:** two games with the same settings should play differently.
- **Show off the juice and the living board:** twists show up in the city (weather, buildings, trains), not only in text.
- Classic play stays available unchanged; every twist is optional.

**Rules for every twist**

- A twist is data in `GameConfig.twists` that `reduce` and `legalActions` read, with no special-case code in the shell. Pure, seeded, replayable, and its events are played by the view like any other.
- Hidden information (a hand of cards, secret goals) only reaches other players through `observe()`.
- The heuristic bot plays every twist sensibly (simple value hooks, tested), and `pnpm sim --fuzz` covers each one.
- Balanced with `pnpm sim` before it ships. Metrics: rounds per game, first-seat win rate, how often the round-10 leader wins (lower is better, within reason), how often the result is close, and the heuristic bot's edge over random.
- Each twist gets a one-line explanation in setup and the rulebook, plus its own juice beat.

**Steps (one per commit, each restated with acceptance criteria first)**

1. **Twist framework and lobby:** the `twists` config, a "Twists" section in local and online setup, the rulebook listing active twists, and the sim reporting the metrics above per config. Done when a no-op twist travels through setup, engine, room and replay.
2. **Dice control:** *Roll 3, keep 2* (choose which pair you move by, with landing odds per choice) and the *Speed die* (a third die with bus and "next unowned lot" faces). Then the *Momentum meter*: paying rent and low rolls fill it; spend it on a reroll or a ±1 nudge.
3. **Blitz mode:** a preset built on step 2 (speed die, dealt lots, short round limit), aiming at about 20 minutes with 4 players. Done when the sim confirms the length.
4. **Comeback (D63):** underdog salary and Second Wind bank loans as an alternative to mortgaging, repaid from income (both done 2026-10-28).
5. **Perk cards (the signature twist):** each time you pass Start you draft 1 of 3, holding at most 3. Instant cards (Flash Sale, Detour ±2, Double Rent Tonight, Eminent Domain) and reaction cards that can be played out of turn (Rent Shield, Insurance). A card fan in the shell and card juice when played; bots value and play cards.
6. **City headlines:** each round, a headline for the next round is shown on a ticker (Heatwave: beach rents ×2, Rail strike, Construction boom, Audit on the richest). The board shows it (weather, lights, stopped trains).
7. **City Council (no dead players):** a bankrupt player stays in and, each round, picks next round's headline from two or places a bounty on the leader.
8. **Acceptance:** a play session against bots with each twist on its own and with all of them on; the sim metrics are recorded in D61 and show the twists keep games at least as close as Classic; bots never stall with any twist (fuzz).

**Possible things for later in this milestone or after (menu, not committed)**

- **District specialization:** completing a set lets you choose Tourist (spiky rent), Residential (income each lap), Commerce (boosts neighbours) or Industrial (cheap to build, lowers nearby rent); each looks different on the board.
- **Adjacency combos:** neighbouring sets you own add bonuses, with chained number pops ("COMBO ×3").
- **Skyscrapers:** a tier above hotels.
- **Trade contracts:** a share of a set's rent for N laps, immunity for N laps, loans with interest; enforced by the engine.
- **Shares** in other players' sets that pay dividends.
- **Characters:** one passive and one active ability with a cooldown each (Developer, Lawyer, Banker, Courier).
- **Secret goals:** draft 2 at the start (own both utilities, build 6 houses on one side); finishing them pays a bonus.
- **Economy cycles:** boom and bust phases city-wide, shown by the day/night light.
- **Cheat cards** with a penalty if you are caught.
- **Skyline Run (solo roguelike):** a series of games against bots with a net-worth target by round N, perks picked between games, and rising stakes levels.
- **Daily City:** the same seed and bots for everyone each day, with a leaderboard.
- **Cosmetic unlocks only:** tokens, city themes and palettes; never pay to win.

## Milestone 10: Bot v2 and search

Order (the developer, 2026-10-26): fun and polish come first, so Milestone 11 is done before this one (see `docs/NEXT.md`).


- Tune heuristic parameters using the simulation harness (grid search or evolutionary).
- Structured trade evaluation and bot-initiated trades; personalities and human-like timing.
- Determinized Monte Carlo search bot with a per-move time budget.
- Difficulty levels derived from bot parameters and search budget.

Acceptance: search bot beats tuned heuristic bot at a statistically meaningful rate over at least 1,000 games; difficulty levels are distinguishable in head-to-head results.

## Milestone 11: Release polish (optional)

- Rename and reskin check for trademark safety (names, icons, text).
- Persistence: settings, last game, stats; PWA install.
- Desktop wrapper with Wails (DECISIONS.md D11).
- Mobile layout (portrait shell, touch camera gestures already supported).
- Performance and bundle audit; lazy-load audio and heavy layers.
- Optional: replays from action logs; spectator mode; cosmetic themes (different cities and palettes).

## Milestone 12: Guided tutorial (planned 2026-10-28)

A real first game against two bots, about 10 minutes, with a coach that teaches each rule as it happens. Order to be confirmed with the developer (after game length options and the remaining polish, or before).

1. **Scripted dice in the engine:** an optional config list of dice totals used before the seeded RNG, so a tutorial plays the same way every time. Pure and deterministic, with Vitest cases like every rule.
2. **Coach framework (shell):** steps as data (text, spotlight target via `data-tutorial="…"` anchors, the event or state that completes the step), a soft spotlight and coach card that never covers the highlighted control, gating of controls that are not part of the step, Skip tutorial at any time, and resume after reload.
3. **Lessons (about 12):** roll, buy (with buy advice), earning rent, paying rent (landing odds), auction and bidding, completing a set, building in My city, jail and cards, a bot's trade offer, raising money (mortgage, selling houses), how the game ends. Short, friendly copy.
4. **Tutorial bots:** simple and predictable, scripted where a lesson needs it (one fixed trade offer, a bid war that you can win).
5. **Entry points:** "New here? Learn to play" on the start screen (offered once on first launch), and a Tutorial item in the game menu.
6. **Acceptance:** an automated test plays the whole tutorial through the store; every step is reachable; skipping and resuming work; reduced motion and keyboard play work.

Later, the same coach framework can show one-time "first time" tips in normal games (first auction, first chance to build).

## Later: learned bots

The "++" mechanics moved to Milestone 13. Neural-network bots come later, after Milestone 10, and must learn to play the twists too (each twist widens the action space; the policy's input should include `GameConfig.twists`).

- Learned policy: self-play using the engine as environment, model exported for in-browser inference. Plan: `docs/LEARNED_BOTS.md`.

## Milestone 14: Mobile (built 2026-10-30, DECISIONS.md D64; waiting on the developer's real-phone check)

Seamless play on phones, portrait first. The developer pulled this ahead of the rest of Milestone 13. One step per commit:

1. Foundations: `viewport-fit=cover`, `100dvh`, no page scroll, pull-to-refresh or double-tap zoom, safe-area utilities, `useLayout()` (`compact` below 768 px wide or 500 px tall), board framing measured from the shell bars on compact screens. (done 2026-10-30)
2. Compact HUD (player chips) and a thumb-zone action dock, 48 px touch targets. (done 2026-10-30)
3. Bottom sheet component; decision panels (buy, auction, debt, offer, card) move onto it; log and My city as full-height sheets. (done 2026-10-30; a tapped tile opens its deed in a sheet too)
4. Tapping a player chip opens a player sheet (holdings, loan Pay off); the hover tooltip stays away after a touch (a tap opens the tile); the two newest toasts hang under the turn banner on phones. (done 2026-10-30; a closer portrait default zoom was left out: moves already zoom to the piece and pinch works) Portrait framing: the board is width-limited, so tiles are small; try a closer default zoom that follows the active piece.
5. Trade composer as a full-screen view with your side / their side tabs. (done 2026-10-30)
6. PWA: manifest, icons, service worker, install, fullscreen launch. (done 2026-10-30)
7. Mobile performance profile: a "Battery saver" setting (resolution at most 1.5x, 30 fps while nothing plays, a touch lifts the cap), on by default for low-power touch devices; City life already turns the traffic off. (done 2026-10-30; the real-phone check is the developer's)

Acceptance: a full game against bots and an online game are playable one-handed on a 390×844 and a 360×780 screen in portrait, and on a phone held sideways, with nothing clipped or overlapping and no page scroll; desktop is unchanged.

## Cross-cutting risks and how to retire them early

| Risk | Retire by |
|---|---|
| Rule edge cases cause bugs | Milestone 2 fuzz and invariant tests before the game is wired to the UI |
| Board geometry and picking errors | Milestone 1 debug overlay; code-drawn tiles as source of truth |
| Animation desync from state | Event queue plus presented state; `skipAll` always works |
| Concurrency from any-time actions | Engine result type, trade snapshots, server ordering (D8) |
| Mobile performance | Test on a phone-class device in Milestones 1, 5, and 7 |
| Scope creep | Finish each milestone's acceptance before starting the next |
