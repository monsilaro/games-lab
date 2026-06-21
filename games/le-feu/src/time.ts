// The pulse of the game: a day → dusk → night → dawn clock. It exposes a single
// `daylight` scalar (1 = full day, 0 = deep night) that every visual lerps from,
// so the transition is smooth and continuous rather than a hard switch. The same
// scalar tells the villager AI when to leave the fields and gather at the fire.
import * as THREE from 'three';
import type { OrthoApp } from '@games-lab/shared';
import { CYCLE, CYCLE_TOTAL, LIGHTS, SKY } from './config';
import type { SceneRig } from './scene';

export type Phase = 'day' | 'dusk' | 'night' | 'dawn';

export interface Clock {
  /** seconds into the current 24h-equivalent cycle. */
  t: number;
  /** 1-based day counter shown in the HUD. */
  day: number;
}

export function createClock(): Clock {
  return { t: 0, day: 1 };
}

/** Advance the clock by `dt` sim-seconds; roll the day counter at midnight. */
export function tickClock(clock: Clock, dt: number): void {
  clock.t += dt;
  while (clock.t >= CYCLE_TOTAL) {
    clock.t -= CYCLE_TOTAL;
    clock.day++;
  }
}

export function phaseOf(clock: Clock): Phase {
  const t = clock.t;
  if (t < CYCLE.day) return 'day';
  if (t < CYCLE.day + CYCLE.dusk) return 'dusk';
  if (t < CYCLE.day + CYCLE.dusk + CYCLE.night) return 'night';
  return 'dawn';
}

/** 1 = full daylight, 0 = full night, ramped across dusk/dawn. */
export function daylightOf(clock: Clock): number {
  const t = clock.t;
  const duskStart = CYCLE.day;
  const nightStart = duskStart + CYCLE.dusk;
  const dawnStart = nightStart + CYCLE.night;
  if (t < duskStart) return 1;
  if (t < nightStart) return 1 - (t - duskStart) / CYCLE.dusk; // 1 → 0
  if (t < dawnStart) return 0;
  return (t - dawnStart) / CYCLE.dawn; // 0 → 1
}

/** Villagers head to the fire once it's getting dark (and during dawn glow). */
export function isNightForVillagers(clock: Clock): boolean {
  return daylightOf(clock) < 0.5;
}

const FR_PHASE: Record<Phase, string> = {
  day: 'Jour',
  dusk: 'Crépuscule',
  night: 'Nuit',
  dawn: 'Aube',
};
export function phaseLabel(p: Phase): string {
  return FR_PHASE[p];
}

// --- Lighting application (lerp current → day/night target every frame) -----
const _ambDay = new THREE.Color(LIGHTS.ambient.dayColor);
const _ambNight = new THREE.Color(LIGHTS.ambient.nightColor);
const _skyDay = new THREE.Color(SKY.day);
const _skyNight = new THREE.Color(SKY.night);
const _amb = new THREE.Color();
const _sky = new THREE.Color();
const lerp = THREE.MathUtils.lerp;

/**
 * Push `daylight` onto the actual lights + sky. `flickerT` is a free-running
 * real-time clock (seconds) so the fire pulses smoothly regardless of sim speed.
 */
export function applyLighting(app: OrthoApp, rig: SceneRig, daylight: number, flickerT: number): void {
  const m = LIGHTS.moon;
  rig.moon.intensity = lerp(m.nightIntensity, m.dayIntensity, daylight);

  const a = LIGHTS.ambient;
  rig.ambient.intensity = lerp(a.nightIntensity, a.dayIntensity, daylight);
  _amb.lerpColors(_ambNight, _ambDay, daylight);
  rig.ambient.color.copy(_amb);

  const f = LIGHTS.fire;
  const flicker = 1 + Math.sin(flickerT * Math.PI * 2 * f.flickerHz) * f.flickerAmp;
  rig.fireLight.intensity = lerp(f.nightIntensity, f.dayIntensity, daylight) * flicker;

  _sky.lerpColors(_skyNight, _skyDay, daylight);
  app.renderer.setClearColor(_sky);
}
