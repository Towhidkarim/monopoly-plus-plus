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

## 4. Tycoon mode: build an empire, take over rivals (ideation, 2026-10-30, unfinished)

The developer's brief: a longer single-player mode about earning in many ways and building an empire over the bots without grinding them to a pulp. It should feel good to play, leave room to come back from disasters, and still be hard enough to need effort. Still being ideated; nothing here is decided.

**The problem with the classic board:** rent is almost the only income, so every dollar earned comes out of another player's pocket. Four players on 22 streets makes competition mean crushing each other.

### Core loop

- **Payday tally** when passing Start, Balatro-style: salary, then each business, combo multipliers and contract bonuses tick in one by one with number pops and a hit-stop on the multipliers, ending in a big total. The engine emits income events; the shell plays them. This is the main reward and should come back every lap.
- **City citizens and tourists** walk the board as engine-driven NPCs (seeded movement, not bots) and pay the businesses they land on. Income comes from the city as well as from rivals, so the game is not zero-sum. It also gives the alive board (trains, lights) a gameplay role.
- **Businesses** opened on owned lots instead of (or beside) houses, each earning differently: Café (small fee from anyone landing, the owner included), Factory (steady Payday income, powers nearby shops), Boutique (scales with the visitor's wealth, so it naturally targets the leader), Startup (boom or bust each lap).
- **Supply chains / adjacency combos:** neighbouring businesses link up (Factory -> Shop -> Café) for multipliers, so building out a district is a puzzle played over the whole game.
- **Landing on a rival's business** costs money but gives something back (café: move ±1 next turn; gym: a reroll; hotel: shield from the next rent). Landing is no longer pure punishment.
- **Contract board:** three public jobs always open ("3 businesses on the east side by round 12: $400 + 2 Prestige"). Bots race you for them. Short-term goals without hurting anyone.
- **Landmarks:** one of each (Stadium, Airport, Tower, Harbour). Expensive, worth big Prestige, and they change the board (the Airport links airports, the Stadium draws visitors to its side).
- **Shares** in a rival's colour group pay dividends when they do well, so the leader's success is partly yours too.
- **Three acts** (Founding, Boom, Skyline) unlock business types and landmarks, ending in an Act Report card: rank, income breakdown, best investment, a rival's quote. The day/night cycle can follow the acts.

### Influence and takeovers (how you beat rivals)

You beat rivals by buying them out, not by bankrupting them.

- **Influence** is a second currency earned by building: development, businesses, contracts, landmarks, happy citizens, holding most of the development in a district. You spend it on takeovers, City Council votes (fits the planned headlines and City Council twists) and protecting your own holdings. Money buys things; Influence takes them.
- **The takeover ladder:**
  1. **Buyout offer** at a premium (about 1.5x value). The owner can refuse, but refusing costs them Influence.
  2. **Share stakes** in a group, bought bit by bit; **51% means control.** The owner can buy back, which makes a back-and-forth takeover battle (a juice moment like the bidding-war heartbeat).
  3. **Hostile takeover:** more Influence than the owner in a district forces a sale at fair market value. Expensive and rare.
  4. **Merger:** combine businesses with a rival and split the income.
- **The payoff:** buildings repaint in your colour, signs flip, the crowd cheers, and your Payday tally grows by one line.
- **Kept fair:**
  - The target always gets paid fair value, so they have cash to rebuild.
  - After a takeover, the old owner holds a buyback right for a few laps.
  - The leader draws "antitrust" scrutiny (takeovers cost the leader more, with a headline about it); the last-place player gets cheaper takeovers.
  - Defences: an Influence reserve, loyal neighbourhoods (well-developed districts resist), insurance, counter-bids.

### Comebacks and difficulty

- **No eliminations:**
  - Disasters (fire, recession, strike) come through headlines, and insurance bought ahead of time softens them.
  - Restructuring replaces bankruptcy: the bank takes some assets, and the player stays in with a small fresh stake and a one-time Second Act perk (extends Second Wind).
- **Comebacks come through chances, not free cash:** last place picks contracts first, gets an auction discount, and a Phoenix Prestige bonus for climbing from last to the top two.
- **Rival tycoons have personalities:** the Magnate (rails, factories), the Developer (landmark rush), the Speculator (shares), the Philanthropist (joint ventures). They compete for the same contracts and landmarks, outbid you, and propose mergers.
- **A Rival strength setting** (Relaxed, Competitive, Cutthroat) changes bot sharpness, never your luck.
- **One development action per turn** (build, open, or upgrade) for opportunity cost.
- **More drafting than raw luck:** contract picks and perk cards.
- **Win:**
  - Empire Score after the last act: net worth, Influence, Prestige, landmarks, controlled districts.
  - A possible early end when someone controls a majority of districts.
- **Sim targets** (`pnpm sim --preset tycoon`):
  - last place wins 15% or more;
  - a good player against Competitive bots wins about 40 to 50%;
  - no runaway leader before the last act;
  - about 45 to 60 minutes for one human against three bots.

### Board size

Takeovers need about 7 to 8 streets per player: 28 to 32 streets in 10 or 11 groups for four players. Payday is the main reward, so a lap should stay at 6 to 8 turns (about 6 on 40 spaces at an average roll of 7). Precedent: Mega Monopoly went to 52 spaces and added the Speed die.

| Board | Spaces | Streets | Turns per lap | Feel |
|---|---|---|---|---|
| Classic | 40 | 22 | ~6 | cramped for takeovers |
| Wide ring | 52 to 56 | 28 to 32 | ~7.5 to 8 (~6 with the Speed die) | roomy, but more of the same |
| **Ring + Downtown** (preferred) | 40 outer + 16 inner = 56 | ~30 | ~6 outer, ~2.5 Downtown loop | roomy, with a route choice |

- **The preferred layout** keeps the classic 40-space outer ring and adds a 16-space Downtown loop in the middle, reached through 2 to 4 transit stops. Downtown holds the expensive groups, the landmark sites and most hostile-takeover fights. At each transit stop you choose a route: stay outer for Payday, or go Downtown to fight over influence. The middle of the board gets a dense skyline.
- **Scaling by player count:**
  - 2 players: outer ring only, with some Downtown blocks closed;
  - 3 or 4 players: the full 56;
  - 5 or 6 players: a 48-space outer ring.
- **Cost:** the engine (movement, passing Start, distances) and the board geometry assume one 40-space ring. Two linked loops with a route choice is likely a milestone of its own, and phones rely on the zoom-and-follow camera (D68), to check at 360 px.

### Suggested first slice

Test the mechanics on the current 40-space board before building Downtown; citizens and fair-value takeovers already ease the crowding.

1. Citizens on the board, businesses, and the Payday tally.
2. Influence: earning it and showing it.
3. Buyout offers and forced takeovers at fair value, with the repaint payoff.
4. Antitrust scaling and buyback rights, tuned with `pnpm sim`.

Then shares and takeover battles, mergers, acts, and landmarks. Downtown comes last.

### Alternative kept for later: Rival Cities

Each player gets their own city board that starts small (about 20 spaces) and grows with bought expansions.

- **AI citizens and tourists are the customers**, not opponents. Visitor numbers follow each city's Appeal (parks, transit, landmarks, nightlife).
- **City life brings events and requests:** council requests, a local competitor opening next door, festivals, strikes.
- **Players compete indirectly:**
  - a shared tourist pool split by Appeal;
  - a shared market where income per business type drops as more exist across all cities;
  - unique landmarks and contracts;
  - franchises in a rival's city (earns from their visitors, the owner takes a cut);
  - shares;
  - Airport visits.
- **Strengths:**
  - turns can be simultaneous (no waiting for bots; online plays faster);
  - no eliminations by design;
  - comebacks happen inside your own city.
- **Weaknesses:**
  - risks feeling like solitaire;
  - it is a new game rather than a rules twist (new ruleset, variable board geometry, new UI);
  - it is not much like Monopoly.

Set aside in favour of Tycoon, because the developer wants direct competition and takeovers. A possible future solo game or "Skyline Run" layer. A cheap v0 test: one classic board per player, citizens as AI tokens, tourists split by Appeal, rival cities shown only as numbers.

## Suggested order (if and when)

1. Rule toggles + Speed Die + short game: cheap, expected online, small bot impact.
2. Daily seeded challenge.
3. Perks mode: the biggest one (perk design, balancing through `pnpm sim`, bots that value perks).
