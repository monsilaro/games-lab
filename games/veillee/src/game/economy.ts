import { UNITS, SHOP_ODDS, ECONOMY, income, fieldCap } from '../config';
import { HEROES } from '../forge/heroes';
import { firstFreeBench, firstFreeCell, boardCount, type RunState, type ShopOffer, type OwnedUnit } from './state';
import type { Slot } from '../render/board';

const costOf = (heroId: string): number => UNITS[heroId]?.cost ?? 1;

export function grantIncome(s: RunState): void {
  s.gold += income(s.gold);
}

function rollOne(): ShopOffer {
  const weights = HEROES.map((h) => SHOP_ODDS[costOf(h.id) as 1 | 2 | 3]);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < HEROES.length; i++) {
    r -= weights[i]!;
    if (r <= 0) {
      const id = HEROES[i]!.id;
      return { heroId: id, cost: costOf(id) };
    }
  }
  const id = HEROES[HEROES.length - 1]!.id;
  return { heroId: id, cost: costOf(id) };
}

export function rollShop(s: RunState): void {
  s.shop = Array.from({ length: ECONOMY.shopSize }, rollOne);
}

/**
 * Buy offer `i`. Goes straight onto an open board cell if the field has room,
 * otherwise the bench. Fails only if too poor, no offer, or nowhere to put it.
 */
export function buy(s: RunState, i: number): boolean {
  const offer = s.shop[i];
  if (!offer || s.gold < offer.cost) return false;

  let placement: Slot | null = null;
  if (boardCount(s) < fieldCap(s.clearedLevels)) {
    const cell = firstFreeCell(s);
    if (cell) placement = { kind: 'cell', col: cell.col, row: cell.row };
  }
  if (!placement) {
    const slot = firstFreeBench(s);
    if (slot !== null) placement = { kind: 'bench', i: slot };
  }
  if (!placement) return false; // no room on board or bench

  s.gold -= offer.cost;
  s.units.push({ iid: s.nextIid++, heroId: offer.heroId, star: 1, placement });
  s.shop[i] = null;
  tryMerge(s);
  autoField(s); // a merge may have freed a cell / left bench units to promote
  return true;
}

/** Promote bench units onto open board cells until the field cap is reached. */
export function autoField(s: RunState): void {
  while (boardCount(s) < fieldCap(s.clearedLevels)) {
    const benchUnit = s.units.find((u) => u.placement.kind === 'bench');
    const cell = firstFreeCell(s);
    if (!benchUnit || !cell) break;
    benchUnit.placement = { kind: 'cell', col: cell.col, row: cell.row };
  }
}

export function reroll(s: RunState): boolean {
  if (s.gold < ECONOMY.rerollCost) return false;
  s.gold -= ECONOMY.rerollCost;
  rollShop(s);
  return true;
}

/**
 * Fold any 3 same hero+star into one of the next star (recursive, capped at
 * starMax). The merged unit keeps a board cell if any of the three was fielded,
 * otherwise a bench slot — that slot is freed by removing the consumed copies.
 */
export function tryMerge(s: RunState): void {
  for (;;) {
    const groups = new Map<string, OwnedUnit[]>();
    for (const u of s.units) {
      if (u.star >= ECONOMY.starMax) continue;
      const key = `${u.heroId}@${u.star}`;
      const arr = groups.get(key);
      if (arr) arr.push(u);
      else groups.set(key, [u]);
    }

    let triple: OwnedUnit[] | null = null;
    for (const arr of groups.values()) {
      if (arr.length >= 3) {
        triple = arr.slice(0, 3);
        break;
      }
    }
    if (!triple) return;

    const onCell = triple.find((u) => u.placement.kind === 'cell');
    const keep: Slot = cloneSlot((onCell ?? triple[0]!).placement);
    const consumed = new Set(triple.map((u) => u.iid));
    s.units = s.units.filter((u) => !consumed.has(u.iid));
    s.units.push({
      iid: s.nextIid++,
      heroId: triple[0]!.heroId,
      star: (triple[0]!.star + 1) as 1 | 2 | 3,
      placement: keep,
    });
  }
}

function cloneSlot(slot: Slot): Slot {
  return slot.kind === 'cell' ? { kind: 'cell', col: slot.col, row: slot.row } : { kind: 'bench', i: slot.i };
}
