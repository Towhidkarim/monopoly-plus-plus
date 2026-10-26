# Where we left off (handoff for the next session)

Updated 2026-10-26. Read this first, then `CLAUDE.md`. Delete or rewrite this file when the work below is done.

## Done: Milestone 9, online multiplayer

All steps but the optional step 7 are built and committed (DECISIONS.md D40 to D46; overview in `docs/ARCHITECTURE.md` section 8; status in `docs/ROADMAP.md`). Acceptance run passed on the dev server: four tabs through a full Turbo game in one room, a mid-game reload, identical final state everywhere, invalid actions rejected by the room. Step 7 (P2P WebRTC or a Node adapter) is kept for later (D47).

Still needs the developer:

- First deploy: `! npx wrangler login`, then `pnpm deploy`; then a real session across machines.
- The hands-on review of Milestone 8 and the real-GPU 60 fps checks listed in the roadmap.

## Next: a polish milestone (to confirm with the developer)

The roadmap has Milestone 10 (bot v2 and search) before Milestone 11 (release polish). The developer leans towards polish first, which matches the project priorities (feel and fun before stronger AI). Proposed order, one step per commit, each restated with acceptance criteria first:

1. **Online follow-ups:** play again in the same room (back to the lobby with the same seats), the chat that the protocol already carries (a small panel or quick reactions), lazy-load the online screens.
2. **Open items from earlier milestones:** D38 dice (throw from the active player's side, white tray dice), the React style warning below, anything from the developer's Milestone 8 review.
3. **Milestone 11 items:** mobile layout (portrait shell), persistence (settings, stats, PWA install), performance audit, trademark and naming check; the Wails desktop wrapper and replays later.

Then Milestone 10 (bots) and the learned bots (`docs/LEARNED_BOTS.md`).

## Loose ends

- React warns "Updating a style property during rerender (background) when a conflicting property is set (backgroundImage)" in one of the game panels that mixes `background` and `backgroundImage` (DebtPanel, GameTooltip, Overlays, TitleDeed, TradeParts or SetupScreen).
- D38 open items: throwing from the active player's side, white tray dice to match the 3D dice.

## How we work

- Work inline by default and keep the main context small (few, cropped screenshots; `/clear` between steps). Delegate to subagents only when it pays off (the `delegate` skill): parallel work, noisy searches, or a cheaper model for a self-contained job.
- Commits: plain messages, no Co-Authored-By or other attribution.
- Run `pnpm fmt` and `pnpm check` before declaring work done.
- Bundle size: keep it small, but ~300 KB gzipped is a goal, not a limit (D47).
- Orca review tips:
  - `pnpm shot <name> --page <id>` saves a screenshot to `.shots/`; `tools/dev/tiles-shot.sh` takes tile close-ups.
  - Create your own tab, never navigate the developer's `#playground` tab, and close yours afterwards. The developer's own dev server may be on 5173; run yours on another port (`npx vite --port 5199` in `apps/web`).
  - Orca freezes CSS animations in a background tab, so run `orca tab switch --page <id>` before a screenshot. Tabs that are not on screen run at about 2 frames a second: for scripted online play set `skylineStore.setSettings({ instant: true })`.
  - Orca's `click` does not reach visually hidden inputs (the color radios); use a DOM `.click()` in scripted tests.
  - `window.skylineStore` and `skylineStore.board` are available in dev builds.
- Test URLs: trade `?demo=play&seed=7&open=trade`; debt `?demo=play&seed=17&scene=debt`; My city `?demo=play&seed=17&scene=build&open=city`; game over `?demo=play&seed=7&scene=build`.
- Online: `/online?seat=tab` in several tabs (one creates a room, the others join its code; `?seat=tab` gives each tab its own seat and name). `pnpm room:smoke <baseUrl>` checks a running server end to end.
