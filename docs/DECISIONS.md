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
