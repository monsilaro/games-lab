// Structure blocks: pooled meshes paired with matter rectangles. Each block is a
// matte-paper rounded rect drawn into its own CanvasTexture (gradient body, paper
// detail per material, and a BAKED offset drop-shadow — no per-frame blur, which
// is the single biggest perf rule of the papercraft look). The static ground body
// lives here too; its visual (hills + ground) is drawn by effects.ts.

import * as THREE from 'three';
import Matter from 'matter-js';
import * as C from './config';
import * as physics from './physics';
import type { BlockDesc, BlockTone } from './levelgen';
import { lighten, darken, hexToInt, roundRect } from './paper';

const { Bodies } = Matter;

const PXU = 96; // canvas pixels per world unit
const PAD = 0.22; // world-unit margin around the block (room for the offset shadow)

let theme: C.Theme = C.THEMES.day;

interface Block {
  mesh: THREE.Mesh;
  canvas: HTMLCanvasElement;
  tex: THREE.CanvasTexture;
  mat: THREE.MeshBasicMaterial;
  body: Matter.Body | null;
  material: C.BlockMaterial;
  tone: BlockTone;
  w: number;
  h: number;
  color: number; // confetti seed
}

const pool: Block[] = [];
const byBodyId = new Map<number, Block>();

function baseColor(material: C.BlockMaterial, tone: BlockTone): string {
  if (material === 'wood') return tone === 'dark' ? theme.mat.woodDark : theme.mat.woodLight;
  return theme.mat[material];
}

/** Redraw a block's paper texture for its current size/material/tone/theme. */
function drawBlock(block: Block): void {
  const { w, h, material, tone } = block;
  const cw = Math.round((w + 2 * PAD) * PXU);
  const ch = Math.round((h + 2 * PAD) * PXU);
  if (block.canvas.width !== cw || block.canvas.height !== ch) {
    block.canvas.width = cw;
    block.canvas.height = ch;
  }
  const ctx = block.canvas.getContext('2d')!;
  ctx.clearRect(0, 0, cw, ch);

  const wpx = w * PXU;
  const hpx = h * PXU;
  const cx = cw / 2;
  const cy = ch / 2;
  const rad = Math.min(wpx, hpx) * 0.22;
  const base = baseColor(material, tone);

  // baked offset shadow (down-right on screen), no blur
  ctx.fillStyle = 'rgba(70,45,30,0.20)';
  roundRect(ctx, cx - wpx / 2 + 0.05 * PXU, cy - hpx / 2 + 0.13 * PXU, wpx, hpx, rad);
  ctx.fill();

  // translucent for ice; opaque otherwise
  ctx.globalAlpha = material === 'ice' ? 0.85 : 1;

  // body gradient: light top → base → dark bottom
  const g = ctx.createLinearGradient(0, cy - hpx / 2, 0, cy + hpx / 2);
  g.addColorStop(0, lighten(base, 0.14));
  g.addColorStop(0.55, base);
  g.addColorStop(1, darken(base, 0.16));
  ctx.fillStyle = g;
  roundRect(ctx, cx - wpx / 2, cy - hpx / 2, wpx, hpx, rad);
  ctx.fill();

  // per-material paper detail
  if (material === 'wood') {
    ctx.strokeStyle = darken(base, 0.22);
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = Math.max(1, hpx * 0.015);
    for (let i = 1; i <= 3; i++) {
      const gy = cy - hpx / 2 + (hpx * i) / 4;
      ctx.beginPath();
      ctx.moveTo(cx - wpx / 2 + 4, gy);
      ctx.quadraticCurveTo(cx, gy + hpx * 0.04, cx + wpx / 2 - 4, gy);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.85;
  } else if (material === 'ice') {
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = Math.max(1, wpx * 0.04);
    ctx.beginPath();
    ctx.moveTo(cx - wpx * 0.18, cy - hpx / 2 + 4);
    ctx.lineTo(cx - wpx * 0.3, cy + hpx / 2 - 4);
    ctx.stroke();
  } else if (material === 'stone') {
    ctx.fillStyle = darken(base, 0.18);
    for (let i = 0; i < 7; i++) {
      const sx = cx - wpx / 2 + Math.random() * wpx;
      const sy = cy - hpx / 2 + Math.random() * hpx;
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(1, wpx * 0.02), 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (material === 'tnt') {
    ctx.fillStyle = theme.mat.fuse;
    ctx.globalAlpha = 0.92;
    ctx.font = `bold ${Math.round(hpx * 0.5)}px 'Baloo 2', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', cx, cy + hpx * 0.02);
    ctx.globalAlpha = 1;
  }

  // top paper highlight (clipped to the rounded body)
  ctx.globalAlpha = 1;
  ctx.save();
  roundRect(ctx, cx - wpx / 2 + 2, cy - hpx / 2 + 2, wpx - 4, hpx - 4, rad * 0.9);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = Math.max(1, Math.min(wpx, hpx) * 0.05);
  ctx.beginPath();
  ctx.moveTo(cx - wpx / 2, cy - hpx / 2 + 3);
  ctx.lineTo(cx + wpx / 2, cy - hpx / 2 + 3);
  ctx.stroke();
  ctx.restore();

  block.tex.needsUpdate = true;
}

export function init(scene: THREE.Scene): void {
  for (let i = 0; i < C.BLOCK_POOL; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = PXU;
    canvas.height = PXU;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.visible = false;
    mesh.position.z = 0.1;
    scene.add(mesh);
    pool.push({ mesh, canvas, tex, mat, body: null, material: 'wood', tone: 'dark', w: 1, h: 1, color: 0xffffff });
  }

  // static ground body (its paper visual is the hills/ground drawn by effects.ts)
  const ground = Bodies.rectangle(C.MIN_VIEW_WIDTH / 2, C.GROUND_Y - 1, C.MIN_VIEW_WIDTH + 12, 2, {
    isStatic: true,
    label: 'ground',
    friction: 0.8,
  });
  physics.addBody(ground);
}

/** Switch mood: redraw every live block's paper texture for the new theme. */
export function setTheme(next: C.Theme): void {
  theme = next;
  for (const block of pool) {
    if (block.body) {
      block.color = hexToInt(baseColor(block.material, block.tone));
      drawBlock(block);
    }
  }
}

export function spawnFromDescs(descs: BlockDesc[]): void {
  for (const desc of descs) {
    const slot = pool.find((b) => b.body === null);
    if (!slot) break; // pool exhausted — levelgen stays under BLOCK_POOL by tuning
    const def = C.MATERIALS[desc.material];
    const body = Bodies.rectangle(desc.x, desc.y, desc.w, desc.h, {
      label: 'block',
      friction: C.BLOCK_FRICTION,
      restitution: def.restitution,
      density: def.density,
    });
    slot.body = body;
    slot.material = desc.material;
    slot.tone = desc.tone;
    slot.w = desc.w;
    slot.h = desc.h;
    slot.color = hexToInt(baseColor(desc.material, desc.tone));
    drawBlock(slot);
    slot.mesh.scale.set(desc.w + 2 * PAD, desc.h + 2 * PAD, 1);
    slot.mesh.rotation.z = 0;
    slot.mesh.visible = true;
    byBodyId.set(body.id, slot);
    physics.addBody(body, slot.mesh);
  }
}

export function reset(): void {
  for (const block of pool) {
    if (block.body) physics.removeBody(block.body);
    block.body = null;
    block.mesh.visible = false;
  }
  byBodyId.clear();
}

/** Shatter a block: remove its body and hide its mesh (no-op for non-blocks). */
export function breakBlock(body: Matter.Body): void {
  const block = byBodyId.get(body.id);
  if (!block || !block.body) return;
  physics.removeBody(block.body);
  byBodyId.delete(body.id);
  block.body = null;
  block.mesh.visible = false;
}

/** Burst color for a struck block (falls back to a paper cream for non-blocks). */
export function colorOf(body: Matter.Body): number {
  return byBodyId.get(body.id)?.color ?? 0xfffaf2;
}

/** The block's material, or null if the body isn't a live block. */
export function materialOf(body: Matter.Body): C.BlockMaterial | null {
  return byBodyId.get(body.id)?.material ?? null;
}

/** Speed (units/s) above which this block shatters; ∞ for non-blocks. */
export function breakImpactOf(body: Matter.Body): number {
  const block = byBodyId.get(body.id);
  return block ? C.MATERIALS[block.material].breakImpact : Infinity;
}
