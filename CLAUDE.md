# Skyline (working title): a lightweight Monopoly-style game for the browser

Read this file first, then `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md`, and `docs/BOARD.md`. `docs/ART_GUIDE.md` when doing art, `docs/LEARNED_BOTS.md` when working on learned bots. When docs and this file disagree, `docs/DECISIONS.md` is the latest word.

## What we are building

A lightweight, good-looking, Monopoly-style board game that runs in the browser (and can be wrapped for desktop later).

- Modern isometric city theme, bluish palette, "alive" board (trains, day/night, window lights).
- Balatro-style "juice" in animation and transitions (springs, squash and stretch, screen shake, hit-stop, number pops). Not the art style, only the feel.
- Strong AI opponents. The bot framework comes early, the "perfect bot" comes later.
- Online multiplayer, designed in from the start.
- Hobby project, solo developer (a software engineer, not an artist). Prefer code-generated assets and reproducible pipelines.

Naming/trademark: "Monopoly", its board art, and its trade dress belong to Hasbro. Use original names, theme, and art. Mechanics are fine to reuse. Treat "Skyline" and all property names as placeholders.

## Non-negotiable principles

1. **The rules engine is pure TypeScript.** No DOM, no Pixi, no React, no timers, no `Math.random`, no `Date.now` (enforced by oxlint and the engine tsconfig). It exports `reduce(state, playerId, action) => { ok, state, events } | { ok: false, error }` (never throws), `legalActions(state, playerId)`, and `observe(state, playerId)`. Time enters as a `TIMEOUT` action.
2. **The engine is deterministic.** All randomness (dice, shuffles) comes from a seeded RNG that is part of the state. Same seed plus same actions gives the same game, always.
3. **Visuals never decide outcomes.** The dice animation lands on a result the engine already chose.
4. **The engine emits events.** The view plays events as animations. The engine knows nothing about animation.
5. **Two states on the client:** `authoritative` (latest engine output) and `presented` (what the screen currently shows, lagging behind while animations play).
6. **Logic lives in grid space.** The board is a ring of 40 spaces in continuous board units (classic proportions, see `docs/BOARD.md`) plus a height `z`. The isometric look is a single `project()` function at render time.
7. **Pixi renders the board world (`packages/board`, no React). React renders the shell** (lobby, buttons, panels, log, modals, trade UI), styled with Tailwind utilities. Text-heavy and accessible UI is never drawn in canvas.
8. **Bots implement `decide(view, playerId, rng) => Action | null`** on the masked `observe()` view, so the same interface works for heuristic, search, and learned bots, and bots can act out of turn.
9. **Animate `transform` and `opacity` only** in DOM, and logical values (grid coords, `z`) on the Pixi side. Per-frame animation values never go through React state.
10. **Tests first for rules.** Every rule gets a Vitest case before or with its implementation.

## Tech stack

- TypeScript 7 (native compiler, strict), Vite 8, pnpm workspaces, Vitest 5. Lint: oxlint (type-aware). Format: oxfmt. No ESLint, no Prettier.
- Pixi.js v8 for the board world, custom camera (no pixi-viewport). GSAP for choreographed timelines. A small custom spring/ticker module for continuous juice.
- React 19 with the React Compiler for the shell. Tailwind CSS v4 for all DOM styling (tokens in one `@theme` block). Motion for shell transitions. TanStack Router (SPA) once there are multiple screens; no TanStack Start, no SSR.
- Multiplayer: one Cloudflare Worker (Hono for the API, the SPA as static assets) + one SQLite-backed Durable Object per room over WebSockets, running the same engine package (authoritative server). Room logic is portable (`packages/room` behind ports) so a Node host can replace Cloudflare. Cloudflare's Vite plugin for dev. Valibot for validation. See DECISIONS.md D40. Optional host-authoritative WebRTC (PeerJS) as an alternative later.
- Native wrapper later: Wails (Go) around the same static SPA build.
- Lightweight and smooth is a requirement: 60 fps, one render loop, initial JS around 300 KB gzipped.
- Verify current versions and plugin compatibility before adding a dependency. Do not assume.
- **For Pixi work, use the PixiJS agent skills** (`.claude/skills/pnpm-pixi.js-*`, installed by pnpm from the `pixi.js` package; start with `pixijs`). Use official docs for other libraries.

## Repo layout

```
/
  CLAUDE.md
  docs/          ARCHITECTURE, ROADMAP, DECISIONS, BOARD, ART_GUIDE, ASSETS, reference/, screenshots/
  packages/
    engine/      pure rules, state, events, seeded RNG, board data, tests
    bots/        bot interface, heuristic bot, simulation harness
    protocol/    shared action/event/message types for client and server
    room/        portable game room (RoomCore): seats, sequence numbers, reduce, observe, timers; no platform APIs
    board/       Pixi board world: geometry, tiles, camera, tokens, juice, ambient (no React)
  apps/
    web/         Vite SPA: React + Tailwind shell, mounts packages/board
    server/      Cloudflare Worker + Durable Object (later phase)
    desktop/     Wails wrapper (later, optional)
  tools/
    assets/      asset scripts (later)
```

Packages export TypeScript source directly (no build step); each has its own `tsconfig.json` extending `tsconfig.base.json`.

## Working agreement for Claude Code

- Work one milestone at a time from `docs/ROADMAP.md`. Do not jump ahead.
- Before writing code for a milestone, restate its acceptance criteria and list the files you will touch.
- Write or update tests with every engine change. Run `pnpm check` before declaring work done.
- Keep modules small. Do not add a dependency without saying why and checking it is maintained and compatible.
- Never import from `apps/*` into `packages/*`. Dependency direction: `engine <- bots`, `engine <- protocol <- web/server`, `engine, protocol, bots <- room <- server`, `engine <- board <- web`.
- Record any notable technical decision as a new entry in `docs/DECISIONS.md`.
- When visual output matters, save a screenshot or render to `/docs/screenshots` and inspect it against `docs/ART_GUIDE.md`.
- Prefer procedural/SVG/code-generated art. Ask before adding binary assets, and record each asset's source and license in `docs/ASSETS.md`.
- If a requirement here conflicts with what you find in the code, stop and flag it rather than silently deviating.

## Commands

```
pnpm dev          # run the web app (http://localhost:5173)
pnpm build        # production build of the web app
pnpm test         # run all tests (Vitest projects)
pnpm typecheck    # tsc (TS 7) across packages
pnpm lint         # oxlint --type-aware
pnpm fmt          # oxfmt (write); pnpm fmt:check to verify
pnpm check        # fmt:check + lint + typecheck + test; run before declaring work done
pnpm assets:audio # rebuild sound packs from tools/assets/audio (after changing sound files)
pnpm sim          # bot matchups: pnpm sim --bots heuristic,random,random,random --games 1000 (--fuzz for random-play invariants)
```
