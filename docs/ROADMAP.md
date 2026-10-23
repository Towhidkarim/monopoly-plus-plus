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

- Code-generated buildings (`docs/BOARD.md` section 5): `isoBox`, window grids, roof variants, seeded plaza city baked to a texture.
- Development visuals: lot buildings grow floors per house, hotel tower.
- Group patterns, owner markers, mortgage overlay, tokens, dice faces in the target palette.
- Optional AI art for hero pieces only (see `ART_GUIDE.md`), with tooling in `tools/assets` if used.

Acceptance: board looks coherent in the target palette and close to the reference layout; every group is distinguishable with color removed; asset sources logged in `docs/ASSETS.md`.

## Milestone 7: Living board

- `clock.night` driven day/night cycle: multiply tint plus additive window-light layer (from the known window geometry).
- Trains on the rail loop; cars on the cross roads; blinking beacons; rooftop steam with caps.
- Ambient toggle and reduced-motion behavior; offscreen culling.
- Event-driven flourishes: hotel built lights up windows, monopoly completion sends a light pulse around the ring.

Acceptance: ambient adds less than a defined frame-time budget (record it); toggle fully disables traffic and blinking.

## Milestone 8: Cards, auctions, trades, polish UI

- Flat overlay cards: title deeds, Chance/Chest draw with launch from the deck stack, flip, reveal, return.
- Auction UI with bid animations and timers (`TIMEOUT` actions); structured trade UI (offer sets, cash, accept/reject, counter).
- Property management panel (build, sell, mortgage) usable any time, with even-build feedback.
- Bankruptcy and endgame sequences; "final round" banner; results screen.
- Accessibility pass: keyboard control, labels, high-contrast patterns.

Acceptance: every engine action is reachable through the UI; all pending-decision states (auction, trade, debt) have a clear UI path; keyboard-only play works for core actions.

## Milestone 9: Online multiplayer

1. `packages/protocol`: message types, versioning, validation (zod or hand-rolled).
2. `apps/server`: Cloudflare Worker + Durable Object per room; join, ready, start; authoritative `reduce`; broadcast events with sequence numbers; server-side timers emit `TIMEOUT`.
3. Client network adapter implementing the same `dispatch` interface; lobby with room codes.
4. Reconnect via sequence numbers and snapshot; presented state resync with `board.sync`.
5. Hidden info handling (clients get `observe()` views; deck order stays server-side).
6. Server-side bot seats; replace disconnected players with bots optionally.
7. (spike, optional) P2P host-authoritative WebRTC using the same protocol.

Acceptance: four browsers play a full game through a room; refreshing a tab mid-game rejoins correctly; invalid actions are rejected server-side; two clients never diverge (state checksum compared at turn ends in dev mode).

## Milestone 10: Bot v2 and search

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

## Later: "++" and learned bots

- New mechanics as rule modules: city events per round, player characters, and more (to be designed).
- Learned policy: self-play using the engine as environment, model exported for in-browser inference.

## Cross-cutting risks and how to retire them early

| Risk | Retire by |
|---|---|
| Rule edge cases cause bugs | Milestone 2 fuzz and invariant tests before the game is wired to the UI |
| Board geometry and picking errors | Milestone 1 debug overlay; code-drawn tiles as source of truth |
| Animation desync from state | Event queue plus presented state; `skipAll` always works |
| Concurrency from any-time actions | Engine result type, trade snapshots, server ordering (D8) |
| Mobile performance | Test on a phone-class device in Milestones 1, 5, and 7 |
| Scope creep | Finish each milestone's acceptance before starting the next |
