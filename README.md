# 🏙️ Skyline (working title)

### A juicy, lightweight, Monopoly-style board game for your browser, set in a living isometric city, with bots that actually play well.

**Roll. Buy. Build. Scheme. Bankrupt your friends.** All in a glowing little city where the trains run, the windows light up at dusk, and every dice roll *feels* good.

```
pnpm install
pnpm dev      # http://localhost:5173
```

---

## ✨ Why this exists

I love the Monopoly-style board game genre. When I was younger, I remember how we played hours upon hours with my cousins and never getting bored of the rush. Then we grew up and got busy.

When I went looking for a good digital version, I tried **Monopoly Plus by Ubisoft**, and it left me wanting more. The visuals are nice and all, but first, it was a paid title, second the **bots were lacking** and the **online support was pretty bad**. Those are the two things that decide whether a digital board game is any fun after the first night. 

So my first instinct was not "make it pretty." It was **"make the opponents good."** The whole codebase is built around that:

- A **pure, deterministic rules engine** (no DOM, no timers, no `Math.random`), so thousands of bot games can run in seconds and every game is replayable from a seed. (Which will become very helpful when I start working on the Neural Network based bot)
- A **bot framework from day one**: every bot is just `decide(view, playerId, rng) => Action | null`, working on the same masked view a human sees. No cheating, no peeking. The Ubisoft one was notorious for cheating.
- **Online multiplayer designed in from the start**, not bolted on: the server runs the *same* engine package, so there is one set of rules and one source of truth.

Then, because I'm only human, I made it gorgeous too. 🎨

---

## 🎲 What's in the box

### The game
- **Full rules**: auctions, trading, houses and hotels with even-build, mortgages, jail, two card decks, debt and bankruptcy.
- **Trade any time**, not just on your turn, with several open offers at once. Offer properties, cash and jail cards. Bots answer with verdicts and counter-offers, and they'll propose deals to you too.
- **Manage property any time** (except mid-auction). One-click *Build evenly*, *Sell* and *Raise money* helpers.
- **Presets**: **Standard** (quick, round-limited, richest player wins), **Turbo** (fast and chaotic) and **Classic** (the full, no-limit slog). Online rooms also get house rules: starting cash, GO salary, jail fine, free-parking pot, mortgage interest and more.
- **Keyboard play**: Space for the primary action, hotkeys for build, auction bids, and more.

### The city 🌆
- An **isometric ring of 40 spaces** around a city drawn entirely in code. **A different seeded city every game**, with a *New city* button if you don't like yours.
- **Day and night cycle** by round: lit windows, street lamps, headlights, beacons.
- A **living board**: street traffic and two trains looping through four stations.
- **Vehicle tokens**: pawn, taxi, bus, drone and hot-air balloon, each moving in its own way.
- **3D dice** thrown onto the board (and a quiet tray fallback if you prefer).

### The juice 🍬
Inspired by the *feel* of Balatro (not its art): springs, squash and stretch, token hops with landing squash, screen shake, hit-stop on big moments, number pops, confetti, dust when buildings go up, and a light pulse when you complete a set. Speed up to 4x, skip, go instant, or switch on reduced motion.

### Sound 🔊
A Web Audio mixer with reverb, a code-driven synth, and a pack of CC0 casino samples loaded after your first click.

### Online multiplayer 🌐
- **Rooms with a 5-character code** and a shareable invite link, for up to 6 players.
- Lobby with bots (pick their personality), kick, presets, house rules, turn timer, lock, ready and start.
- **Rock-solid reconnects**: sequence numbers, snapshot fallback, dead-socket detection.
- **Stand-in bots** that take over if someone drops out (if the host allows it), and **host handover**.
- Server-side validation, and each player only ever receives the information they're allowed to see.
- Runs on a **Cloudflare Worker plus one SQLite-backed Durable Object per room**. The room logic is portable, so a Node host could replace Cloudflare later.

> The online stack is built and tested end to end. First public deploy and real-world play sessions are next on the list.

---

## 🤖 The bots

This is the part I care about most.

| Bot | What it does |
| --- | --- |
| `random` | Picks a random legal action. The baseline every other bot must crush. |
| `simple` | A cash reserve, fair-value buying, builds when rich. A sturdy stand-in. |
| **`heuristic`** | The first real opponent. See below. |

**The heuristic bot** values a position as *net worth plus expected future rent*, then compares that value before and after every candidate move, while keeping a cash reserve that grows with danger. Landing odds come from a **Markov chain over the real dice and card decks** (the Ash and Bishop method), so it knows which squares the board actually sends people to. It handles auctions (with bid caps), buying, jail decisions, building by return on investment, mortgaging to fund a near-complete set, trade evaluation *and* trade proposals, and raising money when in debt.

It comes in four **personalities**: ⚖️ **Balanced**, 🏦 **Banker** (hoards cash, builds late), 🏙️ **Tycoon** (buys and builds hard), 🦈 **Shark** (trades aggressively).

Does it work? Over 1,000 simulated games, the heuristic bot beat random opponents **99.9% of the time**, and the harness runs 7,700+ games per minute:

```
pnpm sim --bots heuristic,random,random,random --games 1000
pnpm sim --fuzz     # random-play games that check engine invariants
```

### 🧠 What's next: a neural network bot

The heuristic bot is round one. The plan (see [`docs/LEARNED_BOTS.md`](docs/LEARNED_BOTS.md); this is a plan, nothing is trained yet) is a **strong learned bot**:

1. **Imitation learning** from heuristic-bot games to get a competent baseline.
2. **A value head** that estimates win probability, which also powers a search bot.
3. **Self-play** against a league of past versions and the heuristic personalities.
4. **A promotion gate** using `pnpm sim` win rates, so a new model only ships if it really is stronger.
5. Shipping the model to the browser with **ONNX Runtime Web**.

Along the way: a determinized Monte Carlo search bot (Milestone 10).

---

## 🛠️ Under the hood

- **TypeScript 7** (strict), **Vite 8**, **Vitest 5**, pnpm workspaces. Lint with **oxlint**, format with **oxfmt**.
- **Pixi.js v8** draws the board world, with a custom camera and a single `project()` function for the isometric look. **React 19** (with the React Compiler) and **Tailwind CSS v4** handle the shell: lobby, panels, trade UI.
- **Cloudflare Workers + Durable Objects + Hono** for the server, **Valibot** for validation.

```
packages/
  engine/     pure rules, seeded RNG, events, tests
  bots/       bot interface, heuristic bot, simulation harness
  protocol/   shared action/event/message types
  room/       portable game room (seats, sequencing, timers)
  board/      Pixi board world (no React)
apps/
  web/        the SPA
  server/     Cloudflare Worker + Durable Object
```

Design rules I hold myself to: the engine never throws and is fully deterministic; visuals never decide outcomes (the dice animation lands on a result the engine already chose); the engine emits events and the view plays them as animations; tests come with every rule.

### Commands

```
pnpm dev          # run the app (http://localhost:5173)
pnpm test         # all tests
pnpm check        # format check + lint + typecheck + tests
pnpm sim          # bot matchups
pnpm build        # production build
```

Requires Node 24+ and pnpm.

More in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/ROADMAP.md`](docs/ROADMAP.md) and [`docs/DECISIONS.md`](docs/DECISIONS.md).

---

## 📜 Legal, license and credits

"Monopoly" is a Hasbro trademark. This is an independent project with original names, theme and art; only game mechanics are reused. "Skyline" and all property names are placeholders.

Code: [MIT](LICENSE).

- Sound effects (dice, chips, cards): [Casino Audio](https://kenney.nl/assets/casino-audio) by Kenney, CC0. Thank you, Kenney.
- All other sounds, the board, city and pieces are generated in code.

Every third-party asset, with its source and license, is listed in [docs/ASSETS.md](docs/ASSETS.md). Only CC0, MIT or similarly permissive assets are accepted.
