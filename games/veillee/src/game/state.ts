import { ECONOMY, BOARD } from '../config';
import type { Slot } from '../render/board';

export interface OwnedUnit {
  iid: number; // unique within the run; also the preview UnitView key
  heroId: string;
  star: 1 | 2 | 3;
  placement: Slot; // current cell or bench slot
}

export interface ShopOffer {
  heroId: string;
  cost: number;
}

export interface RunState {
  level: number; // 1..10 — the level currently being attempted
  clearedLevels: number; // how many have been won
  gold: number;
  hp: number;
  units: OwnedUnit[]; // everything owned; placement says board-cell vs bench
  shop: (ShopOffer | null)[]; // null = slot already bought
  elapsed: number; // run timer (seconds), for the speed score
  nextIid: number;
}

export function newRun(): RunState {
  return {
    level: 1,
    clearedLevels: 0,
    gold: ECONOMY.startGold,
    hp: ECONOMY.startHP,
    units: [],
    shop: [],
    elapsed: 0,
    nextIid: 1,
  };
}

/** First empty bench slot index, or null if the bench is full. */
export function firstFreeBench(s: RunState): number | null {
  const used = new Set(
    s.units.filter((u) => u.placement.kind === 'bench').map((u) => (u.placement as { i: number }).i),
  );
  for (let i = 0; i < ECONOMY.benchSize; i++) if (!used.has(i)) return i;
  return null;
}

/** Units currently fielded on the board (placement is a cell). */
export function boardCount(s: RunState): number {
  return s.units.filter((u) => u.placement.kind === 'cell').length;
}

/** First empty board cell (scanned back rows → front), or null if the board is full. */
export function firstFreeCell(s: RunState): { col: number; row: number } | null {
  const taken = new Set(
    s.units
      .filter((u) => u.placement.kind === 'cell')
      .map((u) => `${(u.placement as { col: number; row: number }).col},${(u.placement as { row: number }).row}`),
  );
  for (let row = BOARD.rows - 1; row >= 0; row--) {
    for (let col = 0; col < BOARD.cols; col++) {
      if (!taken.has(`${col},${row}`)) return { col, row };
    }
  }
  return null;
}
