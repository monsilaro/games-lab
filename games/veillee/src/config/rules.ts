// ---------------------------------------------------------------------------
// Run rules: economy, board cap, combat bounds, and the score formula.
// All knobs live here so the loop can be retuned without touching logic.
// ---------------------------------------------------------------------------

export const ECONOMY = {
  startGold: 5,
  startHP: 20,
  incomeBase: 6,
  interestPer: 10, // +1 gold per this much saved gold...
  interestMax: 5, // ...capped here
  rerollCost: 1,
  shopSize: 3,
  benchSize: 6,
  starMax: 3 as const,
};

// Relative draw weight per cost tier (cheaper heroes appear more often).
export const SHOP_ODDS: Record<1 | 2 | 3, number> = { 1: 6, 2: 3, 3: 1.5 };

// Placement hint: units with range at or below this want the front line; longer
// ranges want the back. (rows 0–1 = front, toward the enemy; 2–3 = back.)
export const FRONT_LINE_RANGE = 1.6;

export const COMBAT = {
  timeoutSec: 30, // a stalled fight resolves on remaining-hp%
  maxDt: 0.05, // clamp big frame gaps so the sim stays stable
};

// Score rewards COMP QUALITY, not mere survival: surviving units summed across
// fights (domination) and fast combats matter most; clearing levels is a smaller base.
export const SCORING = {
  perLevel: 500, // progress
  perHP: 40, // few losses
  perGold: 5, // economy left over
  perSurvivor: 60, // units still standing at the end of each fight (the big one)
  combatBudgetSec: 150, // sum of combat durations; under this (on a win) earns speed
  speedWeight: 8, // points per second of combat under budget
};

/** Passive gold each shop phase: base + simple interest. */
export function income(gold: number): number {
  return ECONOMY.incomeBase + Math.min(Math.floor(gold / ECONOMY.interestPer), ECONOMY.interestMax);
}

/** How many units may be fielded on the 4x4 — grows as levels are cleared. */
export function fieldCap(clearedLevels: number): number {
  return Math.min(3 + clearedLevels, 8);
}

/** HP a loss costs the player — deeper levels hurt more. */
export function hpLoss(level: number): number {
  return 2 + level;
}

/**
 * Gold refunded when selling a unit. A ★N unit is worth its 3^(N-1) base copies;
 * upgraded units pay a 1-gold tax to discourage buy/sell churn.
 */
export function sellValue(cost: number, star: number): number {
  const copies = Math.pow(3, star - 1);
  return cost * copies - (star > 1 ? 1 : 0);
}

export interface ScoreInput {
  clearedLevels: number;
  hp: number;
  gold: number;
  survivors: number; // units alive summed across all fights
  combatTime: number; // seconds of combat summed across all fights
  won: boolean;
}

export interface ScoreBreakdown {
  levels: number;
  hp: number;
  gold: number;
  survivors: number;
  speed: number;
  total: number;
}

export function computeScore(inp: ScoreInput): ScoreBreakdown {
  const levels = inp.clearedLevels * SCORING.perLevel;
  const hp = Math.max(0, inp.hp) * SCORING.perHP;
  const gold = inp.gold * SCORING.perGold;
  const survivors = inp.survivors * SCORING.perSurvivor;
  const speed = inp.won
    ? Math.max(0, Math.round((SCORING.combatBudgetSec - inp.combatTime) * SCORING.speedWeight))
    : 0;
  return { levels, hp, gold, survivors, speed, total: levels + hp + gold + survivors + speed };
}
