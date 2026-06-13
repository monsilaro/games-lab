// Procedural structures. Arcade calls `generateLevel(level)` (Math.random) for an
// endless run; story levels pass a seeded `rng` + an `archetype` so each level's
// layout is fixed and reproducible. Blocks are emitted at exact rest positions so
// a structure spawns stable and only needs the short settle phase to go to sleep.

import * as C from './config';
import { type Rng, randRange } from './rng';

export type BlockTone = 'dark' | 'light';
export type Archetype = 'towers' | 'pyramid' | 'fortress' | 'ledges';

export interface BlockDesc {
  x: number; // center, world units
  y: number;
  w: number;
  h: number;
  tone: BlockTone; // only meaningful for wood (dark/light contrast)
  material: C.BlockMaterial;
}

export interface TargetDesc {
  x: number;
  y: number;
}

export interface LevelLayout {
  blocks: BlockDesc[];
  targets: TargetDesc[];
}

export interface GenOpts {
  level: number;
  rng?: Rng; // defaults to Math.random (arcade); story passes a seeded one
  archetype?: Archetype;
  params?: Partial<C.LevelParams>; // per-level overrides for story
}

// Material mix widens with the level: ice from L2, stone from L4, TNT from L6.
function pickMaterial(level: number, rng: Rng): C.BlockMaterial {
  const r = rng();
  if (level >= 6 && r < 0.08) return 'tnt';
  if (level >= 4 && r < 0.24) return 'stone';
  if (level >= 2 && r < 0.42) return 'ice';
  return 'wood';
}

export function generateLevel(arg: number | GenOpts): LevelLayout {
  const opts: GenOpts = typeof arg === 'number' ? { level: arg } : arg;
  const rng: Rng = opts.rng ?? Math.random;
  const level = opts.level;
  const p: C.LevelParams = { ...C.levelParams(level), ...opts.params };
  switch (opts.archetype ?? 'towers') {
    case 'pyramid':
      return genPyramid(level, p, rng);
    case 'fortress':
      return genFortress(p, rng);
    case 'ledges':
      return genLedges(p, rng);
    default:
      return genTowers(level, p, rng);
  }
}

// --- towers (the original generator) --------------------------------------------
interface Slot {
  x: number;
  y: number;
  protection: number; // 0 open ground … 3 sheltered inside a floor
}

function genTowers(level: number, p: C.LevelParams, rng: Rng): LevelLayout {
  const blocks: BlockDesc[] = [];
  const slots: Slot[] = [];

  const segW = (p.buildXMax - p.buildXMin) / p.towers;
  for (let ti = 0; ti < p.towers; ti++) {
    const cx = p.buildXMin + segW * (ti + 0.5) + randRange(rng, -0.15, 0.15) * segW;
    const floors = 1 + Math.floor(rng() * p.maxFloors);
    let gap = randRange(rng, C.GAP_MIN, C.GAP_MAX);
    const groundGap = gap;
    let baseY = C.GROUND_Y;
    let dark = rng() < 0.5;

    for (let f = 0; f < floors; f++) {
      const jitter = randRange(rng, -C.FLOOR_JITTER, C.FLOOR_JITTER);
      const colY = baseY + C.COL_H / 2;
      const tone = (): BlockTone => {
        dark = !dark;
        return dark ? 'dark' : 'light';
      };
      const mat = (): C.BlockMaterial => pickMaterial(level, rng);
      blocks.push({ x: cx + jitter - gap / 2, y: colY, w: C.COL_W, h: C.COL_H, tone: tone(), material: mat() });
      blocks.push({ x: cx + jitter + gap / 2, y: colY, w: C.COL_W, h: C.COL_H, tone: tone(), material: mat() });
      blocks.push({
        x: cx + jitter,
        y: baseY + C.COL_H + C.PLANK_H / 2,
        w: gap + C.PLANK_OVERHANG,
        h: C.PLANK_H,
        tone: tone(),
        material: mat(),
      });
      slots.push({ x: cx + jitter, y: baseY + C.TARGET_RADIUS, protection: 3 });
      baseY += C.COL_H + C.PLANK_H;
      gap *= C.GAP_SHRINK;
    }

    slots.push({ x: cx, y: baseY + C.TARGET_RADIUS, protection: ti === 0 ? 2 : 2.5 });
    const reach = groundGap / 2 + randRange(rng, 0.9, 1.4);
    slots.push({ x: cx - reach, y: C.GROUND_Y + C.TARGET_RADIUS, protection: ti === 0 ? 0 : 1 });
    slots.push({ x: cx + reach, y: C.GROUND_Y + C.TARGET_RADIUS, protection: 1 });
  }

  // Pick target slots closest to the protection tier this level asks for.
  const wantProtection = Math.min(3, Math.floor((level - 1) / 2));
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = slots[i]!;
    slots[i] = slots[j]!;
    slots[j] = a;
  }
  slots.sort((a, b) => Math.abs(a.protection - wantProtection) - Math.abs(b.protection - wantProtection));

  const targets = pickTargets(slots, p.targets);
  return { blocks, targets };
}

// --- pyramid: stacked bricks narrowing upward -----------------------------------
function genPyramid(level: number, p: C.LevelParams, rng: Rng): LevelLayout {
  const blocks: BlockDesc[] = [];
  const cx = (p.buildXMin + p.buildXMax) / 2 + randRange(rng, -1, 1);
  const bw = 0.72;
  const bh = 0.56;
  const baseCount = Math.min(3 + Math.floor(level / 2), 6);
  let dark = rng() < 0.5;
  for (let r = 0; r < baseCount; r++) {
    const count = baseCount - r;
    const rowW = count * bw;
    const y = C.GROUND_Y + bh / 2 + r * bh;
    for (let i = 0; i < count; i++) {
      const x = cx - rowW / 2 + bw / 2 + i * bw;
      dark = !dark;
      const material: C.BlockMaterial = level >= 2 && rng() < 0.25 ? 'ice' : 'wood';
      blocks.push({ x, y, w: bw, h: bh, tone: dark ? 'dark' : 'light', material });
    }
  }
  const cand: TargetDesc[] = [
    { x: cx, y: C.GROUND_Y + baseCount * bh + C.TARGET_RADIUS }, // crown
    { x: cx, y: C.GROUND_Y + bh + C.TARGET_RADIUS }, // tucked at the base
  ];
  while (cand.length < p.targets) {
    const r = 1 + Math.floor(rng() * Math.max(1, baseCount - 1));
    cand.push({ x: cx + randRange(rng, -1, 1), y: C.GROUND_Y + r * bh + C.TARGET_RADIUS });
  }
  return { blocks, targets: cand.slice(0, Math.max(1, p.targets)) };
}

// --- fortress: stone shell with a TNT + target core (set-piece) ------------------
function genFortress(p: C.LevelParams, rng: Rng): LevelLayout {
  const blocks: BlockDesc[] = [];
  const cx = (p.buildXMin + p.buildXMax) / 2 + randRange(rng, -0.5, 0.5);
  const wallH = C.COL_H * 1.4;
  const half = 1.3;
  blocks.push({ x: cx - half, y: C.GROUND_Y + wallH / 2, w: C.COL_W, h: wallH, tone: 'dark', material: 'stone' });
  blocks.push({ x: cx + half, y: C.GROUND_Y + wallH / 2, w: C.COL_W, h: wallH, tone: 'dark', material: 'stone' });
  blocks.push({
    x: cx,
    y: C.GROUND_Y + wallH + C.PLANK_H / 2,
    w: half * 2 + C.COL_W + C.PLANK_OVERHANG,
    h: C.PLANK_H,
    tone: 'light',
    material: 'stone',
  });
  blocks.push({ x: cx, y: C.GROUND_Y + 0.5, w: C.COL_W, h: 1.0, tone: 'dark', material: 'tnt' });

  const cand: TargetDesc[] = [
    { x: cx, y: C.GROUND_Y + 1.2 + C.TARGET_RADIUS }, // sheltered core
    { x: cx, y: C.GROUND_Y + wallH + C.PLANK_H + C.TARGET_RADIUS }, // on the roof
  ];
  let side = -1;
  while (cand.length < p.targets) {
    cand.push({ x: cx + side * (half + 1.2), y: C.GROUND_Y + C.TARGET_RADIUS });
    side *= -1;
  }
  return { blocks, targets: cand.slice(0, Math.max(1, p.targets)) };
}

// --- ledges: balloon-carried targets aloft + a little ground cover --------------
function genLedges(p: C.LevelParams, rng: Rng): LevelLayout {
  const blocks: BlockDesc[] = [];
  const targets: TargetDesc[] = [];
  const n = Math.min(Math.max(2, p.targets), 4);
  const span = p.buildXMax - p.buildXMin;
  for (let i = 0; i < n; i++) {
    const x = p.buildXMin + span * ((i + 0.5) / n) + randRange(rng, -0.4, 0.4);
    const h = 1.3 + rng() * 2.2; // balloon hover height
    blocks.push({ x, y: C.GROUND_Y + h, w: 0.8, h: 0.8, tone: 'light', material: 'balloon' });
    targets.push({ x, y: C.GROUND_Y + h + 0.4 + C.TARGET_RADIUS }); // rides the balloon
    if (rng() < 0.6) {
      blocks.push({
        x: x + randRange(rng, -0.8, 0.8),
        y: C.GROUND_Y + C.COL_H / 2,
        w: C.COL_W,
        h: C.COL_H,
        tone: 'dark',
        material: rng() < 0.3 ? 'bouncy' : 'wood',
      });
    }
  }
  return { blocks, targets };
}

// Pick target slots closest to the wanted protection tier, spacing-aware.
function pickTargets(slots: Slot[], want: number): TargetDesc[] {
  const targets: TargetDesc[] = [];
  const minSpacing = C.TARGET_RADIUS * 3;
  for (const slot of slots) {
    if (targets.length >= want) break;
    if (targets.some((t) => Math.abs(t.x - slot.x) < minSpacing && Math.abs(t.y - slot.y) < C.COL_H)) continue;
    targets.push({ x: slot.x, y: slot.y });
  }
  for (const slot of slots) {
    if (targets.length >= want) break;
    if (targets.some((t) => t.x === slot.x && t.y === slot.y)) continue;
    targets.push({ x: slot.x, y: slot.y });
  }
  return targets;
}
