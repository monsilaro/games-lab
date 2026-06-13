// Story-mode campaign: 3 worlds × 4 hand-tuned levels, each a seeded archetype so
// the layout is identical on every replay. Progress (stars per level) persists to
// localStorage. Linear unlock: clearing a level opens the next.

import * as C from './config';
import { generateLevel, type Archetype } from './levelgen';
import { makeRng } from './rng';

export interface StoryLevel {
  seed: number;
  archetype: Archetype;
  diff: number; // difficulty fed to the generator (material gating, density)
  params?: Partial<C.LevelParams>;
  par: number; // shot budget
}
export interface World {
  name: string;
  theme: C.ThemeName;
  levels: StoryLevel[];
}

export const WORLDS: World[] = [
  {
    name: 'Daybreak Meadow',
    theme: 'day',
    levels: [
      { seed: 1001, archetype: 'towers', diff: 1, params: { towers: 1, maxFloors: 2, targets: 2 }, par: 4 },
      { seed: 1002, archetype: 'pyramid', diff: 2, params: { targets: 3 }, par: 4 },
      { seed: 1003, archetype: 'towers', diff: 2, params: { towers: 2, maxFloors: 2, targets: 3 }, par: 4 },
      { seed: 1004, archetype: 'ledges', diff: 2, params: { targets: 3 }, par: 5 },
    ],
  },
  {
    name: 'Sunset Ridge',
    theme: 'sunset',
    levels: [
      { seed: 2001, archetype: 'towers', diff: 3, params: { towers: 2, maxFloors: 3, targets: 3 }, par: 4 },
      { seed: 2002, archetype: 'pyramid', diff: 4, params: { targets: 4 }, par: 4 },
      { seed: 2003, archetype: 'fortress', diff: 5, params: { targets: 3 }, par: 4 },
      { seed: 2004, archetype: 'ledges', diff: 4, params: { targets: 4 }, par: 5 },
    ],
  },
  {
    name: 'Midnight Hollow',
    theme: 'night',
    levels: [
      { seed: 3001, archetype: 'towers', diff: 6, params: { towers: 3, maxFloors: 3, targets: 4 }, par: 4 },
      { seed: 3002, archetype: 'fortress', diff: 7, params: { targets: 4 }, par: 4 },
      { seed: 3003, archetype: 'pyramid', diff: 7, params: { targets: 5 }, par: 5 },
      { seed: 3004, archetype: 'ledges', diff: 8, params: { targets: 5 }, par: 6 },
    ],
  },
];

interface FlatLevel {
  world: World;
  level: StoryLevel;
  id: number; // global 0-based index
  indexInWorld: number;
}
const FLAT: FlatLevel[] = [];
WORLDS.forEach((world) => {
  world.levels.forEach((level, indexInWorld) => {
    FLAT.push({ world, level, id: FLAT.length, indexInWorld });
  });
});

export function totalLevels(): number {
  return FLAT.length;
}

/** Worlds with their global level ids, for the level-select map. */
export function worlds(): { name: string; ids: number[] }[] {
  const out: { name: string; ids: number[] }[] = [];
  let id = 0;
  for (const w of WORLDS) {
    const ids: number[] = [];
    for (let i = 0; i < w.levels.length; i++) ids.push(id++);
    out.push({ name: w.name, ids });
  }
  return out;
}

/** Display label like "2-3" (world-level). */
export function labelOf(id: number): string {
  const e = FLAT[id]!;
  return `${WORLDS.indexOf(e.world) + 1}-${e.indexInWorld + 1}`;
}

export interface BuiltLevel {
  blocks: ReturnType<typeof generateLevel>['blocks'];
  targets: ReturnType<typeof generateLevel>['targets'];
  theme: C.Theme;
  par: number;
}
export function buildLevel(id: number): BuiltLevel {
  const e = FLAT[id]!;
  const layout = generateLevel({
    level: e.level.diff,
    rng: makeRng(e.level.seed),
    archetype: e.level.archetype,
    params: e.level.params,
  });
  return { blocks: layout.blocks, targets: layout.targets, theme: C.THEMES[e.world.theme], par: e.level.par };
}

// --- progress (localStorage, fail-soft) -----------------------------------------
const KEY = 'slingshot.story.v1';
interface Progress {
  stars: number[]; // index by global id; 0 = not cleared
}
function load(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Progress>;
      if (Array.isArray(p.stars)) return { stars: p.stars };
    }
  } catch {
    /* ignore */
  }
  return { stars: [] };
}
let progress: Progress = load();

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    /* private mode */
  }
}

export function starsOf(id: number): number {
  return progress.stars[id] ?? 0;
}

/** Record a clear; keeps the best star count for that level. */
export function recordStars(id: number, stars: number): void {
  if (stars > (progress.stars[id] ?? 0)) {
    progress.stars[id] = stars;
    save();
  } else if (progress.stars[id] === undefined) {
    progress.stars[id] = stars;
    save();
  }
}

/** Linear unlock: level 0 is always open; later levels need the previous cleared. */
export function isUnlocked(id: number): boolean {
  return id === 0 || (progress.stars[id - 1] ?? 0) > 0;
}

export function totalStars(): number {
  return progress.stars.reduce((n, s) => n + (s || 0), 0);
}
