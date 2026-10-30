# Where we left off (handoff for the next session)

Updated 2026-10-26. Read this first, then `CLAUDE.md`. Delete or rewrite this file when the work below is done.

## Done: Milestone 9, online multiplayer

All steps but the optional step 7 are built and committed (DECISIONS.md D40 to D46; overview in `docs/ARCHITECTURE.md` section 8; status in `docs/ROADMAP.md`). Acceptance run passed on the dev server: four tabs through a full Turbo game in one room, a mid-game reload, identical final state everywhere, invalid actions rejected by the room. Step 7 (P2P WebRTC or a Node adapter) is kept for later (D47).

Still needs the developer:

- First deploy: `! npx wrangler login`, then `pnpm deploy`; then a real session across machines.
- The hands-on review of Milestone 8 and the real-GPU 60 fps checks listed in the roadmap.

## In progress: Milestone 14, mobile (D64, started 2026-10-30)

The developer pulled the mobile pass ahead. Steps and acceptance in `docs/ROADMAP.md` Milestone 14, one per commit; the PWA comes before the performance profile. Done: 1 foundations, 2 compact HUD and dock (the hint/recap column and the log are hidden on phones until step 3 brings them back as sheets). 3 bottom sheets (`Sheet.tsx`). 4 player sheet, touch tooltips, toasts. 5 trade composer. 6 PWA (verified offline in a production preview). Next: 7 mobile performance profile; then the developer checks on a real phone (install from the deployed site: Add to Home screen). Phone screenshots in Orca only (no headless Chrome): `orca exec --command "set viewport 390 844" --page <id>`, then `pnpm shot <name> --page <id>` (also 360x780 and 844x390); the developer checks on a real phone later.

## In progress: UX and gameplay batch (developer's list, 2026-10-28)

One step per commit, restate acceptance criteria first. Done: 1 landing odds (D54, rents only after review), 2 recap card (D55), 3 buy advice (D56), 4 skip to my turn (D57), 6 bot speech bubbles (D58), 7 bot trade proposals (D53), 8 results screen (D59). Left:

5. Game length in setup: short / standard / long (start cash, round limit, pre-dealt properties).
9. Polish (mobile layout waits for the mobile pass): persistence and PWA install, online "play again" in the same room and chat or reactions, for-sale sign wobble and pop, music ducking under big moments, D38 dice items, the React background/backgroundImage warning.

Testing note: Orca throttles background tabs (no animation frames), so scripted play stalls on board animations unless the tab is in front; use `instant` for flow tests (events still reach `onApplied`), and turn CSS animations off before screenshots of panels with entrance animations.

## Done 2026-10-28: juice and atmosphere pass

D48 raised for-sale lots dressed per district; D49 paper cards; D50 moments (rent approach warning, breathing active piece, bidding-war heartbeat, bankrupt beat); D51 code-generated city ambience. Waiting on the developer: a feel review of all four in real play, and a background music track (CC0) to wire in. Not done yet: the for-sale sign wobbling on hover and popping off when bought.

## Next: fun and polish (confirmed by the developer, 2026-10-26)

The developer wants fun prioritized: polish (Milestone 11 items) comes before Milestone 10 (bot v2 and search). When choosing between items, pick what makes playing more fun first. Order, one step per commit, each restated with acceptance criteria first:

1. **Online follow-ups:** play again in the same room (back to the lobby with the same seats), the chat that the protocol already carries (a small panel or quick reactions), lazy-load the online screens.
2. **Open items from earlier milestones:** D38 dice (throw from the active player's side, white tray dice), the React style warning below, anything from the developer's Milestone 8 review.
3. **Milestone 11 items:** mobile layout (portrait shell), persistence (settings, stats, PWA install), performance audit, trademark and naming check; the Wails desktop wrapper and replays later.

**Milestone 13 started 2026-10-28:** the Speed die is done, engine to shell (D62): setup and room toggle, amber third die in 3D and the tray, Bus/triples choice in the dock and on the board, Scout pin. Comeback is done, engine to shell (D63): underdog salary (default up to 2x salary, slider 50% to 400%) and Second Wind bank loans, separate switches. Waiting on the developer: a play test with the twists on (does the comeback feel earned, are knockouts too rare?). Next: the Blitz preset.

Then the rest of **Milestone 13, twists** (modern modes: dice control, Blitz, perk cards, city headlines, City Council; `docs/ROADMAP.md`, DECISIONS.md D61). The developer wants this soon, ahead of the bots. After that Milestone 10 (bots), and the learned bots last (`docs/LEARNED_BOTS.md`).

Remaining variant ideas are still in `docs/IDEAS.md`.

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
