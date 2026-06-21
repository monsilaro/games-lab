// The colony's stores: how much wood/food/stone you hold, the capacity that
// caps it (the fire gives a base; entrepôts add more), and the famine clock.
// Pure data + functions — no THREE, no DOM. main.ts ticks food consumption each
// sim step and acts on the death signal.
import { ECONOMY, RESOURCE_KINDS, type ResourceKind, type Cost } from './config';

export interface Store {
  counts: Record<ResourceKind, number>;
  capacity: Record<ResourceKind, number>;
  /** true the instant a resource is at cap — drives the HUD "plein" pulse. */
  full: Record<ResourceKind, boolean>;
  /** seconds spent at zero food; a death fires when it crosses starveGrace. */
  famineT: number;
}

export function createStore(): Store {
  return {
    counts: { ...ECONOMY.start },
    capacity: { ...ECONOMY.fireBaseCap },
    full: { wood: false, food: false, stone: false },
    famineT: 0,
  };
}

/** Add (clamped to capacity). Returns how much was actually accepted. */
export function add(store: Store, kind: ResourceKind, amount: number): number {
  const cap = store.capacity[kind];
  const before = store.counts[kind];
  const next = Math.min(cap, before + amount);
  store.counts[kind] = next;
  store.full[kind] = next >= cap;
  return next - before;
}

export function canAfford(store: Store, cost: Cost): boolean {
  for (const k of RESOURCE_KINDS) {
    if (store.counts[k] < (cost[k] ?? 0)) return false;
  }
  return true;
}

/** Deduct a cost if affordable. Returns success. */
export function spend(store: Store, cost: Cost): boolean {
  if (!canAfford(store, cost)) return false;
  for (const k of RESOURCE_KINDS) {
    store.counts[k] -= cost[k] ?? 0;
    store.full[k] = false;
  }
  return true;
}

/** Raise global capacity (when a storage building is placed). */
export function addCapacity(store: Store, cap: Cost): void {
  for (const k of RESOURCE_KINDS) store.capacity[k] += cap[k] ?? 0;
}

/**
 * Eat `pop × rate × dt` food this tick. If food runs out, accumulate the famine
 * clock; returns true on the tick a villager should starve to death.
 */
export function consumeFood(store: Store, pop: number, dt: number): boolean {
  const need = pop * ECONOMY.foodPerVillagerPerSec * dt;
  if (store.counts.food >= need) {
    store.counts.food -= need;
    store.famineT = 0;
    return false;
  }
  store.counts.food = 0;
  store.famineT += dt;
  if (store.famineT >= ECONOMY.starveGrace) {
    store.famineT = 0;
    return true;
  }
  return false;
}

export function isStarving(store: Store): boolean {
  return store.counts.food <= 0;
}
