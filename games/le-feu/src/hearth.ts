// The hearth (Phase 4): the fire's fuel level and the protective light radius it
// projects. Pure data + functions — no THREE, no DOM. main.ts ticks it each sim
// step; the fire visuals, the light rig and the threat AI all read its strength.
import { HEARTH } from './config';
import type { Store } from './resources';

export interface Hearth {
  fuel: number; // 0 .. HEARTH.maxFuel
}

export function createHearth(): Hearth {
  return { fuel: HEARTH.startFuel };
}

/**
 * Burn fuel, then top up from the wood store (the fire tends itself as long as
 * there's wood). Net effect: while wood lasts the fire stays near full; once the
 * stockpile is gone the fuel — and the light ring — drains away.
 */
export function tickHearth(hearth: Hearth, store: Store, dt: number, night: boolean): void {
  const burn = night ? HEARTH.burnNight : HEARTH.burnDay;
  hearth.fuel = Math.max(0, hearth.fuel - burn * dt);
  if (hearth.fuel < HEARTH.maxFuel && store.counts.wood > 0) {
    const want = Math.min(HEARTH.refuelPerSec * dt, HEARTH.maxFuel - hearth.fuel);
    const woodAvail = store.counts.wood / HEARTH.woodPerFuel;
    const got = Math.min(want, woodAvail);
    hearth.fuel += got;
    store.counts.wood = Math.max(0, store.counts.wood - got * HEARTH.woodPerFuel);
    store.full.wood = false;
  }
}

/** 0 (empty) .. 1 (full) — drives every fire visual. */
export function fireStrength(hearth: Hearth): number {
  return hearth.fuel / HEARTH.maxFuel;
}

/** World radius of the protective light ring (where shades are held back). */
export function fireRadius(hearth: Hearth): number {
  return HEARTH.minRadius + (HEARTH.maxRadius - HEARTH.minRadius) * fireStrength(hearth);
}

/** True when the fire is running low (used for the night warning). */
export function isFireLow(hearth: Hearth): boolean {
  return fireStrength(hearth) < HEARTH.lowFrac;
}
