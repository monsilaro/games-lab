// Territory renderer: a persistent ImageData at GRID resolution, updated for
// changed cells only, blitted once per frame to the visible canvas scaled
// (nearest-neighbour) into a centred, letterboxed rect. One putImageData +
// one drawImage per frame — the performant path for a 40k-cell pixel grid.

import {
  GRID_W,
  GRID_H,
  COLOR_NEUTRAL,
  COLOR_WATER,
  COLOR_PLAYER,
  COLOR_LETTERBOX,
  OWNER_NEUTRAL,
  OWNER_PLAYER,
  OWNER_WATER,
} from './config';
import type { Grid } from './grid';
import type { Sim } from './sim';

export interface Renderer {
  ctx: CanvasRenderingContext2D; // visible canvas (CSS-pixel transform applied)
  off: HTMLCanvasElement; // offscreen at grid resolution
  offCtx: CanvasRenderingContext2D;
  image: ImageData;
  buf: Uint32Array; // 32-bit view over image.data for fast writes
  // Blit rect in CSS pixels (recomputed on layout).
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

/** owner id → packed RGBA (little-endian: 0xAABBGGRR). */
const ownerColor = new Uint32Array(256);

function pack(hex: number): number {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return ((0xff << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

function hslToPacked(h: number, s: number, l: number): number {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  const rr = Math.round((r + m) * 255);
  const gg = Math.round((g + m) * 255);
  const bb = Math.round((b + m) * 255);
  return ((0xff << 24) | (bb << 16) | (gg << 8) | rr) >>> 0;
}

function buildPalette(): void {
  ownerColor[OWNER_NEUTRAL] = pack(COLOR_NEUTRAL);
  ownerColor[OWNER_PLAYER] = pack(COLOR_PLAYER);
  ownerColor[OWNER_WATER] = pack(COLOR_WATER);
  // Bots 2..254: distinct cold-ish hues. Unused in Phase 1, ready for Phase 3.
  for (let id = 2; id < 255; id++) {
    const hue = (id * 53) % 360;
    ownerColor[id] = hslToPacked(hue, 0.5, 0.55);
  }
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  buildPalette();
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('emprise: 2D canvas context unavailable');

  const off = document.createElement('canvas');
  off.width = GRID_W;
  off.height = GRID_H;
  const offCtx = off.getContext('2d');
  if (!offCtx) throw new Error('emprise: offscreen 2D context unavailable');

  const image = offCtx.createImageData(GRID_W, GRID_H);
  const buf = new Uint32Array(image.data.buffer);

  return { ctx, off, offCtx, image, buf, dx: 0, dy: 0, dw: GRID_W, dh: GRID_H };
}

/** Full repaint of the offscreen buffer (boot, and after a resize is fine too). */
export function paintFull(r: Renderer, grid: Grid): void {
  const owner = grid.owner;
  const buf = r.buf;
  for (let i = 0; i < owner.length; i++) {
    buf[i] = ownerColor[owner[i]];
  }
  r.offCtx.putImageData(r.image, 0, 0);
}

/** Update only the cells the sim changed this frame, then one putImageData. */
export function applyDirty(r: Renderer, sim: Sim): void {
  if (sim.dirtyLen === 0) return;
  const owner = sim.grid.owner;
  const dirty = sim.dirty;
  const buf = r.buf;
  for (let k = 0; k < sim.dirtyLen; k++) {
    const c = dirty[k];
    buf[c] = ownerColor[owner[c]];
  }
  r.offCtx.putImageData(r.image, 0, 0);
}

/** Contain-fit the grid into the viewport (CSS pixels), centred. */
export function layout(r: Renderer, cssW: number, cssH: number): void {
  const scale = Math.min(cssW / GRID_W, cssH / GRID_H);
  r.dw = GRID_W * scale;
  r.dh = GRID_H * scale;
  r.dx = (cssW - r.dw) / 2;
  r.dy = (cssH - r.dh) / 2;
}

/** Blit the offscreen grid to the visible canvas (nearest-neighbour, crisp). */
export function blit(r: Renderer, cssW: number, cssH: number): void {
  const ctx = r.ctx;
  ctx.fillStyle = packToCss(COLOR_LETTERBOX);
  ctx.fillRect(0, 0, cssW, cssH);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(r.off, r.dx, r.dy, r.dw, r.dh);
}

/** Inverse of the blit transform: viewport CSS px → grid cell (or null). */
export function pointerToCell(
  r: Renderer,
  px: number,
  py: number,
): { x: number; y: number } | null {
  const gx = Math.floor(((px - r.dx) / r.dw) * GRID_W);
  const gy = Math.floor(((py - r.dy) / r.dh) * GRID_H);
  if (gx < 0 || gx >= GRID_W || gy < 0 || gy >= GRID_H) return null;
  return { x: gx, y: gy };
}

function packToCss(hex: number): string {
  return `#${(hex & 0xffffff).toString(16).padStart(6, '0')}`;
}
