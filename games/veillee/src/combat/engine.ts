import { COMBAT } from '../config';
import type { CombatEvent, CombatState, CombatUnit, Team } from './types';

// Deterministic, render-agnostic auto-battler. Operates purely on {x,z} board
// coordinates; the render layer follows the unit positions and reacts to events.
// Determinism: fixed iteration order, ties broken by iid, no RNG.

const EPS = 0.02;

export function createCombat(units: CombatUnit[]): CombatState {
  return { units, elapsed: 0, done: false, winner: null };
}

const alive = (u: CombatUnit): boolean => u.state !== 'dead';

function dist(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function nearestEnemy(state: CombatState, u: CombatUnit): CombatUnit | null {
  let best: CombatUnit | null = null;
  let bestD = Infinity;
  for (const o of state.units) {
    if (o.team === u.team || !alive(o)) continue;
    const d = dist(u.pos, o.pos);
    if (d < bestD || (d === bestD && (best === null || o.iid < best.iid))) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

function applyDamage(target: CombatUnit, amount: number, events: CombatEvent[]): void {
  if (!alive(target)) return;
  target.hp -= amount;
  const lethal = target.hp <= 0;
  events.push({ type: 'hit', iid: target.iid, amount, lethal });
  if (lethal) {
    target.state = 'dead';
    events.push({ type: 'death', iid: target.iid });
  }
}

function livingEnemiesByRange(state: CombatState, u: CombatUnit): CombatUnit[] {
  return state.units
    .filter((o) => o.team !== u.team && alive(o))
    .sort((a, b) => dist(u.pos, a.pos) - dist(u.pos, b.pos) || a.iid - b.iid);
}

function cast(state: CombatState, u: CombatUnit, primary: CombatUnit | null, events: CombatEvent[]): void {
  const ab = u.stats.ability;
  const hit: number[] = [];
  switch (ab.kind) {
    case 'strike': {
      if (primary) {
        applyDamage(primary, u.stats.atk * ab.power, events);
        hit.push(primary.iid);
      }
      break;
    }
    case 'volley': {
      for (const e of livingEnemiesByRange(state, u).slice(0, ab.targets ?? 2)) {
        applyDamage(e, u.stats.atk * ab.power, events);
        hit.push(e.iid);
      }
      break;
    }
    case 'hex': {
      if (primary) {
        applyDamage(primary, u.stats.atk * ab.power, events);
        if (alive(primary)) {
          primary.slowTimer = ab.slowDur ?? 1.5;
          primary.slowFactor = ab.slow ?? 0.5;
        }
        hit.push(primary.iid);
      }
      break;
    }
    case 'ward': {
      // Heal the lowest-hp% living ally (self included). Heal scales off caster maxHp.
      let low: CombatUnit | null = null;
      for (const o of state.units) {
        if (o.team !== u.team || !alive(o)) continue;
        const r = o.hp / o.maxHp;
        if (low === null || r < low.hp / low.maxHp || (r === low.hp / low.maxHp && o.iid < low.iid)) low = o;
      }
      if (low) {
        low.hp = Math.min(low.maxHp, low.hp + u.maxHp * ab.power);
        hit.push(low.iid);
      }
      break;
    }
  }
  events.push({ type: 'cast', iid: u.iid, kind: ab.kind, targets: hit });
}

export function step(state: CombatState, dt: number): CombatEvent[] {
  if (state.done) return [];
  const events: CombatEvent[] = [];
  state.elapsed += dt;

  for (const u of state.units) {
    if (!alive(u)) continue;

    if (u.slowTimer > 0) {
      u.slowTimer -= dt;
      if (u.slowTimer <= 0) u.slowFactor = 1;
    }

    const target = nearestEnemy(state, u);
    if (!target) {
      u.targetIid = null;
      continue;
    }
    u.targetIid = target.iid;

    const dx = target.pos.x - u.pos.x;
    const dz = target.pos.z - u.pos.z;
    const d = Math.hypot(dx, dz);

    if (d <= u.stats.rangeWorld + EPS) {
      u.state = 'attacking';
      u.attackTimer -= dt;
      if (u.attackTimer <= 0) {
        u.attackTimer += u.stats.atkInterval;
        events.push({ type: 'attack', iid: u.iid, targetIid: target.iid });
        applyDamage(target, u.stats.atk, events);
        u.mana = Math.min(u.stats.manaMax, u.mana + u.stats.manaPerAttack);
        if (u.mana >= u.stats.manaMax) {
          u.mana = 0;
          cast(state, u, alive(target) ? target : nearestEnemy(state, u), events);
        }
      }
    } else {
      u.state = 'moving';
      const speed = u.stats.moveSpeed * (u.slowTimer > 0 ? u.slowFactor : 1) * dt;
      const stepLen = Math.min(speed, d - u.stats.rangeWorld);
      if (stepLen > 0) {
        u.pos.x += (dx / d) * stepLen;
        u.pos.z += (dz / d) * stepLen;
      }
    }
  }

  const pAlive = state.units.some((u) => u.team === 'player' && alive(u));
  const eAlive = state.units.some((u) => u.team === 'enemy' && alive(u));
  if (!pAlive || !eAlive) {
    state.done = true;
    state.winner = pAlive ? 'player' : 'enemy'; // mutual wipe counts as a loss
  } else if (state.elapsed >= COMBAT.timeoutSec) {
    state.done = true;
    const pct = (team: Team): number => {
      let s = 0;
      for (const u of state.units) if (u.team === team && alive(u)) s += u.hp / u.maxHp;
      return s;
    };
    state.winner = pct('player') > pct('enemy') ? 'player' : 'enemy';
  }
  return events;
}
