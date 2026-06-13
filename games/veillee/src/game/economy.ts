import { UNITS, SHOP_ODDS, ECONOMY, income } from '../config';
import { HEROES } from '../forge/heroes';
import { firstFreeBench, type RunState, type ShopOffer, type OwnedUnit } from './state';
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

/** Buy offer `i` → onto the bench (fails if too poor, no offer, or bench full). */
export function buy(s: RunState, i: number): boolean {
  const offer = s.shop[i];
  if (!offer || s.gold < offer.cost) return false;
  const slot = firstFreeBench(s);
  if (slot === null) return false;
  s.gold -= offer.cost;
  s.units.push({ iid: s.nextIid++, heroId: offer.heroId, star: 1, placement: { kind: 'bench', i: slot } });
  s.shop[i] = null;
  tryMerge(s);
  return true;
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
