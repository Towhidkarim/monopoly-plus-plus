# Decisions

Short ADR-style log. Newest last. Each entry: context, decision, consequences. Supersede rather than edit old entries.

---

## D1. pnpm workspace monorepo (2026-10-23)

**Context:** Engine, bots, protocol, board view, web app, and later a server and a native wrapper share code.
**Decision:** pnpm workspace. Packages export TypeScript source directly (`"exports": "./src/index.ts"`), no per-package build step. Vite and Vitest consume source; each package typechecks on its own.
**Consequences:** Zero build orchestration. If a package ever needs publishing or Node execution from `node_modules`, add a build for that package only.

## D2. TypeScript 7 (native compiler) (2026-10-23)

**Context:** TS 7.0 (Go port) went GA in July 2026 and ships as the regular `typescript` package. 8 to 12x faster typechecks.
**Decision:** `typescript@^7`. Shared `tsconfig.base.json` with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `erasableSyntaxOnly`.
**Consequences:** TS 7.0 has no stable programmatic API until 7.1. Nothing in our stack needs it (Vite/Vitest transpile with oxc; oxlint type-aware uses `oxlint-tsgolint`). Avoid tools that depend on the TS API (typescript-eslint, etc.).

## D3. oxlint + oxfmt, no ESLint/Prettier (2026-10-23)

**Decision:** oxlint (type-aware via `oxlint-tsgolint`) and oxfmt (pre-1.0, passes Prettier conformance). Style: no semicolons, single quotes, width 110. Markdown is not auto-formatted.
**Engine purity** is enforced by an oxlint override on `packages/engine/**`: `no-restricted-imports` (pixi, react, gsap, board, apps, Node built-ins), `no-restricted-globals` (timers, rAF, performance, crypto), `no-restricted-properties` (`Math.random`, `Date.now`). The engine tsconfig also has no DOM and no Node types.

## D4. No TanStack Start; SPA with TanStack Router later (2026-10-23)

**Context:** TanStack Start is an SSR/server-functions framework.
**Decision:** Plain Vite SPA. Add TanStack Router (SPA mode) when we have more than one screen (menu, lobby, game, playground, `/room/:code` links).
**Why:** SSR gives nothing to a canvas game; our server is a WebSocket Durable Object, not route loaders; native wrappers want a static SPA; less weight.

## D5. `packages/board`: framework-agnostic Pixi world (2026-10-23)

**Decision:** All Pixi code lives in `packages/board` (no React). `apps/web` mounts it via `mountBoard(host)` and talks to it through a small imperative handle (`sync`, `play`, `destroy`, input callbacks).
**Why:** Any shell (web, Wails desktop, a future mobile shell) reuses the board. Keeps per-frame work out of React.

## D6. Custom camera instead of pixi-viewport (2026-10-23)

**Context:** pixi-viewport v6 targets Pixi v8 but has open v8 type/runtime issues. We need only pan, wheel/pinch zoom, clamp, and smooth follow.
**Decision:** Own ~200-line camera in `packages/board`, spring-driven follow.
**Consequences:** Smaller bundle, juicier follow, one less compatibility risk. Revisit only if we need features we would otherwise rebuild.

## D7. Engine contract details (2026-10-23)

Resolves the mismatch between CLAUDE.md and ARCHITECTURE.md.

- `reduce(state, playerId, action) => { ok: true, state, events } | { ok: false, error }`. The RNG state lives inside `GameState`; there is no separate `rng` argument. Illegal actions return an error result, never throw (the server sees bad actions routinely).
- Bots: `decide(view, playerId, rng) => Action | null`. `view` is the masked observation (see D9). `rng` is the bot's own RNG, never the game's. `null` means "nothing to do right now", which lets bots act out of turn (trades, management) when called on every state change.
- Time is an input: timers live outside the engine; expiry enters as a `TIMEOUT` action.

## D8. Property management any time (2026-10-23)

**Decision:** Any player may BUILD, SELL_BUILDING, MORTGAGE, UNMORTGAGE, PROPOSE_TRADE, CANCEL_TRADE at any time except during an auction or after game over. ACCEPT/REJECT only by the trade's recipient.
- Rent is resolved inside the same `reduce` as the roll that lands, so reactive building cannot change rent already owed.
- Trades are non-blocking: several open offers may coexist; each stores a snapshot of the involved assets and is auto-voided when any of them changes.
- Debt is the only blocking state: a debtor must raise cash (mortgage, sell, trade) or declare bankruptcy. Others can still trade with the debtor.
- Online, the server applies actions in arrival order; stale actions get an error result and the UI shows a gentle "too late" nudge.

## D9. AI-ready engine shape (2026-10-23)

**Decision:** Flat, compact state (arrays indexed by space and player index); `observe(state, playerId)` returns a masked view (no deck order, no RNG state) used by bots and network clients. Simulation must run thousands of games per minute.
**Why:** Strong, human-like, and eventually neural-net bots. Masking prevents cheating and matches what online clients may see.

## D10. Game modes as config presets (2026-10-23)

- **Standard (default, target 45 to 60 min):** 2 dealt properties per player, auction on decline, round limit then "final round", highest net worth wins.
- **Turbo (target ~20 min):** speed die, 3 dealt properties, higher GO salary, short round cap.
- **Classic:** full rules, no limit.
Targets are verified by the bot simulation harness, not guessed. Rules are small modules with hooks so "++" mechanics (city events, characters) plug in without forking the engine.

## D11. Native wrapper: Wails (Go) (2026-10-23)

**Decision:** If/when a native app is built, use Wails wrapping the same SPA build (`apps/desktop`). Wails v3 is in beta (stable desktop API); v2 is the current stable line. Choose at that time.
**Consequences:** No Node or Tauri assumptions in the web app; keep it a static SPA with relative asset paths.

## D12. Milestone order: board feel before full rules (2026-10-23)

**Context:** The developer's top priority is seeing and touching the board early.
**Decision:** Board view milestone (ring, lots, camera, highlights, token hops, playground) moves ahead of the full rules engine. It depends only on grid math and event *types*, not on rule logic, so the engine-first principle for rules is preserved.

## D13. Board layout and code-first city (2026-10-23)

**Context:** Target look is `docs/reference/board-layout-ref.png`: diamond isometric board, GO at the bottom corner, rectangular side tiles with small buildings, raised central city with skyscrapers, cross roads, a rail loop with trains.
**Decision:**
- Ring tiles use classic proportions (corners larger and square, side tiles narrow and deep), expressed in continuous board units. Logic still uses space index 0..39; only the view maps index to a footprint rectangle. Details in `docs/BOARD.md`.
- City buildings are **code-generated** isometric boxes (three face tones, window grids, roofs) from a seeded layout. This matches the flat-shaded reference style, and gives night window lights for free because window geometry is known. AI art becomes optional polish, not a dependency. (Supersedes the "central plaza is an AI image" line in `ART_GUIDE.md`.)
- Houses render as a building on the lot that **grows floors** with each house; a hotel becomes a tower. The skyline literally grows during the game.

## D15. Custom tween/spring before GSAP (2026-10-23)

**Decision:** Milestone 1 choreography (hops, slides, morph) uses a ~80-line promise-based `Animator` and a `Spring`, both stepped from the single Pixi ticker. GSAP is deferred until timelines get complex enough to need it (labels, overlaps, scrubbing), likely in the juice pass.
**Why:** Zero dependency weight, one frame loop, `finishAll()` gives skip-animations for free.

## D16. Heights flatten in the top-down view (2026-10-23)

**Decision:** `project()` scales `z` by `viewT`, so the top-down tactical view is truly flat (walls and buildings collapse to their footprints) and the isometric view has full height. Picking always inverts at the tile surface. Billboards (pawns) are drawn once in screen space and never redrawn by the morph.

## D17. Player pieces are vehicles with their own movement styles (2026-10-23)

**Decision:** Pieces are code-drawn city objects (taxi, bus, drone, balloon, plus the classic pawn), chosen per player and purely cosmetic. Each kind maps to a movement style in `packages/board/src/pieces/motion.ts`: **drive** (lane-following with a trapezoid speed profile, lean on accelerate/brake/turn), **fly** (lift off, straight line over the city, hover with bob), **float** (slow curved drift with sway, soft landing), **hop** (classic). Vehicles are box parts in a local frame, re-drawn only when their heading (4 per lap) or the view morph changes. Airborne pieces render above the city.
**Later:** Gemini sprites can replace the shapes per kind (2 images + mirroring cover 4 headings) without touching the motion code.

## D18. Rules engine details settled in Milestone 2 (2026-10-23)

- **Economy:** classic price, rent, and card tables with placeholder names (mechanics are reusable).
- **Debts:** a payment the payer cannot afford becomes a queued debt (`state.debts`), settled automatically after any action once the debtor has the cash. Only the payer's own queued debts force queueing, so other players are never blocked by someone else's debt. The front debtor blocks turn actions; others keep their any-time actions.
- **Bankruptcy simplifications:** buildings are sold to the bank at half price first; a creditor receives mortgaged property without paying the 10% interest; properties surrendered to the bank return unowned (no forced auction). Revisit if games feel off.
- **Auctions:** turn-based English auction (bidders in seat order after the decliner); real-time clocks send TIMEOUT, which passes.
- **Trades:** validated on propose and accept, re-validated after every action (`pruneTrades`); receiving mortgaged property costs the 10% fee.
- **Speed die (Turbo):** deferred; Turbo currently means more dealt properties, higher salary, shorter round limit.
- **Validation pattern:** each rule is a pure `check` plus an `apply`; `legalActions` reuses the checks, so it never clones state.

## D19. Simulation baseline (2026-10-23)

`pnpm sim` (random legal actions, 4 players): Standard preset 10,000 games, all finished, 0 invariant violations, about 405 games/s (24,000 games/min) on the dev laptop. Classic with invariants checked after every action: 1,000 games, about 12M actions, 0 violations. Random players rarely go bankrupt, so Standard games run to the round limit; real game-length tuning waits for heuristic bots (Milestone 3).

## D20. Playable game before smart bots; client store design (2026-10-23)

- **Order:** Milestone 4 (playable hotseat game) was done before Milestone 3 (heuristic bot), so the game is playable early. A simple stand-in bot (`packages/bots/src/simple.ts`) fills bot seats until the heuristic bot lands.
- **GameStore** (`apps/web/src/game/store.ts`): framework-agnostic; holds the authoritative engine state, an event queue, and the presented state. Events are played one at a time (`board.play`), each applied to the presented state after its animation; when a batch ends the presented state is reconciled with the engine and any drift is logged (tests prove events alone rebuild the screen, so drift means a bug).
- **BoardPort:** the store depends on a small `Pick<Board, ...>` interface, so it runs headless in tests with a stub board.
- **Persistence:** setup plus the action log in localStorage; resume replays the log from the seed (deterministic).
- **Instant mode** skips animations entirely; **Skip** finishes the current batch; speed 1x/2x/4x; fast bots.
- **Dev URLs:** `?demo=bots` (four-bot game), `&fast=1`, `&instant=1`; `?demo=play&scene=...` (D21); `#playground` for the board playground.
- No router yet (setup, game, playground only); TanStack Router arrives with online rooms.

## D21. Game screen UX built from the approved mockup (2026-10-23, Milestone 4.5)

- **Layout:** full-bleed board with DOM overlays (no sidebar): top HUD with a card per player, turn banner, left column (last roll, hint or the clicked tile's deed), right activity toasts with the full log on demand, bottom action dock. The board camera takes **insets** (`board.setInsets`) so it frames itself between the HUD and the dock.
- **One source of truth for "what now":** `screens/game/turn.ts` derives the banner text, the primary action, secondary actions and the open decision panel (buy, auction, debt) from the snapshot. The dock, the panels and the keyboard handler all read it, so they cannot disagree.
- **Keys:** Space is always the primary action (also when a button has focus; Enter keeps native button activation). B/A buy or auction, P/U jail fine or card, C My city, L log, S skip, ? help, Esc closes.
- **Cards wait for a click** for humans (`GameStore.ackCard`); bot cards close after `TIMINGS.botCard`. Instant mode and Skip do not stop for cards (the log and toasts still show them).
- **One-click plans** (`game/plans.ts`): "Build evenly", "Sell", and "Raise ₵X automatically" are planned by simulating `reduce`, then dispatched as ordinary actions one by one (`GameStore.run`). The raise plan mortgages lone properties, stations and utilities first, then sells houses where rent drops least, and breaks up sets last.
- **Money feedback:** the store emits one-shot effects (`onFx`: number pops, coin transfers, callouts for big rents, completed sets, bankruptcies). The DOM layer animates them with the Web Animations API (transform and opacity only); HUD cash counts with direct `textContent` writes. Nothing per-frame goes through React state.
- **All shell timings** live in `apps/web/src/game/timings.ts`.
- **Deviation from the mockup:** no auction countdown in local play. Hotseat humans should not be rushed; timers arrive with online rooms, where the server sends `TIMEOUT`.
- **Viewer seat:** My city and hints show the human the game is waiting on, else the last such human (hotseat friendly).
- **Dev scenes:** `?demo=play` seats you against three bots; `&scene=buy|auction|debt|build|card` fast-forwards until you face that moment (seeds 7 and 17 reach all of them); `&open=city|help` opens a panel on load.

## D22. Heuristic bot, simulation results, preset tuning (2026-10-23, Milestone 3)

- **Model:** `seatValue` = net worth (what wins at the round limit) + expected rent per round × rounds left × `incomeWeight` + set upside (developing a set to 3 houses, partly counted for unblocked partial sets). Landing odds come from a Markov chain over the real dice and card decks (`heuristic/landing.ts`, short-jail policy, triple doubles ignored). Rounds left shrink toward the round limit, so bots protect net worth late.
- **Decisions:** buy when the gain is positive and cash stays above `reserve × buyCaution` (or the space matters for a set); bid up to value plus 40% of the denial value; build the house with the best rent gain per ₵; mortgage lone properties to fund houses when the funded rent beats the lost rent (no unmortgaging while sets are below 3 houses, so no flip-flopping); leave jail early, stay late; raise money with the shared `raisePlan`; accept a deal when my gain minus `envy` × the partner's extra gain beats `tradeMargin`; propose one deal per turn for a set's single missing piece (cash, or a property the partner can use), choosing the best one the partner's model would accept.
- **Trades in Milestone 3:** basic bot-initiated trades were pulled forward from Milestone 10, because without them sets rarely form and games drift. Bots only propose to bots until humans have a trade screen (Milestone 8).
- **Personalities:** Balanced, Banker (cautious), Tycoon (aggressive), Shark (hard bargainer). Head to head over 2,000 games: 25 / 19 / 28 / 27%.
- **Results (1,000 games each, seats rotated):** heuristic vs 3 random: 99.9% wins. Heuristic vs 3 simple (non-trading) bots: 28% (fair 25%; without trades, Standard is mostly dice). Four heuristics: 2.4 trades, 5.9 sets, 1.7 bankruptcies per game, 23% end with one player left. Single-parameter sweeps (400 games, ±2%) found no change better than the defaults; never proposing trades drops to 8.5%, a low `incomeWeight` (0.35) to 6.5%.
- **Speed:** 7,700 to 11,800 games/min with heuristic bots via `pnpm sim` (Node, dev laptop); about 3,000/min inside Vitest.
- **Presets:** Standard stays at 30 rounds (about 29 played): roughly 20 min solo vs 3 bots, 50 min for 4 humans. Turbo changed to 4 dealt properties and 20 rounds (was 3 and 16, which produced 0.3 bankruptcies per game; now 1.2): roughly 14 min solo, 35 min for 4 humans. Classic: every game ends with one player left, about 58 rounds. Durations assume 30 s per human turn and 6 s per bot turn at 1x; correct them after real playtests.
- **Web:** bot seats get personalities in turn (Balanced, Tycoon, Shark, Banker; `SeatSetup.personality` can override), bots answer offers out of turn, deals get a callout and log lines.

## D23. Juice toolkit and sound (2026-10-23, Milestone 5)

- **Juice lives in the board package** (`packages/board/src/juice/`): trauma-based screen shake (`Shake`, offset applied on top of the camera so it never moves the logical center), hit-stop (the board's tick slows the world to 3% while the camera keeps running), pooled tinted particles (`Particles`: confetti, sparkles, dust; shared `GraphicsContext` per shape so they batch). The existing `Spring`/`Animator` stay; GSAP is still not needed.
- **One config file per layer:** board feel in `juice/config.ts` (`DEFAULT_JUICE`: hop, shake, purchase, build, land, celebrate, punch, particles, camera), shell timings in `apps/web/src/game/timings.ts`, sounds in `apps/web/src/audio/catalog.ts`. `BoardTuning` keeps only runtime switches (follow, speed, reduced motion).
- **Effects:** purchase stamps the tile up with sparkles in the buyer's color; a built house falls onto its lot, bounces once, puffs dust and shakes a little (hotels harder); a completed set gets hit-stop, then lights up tile by tile with confetti; big rent lands with a punch (hit-stop plus shake scaled by the amount, `board.punch`); long jumps shake on landing; the dice tray throws two dice with spin, flickering faces, a tightening shadow and a landing squash (WAAPI, the final face is the engine's).
- **Board beats:** the board reports moments in step with its motion (`BoardListeners.beat`: step, land, liftoff, own, build, pulse, punch), so sounds stay in sync at every speed without the board knowing about audio.
- **Sound:** Web Audio, no library. A mixer (sfx and ui buses, compressor, one shared room reverb generated from noise), a code synth (sine/triangle tones with glides, two-operator FM bells, filtered noise), and CC0 samples from Kenney Casino Audio (39 files, about 350 KB). They ship as one binary sound pack (`casino.pack`, format in `audio/pack.ts`, built from `tools/assets/audio/` with `pnpm assets:audio`) fetched after the first click: one request instead of 39, and download managers such as IDM no longer pop up a dialog for every `.ogg` the page loads. Retro presets like ZzFX were rejected: the target feel is Monopoly Plus-like (toy-like and physical, warm glassy chimes), which comes from soft waveforms, reverb, layering and per-play pitch variation, not from 8-bit voices.
- **Event-to-sound map** (`audio/cues.ts`, unit-tested): engine events as they play, board beats, and shell effects. Streaks climb a major scale (hops, coins, building sprees, bids), vehicles tick instead of singing, coins tick as each one lands.
- **Sound board** (`#sounds`): every sound with 2 to 4 variants, sliders (volume, pitch, length, brightness, room echo, randomness), x10 repeat test, and scripted game moments. Edits are saved in the browser and used by the game; "Copy changes" exports them to paste into `catalog.ts`. The board playground gained a Juice tab (`#playground`, `?tab=juice`) with every effect on its own and a slider for every `DEFAULT_JUICE` value.
- **Settings:** reduced motion (defaults to the system setting) turns off shake, hit-stop, confetti, falling buildings, flying coins and dice spin, and lowers jump arcs. Sound on/off and volume in the menu, a HUD speaker button, and the M key. Speed, fast bots, instant and reduced motion are remembered between games.
- **Cost:** board tick about 0.02 ms idle and 0.8 ms with 400 live particles (headless Chrome, CPU only); the web bundle grew by about 15 KB gzipped (229 KB). The real-GPU 60 fps check with a 4-bot game is for the developer's machine (playground FPS readout).

## D24. Human trading pulled forward from Milestone 8 (2026-10-24)

- **Why now:** bots traded only with each other, so a human could not finish sets the way bots do (a non-trading bot wins about 8% instead of 25%). The trade screen fixes that fairness gap before the art milestones.
- **Composer** (Trade button or T): pick a partner, tick properties, set cash and Lockup cards for both sides. The engine checks the deal live (`reduce` dry run, refusals translated in `game/trade.ts`). Notes show sets completed, sets handed to the partner or broken, and the mortgage takeover fee (same formula as the engine).
- **Bot verdict:** `GameStore.tradeVerdict` runs the bot's own `accepts` on its own `observe` view, and binary-searches the least extra cash that turns a no into a yes ("Nova wants about ₵X more", one click to add it). It is the same judgement the bot uses when the offer arrives, so the hint never lies.
- **Offers to humans:** bots may now propose to humans, at most one open offer per human and one per two rounds per human; a menu toggle turns them off. While a human has an offer to answer, the game (and the bots) wait; the offer panel shows Accept (Y), Decline (N) and Counter (opens the composer prefilled and swapped; sending it declines the original). Hotseat offers between humans use the same panel.
- **Feedback:** a declined human offer gets a callout; accepted deals keep the existing "Deal" callout.
- **Trade table look (same day):** your hand left, the partner's right, the deal in the middle. Properties are mini cards grouped by set with progress; clicking one flies it onto the table (FLIP with WAAPI) with a card sound. A deal meter (from \`tradeScore\`, logistic around the bot's acceptance bar) and a speech bubble whose lines depend on the bot's personality (\`game/trade.ts\`: Balanced, Banker, Tycoon, Shark) replace the text verdict. One-click suggestions ask for a set's missing piece at the bot's own price. Cash has an editable amount and +10/+50/+100 chips. After sending, the bot "thinks", then a DEAL! or DECLINED stamp lands; on a deal the cards slide toward their new owners and the table closes, on a refusal it stays open with the bot's last word. Incoming offers use the same cards, trays and a pitch line.
- **React Compiler gotcha:** store methods whose result depends on store state must take that state as an argument (\`tradeVerdict(state, ...)\`) or read it from the snapshot (\`snap.tradeOutcomes\`); the compiler memoizes calls on their arguments.
- **Still in Milestone 8:** the card-styled visual pass for the trade screen, bots countering human offers, and online trade timeouts.

## D25. A different city every game, from a seed (2026-10-24, planned for Milestone 6)

**Context:** The developer wants the central city to change every game, while staying as neat as the reference image.
**Decision:**
- The city is generated from a **city seed** stored in `GameSetup` (saved with the game, so resume, replays and online rooms show the same city). It is separate from the dice seed and purely cosmetic: rerolling the city never changes the game.
- Generation uses **templates plus seeded variation** inside fixed structure (ring, corners, cross roads, rail loop), with zoning, a limited palette per city and self-validation (BOARD.md section 5), rather than unconstrained random placement.
- Varies per game: block layout, park and plaza placement, building mix, landmark type, each group's lot architecture, tree density and color. Fixed: the 40 tiles, group colors, routes for trains and cars, the chosen art style.
- Setup screen shows a city preview with "New city"; the art style page has Reroll to judge the style across many cities.
**Why:** variety makes each game feel new at almost no runtime cost (generation takes milliseconds, then the city is baked to a texture); templates and rules are what keep procedural cities from looking messy.

## D26. City art style: D · Calm modern (2026-10-24, Milestone 6)

**Context:** The art page (`#art`) compared three directions (A clean, B dusk, C toy). The developer found A's all-over blue tint odd and pointed to the reference image (`docs/reference/board-layout-ref.png`) as the feel they want.
**Decision:** The city uses style `calm` ("D · Calm modern", `packages/board/src/art/style.ts`), tuned against the reference: a near-white ground, dark slate roads, mostly dark desaturated slate buildings with a few light ones, teal glass as the one strong accent, muted brown-red brick, coral and orange roofs, soft sage parks and light slate shadows. A, B and C stay on the art page for comparison and may be removed later.
**Why:** The reference feels calm because of restraint, not because it avoids blue: a pale ground with dark buildings gives clear contrast, with one accent color and a few warm touches. A mixed many mid-tone blue-greys, so nothing separated. This keeps the "bluish palette" of CLAUDE.md.
**Also:** the landmark uses punched windows instead of glass ribbons in every style, because ribbons on its wide walls read as flat glass.

## D27. The board city: layout and plumbing (2026-10-24, Milestone 6 step 5)

**Decision:**
- `view/cityPlan.ts` plans the city as plain data from the city seed (rail loop, plinth, zoning, landmark, outer belt, four stations, the parked train); `view/city.ts` draws it with the art kit in `BOARD_STYLE`. Tests cover the plan, not the pixels.
- The plinth is a square inside a rounded loop, so its gap to the loop is 0.4 and the loop radius 0.85 (a gap of 0.22 let the plinth corners cut into the track).
- **The plinth is 2 x 2 big blocks** (revised after review against the reference; a first 4 x 4 grid of small blocks was too noisy). The two cross roads (0.42 wide) are the only streets; the outer streets have width 0. Each block has 3 x 3 lots (`composeBig` in `art/block.ts`) with two open lots (plaza or park). Front quadrant (1,1): downtown with the landmark and 3 towers in all. Side quadrants (1,0), (0,1): 1 to 2 towers plus offices and walk-ups. Back quadrant (0,0): midtown, at most 3 floors, so the far tiles stay clear.
- Towers are 7 to 9 floors with footprints of about 0.65; the landmark is 5+5+3 floors with a short spire, about 2.65 high, clearly the tallest. Walk-ups are about 10% of lots in downtown quadrants and 25% in midtown, so offices dominate.
- Flat ground goes into `CityView.base`; everything with height goes into per-depth `Graphics` inside the actor layer, created on demand (about 40). `Board.setCitySeed()` rebuilds it. `GameSetup.citySeed` is optional; old saves derive it from `seed` (`cityOf`).
- Redraw cost is about 7 to 14 ms of JS per `draw(t)`, paid only on view morph and seed change. Idle frames cost nothing extra: a four-bot game holds 60 fps.

## D28. Day and night: by rounds, with a preference, never too dark (2026-10-24, Milestone 7)

**Context:** The developer wants a day/night cycle that makes the city feel alive at night, like a lit modern city at night (open-world city games were the casual reference), without making the board hard to read.
**Decision:**
- **Driven by game rounds** (cosmetic only, never affects rules): day for most rounds, a dusk transition, night, dawn. Exact rounds per cycle and transition length are tuned by eye in Milestone 7. A preference **Sky: Auto / Always day / Always night** in the settings menu, remembered between games like the other display prefs.
- **Night must not be dark.** Night is a blue-violet grade of the city, not a blackout: the city keeps clear value contrast, and light sources (lit windows, street lamps, headlights, landmark floodlights, beacons) carry the mood. The ring tiles darken much less than the city, and **tokens, dice, owner markers and UI-relevant highlights are never darkened** (they may get a subtle rim light so pieces pop at night).
- Everything is cheap: tints and additive glow sprites, no real-time shadows or per-pixel lighting; switchable with the ambient toggle and reduced motion.
**Why:** The cycle gives long games a rhythm and atmosphere; tying it to rounds keeps it in step with play. Readability always beats mood on a game board.

## D29. City life: traffic, trains and the Milestone 7 frame budget (2026-10-24, Milestone 7 steps 1-2)

**Decision:**
- The plinth has a **ring road** (0.26 wide, `RING_W`) along its outer edge, so the ring road and the two cross roads form four drivable loops around the quadrant blocks. Blocks shrink by 0.26 in each direction; zoning, heights and the landmark rule (D27) are unchanged. Parking is only on streets 0.29 or wider, so the ring road stays free for the two lanes.
- `view/ambient.ts` (`Ambient`, owned by `CityView.life`): 10 to 14 vehicles (cars, taxis, vans, buses from `art/traffic.ts`) on seeded loops around one or more quadrants, and 2 trains on the rail loop at different speeds (1.05 and 1.3 u/s). Trains stop at the four stations for 1.5 to 2.5 s with eased braking and acceleration, and the follower brakes behind the leader. Everything is seeded from the city seed, cosmetic, and never touches game state or the event queue.
- **Time:** it runs on the board's world delta (so it slows with hit-stop), not the game speed setting.
- **Toggle:** display pref "City life" (`cityLife`, `BoardTuning.ambient`), on by default; reduced motion defaults it off (flipping reduced motion in the menu flips it too, and the player can override). **Off means hidden** (`visible = false`) and not updated at all, resuming where it was when turned back on: simpler and cheaper than freezing in view.
- **Redraw strategy:** each body is drawn around its own Graphics origin and moved by `position`; it is redrawn only when its heading turns more than about 2 degrees (corners) or the view morphs. The 8-directional prebuilt variants were not needed (straights cost zero redraws, corners a handful). Pieces outside the camera view (plus 120 px) are hidden and not redrawn. Vehicles and train cars live in the actor layer with `zIndex = col + row`, like tokens and city layers. Vehicles keep `pose` (position and heading) and `vehicleFront()` gives the front point where headlights attach.
- Static city stays static: no city redraw per frame.

**Frame-time budget (Milestone 7):** ambient JS update (`Ambient.update`, includes sim, positioning, culling and corner redraws) averages **0.05 ms per frame** and **0.4 ms at p99, 1 ms worst** over 1200 frames (20 s of simulated play at 60 Hz, 16 graphics, whole city in view). The budget for all of Milestone 7's ambient work (traffic and trains now, plus lights and day/night later) is **1 ms per frame average and 3 ms worst on the JS side**, and the board must still hold 60 fps. Measure with `skylineBoard.ambientCost(true)` (reset) then `skylineBoard.ambientCost()`. Caveat: the Orca browser throttles the tab to about 1 fps, so GPU render cost could not be measured there; re-check fps on a real focused window.

## D30. Pieces stand in front of buildings (2026-10-25, Milestone 7)

**Context:** Pieces stood in the middle of a tile, exactly where the building lot is, so on developed properties they sank into the buildings.
**Decision:** Each side tile is split into a building lot and a standing strip about 30% deep along the edge nearest the camera: the outer edge on the two front sides (GO to Jail, Go to Jail to GO), the inner edge on the two back sides (`stripV`, `lotRect`, `tokenAnchor` in geometry/ring.ts, tested). Up to six pieces line up along the strip. Tile buildings live in the actor layer keyed by their lot's depth, so they sort correctly with the city and the pieces (before, city items behind a tall tile building were drawn over it). Safety net: a tall building (2+ houses) on the neighboring tile toward the camera fades to about 45% while pieces rest next to it (`nearerNeighbor`).
**Why:** Fading buildings all the time would hide the thing a player paid for, and shrinking them would undo the growing skyline; a dedicated strip keeps both readable, as physical boards do.

## D14. Tailwind CSS v4 for all DOM UI (2026-10-23)

**Decision:** The React shell is styled with Tailwind v4 utilities (`@tailwindcss/vite`), not hand-written CSS classes. Design tokens (palette) live in one `@theme` block in `apps/web/src/index.css` and are used as utilities (`bg-panel`, `text-accent`). Custom CSS only for things utilities cannot express.
**Why:** Fast iteration on the shell, consistent tokens, and only the classes used get shipped (small CSS). Pixi colors come from the same palette values via a shared TS palette module once the board exists.

## D31. City richness stays 2D and code-drawn (2026-10-25)

**Context:** The developer loved the city in an AI-generated reference (`docs/reference/UI_REFS.md`, Ref 3): soft light on wall faces, warm light spilling out of windows, varied roofs and props, smooth windows. Two routes were weighed: push the code-drawn Pixi kit, or pre-render modular CC0 buildings in Blender into sprite sheets.
**Decision:** Stay 2D and code-drawn; no Blender or pre-rendered sprites for now. Get the most out of the existing kit: gradients and fake occlusion on faces, light spill and bloom at night, richer silhouettes and props. The tall downtown stays (BOARD.md section 5), with the same richness on towers. Order: a city richness draft on `#art` for review first, then the Milestone 8 cards, UX and UI color theming.
**Why:** Keeps the seeded city, buildings that grow with play, the iso/top-down morph and a light download; no binary asset pipeline.
- **No more raised downtown:** the plinth drops from 0.22 to a curb-high 0.03 step (`PLINTH_Z`). The tall, plain grey wall with the ring road running along its edge read as a cake on a table; the reference city sits on the ground.

## D32. Milestone 8 look: Lamplight panels with card-stock faces (2026-10-25)

**Context:** The developer compared three UI directions on a design canvas (sources in `docs/design/m8/`) and asked for richer cards and UI pieces, then for every screen in that style.
**Decision:**
- **Panels:** dark ink-blue glass (`#121c33` on the `#0a1222`/`#0b1426` table, kept matched with the board's table), a faint warm border (`rgba(255,214,150,0.16)`), a 1 px top highlight and soft drop shadows. Lamp gold `#f5b54a` is the one accent (primary buttons, active player); money is `#ffcf70`; good `#5eead4`, bad `#fb7185`.
- **Physical things are card stock:** deeds, event cards, the turn ribbon, bills, the results certificate, keycaps and dice use cream `#fbf8f1` with a pressed edge (`#e4dccb`), ink `#1f2a3d`, green money `#1d7354`. Cards carry a printed double frame and a striped band in their group or deck color.
- **Type (self-hosted, OFL, Fontsource variable fonts):** Sora for display, Manrope for UI text, Bricolage Grotesque for card titles, DM Sans for card text. Bricolage is second in every stack because it is the only one of the four with the ₵ glyph (U+20B5); the browser takes just that glyph from it.
- **Feel:** cozy and physical, not neon. Glow only on money and the active player. Motion is transform and opacity only, springy, and off or reduced with reduced motion.
**Why:** The board is the brightest thing on screen; the UI reads as objects lying on the same table, and cards feel like things you hold.

## D33. Board framing: warm slab, table vignette, day/night table (2026-10-25)

The board should read as a crafted object on a dark table. Slab sides move from cold slate to a deeper navy-slate (`#2b3350` lit, `#1b2238` shaded) with a thin bevel highlight (`#7f8dbb`, 55% alpha) on the two visible top edges. The table shadow is a radial falloff on a diamond larger than the slab instead of one hard polygon. A screen-space vignette (one rect, one radial `FillGradient`, behind the world, rebuilt only on resize) lifts the middle faintly and darkens the edges. The renderer background eases from `tableDay` `#0f1b33` to `table` `#0b1426` with the existing night level, set only when the level changes (during the few-second fade), never per frame otherwise. The table color stays matched to the UI base.

## D34. Buy and auction moments (2026-10-25, Milestone 8 step 3)

During a decision (buy, auction, debt, offer, trade) the left column and activity toasts slide and fade away (`inert`, opacity and translate only), and the decision panel dims the board. Auction bid buttons step up from the high bid (+10, +25, +50, and the list price while it is higher; the engine accepts any whole bid above the high bid up to the bidder's cash), keys 1 to 4 bid them and P passes (P pays the Lockup fine only outside an auction). No countdown ring: the auction state has no deadline in local play (D21). When a buy or auction closes, the panel stays a beat for a SOLD stamp, then the deed flies to the winner's chip in the top bar; the flight is a Web Animation with a timer fallback so it always ends in the right state.

## D35. Game cursor and hover affordances (2026-10-26)

**Decision:** Everything clickable gets a pointer cursor and a calm hover (1 px spring lift, brightness 1.06 on gold or colored fills, `bg-white/5` on ghost and outline, `active:scale-[0.97]`, accent focus ring); the shared classes are `FX`, `FX_BRIGHT`, `FX_GHOST` in `screens/game/ui.tsx`. A custom cursor is on by default and toggled in the menu ("Game cursor", pref `cursor: 'game' | 'system'` in `skyline.prefs`).
- **Code-drawn, no assets:** `apps/web/src/cursors.ts` builds inline SVG data URIs: a cream arrow with an ink outline (default), the same arrow in lamp gold with a cream highlight (interactive), and an open hand or fist (board pan). 1x plus 2x via `image-set()`, each value ends with the system keyword; a plain 1x `url()` is used where `image-set()` is not accepted in `cursor`.
- **CSS variables:** `--cur-default|pointer|grab|grabbing` are system keywords in `:root` and are replaced under `html[data-cursor="game"]` by an injected style tag. The base layer in `index.css` uses them for `body`, buttons, links, `summary`, selects, checkbox labels and range inputs; disabled buttons get `not-allowed`.
- **Board:** `mountBoard(host, { cursors })` and `handle.setCursors()` / `Board.setCursors()` take `{ grab, pointer, grabbing? }` (any CSS cursor value; defaults are the system keywords). The package never imports from `apps`. The canvas shows grabbing while the camera drags.
**Why:** The pointer cursor was missing on every raw `<button>` (Tailwind v4 preflight resets it), and a drawn cursor keeps the Lamplight look cohesive; the system fallback keeps it accessible.

## D36. Dialog focus, announcements and reduced motion (2026-10-26, Milestone 8 step 7)

**Decision:**
- **One hook for every dialog layer:** `useDialogFocus` (`screens/game/useDialogFocus.ts`) returns props to spread on the layer's root (`role="dialog"`, `aria-modal`, `aria-labelledby`, `tabIndex -1`, a callback ref) and a `titleId` for the heading. On open it focuses `[data-autofocus]` (the `autofocus` prop on `Btn`), else the first control, else the dialog; modal dialogs trap Tab (a module-level stack, so only the top-most traps; the listener is on `document` so focus that was lost to `<body>` comes back in); on close focus returns to the opener. The root is held in state, not a ref, because the decision panels stay mounted and render nothing until they open. Escape is not in the hook: GameScreen has one handler that closes the top-most closable layer (help, menu, trade, My city, log). My city is a non-modal drawer (no trap).
- **Space inside a dialog belongs to the focused button** (GameScreen `ownsKey`), so Tab to "Put it up for auction" and Space does that, not the primary action.
- **One live region:** `Announcer` speaks turn changes and money changes (batched 350 ms). The turn banner is no longer an `<output>`, and the callout layer and log are not live regions, so nothing is read twice.
- **One reduced-motion signal for CSS:** `data-reduced-motion` on `<html>` (set by `syncReducedMotion` in `game/prefs.ts`: the setting or the OS preference). JS uses `useReducedMotion`, the board gets the same OR through the store. With it, CSS animations run for 1 ms (they still land in their end state, no slam), and `--ease-spring` becomes a plain ease. The toast keeps its hold-then-fade.
- **Contrast:** no theme token failed AA (`ink-muted` 7.9:1 on panel, `card-muted` 5.7:1 on card). Hard-coded values that did were darkened: the gold eyebrow `#9a7322` to `#8a6318` (4.1 to 5.1:1 on card), the faint card text `#7a8293` and `#6b7385` to `#5f6778` (3.6 and 4.5 to 5.4:1), and `text-white/50` on the felt to `/60` (4.3 to 5.5:1).
**Why:** the same behavior everywhere with no per-panel code, and nothing announced twice.

## D37. Inline press-again confirmation for value-losing actions (2026-10-26)

**Decision:** Selling a building and mortgaging need a second press. The first press arms the button for 2.5 s: the label becomes a short question with the consequence ("Sell? +₵75", "Sell 3? +₵225", "Mortgage? +₵30"), the button takes a soft alert tint (`alert` border at 50%, `alert/10` fill, alert text), a thin bar drains along its bottom edge, and it nudges once. A second press runs the action. It disarms on timeout (a real `setTimeout`), Esc (swallowed in the capture phase, so it does not also close the drawer), blur, the pointer staying away for 600 ms, or the action becoming illegal.
- **Code:** `confirmPress.ts` (timer-free `confirmStep`, unit tested), `useConfirmPress.ts` (timers, Esc, sound, `bind` props), `ConfirmBtn.tsx` (shared button; idle and armed labels share one grid cell so the width never jumps). The per-lot "−" in My city uses the hook directly and swaps in a wider pill while armed. The bar and nudge are CSS (`confirm-drain`, `confirm-nudge` in `index.css`), mounted only while armed, so no fill state is left behind; with reduced motion they are off (the bar stays full).
- **Applies to:** My city set Sell, per-lot "−", Mortgage rows, and the selected-tile panel's Sell and Mortgage.
- **Does not apply to:** Build, Lift, Buy, bids, trades, and the Debt panel's raise options (you are deliberately raising money and each row states its consequence). Go bankrupt and New game keep their full confirms.
- **Sound:** no new files; arming plays `ui.click` higher and softer, confirming plays the normal click.
**Why:** a sale refunds half and a mortgage costs 10% to lift, so a misclick costs money. A modal on every sale would make managing the city tedious; pressing the same spot twice keeps the pointer where it is and takes under a second. Accessibility: the armed `aria-label` says "Press again to ...".

## D38. 3D dice thrown onto the board (trial, 2026-10-26)

**Decision:** A dice throw on the board, playable on `#playground` (Dice tab) only, not wired into the game yet. Code in `packages/board/src/dice/` (`math.ts`, `cube.ts`, `sim.ts` pure and tested; `view.ts` Pixi), API `board.throwDice({ values, seed?, from?, area?, speed?, instant?, tray?, onBounce?, onSettle? })` (also on `BoardHandle`), feel numbers in `DEFAULT_JUICE.dice`.
- **Rounded-cube mesh, no 3D engine.** `project()` is affine, so a die is a rigid body in board units with a quaternion orientation. `mesh.ts` builds one shared mesh of a rounded cube (each face a grid, dense in the rounded bands, pulled onto an inner box plus radius `round`, about 1,000 vertices) and draws it with a small custom GLSL shader. Every frame the view passes the die's rotation and the board's 2x3 projection as uniforms, so the vertex shader places it with the same math as the rest of the world. The fragment shader lights it in world space (ambient, key light from the top-left-front, a plastic highlight, slightly darker turning edges) and draws the pips per pixel as recessed dimples (the normal tilts toward each pip's center). The body is convex, so fragments facing away from the viewer are discarded instead of needing a depth buffer; the far die draws first. Bright white `#ffffff` plastic with near-black `#15171c` pips (the developer's reference: classic white dice; the first cream body read washed out), lit so faces stay white and the shading gathers in the rounded edges and the side away from the light; at night a warm lamp rim lights the upper edges. The shader is GLSL ES 1.0 safe (Pixi compiled it that way here: no dynamic array indexing, no `fwidth`; the pip edge softness comes in as a uniform). WebGL only, which is Pixi's default renderer here. The dice are rigid: the earlier squash on impact read as jelly, so impacts are carried by sound, hit-stop, shake and the bounce itself. The first trial drew flat faces in Graphics with an inset "bevel", which could not show real rounded edges. A three.js or Pixi 3D layer would add a second renderer and a large dependency for two dice.
- **Precomputed fixed-step simulation.** Gravity, impulse contacts at the eight corners against the board plane (rounded corners (corner spheres of the same radius as the mesh, so dice roll off their edges and rest exactly `size/2` high), restitution with a bounce threshold, Coulomb friction, sequential impulses), contact damping, a sphere bump between the dice, soft rails around the throw area, and a tip onto the nearest face once a die is nearly still. A solid cube's inertia is the same about every axis, which keeps the solver tiny. After touchdown a shallow invisible "bowl" pulls each die toward a goal in the area with some drag; without it the dice scattered about two tiles and leaned on the rails. It runs at 1/120 s ahead of time into a keyframe track from a seeded RNG; the solver tries throws from the seed until one rests inside the area, apart, with no hard rail knocks or mid-air clash, within 1.1 to 1.6 s (about 2 tries, a few ms). Playback interpolates the track, so 0.25x, 2x, hit-stop or skipping never change the result.
- **Backward solve by body-frame rotation.** After simulating, read which face ended on top, then right-multiply every keyframe orientation by the cube symmetry `Q` that takes the wanted face to that face (`faceSwap`). World motion composes on the left, and `Q` only permutes the cube's corners, so the trajectory, contacts and clacks are identical while the engine's value lands on top. Tests cover all 36 outcomes over several seeds, determinism, identical paths for different values, resting inside the area and apart, and extreme tuning.
- **Juice:** `onBounce(intensity, die)` per floor, rail and dice knock (the playground plays `move.step` scaled by impact), a 50 ms hit-stop and a small shake on the first hard landing, then a pause, the total pops in screen space (Sora, gold with "DOUBLES" and sparkles for doubles), and the dice lift and arc to the tray point while shrinking to the tray's die size and fade. Reduced motion: no tumble, shake or hit-stop; the dice fade and drop gently into place, the total fades in, and the dice fade out.
**In the game (2026-10-26):** on by default, with a "3D dice" switch in the menu (saved with the other preferences); off brings back the tray tumble exactly as before. On a roll the camera frames the throw area (`focus: true`, `DEFAULT_JUICE.dice.focusZoom`), the dice tumble and the total pops, and the game moves on when the dice start flying to the tray (`onFly`), so the token's move overlaps the flight. Until they arrive the tray keeps its slots empty and reads "... is rolling" (no early result), then the dice pop in. The game screen measures the tray (`[data-dice-tray]`) for the fly target. Sound comes from the throw, not the event: the recorded Kenney throw (`dice.roll`) at the first touchdown, the pulse and doubles chime when the total pops (`diceHit` and `diceSettle` effects). Skipping, instant speed and reduced motion work as before (skip finishes the throw at once).
**Open:** throwing from the active player's side (needs a landing area that never sends dice across the towers), whether the rails need a visible edge, and white tray dice to match the 3D ones.

## D39. Side tiles: paved lots, a raised group curb, and 3D props for the special spaces (2026-10-26)

**Decision:** Every side tile's lot (`lotRect`) gets a paved pad with a low curb (`LOT_Z`, ring.ts), and buildings stand on it. The property group band is a raised curb in the group color (its grayscale marks stay, on top). An unowned lot is a mown lawn (stripes along its long side) with a hedge on the back edges, a shrub and a "for sale" board on two posts at the front corner. The non-property side spaces get small 3D props on their lots instead of flat icons (`art/specials.ts`, drawn into the tile's depth-sorted building layer, so pieces in front stay in front):
- **Railroad:** a station with a platform and yellow safety line, a canopy on two posts with a sign, and a track with sleepers and red buffer stops; warm light under the canopy at night.
- **Electric company:** a transformer on a gravel pad and a pylon with a blinking warning light at night. **Water works:** a water tower on legs and a pump house.
- **Tax:** stacks of gold coins (more and taller for the luxury tax). **Chance:** a card deck with a diamond and one card on its edge. **Community chest:** a teal chest with gold bands and a few spilled coins.
**Corners** (GO keeps its arrow): pieces stand in a grid centered on a corner, so corner props keep to the two back edges, away from the camera, and sort behind the pieces. **Lockup:** a slate cell block with barred windows and a blinking blue light, a barred fence along the yard, on darker concrete behind a yellow line. **Go to Lockup:** a police booth with a blue light, a red and white boom gate, and a painted no-entry mark in the middle. **Central Park:** a lawn with a path ring, a fountain in the back corner, trees along the back edges, a bench, flower beds and two lamps that light at night.
**Why:** the developer found the tiles plain next to the rich city, and the railroad's loose patch of track odd. Props on the lot keep the pieces' standing strip clear, match the code-drawn city (same paint helpers, shadows, night grade), and need no assets. `tools/dev/tiles-shot.sh <name> <space> [zoom] [night]` takes a close-up of any tile in Orca for review.

## D40. Online multiplayer: an authoritative room per game, portable across hosts (plan, 2026-10-26, Milestone 9)

**Decision:**
- **Stack.** The web app stays a Vite + React SPA (no TanStack Start, no SSR). One Cloudflare Worker serves the built app as static assets (single-page-app fallback) and the API, on one origin. The API uses **Hono**. Each game room is a **SQLite-backed Durable Object**. Cloudflare's Vite plugin (`@cloudflare/vite-plugin`) runs the Worker and its Durable Objects inside `pnpm dev` and deploys app and Worker as one unit. Validation uses **Valibot**, shared by the Hono routes and the socket messages (small enough for the client bundle; Zod 4 Mini is the fallback). TanStack Router comes in with the first real route (`/r/:code`). Check the current versions and Vite 8 / Vitest 5 compatibility of each before adding it.
- **The room is the host.** The room holds the only full `GameState` and runs `reduce`. Clients send actions and play back confirmed events; there is no optimistic update or rollback (turn-based, and the dice throw hides the round trip). The client gets a network transport behind the existing `dispatch` interface, so the board and shell do not know whether a game is local or online. A peer-to-peer host could cheat and ends the game when it leaves; lockstep would give every client the RNG seed.
- **Room rules.**
  - Every outgoing message is filtered per player with `observe()`. The seed and deck order never leave the room; check that no event carries seed-derived hidden data.
  - Every broadcast has a sequence number. On reconnect the client sends the last one it saw; the room resends the missing events it still holds in memory, or sends a fresh `observe()` snapshot and the client calls `board.sync()`.
  - The room handles one message at a time, so out-of-turn actions (bids, trade answers) apply in arrival order and cannot race.
  - Turn and auction timers and bot pacing run on alarms that feed `TIMEOUT` (or a bot's `decide()`) into `reduce`. Bot seats run inside the room.
  - A disconnected player keeps the seat for a grace period; then, if the host enabled it, a bot plays it until they return.
  - Dev mode: at each turn end the room sends a checksum of each player's view and the client compares it with its own.
- **Saving: as few storage operations as possible.** The Workers Free plan (since April 2025, SQLite-backed Durable Objects only) allows 100,000 requests, 13,000 GB-s and 5 million rows read and 100,000 rows written per day, and 5 GB of storage (the per-object cap is 1 or 10 GB, the docs disagree). Game traffic never touches D1 or KV.
  - **Store actions, not events.** The seed plus the action list rebuilds the whole game, so events live only in memory (for resending to reconnecting players) and replays come from replaying actions.
  - **Checkpoint per turn.** State lives in memory; one row (state plus that turn's actions) is written at each turn end, and on lobby changes. A room can hibernate without warning, so it also saves a few seconds after the last action, on the same alarm used for turn timers; a player thinking mid-turn never loses earlier actions.
  - **One read on wake** (that row). No lookup tables: a room code is the Durable Object's name, rate limiting uses Cloudflare's rate-limit binding, expiry is one alarm.
  - **Sockets:** one message per action's events; keep-alive pings use the WebSocket auto-response, which neither wakes the room nor counts.
  - **Duration is the next limit:** about 29 room-awake hours a day at 128 MB. The room uses the hibernation API (`ctx.acceptWebSocket`, `webSocketMessage`, `webSocketClose`), sleeps between actions and waits only on alarms, never in-memory timers.
  - Roughly a few hundred rows written per game instead of a few thousand (writing per action would allow about 50 games a day). Confirm how WebSocket messages count against the request limit on the free plan.
- **Portable core.** The room logic lives in **`packages/room`** (`RoomCore`, pure TypeScript, no Cloudflare APIs). It is driven by method calls (`join`, `message`, `leave`, `timerFired`) and reaches the outside only through small ports:
  - `Connection`: `send`, `close`.
  - `RoomStore`: load and save the state, append to the event log.
  - `Scheduler`: set or cancel a timer. The current time is passed in.

  `apps/server` is a thin Cloudflare adapter: Hono routes plus a Durable Object that maps sockets, alarms and `ctx.storage.sql` onto the ports. A later Node adapter (Hono on Node, the `ws` package, a `Map` of rooms, `setTimeout`, SQLite or Postgres) would be the same size, and could let the desktop build host LAN games. The client uses a plain browser `WebSocket` with our own reconnect and JSON messages from `packages/protocol`, no Cloudflare client libraries. Hosted pub/sub services (Ably, Pusher) only relay messages and cannot be the authority; at most they could replace the socket layer. `RoomCore` is tested in plain Vitest with fake connections, so the plan does not depend on Cloudflare's Workers test pool.
- **Rooms and invites.** No accounts; the room code is the invite.
  - **Create:** Play online → Create room calls `POST /api/rooms`, which returns a code and the host's seat token and opens the lobby at `/r/<code>`. Codes are five characters from an alphabet without look-alikes (no 0, O, 1, I, L), about 28 million combinations, checked for collisions; the code names the Durable Object (or keys the room map in the Node adapter).
  - **Invite:** the lobby shows the code large, with Copy invite link (the native share sheet on phones). The link is `https://<site>/r/<code>`.
  - **Join:** open the link, or Play online → Join and type the code. Pick a display name and token color (remembered by the browser) and take a free seat. The seat token is stored in `localStorage` under the room code, so a refresh or a later visit reconnects to the same seat; opening the room in a second tab takes the seat over ("Opened in another tab"). Dev builds get a URL option for one seat per tab, to test four players in one browser.
  - **Lobby:** the host fills empty seats with bots (choosing personalities), changes settings (speed, turn timer, house rules), removes players and can lock the room. Players toggle Ready. Start needs at least two filled seats (bots count) and every human ready. Seat order is decided by the room.
  - **In play:** nobody joins a running game, except to take over a bot seat if the host allows it. If the host leaves, the next human in seat order becomes host. Up to 6 players per room.
  - **Upkeep:** a room deletes its storage after about 24 hours without activity (an alarm), and the code can be reused. Room creation is rate-limited per IP.
- **Later, on top of the same design:** spectators, public room lists and matchmaking (a directory Durable Object or D1), accounts and friends, and the optional WebRTC host.
**Why:** turn-based play needs one referee, and the engine is already a pure, deterministic reducer that emits events, so the room is a thin shell around it. TanStack Start was considered and rejected: its server functions are request-and-response and do not help with the live socket, which is most of the work; server rendering fights a canvas game (Pixi, audio, local preferences); it adds runtime weight against the ~300 KB budget; and it would mean migrating the Milestone 8 shell. The one-project, one-deploy benefit comes from Cloudflare's Vite plugin instead. Revisit Start if server-rendered pages (a landing page, shareable replays, accounts) arrive. The ports keep Cloudflare replaceable.

## D41. Wire format details (2026-10-26, Milestone 9 step 1)

**Decision:** `packages/protocol` holds the wire format (Valibot 1.5).
- Client messages (`join`, `ready`, `action`, `chat`, `leave`, and the host's `set_bot`, `kick`, `settings`, `lock`, `start`) are strict Valibot schemas; `parseClientMessage` never throws, rejects anything over 8 KB before parsing, and names the failing field. Clients cannot send `TIMEOUT`; only the room's timers do.
- The protocol version is checked once, in `join` and `welcome`, not on every message.
- Room messages are plain types, built by the trusted room; the client checks only the envelope (`parseServerMessage`), so a full `GameState` schema never ships in the bundle.
- `events` carries the actor and the action, and `replyTo` (the sender's action id) only in the sender's copy.
- Keep-alive is the raw strings `ping`/`pong`, not JSON, so the Durable Object's WebSocket auto-response can answer without waking the room.
- Type-level checks fail the build if the action, bundle or house-rule schemas drift from the engine's types.
**Why:** the room must reject bad input cheaply and the client must stay small; the compile-time checks keep one source of truth (the engine types) without code generation.

## D42. RoomCore details (2026-10-26, Milestone 9 step 2)

**Decision:** `packages/room` implements D40's room as `RoomCore` (pure, synchronous, one call at a time).
- **Ports:** `Connection` (`send`, `close`, optional `bound(token)` so a hibernating host can keep the token on the socket and call `attach` on wake), `RoomStore` (`save` one row, `clear`), `Scheduler` (a single alarm, like a Durable Object's; the room multiplexes turn timer, bot pacing, idle save and expiry onto it), and a fourth port, `Entropy` (game seed and seat tokens), because the room must not make randomness itself. Time is passed in as `now`. Lint bans timers, clocks and `Math.random` in the package.
- **Rows:** keyed by turn (0 = lobby and game start, then the engine's `turnCount + 1`). Each row holds the room snapshot plus that turn's actions; a turn end completes its row, the idle save (5 s after the last change) rewrites the current one. The latest row restores the room; row 0's seed plus all rows' actions replays the game exactly (tested).
- **Events carry the view.** Clients cannot reduce (no seed), so each live `events` message includes that player's `observe()` view. Missed events resent on reconnect carry the view only on the last one.
- **Epochs:** every run of a room has an `epoch` (sent in `welcome`). A reconnect sends `resume: { epoch, seq }`; events are resent only within the same epoch, otherwise the client gets a snapshot. This stops a client from silently diverging when a restarted room reuses sequence numbers after losing unsaved actions.
- **Player ids follow seats** (`p1` is seat 0), so they survive reconnects and restores.
- **Bots** run like `playMatch`: offers to bots are answered first, then the expected actor moves if it is a bot, one move per alarm (900 ms pacing); a rejected or empty choice falls back to `REJECT_TRADE` or `TIMEOUT`. Offers to humans keep the local game's two-round gap.
- **Host:** the room's creation token makes its holder host; if the host leaves the lobby the next human in seat order takes over. Bots get the first unused board token color.
**Why:** the single alarm and synchronous store match the Durable Object directly and stay trivial on Node; the epoch is the smallest fix for sequence-number reuse after a crash; sending views keeps the client free of the seed at a cost of about 2 KB per message.

## D43. The Cloudflare adapter (2026-10-26, Milestone 9 step 3)

**Decision:** `apps/server` is the one Worker, built and run from `apps/web` by `@cloudflare/vite-plugin` (`configPath: '../server/wrangler.jsonc'`), so `pnpm dev` serves the app, the API and the room Durable Objects on one origin, `pnpm build` writes `dist/client` plus the Worker, and `pnpm deploy` (`vite build && wrangler deploy`) ships both. The plugin is left out under Vitest.
- **Routing:** static assets first with the SPA fallback (so `/r/<code>` loads the app); `run_worker_first: ["/api/*"]`, so only the API costs Worker requests.
- **Routes** (`src/api.ts`, Hono, platform-free and tested with a fake room directory): `POST /api/rooms` (rate-limited per IP with the `ratelimits` binding, 10 a minute per location; up to five fresh codes on a collision), `GET /api/rooms/:code`, `GET /api/rooms/:code/ws` (426 unless it is an upgrade). Codes are normalized, so typed lowercase or dashed codes work.
- **Room Durable Object** (`src/room-object.ts`, SQLite-backed): a `rows` table keyed by turn (`INSERT OR REPLACE`), one `SELECT ... ORDER BY turn DESC LIMIT 1` on wake, the alarm as the Scheduler, `crypto` as Entropy, hibernating sockets (`ctx.acceptWebSocket`, the seat token in `serializeAttachment` and rebound with `RoomCore.attach` on wake) and `ping`/`pong` as a WebSocket auto-response. Expiry calls `deleteAll()`; a later `create` on the same code starts a new room.
- **Dev checksums** are switched on by the Vite plugin's `config` override of the `ROOM_CHECKSUMS` var in `vite dev` only.
- **Types:** `@cloudflare/workers-types` (Wrangler's peer) instead of a generated `worker-configuration.d.ts`; the `Env` interface is written by hand next to the Durable Object.
- **Installs:** pnpm may run the install scripts of `workerd` (the local Workers runtime) and `esbuild` (`allowBuilds` in `pnpm-workspace.yaml`).
- **Checks:** `pnpm room:smoke [baseUrl]` (`tools/dev/room-smoke.ts`) creates a room over HTTP and plays a few steps over real sockets against a dev server or a deploy.
**Why:** one project, one deploy and one origin without TanStack Start (D40); keeping the routes and RoomCore free of Cloudflare APIs makes everything but the thin Durable Object testable in plain Vitest.

## D44. The online client (2026-10-26, Milestone 9 step 4)

**Decision:**
- **Same store, online mode.** `GameStore` takes an optional `OnlineLink` (`me`, the starting view, `send`). Online, `dispatch` checks the action with the engine's new `validate()` (the pure legality check of `reduce`, which needs no hidden information and so works on the masked view) for an instant answer, then sends it; the room's confirmed `events` and view come back through `store.receive`, and play through the same animation pipeline as a local game. `store.resync(view)` handles snapshots, `store.rejected(reason)` shows a "Not allowed" callout. No local bots or saves online; the viewer is always our seat; `store.canAct(id)` replaces "is a human" wherever the UI decides whether it may act for a player.
- **`RoomConnection`** (`apps/web/src/net`) owns the socket: join with the seat token (`localStorage` key `skyline.seat.<code>`), keep the room's token, `ping` every 25 s, reconnect with backoff (0.5 to 8 s) and `resume: { epoch, seq }`, reconnect at once on a sequence gap, stop for good after `replaced`, `kicked`, `closed` or a version mismatch. Clients never send `TIMEOUT`. Dev checksums are compared with the store's view and counted.
- **Cosmetics everyone shares:** the city seed comes from the room code; board pieces go by seat.
- **Seat kinds online:** only our own seat is `human`; other people's seats are `remote` (a human in another browser), bots stay `bot`. The shell already reads `human` as "plays at this screen", so controls, "You" wording and bot tags are right online without touching each panel.
- **Screens:** `/online` (name and token color, remembered; Create room, or Join by code) and `/r/<code>` (asks for a name if none is saved; then the lobby: the code with Copy invite link or the share sheet on phones, six seat cards, host controls for bots, kicks, preset, turn timer and lock, Ready and Start; then the normal game screen with a reconnecting banner). The setup screen links to Play online. Browser Back out of a room closes its socket but keeps the seat. A hidden tab skips animations, so a returning player is not stuck replaying a backlog. The room gives a joining player a free color when theirs is taken.
- **Dev:** `?seat=tab` keeps the seat token and the profile per tab (sessionStorage), so one browser can play several seats.
- **No TanStack Router yet.** D40 planned it for `/r/:code`, but that is the only path route and the main bundle is already over the ~300 KB target, so a small pathname switch handles `/r/<code>`. Bring the router in when there are several real screens.
**Why:** one playback pipeline for local and online keeps the board and shell unaware of the mode (ARCHITECTURE.md section 8); checking legality locally keeps the UI's synchronous `dispatch` contract.

## D45. Staying connected (2026-10-26, Milestone 9 step 5)

**Decision:** the client decides for itself when a connection is dead, because a socket can look open after a laptop sleeps or the network changes.
- **Silence:** the client notes when it last heard anything (the room's `pong` auto-response counts). If 60 s pass with nothing (two missed pings and slack), the 25 s ping timer reconnects instead of pinging.
- **Wake:** when the tab becomes visible again or the browser comes back `online`, a pending retry runs at once (no waiting out the backoff); a socket that has been quiet for a ping interval gets one probe `ping` and is replaced if nothing arrives within 5 s. Probing rather than always reconnecting, because background tabs throttle timers and would otherwise reconnect on every return.
- **Gone rooms:** after a failed connection the client asks `GET /api/rooms/:code` before retrying; a 404 ends the session with "This room does not exist" instead of retrying forever. A failed lookup (offline) counts as "exists".
- **Resync:** a snapshot during an animation skips the animation and lands exactly on the new view (tested with a board that hangs until skipped).
- The lobby and the waiting screen show "Reconnecting…", like the in-game banner.
**Why:** cheap, client-only rules that cover sleep, flaky networks and expired rooms without new server messages or extra Worker requests while things are healthy.

## D46. Players who drop out of a running game (2026-10-26, Milestone 9 step 6)

**Decision:**
- **Away:** in a running game, a human seat whose last socket closes is marked `awaySince` (persisted with the seat). After a room restart every human counts as away until their socket is attached again. Coming back clears it.
- **Stand-in bot:** when the host enabled `botTakeover` (lobby checkbox "A bot plays for anyone who drops out for a minute"), a seat away for 60 s (`takeoverAfter`) is played by a Balanced bot: `standIn` on the seat, shown to everyone ("Bo dropped out · a bot plays for them until they are back"). The bot answers offers and plays turns; the turn timer stops counting for that seat. It survives a room restart, and the seat goes back to the player the moment they reconnect. Without `botTakeover` an away seat is only moved by the turn timer, if one is set.
- **Host handover in play:** a host away for the same grace period hands the role to the next connected human in seat order; coming back does not take it back.
- **One alarm:** away deadlines join the room's single alarm. They are checked first, so a due stand-in takes a move instead of the turn timer timing it out; a handover only counts while someone could take it, so the alarm never spins.
- **Later:** play again in the same room after a game ends; newcomers taking over a bot seat mid-game.
**Why:** a dropped player should not stall or forfeit a long game, but whether a bot may play for them is a table choice, so it is the host's setting.

## D47. Bundle size is a goal, not a limit; P2P later (2026-10-26)

**Decision:** the ~300 KB gzipped initial JS figure is a goal: prefer the smaller option and lazy-load what is not needed at start, but a feature may cost bytes when it is worth it (the developer, 2026-10-26). Milestone 9 step 7 (P2P WebRTC or a Node adapter) is kept for later, not dropped.
**Why:** the shell (React, Pixi, fonts, the 3D dice) already sits around 335 KB gzipped; treating the figure as a hard cap would block features for little gain on today's connections.

## D48. For-sale lots are raised plots dressed per district (2026-10-28)

- The empty lot was a lawn edged by a hedge along its two back sides, which read as the walls of a pit, and every lot looked the same. It is now a thin raised slab (its front faces show, so it reads as land), with no back edging.
- The surface and props follow the group's architecture family: cottage lawns with flower beds and trees, brick gravel with crates and an old lamp, modern paving with planters, benches and lamps, glass lawns with young trees and shrubs. The ground is lightly tinted with the group color.
- Variation is seeded by the space index (cosmetic RNG): which of three prop slots stays empty, prop jitter, and which front corner holds the "for sale" sign. Same board every game, no two neighbors alike. Screenshot: `docs/screenshots/lots-for-sale.png`.

## D49. Cards read as paper, not plastic (2026-10-28)

- A `paper` utility (index.css) multiplies a fine SVG noise grain and a faint warm edge falloff over every card face (deeds, compact deeds, chance cards).
- No thick bottom lip: `--shadow-card` / `--shadow-card-lg` are a bright top edge, a 1px paper edge, a close contact shadow and a soft ambient one. Smaller radii (16 px deed, 10 px compact, 18 px chance) and quieter header stripes.
- The cursor sheen is matte: a broad warm light on the near side and a faint shade on the far side, instead of a tight white hotspot. Tilt is gentler (10° / 13°, 10 px lift, 1.02 scale).
- The selected-space close button is a round chip on the card's corner, clear of the FOR SALE ribbon. Screenshot: `docs/screenshots/card-paper.png` (rest, then tilted).

## D50. Moments: approach warning, active piece breathing, bidding-war heartbeat, bankrupt beat (2026-10-28)

- **Approach warning:** when a move ends on someone else's unmortgaged property, that tile's rim beats like a heart in the owner's color as the piece comes closer (period ~900 to ~420 ms, strength up with buildings), then fades after arrival. The follow camera leans up to 22% toward the destination. The board decides this from its own owners/levels; the engine is untouched.
- **Active piece:** the piece whose turn it is breathes (a 2.5% squash-and-stretch loop) while it waits. Off with reduced motion.
- **Bidding war:** from the third bid on, a soft lub-dub heartbeat (`auction.heart`, tunable on the sound board) plays under each raise, slightly louder as the war goes on.
- **Bankruptcy:** the piece trembles for a held beat (`BANKRUPT_HOLD_MS`, 440 ms) with a short hit-stop and shake before it lifts away; the bankrupt sound waits for the beat.
- Already present and kept: rolling cash numbers (`TickingMoney`), spring button presses (`FX`).

## D51. City ambience, code-generated (2026-10-28)

- `apps/web/src/audio/ambience.ts` (`CityAmbience`): a looped brown-noise hum through a slowly sweeping low-pass (quieter at night), a distant car or train every 16 to 42 s (band-passed noise swelling and panning across), bird chirps by day and cricket pulses at night, following the board's sky level. No samples, no download.
- Its own bus into the master (after the compressor's input, like sfx and ui) with an `ambience` level (default 0.5) saved with the sound settings and a "City" slider in the game menu; muting stops new sounds and silences the master. It starts on the game screen and waits for the first click to unlock audio.
- Measured offline (8 s render): about -25 dBFS RMS by day, -29 at night, peaks below 0.25 before the bus and master gains.
- Background music is left for a track the developer picks (CC0 only, see project rules).

## D52. Background music (2026-10-28)

- One looping track, "Warm Drinks and Dice" (developer-generated with Google's AI music tool, see docs/ASSETS.md), served from `public/audio/music/`. `MusicPlayer` (`apps/web/src/audio/music.ts`) streams it through an audio element (never decoded whole) into the engine's music bus via a media-element source, so master volume and mute apply. Nothing is fetched before audio unlocks on the first click; it fades in over ~2.5 s on the game screen and out when leaving, and pauses while muted.
- `music` level (default 0.45, "Music" slider in the game menu) times a fixed `MUSIC_TRIM` of 0.35: the track is mastered loud and should sit under the game's sounds at any slider position.
- Not done: ducking the music under big moments, and more tracks.

## D53. Bot trade proposals (2026-10-28)

**Decision:** a heuristic bot builds several candidate offers per partner and proposes the one that scores best for itself, among those it estimates the partner would accept with room to spare (partner `tradeScore` model with the bot's own params, 1.25 x `tradeMargin`, so offers look tempting). Candidates: the single missing piece for cash or a property (plus sweetener), two spare properties for one piece, set swaps (each side holds the other's missing piece) and two-for-one deals where the partner holds two pieces of a set; swaps and two-for-ones also try cash amounts near the point where both sides gain the same. Cash given never exceeds the bot's spare cash above 0.6 x reserve, and cash asked never takes the partner below half its reserve. Still at most one proposal per bot per turn. Spam control: the engine state keeps no record of rejected offers, so the bot remembers (partner, properties) of each offer it made and does not repeat it for 12 turns (`PROPOSAL_COOLDOWN`), accepted or not. `pnpm sim` now also prints trades proposed per game.
**Why:** one-sided "missing piece for cash" offers were rare and often refused; balanced swaps give both sides a set, which is how people actually trade. No randomness is used, so decisions stay deterministic.

## D54. Landing odds before you roll (2026-10-28)

- On your own move, while rolling is the legal action, the 11 spaces a two-dice total can reach are tinted on the board: gold for a plain chance, stronger for likelier totals (7 strongest), in the owner's color where rent is due. Each gets a floating label: the chance ("17%") or the rent owed ("₵250", the engine's `rentFor` with that total, so set doubling and utilities are right). Labels pop in along the path and everything fades out when the dice are thrown. Not shown in jail. Cards, doubles and "go to jail" are not modelled; it is the one roll.
- Revised the same day after the developer's review: only spaces where rent is due are marked (no plain percentages), with a soft wash and a thin edge in the owner's color; strength is relative to the likeliest total (6 in 36).
- Computed in the shell (`apps/web/src/game/odds.ts`, unit-tested) and drawn by the board (`board.setOdds`, tile tint in `TileView`, labels in `view/odds.ts`, world space above buildings). A "Landing odds" switch in the menu, on by default, saved with the other preferences.
- Tooling: `pnpm lint` passes `--ignore-pattern ".claude/**"` because type-aware oxlint ignores the config's `ignorePatterns` (agent worktrees live under `.claude/worktrees`, now gitignored).

## D55. "While you waited" recap card (2026-10-28)

- When a local human's turn starts (online: your seat), the left column shows what the others did since that player's own last turn, instead of the hint, until they roll or close it. One row per opponent with a Bot / Player tag, net cash change, and chips: went bankrupt, completed a set, bought (first two, then "+n more"), built, traded, sent to the Lockup, or where they ended. A line on top for rent you collected or paid. Not modal, takes no focus, never covers the board.
- `RecapTracker` (`apps/web/src/game/recap.ts`, unit-tested) keeps one stretch per player, from the end of their turn to the start of their next, so several local humans each get their own recap. Empty stretches give no card.
- The store gained `onApplied`: every event as it reaches the presented state, including skipped ones (`onEvent` only sees animated events, so instant mode and the S skip would have hidden whole turns from the recap). Screenshot: `docs/screenshots/recap-card.png`.

## D56. Buy advice on the buy and auction screens (2026-10-28)

- `buyAdvice(state, seat, space, price)` (`apps/web/src/game/advice.ts`, unit-tested) gives at most two lines, most telling first: completes your set (rent doubles, you can build), blocks one rival from completing a set, station count and rent per visit, utility multiplier; then either a cash warning (short of the price, or under ₵150 left) or "pays for itself after about N visits" (rent with this space added, utilities at a roll of 7).
- Shown under the set card on the buy screen and under the set note in the auction (priced at the current high bid, for the viewer). The old "This completes your set!" note gives way to the advice line so nothing repeats.

## D57. Skip to my turn (2026-10-28)

- While a bot plays in a local game, the action dock offers "To my turn" (F). `GameStore.skipToHuman()` sets `fastForward`: playback skips every animation (as the instant setting does), bot thinking time is 0, and a bot already waiting goes at once. It ends by itself when no bot has anything to do, which means a human here must act (their turn, a bid, an offer to answer, a debt) or the game is over; normal pacing resumes and the recap card (D55, fed by `onApplied`) summarizes what was skipped.
- Not offered online: bots there run in the room, and other people's turns are theirs.

## D58. Bot speech bubbles (2026-10-28)

- Bots react out loud to moments, in the voice of their personality (`BotParams.name`: Balanced, Banker, Tycoon, Shark): paying or collecting rent (25+; 100+ always), buying or winning an auction, completing a set, trades (the bot that accepted answers), going to the Lockup, bankruptcy, and now and then payday. Lines live in `apps/web/src/game/barks.ts` (`BarkMapper`, unit-tested).
- Rate-limited: one bot at most every 4 s and the table at most every 1.2 s for minor moments; sets, trades, jail and bankruptcy always speak. Driven by `onEvent`, so nothing is said while skipping or fast-forwarding.
- Shown as a small card-colored bubble with a tail under the bot's HUD card for 2.6 s; `aria-hidden` (the log and announcer already say what happened), never over the board's center, no input.
- UI flavor uses Math.random (allowed outside the engine).
