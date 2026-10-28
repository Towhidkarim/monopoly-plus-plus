# Ideas: game variants and "++" features

A parking lot for later. The strongest of these (Speed die, perks, headlines, daily seed and more) are now planned in Milestone 13 (`docs/ROADMAP.md`, DECISIONS.md D61). Nothing here is planned or decided; when one of these becomes a milestone, move it to `docs/ROADMAP.md` and record the design in `docs/DECISIONS.md`.

## Design note

Variants should be data, not special cases: a `RuleSet` in the game state that `reduce` and `legalActions` read. The engine stays pure and deterministic, games stay replayable from seed plus actions, and bots read the same rule set from `observe()` instead of needing per-variant code. Every variant still widens what bots must handle, so test each one with `pnpm sim` (and `--fuzz`).

## 1. Rule toggles (what online players expect in a lobby)

Popularised by sites like Richup.io. Small engine changes, mostly no new UI beyond lobby options.

- Double rent on unimproved full sets (already the official rule; make it switchable).
- Free Parking jackpot: taxes and fees go to a pot, landing on Free Parking collects it.
- Auctions on or off (off: a declined property stays with the bank).
- Starting cash and Go salary.
- No rent collected while in jail.
- Even building on or off.
- Short game: turn or time limit, highest net worth wins.

## 2. Mechanics borrowed from official editions

- **Speed Die** (Mega Monopoly, now optional in the classic box): a third die with bus and Mr. Monopoly faces. Faster games, more decisions. Strongest candidate.
- **Skyscrapers and train depots** (Mega Monopoly): a tier above hotels; suits the isometric city visually.
- **Cheaters Edition:** cheat cards ("steal from the bank", "skip rent") with a penalty if caught. Fun against bots.
- **Dynamic values** (Revolution / Ultimate Banking style): events that raise or crash property values mid-game.

## 3. Original "++" ideas

- **Perks ("Jokers") mode:** each time you pass Go, draft one of three perks ("Railroads pay double", "Immune to the first tax", "Houses cost 20% less"). Echoes the Balatro feel the project already aims for; could be the signature mode.
- **Economy cycles:** boom and bust phases shift rents city-wide, shown through the board's day/night and ambient life, so the alive board carries gameplay meaning.
- **Daily seeded challenge:** same seed and bots for everyone, with a leaderboard. Nearly free thanks to determinism.
- **Draft start:** properties dealt or drafted at the start, skipping the slow opening.
- **Bank loans with interest:** an alternative to mortgages; more tension and comebacks.

## Suggested order (if and when)

1. Rule toggles + Speed Die + short game: cheap, expected online, small bot impact.
2. Daily seeded challenge.
3. Perks mode: the biggest one (perk design, balancing through `pnpm sim`, bots that value perks).
