// Emprise — boot, canvas/DPR sizing, fixed-step loop, touch input, HUD, rounds.

import { startGameLoop } from '@games-lab/shared';
import { SIM_STEP, OWNER_PLAYER, WIN_PERCENT } from './config';
import { createGrid, type Grid } from './grid';
import { createSim, setTarget, setGreedyNeutral, simTick, clearDirty, type Sim } from './sim';
import { aiStep } from './ai';
import { createRenderer, renderFrame, clearFlash, layout, pointerToCell } from './render';
import {
  initAudio,
  sfxCapture,
  sfxUnderAttack,
  sfxNode,
  sfxWin,
  sfxLose,
} from './audio';

declare const __BUILD_INFO__: string;

const canvas = document.getElementById('emprise-game-canvas') as HTMLCanvasElement;
const renderer = createRenderer(canvas);

function nextSeed(): number {
  return Date.now() >>> 0;
}

let grid: Grid = createGrid(nextSeed());
let sim: Sim = createSim(grid);
let landCount = grid.landCount;
let totalPlayers = sim.activeOwners.length;
let running = true;
let elapsed = 0;
let lastPlayerOwned = grid.ownedCount[OWNER_PLAYER];
let nodeOwners = snapshotNodeOwners();
setGreedyNeutral(sim, OWNER_PLAYER); // auto-expand into neutral by default

function snapshotNodeOwners(): Uint8Array {
  const a = new Uint8Array(grid.nodes.length);
  for (let n = 0; n < grid.nodes.length; n++) a[n] = grid.owner[grid.nodes[n]];
  return a;
}

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

// --- input: HOLD/drag to focus a directed push (attack), RELEASE to auto-grow.
let pointerDown = false;
function steer(e: PointerEvent): void {
  if (!running) return;
  const cell = pointerToCell(renderer, e.clientX, e.clientY);
  if (cell) setTarget(sim, OWNER_PLAYER, cell.x, cell.y);
}
function release(): void {
  pointerDown = false;
  setGreedyNeutral(sim, OWNER_PLAYER);
}
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  initAudio();
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
  release();
});
canvas.addEventListener('pointercancel', () => {
  release();
});
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());

// --- HUD + round overlay -------------------------------------------------
const balEl = document.getElementById('emprise-hud-balance') as HTMLElement;
const pctEl = document.getElementById('emprise-hud-percent') as HTMLElement;
const rivalsEl = document.getElementById('emprise-hud-rivals') as HTMLElement;
const fpsEl = document.getElementById('emprise-hud-fps') as HTMLElement;
const hintEl = document.getElementById('emprise-hint') as HTMLElement | null;
const hurtEl = document.getElementById('emprise-hurt') as HTMLElement | null;
const overlayEl = document.getElementById('emprise-end-overlay') as HTMLElement;
const endTitleEl = document.getElementById('emprise-end-title') as HTMLElement;
const endSubEl = document.getElementById('emprise-end-sub') as HTMLElement;
const endStatsEl = document.getElementById('emprise-end-stats') as HTMLElement;
const restartBtn = document.getElementById('emprise-restart-btn') as HTMLButtonElement;
const stampEl = document.getElementById('emprise-build-stamp');
if (stampEl) stampEl.textContent = __BUILD_INFO__;

let hintDismissed = false;
function dismissHint(): void {
  if (hintDismissed || !hintEl) return;
  hintDismissed = true;
  hintEl.classList.add('emprise-hint-hidden');
}
canvas.addEventListener('pointerdown', dismissHint);

function hurtFlash(): void {
  if (!hurtEl) return;
  hurtEl.style.opacity = '0.5';
  setTimeout(() => {
    hurtEl.style.opacity = '0';
  }, 60);
}

function snapshot(): { player: number; maxRival: number; rivals: number; rank: number } {
  const oc = grid.ownedCount;
  const player = oc[OWNER_PLAYER];
  let maxRival = 0;
  let rivals = 0;
  let rank = 1;
  for (let a = 0; a < sim.activeOwners.length; a++) {
    const o = sim.activeOwners[a];
    if (o === OWNER_PLAYER) continue;
    const n = oc[o];
    if (n > 0) rivals++;
    if (n > maxRival) maxRival = n;
    if (n > player) rank++;
  }
  return { player, maxRival, rivals, rank };
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function endRound(win: boolean): void {
  running = false;
  const snap = snapshot();
  endTitleEl.textContent = win ? 'Empire' : 'Conquis';
  endSubEl.textContent = win ? 'La carte est à toi.' : 'Ton territoire a été englouti.';
  const pct = ((snap.player / landCount) * 100).toFixed(1);
  endStatsEl.textContent = `Territoire ${pct}%  ·  Rang ${snap.rank}/${totalPlayers}  ·  ${fmtTime(elapsed)}`;
  overlayEl.classList.add('emprise-end-active');
  if (win) sfxWin();
  else sfxLose();
}

function newGame(): void {
  grid = createGrid(nextSeed());
  sim = createSim(grid);
  landCount = grid.landCount;
  totalPlayers = sim.activeOwners.length;
  setGreedyNeutral(sim, OWNER_PLAYER);
  running = true;
  elapsed = 0;
  acc = 0;
  lastPlayerOwned = grid.ownedCount[OWNER_PLAYER];
  nodeOwners = snapshotNodeOwners();
  clearFlash(renderer);
  overlayEl.classList.remove('emprise-end-active');
}
restartBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  initAudio();
  newGame();
});

// --- loop: fixed-step sim, decoupled from render -------------------------
const MAX_STEPS_PER_FRAME = 5;
let acc = 0;
let fps = 60;
let lastFrame = performance.now();
let hudT = 0;

startGameLoop((dt) => {
  const now = performance.now();
  const frameMs = now - lastFrame;
  lastFrame = now;
  if (frameMs > 0) fps += (1000 / frameMs - fps) * 0.1;

  if (running) {
    elapsed += dt;
    acc += dt;
    let steps = 0;
    while (acc >= SIM_STEP && steps < MAX_STEPS_PER_FRAME) {
      aiStep(sim, SIM_STEP);
      simTick(sim, SIM_STEP);
      acc -= SIM_STEP;
      steps++;
    }
    if (acc > SIM_STEP) acc = 0;

    const snap = snapshot();
    if (snap.player === 0) endRound(false);
    else if (snap.player / landCount >= WIN_PERCENT || snap.rivals === 0) endRound(true);
    else if (snap.maxRival / landCount >= WIN_PERCENT) endRound(false);
  }

  // Render every frame (juice keeps animating under the end overlay too).
  renderFrame(renderer, sim, grid, dt, now / 1000);
  clearDirty(sim);

  // HUD + audio events (throttled ~5×/s).
  hudT += dt;
  if (hudT >= 0.2) {
    hudT = 0;
    const snap = snapshot();
    balEl.textContent = Math.floor(grid.balance[OWNER_PLAYER]).toString();
    pctEl.textContent = `${((snap.player / landCount) * 100).toFixed(1)}%`;
    rivalsEl.textContent = snap.rivals.toString();
    fpsEl.textContent = Math.round(fps).toString();

    if (running) {
      const delta = snap.player - lastPlayerOwned;
      lastPlayerOwned = snap.player;
      if (delta >= 15) sfxCapture(Math.min(delta / 200, 1));
      else if (delta <= -8) {
        sfxUnderAttack();
        hurtFlash();
      }
      checkNodes();
    }
  }
});

// Power-node ownership changes → reward / alarm feedback.
function checkNodes(): void {
  for (let n = 0; n < grid.nodes.length; n++) {
    const o = grid.owner[grid.nodes[n]];
    if (o === nodeOwners[n]) continue;
    const prev = nodeOwners[n];
    nodeOwners[n] = o;
    if (o === OWNER_PLAYER) sfxNode();
    else if (prev === OWNER_PLAYER) {
      sfxUnderAttack();
      hurtFlash();
    }
  }
}
