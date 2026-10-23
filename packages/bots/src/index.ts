/**
 * Bot interface and implementations. See docs/ARCHITECTURE.md section 9.
 */
export { botRng, type Bot, type BotRng } from './bot.ts'
export { randomBot, simpleBot } from './simple.ts'
export { createHeuristicBot, type HeuristicOptions } from './heuristic/bot.ts'
export { BALANCED, PERSONALITIES, type BotParams } from './heuristic/params.ts'
export { LANDING } from './heuristic/landing.ts'
export { playMatch, type MatchOptions, type MatchResult } from './match.ts'
export {
  buildEvenlyPlan,
  buildableGroups,
  liquidationValue,
  raisePlan,
  raiseValue,
  sellEvenlyPlan,
  type Plan,
} from './plans.ts'
