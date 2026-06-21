// Tilted-ortho diorama camera with pan + pinch-zoom. This module is pure math /
// state — it owns a ground-plane look target and a zoom factor and derives the
// THREE camera from them. main.ts owns the raw pointer events and routes gestures
// here (so build-mode taps and camera drags don't fight over the same pointer).
import * as THREE from 'three';
import type { OrthoApp } from '@games-lab/shared';
import { CAMERA, GRID } from './config';
import { screenToGround } from './grid';

export interface CameraController {
  /** Recompute frustum (zoom×aspect) and reposition the camera from the look target. */
  apply(): void;
  /** Shift the look target across the ground plane (clamped to the island). */
  panByGround(dx: number, dz: number): void;
  /** Set absolute zoom (clamped); 1 = base, <1 zoomed in, >1 zoomed out. */
  setZoom(z: number): void;
  zoom(): number;
  /** Ground point currently under a screen pixel, or null (missed the plane). */
  groundAt(clientX: number, clientY: number): { x: number; z: number } | null;
}

export function createCameraController(app: OrthoApp): CameraController {
  const cam = app.camera;
  let lookX = 0;
  let lookZ = 0;
  let zoom = 1;

  const islandWorldR = GRID.islandRadius * GRID.cell;
  const clampMax = islandWorldR + CAMERA.panClampMargin;

  function apply(): void {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    // Fit `fitRadius` in BOTH axes: width needs halfW ≥ r → halfH ≥ r/aspect;
    // depth (z) is foreshortened so it needs only halfH ≥ r·depthFactor. Take
    // the larger so the island is framed in portrait (width-bound) and landscape
    // (depth-bound) alike. zoom scales the whole thing.
    const r = CAMERA.fitRadius;
    const halfH = Math.max(r * CAMERA.depthFactor, r / aspect) * zoom;
    const halfW = halfH * aspect;
    cam.left = -halfW;
    cam.right = halfW;
    cam.top = halfH;
    cam.bottom = -halfH;
    cam.position.set(lookX + CAMERA.offset.x, CAMERA.offset.y, lookZ + CAMERA.offset.z);
    cam.lookAt(lookX, 0, lookZ);
    cam.updateProjectionMatrix();
  }

  function panByGround(dx: number, dz: number): void {
    lookX = THREE.MathUtils.clamp(lookX + dx, -clampMax, clampMax);
    lookZ = THREE.MathUtils.clamp(lookZ + dz, -clampMax, clampMax);
    apply();
  }

  function setZoom(z: number): void {
    zoom = THREE.MathUtils.clamp(z, CAMERA.minZoom, CAMERA.maxZoom);
    apply();
  }

  function groundAt(clientX: number, clientY: number): { x: number; z: number } | null {
    return screenToGround(cam, clientX, clientY);
  }

  // Re-apply on every resize (shared resize handles renderer size/DPR, then calls this).
  app.onResize = apply;
  apply();

  return { apply, panByGround, setZoom, zoom: () => zoom, groundAt };
}
