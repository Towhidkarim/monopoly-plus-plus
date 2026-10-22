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

## D14. Tailwind CSS v4 for all DOM UI (2026-10-23)

**Decision:** The React shell is styled with Tailwind v4 utilities (`@tailwindcss/vite`), not hand-written CSS classes. Design tokens (palette) live in one `@theme` block in `apps/web/src/index.css` and are used as utilities (`bg-panel`, `text-accent`). Custom CSS only for things utilities cannot express.
**Why:** Fast iteration on the shell, consistent tokens, and only the classes used get shipped (small CSS). Pixi colors come from the same palette values via a shared TS palette module once the board exists.
