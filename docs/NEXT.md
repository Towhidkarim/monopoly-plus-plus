# Where we left off (handoff for the next session)

Updated 2026-10-26. Read this first, then `CLAUDE.md`. Delete or rewrite this file when the work below is done.

## Current work: Milestone 9, online multiplayer

Milestone 8 is built and committed, and so are the 3D dice (D38, `88d24ce`) and the tile pass (D39, `fcdfd25`). The developer's hands-on play review of Milestone 8 can happen alongside.

The multiplayer plan is settled and recorded in `docs/DECISIONS.md` D40; the steps are in `docs/ROADMAP.md`, Milestone 9; the overview is `docs/ARCHITECTURE.md` section 8. In short:

- Stay on the Vite + React SPA (TanStack Start was considered and rejected, see D40).
- One Cloudflare Worker: Hono for `/api/*`, the SPA as static assets, one SQLite-backed Durable Object per room with hibernating WebSockets and alarms. Cloudflare's Vite plugin runs it in `pnpm dev`. Valibot for validation.
- The room is the authority. Room logic is portable: `RoomCore` in `packages/room` behind `Connection`, `RoomStore` and `Scheduler` ports; `apps/server` is a thin Cloudflare adapter.
- Room codes are the invite (`/r/<code>`), seat tokens in `localStorage`, a lobby with bots, ready and host controls.
- Stay inside the Workers Free plan: store actions not events, one checkpoint row per turn plus an idle save, one read on wake, rooms sleep between actions (D40 "Saving").

### Next steps

1. Done: Step 1, `packages/protocol` (D41). Versions checked 2026-10-26, all maintained and compatible: valibot 1.5.0 (added), hono 4.13, @cloudflare/vite-plugin 1.65 (peer vite ^8), wrangler 4.153, @tanstack/react-router 1.170.
2. Done: Step 2, `packages/room` (`RoomCore`, D42), tested with the fake ports in `packages/room/src/testkit.ts`.
3. Next: Step 3, the Cloudflare adapter (`apps/server`): Hono routes, the room Durable Object mapping sockets, the alarm and `ctx.storage.sql` onto the ports, and Cloudflare's Vite plugin in `pnpm dev`. Then the client transport and lobby, reconnect, and bot seats, one step per commit.

Restate each step's acceptance criteria and the files it touches before writing code.

## Loose ends

- D38 open items: throwing from the active player's side, white tray dice to match the 3D dice.
- Learned bots are planned last: `docs/LEARNED_BOTS.md`.

## How we work

- Work inline by default and keep the main context small (few, cropped screenshots; `/clear` between steps). Delegate to subagents only when it pays off (the `delegate` skill): parallel work, noisy searches, or a cheaper model for a self-contained job.
- Commits: plain messages, no Co-Authored-By or other attribution.
- Run `pnpm fmt` and `pnpm check` before declaring work done.
- Orca review tips:
  - `pnpm shot <name> --page <id>` saves a screenshot to `.shots/`; `tools/dev/tiles-shot.sh` takes tile close-ups.
  - Create your own tab, never navigate the developer's `#playground` tab, and close yours afterwards.
  - Orca freezes CSS animations in a background tab, so run `orca tab switch --page <id>` before a screenshot.
  - `window.skylineStore` and `skylineStore.board` are available in dev builds.
- Test URLs: trade `?demo=play&seed=7&open=trade`; debt `?demo=play&seed=17&scene=debt`; My city `?demo=play&seed=17&scene=build&open=city`; game over `?demo=play&seed=7&scene=build`.
