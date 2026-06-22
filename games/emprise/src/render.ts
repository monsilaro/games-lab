// Territory renderer. The 40k grid is cheap enough to FULLY recompute every
// frame, which buys live juice: glowing front-lines (sim.isBorder cells),
// a white capture-flash wavefront (sim.dirty → per-cell flash that decays),
// and pulsing Power-Node rings drawn as a vector overlay. Still one
// putImageData + one drawImage per frame.

import {
  GRID_W,
  GRID_H,
  COLOR_NEUTRAL,
  COLOR_WATER,
  COLOR_PLAYER,
  COLOR_LETTERBOX,
  COLOR_NODE,
  OWNER_NEUTRAL,
  OWNER_PLAYER,
  OWNER_WATER,
  CELL_COUNT,
  FLASH_DUR,
  BORDER_TINT,
  NODE_COUNT,
} from './config';
import type { Grid } from './grid';
import type { Sim } from './sim';

// Seconds a node ring stays "popped" (enlarged + brightened) after it flips owner.
const NODE_POP_DUR = 0.6;

export interface Renderer {
  ctx: CanvasRenderingContext2D;
  off: HTMLCanvasElement;
  offCtx: CanvasRenderingContext2D;
  image: ImageData;
  buf: Uint32Array;
  flash: Float32Array; // per-cell capture-flash time remaining
  nodePop: Float32Array; // per-node 1→0 "just changed hands" pop, decays each frame
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

/** owner id → packed RGBA fill, plus a brightened "front-line" variant. */
const ownerColor = new Uint32Array(256);
const ownerBorderColor = new Uint32Array(256);

function pack(r: number, g: number, b: number): number {
  return ((0xff << 24) | (b << 16) | (g << 8) | r) >>> 0;
}
function packHex(hex: number): number {
  return pack((hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff);
}
/** Lerp a packed colour toward white by t (0..1). */
function lighten(packed: number, t: number): number {
  const r = packed & 0xff;
  const g = (packed >> 8) & 0xff;
  const b = (packed >> 16) & 0xff;
  return pack(
    (r + (255 - r) * t) | 0,
    (g + (255 - g) * t) | 0,
    (b + (255 - b) * t) | 0,
  );
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
  return pack(((r + m) * 255) | 0, ((g + m) * 255) | 0, ((b + m) * 255) | 0);
}

function buildPalette(): void {
  ownerColor[OWNER_NEUTRAL] = packHex(COLOR_NEUTRAL);
  ownerColor[OWNER_PLAYER] = packHex(COLOR_PLAYER);
  ownerColor[OWNER_WATER] = packHex(COLOR_WATER);
  for (let id = 2; id < 255; id++) {
    const hue = (id * 53) % 360;
    ownerColor[id] = hslToPacked(hue, 0.55, 0.55);
  }
  // Front-line variants: neutral/water never glow; owners glow toward white.
  for (let id = 0; id < 256; id++) ownerBorderColor[id] = ownerColor[id];
  for (let id = 1; id < 255; id++) ownerBorderColor[id] = lighten(ownerColor[id], BORDER_TINT);
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
  return {
    ctx,
    off,
    offCtx,
    image,
    buf,
    flash: new Float32Array(CELL_COUNT),
    nodePop: new Float32Array(NODE_COUNT),
    dx: 0,
    dy: 0,
    dw: GRID_W,
    dh: GRID_H,
  };
}

export function clearFlash(r: Renderer): void {
  r.flash.fill(0);
  r.nodePop.fill(0);
}

/** Kick node `n`'s ring into a brief "just changed hands" pop. */
export function flashNodeCapture(r: Renderer, n: number): void {
  if (n >= 0 && n < r.nodePop.length) r.nodePop[n] = 1;
}

/** Recompute the buffer with glow + flash, blit it, then draw node rings. */
export function renderFrame(
  r: Renderer,
  sim: Sim,
  grid: Grid,
  dt: number,
  timeSec: number,
): void {
  // Seed flash for cells conquered this frame (sim.dirty, not yet cleared).
  const flash = r.flash;
  const dirty = sim.dirty;
  for (let k = 0; k < sim.dirtyLen; k++) flash[dirty[k]] = FLASH_DUR;

  const owner = grid.owner;
  const isBorder = sim.isBorder;
  const buf = r.buf;
  const invDur = 1 / FLASH_DUR;
  for (let i = 0; i < CELL_COUNT; i++) {
    const o = owner[i];
    let col = isBorder[i] ? ownerBorderColor[o] : ownerColor[o];
    const f = flash[i];
    if (f > 0) {
      col = lighten(col, f * invDur * 0.85);
      const nf = f - dt;
      flash[i] = nf > 0 ? nf : 0;
    }
    buf[i] = col;
  }
  r.offCtx.putImageData(r.image, 0, 0);

  const ctx = r.ctx;
  ctx.fillStyle = cssHex(COLOR_LETTERBOX);
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(r.off, r.dx, r.dy, r.dw, r.dh);

  drawNodes(r, grid, dt, timeSec);
}

function drawNodes(r: Renderer, grid: Grid, dt: number, timeSec: number): void {
  const ctx = r.ctx;
  const nodes = grid.nodes;
  const pop = r.nodePop;
  const cell = r.dw / GRID_W;
  const baseR = Math.max(7, cell * 2.2);
  for (let n = 0; n < nodes.length; n++) {
    const idx = nodes[n];
    const gx = idx % GRID_W;
    const gy = (idx / GRID_W) | 0;
    const sx = r.dx + ((gx + 0.5) / GRID_W) * r.dw;
    const sy = r.dy + ((gy + 0.5) / GRID_H) * r.dh;
    const pulse = 0.5 + 0.5 * Math.sin(timeSec * 4 + n * 1.3);
    // Capture pop: a fat, bright burst that decays over NODE_POP_DUR.
    const p = pop[n];
    if (p > 0) {
      const np = p - dt / NODE_POP_DUR;
      pop[n] = np > 0 ? np : 0;
    }
    const rad = baseR * (1 + 0.35 * pulse + 0.9 * p);
    const o = grid.owner[idx];
    const held = o !== OWNER_NEUTRAL && o !== OWNER_WATER;
    const col = held ? cssOwner(o) : cssHex(COLOR_NODE);

    ctx.beginPath();
    ctx.arc(sx, sy, rad, 0, Math.PI * 2);
    ctx.lineWidth = 2.5 + 3 * p;
    ctx.strokeStyle = col;
    ctx.globalAlpha = Math.min(1, 0.55 + 0.35 * pulse + 0.45 * p);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.beginPath();
    ctx.arc(sx, sy, baseR * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
  }
}

export function layout(r: Renderer, cssW: number, cssH: number): void {
  const scale = Math.min(cssW / GRID_W, cssH / GRID_H);
  r.dw = GRID_W * scale;
  r.dh = GRID_H * scale;
  r.dx = (cssW - r.dw) / 2;
  r.dy = (cssH - r.dh) / 2;
}

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

function cssHex(hex: number): string {
  return `#${(hex & 0xffffff).toString(16).padStart(6, '0')}`;
}
function cssOwner(o: number): string {
  const p = ownerColor[o];
  return `rgb(${p & 0xff},${(p >> 8) & 0xff},${(p >> 16) & 0xff})`;
}
