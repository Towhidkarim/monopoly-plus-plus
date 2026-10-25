# Where we left off (handoff for the next session)

Updated 2026-10-25. Read this first, then `CLAUDE.md`. Delete or rewrite this file when the work below is done.

## Current work: Milestone 8 UI build

The look is approved and recorded in `docs/DECISIONS.md` D32 (Lamplight panels + card-stock faces). The visual spec for every screen is in `docs/design/m8/` (see its README). The live design canvas: https://claude.ai/artifact/VhpgcgV3KjWtCykjq4R5Ay. The 7-step build plan is in `docs/ROADMAP.md`, Milestone 8.

The developer's standing brief: improve anything you spot along the way; the game should feel fun and cozy, and the juice should show in the UI. Keep it calm (no neon; glow only on money and the active player).

### Done and committed

| Commit | What |
|---|---|
| `9dc05a4` | Design sources, D32, build plan |
| `11eb18f` | Board framing (D33): warm slab, table vignette, day/night table |
| `3f3e701` | Step 1: theme tokens, fonts, primitives, top bar, turn ribbon, dice tray, hint, toasts, action dock |
| `7cc7f8b` | Step 2: deeds with real lot portraits (`lotPortrait` on the board handle), event cards, card motion |
| `249f31c` | Step 3: buy moment and auction, focus mode for decisions (D34) |

### Committed in `ba31316` but NOT yet visually reviewed

Built by Sonnet agents; `pnpm check` passes:

- **Step 4, trade table and incoming offers:** `TradeComposer.tsx`, `TradeParts.tsx`, `OfferPanel.tsx`, new `tradeFx.ts`, a `coin-drop` keyframe in `index.css`, and `?open=trade` support in `GameScreen.tsx`.
- **Step 5, raise-money bill and My city:** `DebtPanel.tsx`, `MyCity.tsx`, plus small additions in `ui.tsx` (`DeedSwatch`), `icons.tsx`, `TitleDeed.tsx` (slot pop) and `GameScreen.tsx` (`onTrade`, `onAsk`).

### Next steps

1. Run `pnpm check`.
2. Review steps 4 and 5 in Orca. Look for crisp cards, fit at about 950×800 (the developer's window) and at 1440×900, and the motion end states.
   - Trade: `?demo=play&seed=7&open=trade`.
   - Incoming offer: see the console snippet below.
   - Debt and My city: `?scene=debt` and `?scene=build&open=city`. With seed 7 the fast-forward never reaches those moments (it ends in game over), so try other seeds.
3. Fix what's needed and commit the fixes.
4. **Step 6:** setup screen, game over (mayor certificate and podium), menu, rulebook help, board tooltip, callouts. Fix the copy: remove the dev links (#playground, Sound board), and use the same wording for "New game" everywhere. Specs: `Setup.dc.html`, `Results.dc.html`, `Menu.dc.html`, `Moments.dc.html`.
5. **Step 7:** smaller windows with no overlap, then a keyboard and accessibility pass.
6. After Milestone 8: try 3D dice thrown onto the board on `#playground` first: Pixi cubes, a tumble solved backward to the engine's result, bounce clacks, hit-stop, the total pops, then the dice fly into the tray.

Small polish noted: the balloon piece icon reads like a lightbulb.

Incoming offer for testing: in the dev console, with a game where you own something, run:

```
const s=skylineStore.getSnapshot().state; const mine=s.owner.indexOf(0);
skylineStore.dispatch('p2',{type:'PROPOSE_TRADE',to:'p1',give:{spaces:[],cash:180,jailCards:0},get:{spaces:[mine],cash:0,jailCards:0}})
```

## How we work

- **Orchestrate on Opus and delegate** (the `delegate` skill). Sonnet agents build, one step per agent, with a self-contained brief that points at the `.dc.html` spec. Opus reviews every step visually in Orca, sends fixes back to the same agent, and commits each step.
- **Lessons the briefs must repeat:**
  - Cards must be crisp at rest: no persistent 3D transforms, no `will-change`, no `translate(-50%)` centering, and no animation fill state left on a card.
  - Animations driven by timers or frames must reach their end state even if no frame runs.
  - Run `pnpm fmt` and `pnpm check`.
  - Agents running in parallel must not edit the same files.
- **Orca review tips:**
  - `pnpm shot <name> --page <id>` saves a screenshot to `.shots/`.
  - Create your own tab, and never navigate the developer's `#playground` tab.
  - Orca freezes CSS animations in a background tab, so run `orca tab switch --page <id>` before a screenshot. The first shot after a load is often mid-animation.
  - `window.skylineStore` and `skylineStore.board` are available in dev builds.
  - To render the board only, hide the DOM UI with an eval that sets every element except the canvas to `visibility: hidden`.
