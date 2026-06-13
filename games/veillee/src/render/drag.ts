import * as THREE from 'three';
import type { OrthoApp } from '@games-lab/shared';
import type { Board } from './board';

// Geometry helper for touch placement: project a screen point onto the board's
// y=0 plane. The run loop owns the pointer events + pick/drop policy.

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const hit = new THREE.Vector3();

export function pointerToBoard(
  app: OrthoApp,
  clientX: number,
  clientY: number,
  board: Board,
): { x: number; z: number } | null {
  ndc.x = (clientX / window.innerWidth) * 2 - 1;
  ndc.y = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(ndc, app.camera);
  return raycaster.ray.intersectPlane(board.plane, hit) ? { x: hit.x, z: hit.z } : null;
}
