# Learned bots: training plan

Status: plan only (2026-10-26). Nothing here is built. It expands ARCHITECTURE.md section 9, step 5 and the ROADMAP's "Later: learned bots". Revise it when the work starts; record the choices that stick in DECISIONS.md.

## Why the project is ready for it

- **The engine is the training environment.** It is pure, deterministic and seeded (CLAUDE.md principles 1 and 2), and `pnpm sim` already runs about 7,700 games a minute. The same seed and actions always replay the same game, so training runs are reproducible.
- **The interface already fits.** A learned bot is one more `decide(view, playerId, rng)`. Its input is the masked `observe()` view (no cheating, the same information an online client has), and `legalActions()` is the action mask: the network only ever chooses among legal actions.
- **Ratings already exist.** `pnpm sim` matchups give win rates with seat rotation, which is what every promotion gate below needs.

## Training, step by step

Each stage starts from the previous one, so the bot never has to learn from random play.

1. **Imitation (behavior cloning).** Record (view, chosen action) pairs from millions of heuristic-bot games and train a network to predict the choice. Result: roughly heuristic-level play after hours, not weeks.
2. **Value head.** Train a second output to predict the probability of winning from a view, labeled with each recorded game's real outcome. This alone learns the board's economics: strong sets, railroads early, cash danger late. It also upgrades the search bot (ARCHITECTURE step 4): the search asks the network for a position's value instead of playing random rollouts.
3. **Self-play against a league.** The bot plays a pool of opponents and is rewarded for winning:
   - its current version,
   - snapshots of older versions,
   - the four heuristic personalities.

   The mixed pool stops it from overfitting to its latest self (strategies that only beat themselves). Algorithm options: PPO, or an AlphaZero-style loop (search with the network, train on the search's improved choices).
4. **Promotion gate.** A new version replaces the current one only if it beats it by a statistically meaningful margin over a few thousand `pnpm sim` games. Keep every promoted version: they become league opponents and difficulty levels.

## The action space

Most decisions are small: buy or not, pay bail or roll, which lot to build on. The hard ones need structure:

- **Trades:** the space of possible bundles is huge. The heuristic bot proposes a shortlist of sensible deals and the network scores them (pick one, or none). Answering an offer is a yes or no.
- **Auction bids:** a few price levels relative to the current bid and the lot's value, not any number.
- **Building and raising money:** choose from the legal options `legalActions()` lists, one step at a time.

## Personalities and patterns

A bot trained only to win converges on one "optimal" style. Personalities have to be put in on purpose:

1. **Reward shaping per personality.** Small bonuses on top of winning:
   - Tycoon: building and risk
   - Banker: a cash cushion
   - Shark: trade margins

   One trained bot per personality.
2. **Personality dials (preferred).** Add a small input vector (risk, aggression, trade greed, and so on). During training, sample random dial settings each game and shape the reward to match them. One model then plays any personality, set at game start. The same dials double as difficulty levels, together with sampling temperature.
3. **Learning from people.** With online play (Milestone 9) and players' consent, recorded human games can train bots that feel human, or play like a particular player.

**Reacting to opponents.** Give the network a short history of each opponent's recent choices (accepted trades, bids, cash habits). It then learns to adapt, for example to avoid trading with a hard bargainer or to exploit a loose one. This is the step from "strong" to "feels smart".

## Tooling and shipping

- **Self-play runs in Node** (the engine is TypeScript; run games in worker threads), feeding a trainer in **Python with PyTorch**. The two talk through files or a local socket; the engine never depends on the trainer.
- **The model ships to the browser** as ONNX, run with ONNX Runtime Web. A small network (a few hundred KB) is enough. Load it only when a player picks a neural bot, so it stays out of the ~300 KB initial load.
- **Determinism holds.** Inference is a pure function of the view. Any sampling between actions uses the `rng` that `decide` receives, so replays and the rule that visuals never decide outcomes still hold.
- Check current versions and licenses of these tools when the work starts (CLAUDE.md: verify before adding a dependency).

## Order of work

1. The search bot from the ROADMAP comes first. It is useful on its own, and its decisions are better training data than the heuristic bot's.
2. Then imitation and the value head (steps 1 and 2), which also strengthen the search bot.
3. Then self-play, personality dials and opponent modeling.

## Open questions

- How to encode the view as numbers: per-space features (owner, houses, mortgage) plus per-player features, or something richer.
- Network shape: a plain multilayer network may do. The board is a ring of 40 spaces, so attention over spaces is worth trying if it falls short.
- Compute budget: CPU self-play is likely enough for small networks. Measure before reaching for a GPU.
- Where human game data lives, and how consent works, once online play exists.
