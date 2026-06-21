// Le Feu — Phase 2: ressources, métiers et assignation. Wires the living economy
// on top of Phase 1's day/night skeleton: assigned villagers haul wood/food/stone
// to storage, food feeds the population (famine if it runs out), and wanderers
// arrive at the fire to join. Building-centric assignment (tap a building → +/−).
import * as THREE from 'three';
import { createOrthoApp, startGameLoop } from '@games-lab/shared';
import { SIM_STEP, MAX_STEPS_PER_FRAME, PALETTE, CAMERA, BUILD_ORDER } from './config';
import { setupScene } from './scene';
import { createCameraController } from './camera';
import { createGrid, screenToCell, setOccupied, type Cell } from './grid';
import { createClock, tickClock, daylightOf, phaseOf, phaseLabel, isNightForVillagers, applyLighting } from './time';
import { createFire } from './fire';
import { createBuildings, type BuildingInstance } from './buildings';
import { createStore, consumeFood, isStarving } from './resources';
import { createVillage, tickVillage, updateVillageVisuals } from './village/ai';
import { assignNearestIdle, unassign, unassignOne } from './village/jobs';
import { createRecruiter, tickRecruit, population, popCap } from './village/recruit';
import { createHud, type MarkerItem } from './hud';

// --- Boot ------------------------------------------------------------------
const app = createOrthoApp({ worldHeight: CAMERA.seedHeight, clearColor: PALETTE.night });
const rig = setupScene(app);
const camera = createCameraController(app);

const grid = createGrid();
// Reserve the centre cell: the fire lives there, so nothing spawns/builds on it.
setOccupied(grid, grid.centre, grid.centre, true);
const fire = createFire();
app.scene.add(fire.group);

const store = createStore();
const buildings = createBuildings(app.scene);
const village = createVillage(app.scene, grid);
const recruiter = createRecruiter();

const clock = createClock();

// --- Helpers ---------------------------------------------------------------
function idleCount(): number {
  let n = 0;
  for (const v of village.villagers) if (!v.job && !v.recruiting) n++;
  return n;
}

/** Permanent death from famine: free their job, drop them from the world. */
function killOne(): void {
  // Prefer an idle colonist; otherwise take any non-wanderer.
  let victim = village.villagers.find((v) => !v.job && !v.recruiting);
  if (!victim) victim = village.villagers.find((v) => !v.recruiting);
  if (!victim) return;
  if (victim.job) unassign(victim);
  village.group.remove(victim.root);
  const i = village.villagers.indexOf(victim);
  if (i >= 0) village.villagers.splice(i, 1);
  if (selectedBuilding) hud.refreshSheet(selectedBuilding, idleCount());
}

// --- HUD + control state ---------------------------------------------------
let speedMul = 1;
let buildMode = false;
let selectedBuildId: string | null = null;
let selectedBuilding: BuildingInstance | null = null;

function enterBuildMode(on: boolean): void {
  buildMode = on;
  hud.setBuildActive(on);
  if (on) {
    closeSheet();
    if (!selectedBuildId) selectedBuildId = BUILD_ORDER[0] ?? null;
    buildings.setBuildType(selectedBuildId);
    hud.setBuildSelection(selectedBuildId);
  } else {
    buildings.setBuildType(null);
    buildings.hidePreview();
    selectedBuildId = null;
    hud.setBuildSelection(null);
  }
}

function closeSheet(): void {
  selectedBuilding = null;
  hud.closeSheet();
}

const hud = createHud({
  onSpeed(mult) {
    speedMul = mult;
    hud.setSpeedActive(mult);
  },
  onToggleBuild() {
    enterBuildMode(!buildMode);
  },
  onPickBuilding(id) {
    selectedBuildId = id;
    buildings.setBuildType(id);
    hud.setBuildSelection(id);
  },
  onAssignPlus() {
    if (selectedBuilding) {
      assignNearestIdle(selectedBuilding, village.villagers);
      hud.refreshSheet(selectedBuilding, idleCount());
    }
  },
  onAssignMinus() {
    if (selectedBuilding) {
      unassignOne(selectedBuilding);
      hud.refreshSheet(selectedBuilding, idleCount());
    }
  },
  onCloseSheet() {
    closeSheet();
  },
});
hud.setSpeedActive(speedMul);

// --- Pointer / gesture routing --------------------------------------------
// Two fingers → pinch zoom. One finger in build mode → preview/commit. One finger
// otherwise → pan, unless it was a tap (no drag), which selects a building.
const canvas = app.renderer.domElement;
const TAP_PX = 8;
const pointers = new Map<number, { x: number; y: number }>();
let panAnchor: { x: number; z: number } | null = null;
let pinchStart: { dist: number; zoom: number } | null = null;
let multiTouchUsed = false;
let downX = 0;
let downY = 0;
let movedFar = false;

function twoPointerDist(): number {
  const pts = [...pointers.values()];
  if (pts.length < 2) return 0;
  const a = pts[0]!;
  const b = pts[1]!;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function updatePreview(x: number, y: number): void {
  const cell: Cell | null = screenToCell(grid, app.camera, x, y);
  if (cell) buildings.showPreview(grid, cell, store);
  else buildings.hidePreview();
}

function commitAt(x: number, y: number): void {
  const cell = screenToCell(grid, app.camera, x, y);
  if (cell) buildings.place(grid, cell, store);
  buildings.hidePreview();
}

function selectAt(x: number, y: number): void {
  const cell = screenToCell(grid, app.camera, x, y);
  const b = cell ? buildings.buildingAt(grid, cell) : null;
  if (b) {
    selectedBuilding = b;
    hud.openSheet(b);
    hud.refreshSheet(b, idleCount());
  } else {
    closeSheet();
  }
}

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  downX = e.clientX;
  downY = e.clientY;
  movedFar = false;

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
  if (Math.hypot(e.clientX - downX, e.clientY - downY) > TAP_PX) movedFar = true;

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
    if (!multiTouchUsed) {
      if (buildMode) commitAt(e.clientX, e.clientY);
      else if (!movedFar) selectAt(e.clientX, e.clientY); // a tap (not a drag) selects
    }
    multiTouchUsed = false;
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
// Belt-and-suspenders against iOS scroll/zoom gestures.
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());

// --- World→screen markers (recruit "!", idle building "💤") ----------------
const _proj = new THREE.Vector3();
function projectMarkers(): MarkerItem[] {
  const out: MarkerItem[] = [];
  const w = window.innerWidth;
  const h = window.innerHeight;
  const push = (x: number, y: number, z: number, emoji: string): void => {
    _proj.set(x, y, z).project(app.camera);
    if (_proj.z < -1 || _proj.z > 1) return;
    out.push({ sx: (_proj.x * 0.5 + 0.5) * w, sy: (-_proj.y * 0.5 + 0.5) * h, emoji });
  };
  for (const v of village.villagers) if (v.recruiting) push(v.x, 2.2, v.z, '❗');
  for (const b of buildings.instances) {
    if (b.def.kind === 'production' && b.assigned.length === 0) push(b.world.x, 2.0, b.world.z, '💤');
  }
  return out;
}

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
    tickVillage(village, grid, clock, SIM_STEP, buildings, store);
    tickRecruit(recruiter, village, grid, SIM_STEP, buildings.houseCapacity());
    if (consumeFood(store, population(village), SIM_STEP)) killOne();
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
    const pop = population(village);
    hud.setStatus(store, pop, popCap(buildings.houseCapacity()), idleCount(), isStarving(store));
    if (selectedBuilding) hud.refreshSheet(selectedBuilding, idleCount());
    hud.updateMarkers(projectMarkers());
  }
});
