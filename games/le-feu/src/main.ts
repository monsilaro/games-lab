// Le Feu — Phase 1: the campement and the day/night cycle (a living skeleton).
// Wires the systems together: a fixed-step sim (clock + villager AI) decoupled
// from the render, the lit "Nuit de veillée" rig, a tilted-ortho pan/pinch
// camera, and finger placement of a test hut. No economy or combat yet — this
// phase is the feeling test of the base loop.
import { createOrthoApp, startGameLoop } from '@games-lab/shared';
import { SIM_STEP, MAX_STEPS_PER_FRAME, PALETTE, CAMERA } from './config';
import { setupScene } from './scene';
import { createCameraController } from './camera';
import { createGrid, screenToCell, setOccupied, type Cell } from './grid';
import { createClock, tickClock, daylightOf, phaseOf, phaseLabel, isNightForVillagers, applyLighting } from './time';
import { createFire } from './fire';
import { createBuildings } from './buildings';
import { createVillage, tickVillage, updateVillageVisuals } from './village/ai';
import { createHud } from './hud';

// --- Boot ------------------------------------------------------------------
const app = createOrthoApp({ worldHeight: CAMERA.seedHeight, clearColor: PALETTE.night });
const rig = setupScene(app);
const camera = createCameraController(app);

const grid = createGrid();
// Reserve the centre cell: the fire lives there, so nothing spawns/builds on it.
setOccupied(grid, grid.centre, grid.centre, true);
const fire = createFire();
app.scene.add(fire.group);

const buildings = createBuildings(app.scene);
const village = createVillage(app.scene, grid);

const clock = createClock();

// --- HUD + control state ---------------------------------------------------
let speedMul = 1;
let buildMode = false;

const hud = createHud({
  onSpeed(mult) {
    speedMul = mult;
    hud.setSpeedActive(mult);
  },
  onToggleBuild() {
    buildMode = !buildMode;
    hud.setBuildActive(buildMode);
    if (!buildMode) buildings.hidePreview();
  },
});
hud.setSpeedActive(speedMul);

// --- Pointer / gesture routing --------------------------------------------
// One layer owns the raw pointers and decides per-gesture: two fingers → pinch
// zoom; one finger while building → preview/commit a hut; one finger otherwise
// → pan the camera. This keeps build taps and camera drags from fighting.
const canvas = app.renderer.domElement;
const pointers = new Map<number, { x: number; y: number }>();
let panAnchor: { x: number; z: number } | null = null;
let pinchStart: { dist: number; zoom: number } | null = null;
let multiTouchUsed = false;

function twoPointerDist(): number {
  const pts = [...pointers.values()];
  if (pts.length < 2) return 0;
  const a = pts[0]!;
  const b = pts[1]!;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function updatePreview(x: number, y: number): void {
  const cell: Cell | null = screenToCell(grid, app.camera, x, y);
  if (cell) buildings.showPreview(grid, cell);
  else buildings.hidePreview();
}

function commitAt(x: number, y: number): void {
  const cell = screenToCell(grid, app.camera, x, y);
  if (cell) buildings.place(grid, cell);
  buildings.hidePreview();
}

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size === 2) {
    multiTouchUsed = true;
    panAnchor = null;
    pinchStart = { dist: twoPointerDist(), zoom: camera.zoom() };
  } else if (pointers.size === 1) {
    if (buildMode) updatePreview(e.clientX, e.clientY);
    else panAnchor = camera.groundAt(e.clientX, e.clientY);
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  e.preventDefault();
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size >= 2 && pinchStart) {
    const d = twoPointerDist();
    if (d > 0) camera.setZoom((pinchStart.zoom * pinchStart.dist) / d);
  } else if (pointers.size === 1) {
    if (buildMode) {
      updatePreview(e.clientX, e.clientY);
    } else if (panAnchor) {
      const cur = camera.groundAt(e.clientX, e.clientY);
      if (cur) camera.panByGround(panAnchor.x - cur.x, panAnchor.z - cur.z);
    }
  }
});

function endPointer(e: PointerEvent): void {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchStart = null;
  if (pointers.size === 0) {
    panAnchor = null;
    // A clean single-finger interaction in build mode commits a hut.
    if (buildMode && !multiTouchUsed) commitAt(e.clientX, e.clientY);
    multiTouchUsed = false;
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
// Belt-and-suspenders against iOS scroll/zoom gestures.
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());

// --- Main loop: fixed-step sim, decoupled render (emprise idiom) -----------
let acc = 0;
let hudT = 0;
let flickerT = 0; // free-running real time so the fire pulses even when paused

startGameLoop((dt) => {
  flickerT += dt;

  acc += dt * speedMul; // pause => 0 => sim frozen
  let steps = 0;
  while (acc >= SIM_STEP && steps < MAX_STEPS_PER_FRAME) {
    tickClock(clock, SIM_STEP);
    tickVillage(village, grid, clock, SIM_STEP);
    acc -= SIM_STEP;
    steps++;
  }
  if (acc > SIM_STEP) acc = 0; // drop backlog rather than spiral

  // Render-rate visuals (independent of sim step).
  const daylight = daylightOf(clock);
  applyLighting(app, rig, daylight, flickerT);
  fire.update(flickerT);
  const night = isNightForVillagers(clock);
  updateVillageVisuals(village, flickerT, dt, night, speedMul > 0);
  app.renderer.render(app.scene, app.camera);

  hudT += dt;
  if (hudT >= 0.1) {
    hudT = 0;
    hud.setClock(clock.day, phaseLabel(phaseOf(clock)));
  }
});
