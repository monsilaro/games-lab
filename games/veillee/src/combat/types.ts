import type { Ability } from '../config';

export type Team = 'player' | 'enemy';
export type UnitState = 'moving' | 'attacking' | 'dead';

/** Per-instance combat stats, already resolved (star-scaled, cells→world). */
export interface CombatStats {
  atk: number;
  atkInterval: number;
  rangeWorld: number;
  moveSpeed: number; // world units / sec
  manaMax: number;
  manaPerAttack: number;
  ability: Ability;
}

export interface CombatUnit {
  iid: number; // unique instance id (also the key for its UnitView)
  heroId: string;
  team: Team;
  star: 1 | 2 | 3;
  stats: CombatStats;
  hp: number;
  maxHp: number;
  mana: number;
  pos: { x: number; z: number };
  state: UnitState;
  attackTimer: number; // counts down to the next attack
  slowTimer: number; // > 0 while slowed
  slowFactor: number; // moveSpeed multiplier while slowed
  targetIid: number | null;
}

export type CombatEvent =
  | { type: 'attack'; iid: number; targetIid: number }
  | { type: 'hit'; iid: number; amount: number; lethal: boolean }
  | { type: 'cast'; iid: number; kind: Ability['kind']; targets: number[] }
  | { type: 'death'; iid: number };

export interface CombatState {
  units: CombatUnit[];
  elapsed: number;
  done: boolean;
  winner: Team | null;
}
