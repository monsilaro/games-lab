// The campement grid: a square field of cells centred on the world origin, with
// a round island mask so the silhouette reads (not a bare square). Occupancy is
// one Uint8Array — no per-cell objects (emprise idiom). Phase 1 uses it for the
// island shape, the fire's home cell, and finger placement of the test hut.
import * as THREE from 'three';
import { GRID, CELL_OFFISLAND, CELL_FREE, CELL_OCCUPIED } from './config';

export interface Cell {
  cx: number;
  cy: number;
}

export interface Grid {
  size: number;
  cell: number;
  /** size*size occupancy: CELL_FREE | CELL_OCCUPIED | CELL_OFFISLAND. */
  occ: Uint8Array;
  /** the centre cell index along one axis (where the fire sits). */
  centre: number;
}

export function createGrid(): Grid {
  const size = GRID.size;
  const occ = new Uint8Array(size * size);
  const centre = Math.floor(size / 2);
  for (let cy = 0; cy < size; cy++) {
    for (let cx = 0; cx < size; cx++) {
      const dx = cx - centre;
      const dy = cy - centre;
      const onIsland = Math.hypot(dx, dy) <= GRID.islandRadius;
      occ[cy * size + cx] = onIsland ? CELL_FREE : CELL_OFFISLAND;
    }
  }
  return { size, cell: GRID.cell, occ, centre };
}

export function idx(grid: Grid, cx: number, cy: number): number {
  return cy * grid.size + cx;
}

export function inBounds(grid: Grid, cx: number, cy: number): boolean {
  return cx >= 0 && cy >= 0 && cx < grid.size && cy < grid.size;
}

/** A cell is land if it's in bounds and not off-island. */
export function isLand(grid: Grid, cx: number, cy: number): boolean {
  return inBounds(grid, cx, cy) && grid.occ[idx(grid, cx, cy)] !== CELL_OFFISLAND;
}

/** Free = land and not occupied — buildable / walkable target. */
export function isFree(grid: Grid, cx: number, cy: number): boolean {
  return inBounds(grid, cx, cy) && grid.occ[idx(grid, cx, cy)] === CELL_FREE;
}

export function setOccupied(grid: Grid, cx: number, cy: number, occupied: boolean): void {
  if (!inBounds(grid, cx, cy)) return;
  const i = idx(grid, cx, cy);
  if (grid.occ[i] === CELL_OFFISLAND) return; // never overwrite water
  grid.occ[i] = occupied ? CELL_OCCUPIED : CELL_FREE;
}

/** Cell centre → world (x, z) on the y=0 ground plane. */
export function cellToWorld(grid: Grid, cx: number, cy: number): { x: number; z: number } {
  const half = (grid.size - 1) / 2;
  return { x: (cx - half) * grid.cell, z: (cy - half) * grid.cell };
}

/** World (x, z) → nearest cell (may be out of bounds / off-island). */
export function worldToCell(grid: Grid, x: number, z: number): Cell {
  const half = (grid.size - 1) / 2;
  return { cx: Math.round(x / grid.cell + half), cy: Math.round(z / grid.cell + half) };
}

const _ndc = new THREE.Vector2();
const _ray = new THREE.Raycaster();
const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // ground, y = 0
const _hit = new THREE.Vector3();

/** Raycast a screen point onto the ground plane → world (x, z), or null. */
export function screenToGround(
  camera: THREE.Camera,
  clientX: number,
  clientY: number,
): { x: number; z: number } | null {
  _ndc.x = (clientX / window.innerWidth) * 2 - 1;
  _ndc.y = -(clientY / window.innerHeight) * 2 + 1;
  _ray.setFromCamera(_ndc, camera);
  return _ray.ray.intersectPlane(_plane, _hit) ? { x: _hit.x, z: _hit.z } : null;
}

/** Convenience: screen point → grid cell (or null if it missed the plane). */
export function screenToCell(grid: Grid, camera: THREE.Camera, clientX: number, clientY: number): Cell | null {
  const g = screenToGround(camera, clientX, clientY);
  return g ? worldToCell(grid, g.x, g.z) : null;
}
