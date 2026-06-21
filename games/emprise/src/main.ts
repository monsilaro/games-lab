// Emprise — boot, canvas/DPR sizing, fixed-step loop wiring, touch input, HUD.

import { startGameLoop } from '@games-lab/shared';
import { SIM_STEP, OWNER_PLAYER } from './config';
import { createGrid } from './grid';
import { createSim, setTarget, simTick, clearDirty } from './sim';
import {
  createRenderer,
  paintFull,
  applyDirty,
  blit,
  layout,
  pointerToCell,
} from './render';

declare const __BUILD_INFO__: string;

const canvas = document.getElementById('emprise-game-canvas') as HTMLCanvasElement;

const grid = createGrid();
const sim = createSim(grid);
const renderer = createRenderer(canvas);

// --- canvas sizing (DPR capped at 2) -------------------------------------
let cssW = 0;
let cssH = 0;
function resize(): void {
  cssW = window.innerWidth;
  cssH = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  renderer.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  layout(renderer, cssW, cssH);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
resize();

paintFull(renderer, grid);

// --- input: tap/drag steers the expansion target -------------------------
let pointerDown = false;
function steer(e: PointerEvent): void {
  const cell = pointerToCell(renderer, e.clientX, e.clientY);
  if (cell) setTarget(sim, cell.x, cell.y);
}
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  pointerDown = true;
  canvas.setPointerCapture(e.pointerId);
  steer(e);
});
canvas.addEventListener('pointermove', (e) => {
  if (!pointerDown) return;
  e.preventDefault();
  steer(e);
});
canvas.addEventListener('pointerup', (e) => {
  e.preventDefault();
  pointerDown = false;
});
canvas.addEventListener('pointercancel', () => {
  pointerDown = false;
});
// Belt-and-suspenders against iOS scroll/zoom gestures.
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());

// --- HUD -----------------------------------------------------------------
const balEl = document.getElementById('emprise-hud-balance') as HTMLElement;
const pctEl = document.getElementById('emprise-hud-percent') as HTMLElement;
const fpsEl = document.getElementById('emprise-hud-fps') as HTMLElement;
const hintEl = document.getElementById('emprise-hint') as HTMLElement | null;
const stampEl = document.getElementById('emprise-build-stamp');
if (stampEl) stampEl.textContent = __BUILD_INFO__;

let hintDismissed = false;
function dismissHint(): void {
  if (hintDismissed || !hintEl) return;
  hintDismissed = true;
  hintEl.classList.add('emprise-hint-hidden');
}
canvas.addEventListener('pointerdown', dismissHint);

const landCount = grid.landCount;

// --- loop: fixed-step sim, decoupled from render -------------------------
const MAX_STEPS_PER_FRAME = 5; // spiral-of-death guard
let acc = 0;
let fps = 60;
let lastFrame = performance.now();
let hudT = 0;

startGameLoop((dt) => {
  // True frame time for an honest fps readout (independent of the sim clamp).
  const now = performance.now();
  const frameMs = now - lastFrame;
  lastFrame = now;
  if (frameMs > 0) fps += (1000 / frameMs - fps) * 0.1;

  // Fixed-step simulation.
  acc += dt;
  let steps = 0;
  while (acc >= SIM_STEP && steps < MAX_STEPS_PER_FRAME) {
    simTick(sim, SIM_STEP);
    acc -= SIM_STEP;
    steps++;
  }
  if (acc > SIM_STEP) acc = 0; // drop backlog rather than spiral

  // Render: changed cells → offscreen, then one scaled blit.
  applyDirty(renderer, sim);
  clearDirty(sim);
  blit(renderer, cssW, cssH);

  // HUD (throttled ~5×/s).
  hudT += dt;
  if (hudT >= 0.2) {
    hudT = 0;
    balEl.textContent = Math.floor(grid.balance[OWNER_PLAYER]).toString();
    const owned = grid.ownedCount[OWNER_PLAYER];
    pctEl.textContent = `${((owned / landCount) * 100).toFixed(1)}%`;
    fpsEl.textContent = Math.round(fps).toString();
  }
});
