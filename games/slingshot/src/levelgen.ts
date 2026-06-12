// Procedural structures: towers of column pairs + planks, with target slots
// picked by a protection score that rises with the level. Blocks are emitted
// at exact rest positions so the structure spawns stable and only needs the
// short settle phase to go to sleep.

import * as C from './config';

export type BlockTone = 'dark' | 'light';

export interface BlockDesc {
  x: number; // center, world units
  y: number;
  w: number;
  h: number;
  tone: BlockTone; // only meaningful for wood (dark/light contrast)
  material: C.BlockMaterial;
}

// Material mix widens with the level: ice from L2, stone from L4, TNT from L6.
function pickMaterial(level: number): C.BlockMaterial {
  const r = Math.random();
  if (level >= 6 && r < 0.08) return 'tnt';
  if (level >= 4 && r < 0.24) return 'stone';
  if (level >= 2 && r < 0.42) return 'ice';
  return 'wood';
}

export interface TargetDesc {
  x: number;
  y: number;
}

export interface LevelLayout {
  blocks: BlockDesc[];
  targets: TargetDesc[];
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

interface Slot {
  x: number;
  y: number;
  // 0 = open ground in front, 1 = ground between/behind towers,
  // 2 = on top of a tower, 3 = inside a floor (columns + plank above)
  protection: number;
}

export function generateLevel(level: number): LevelLayout {
  const p = C.levelParams(level);
  const blocks: BlockDesc[] = [];
  const slots: Slot[] = [];

  // Tower centers: even partition of the build range, jittered within segments.
  const segW = (p.buildXMax - p.buildXMin) / p.towers;
  for (let ti = 0; ti < p.towers; ti++) {
    const cx = p.buildXMin + segW * (ti + 0.5) + rand(-0.15, 0.15) * segW;
    const floors = 1 + Math.floor(Math.random() * p.maxFloors);
    let gap = rand(C.GAP_MIN, C.GAP_MAX);
    const groundGap = gap;
    let baseY = C.GROUND_Y;
    let dark = Math.random() < 0.5;

    for (let f = 0; f < floors; f++) {
      const jitter = rand(-C.FLOOR_JITTER, C.FLOOR_JITTER);
      const colY = baseY + C.COL_H / 2;
      const tone = (): BlockTone => {
        dark = !dark;
        return dark ? 'dark' : 'light';
      };
      const mat = (): C.BlockMaterial => pickMaterial(level);
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
      // inside this floor: sheltered by the columns and the plank above
      slots.push({ x: cx + jitter, y: baseY + C.TARGET_RADIUS, protection: 3 });
      baseY += C.COL_H + C.PLANK_H;
      gap *= C.GAP_SHRINK;
    }

    // on top of the tower (rear towers are harder to reach over the front ones)
    slots.push({ x: cx, y: baseY + C.TARGET_RADIUS, protection: ti === 0 ? 2 : 2.5 });
    // on the ground around the tower
    const reach = groundGap / 2 + rand(0.9, 1.4);
    slots.push({ x: cx - reach, y: C.GROUND_Y + C.TARGET_RADIUS, protection: ti === 0 ? 0 : 1 });
    slots.push({ x: cx + reach, y: C.GROUND_Y + C.TARGET_RADIUS, protection: 1 });
  }

  // Pick target slots closest to the protection tier this level asks for.
  const wantProtection = Math.min(3, Math.floor((level - 1) / 2));
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = slots[i]!;
    slots[i] = slots[j]!;
    slots[j] = a;
  }
  slots.sort(
    (a, b) => Math.abs(a.protection - wantProtection) - Math.abs(b.protection - wantProtection),
  );

  const targets: TargetDesc[] = [];
  const minSpacing = C.TARGET_RADIUS * 3;
  for (const slot of slots) {
    if (targets.length >= p.targets) break;
    if (targets.some((t) => Math.abs(t.x - slot.x) < minSpacing && Math.abs(t.y - slot.y) < C.COL_H)) {
      continue; // two ground slots from neighbouring towers can overlap
    }
    targets.push({ x: slot.x, y: slot.y });
  }
  // If spacing filtered out too many, relax it rather than under-deliver.
  for (const slot of slots) {
    if (targets.length >= p.targets) break;
    if (targets.some((t) => t.x === slot.x && t.y === slot.y)) continue;
    targets.push({ x: slot.x, y: slot.y });
  }

  return { blocks, targets };
}
