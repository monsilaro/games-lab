// Scene bootstrap for the tower climber: a tilted 3/4 camera that FOLLOWS the
// scroll along the shaft, the soft light rig (lit voxel exception — Lambert +
// flatShading), a long scrolling floor strip with side rails, and a per-level
// band tint. The shaft runs along matter −y (= world −z), which the tilt
// projects to the top of the screen.

import * as THREE from 'three';
import { createOrthoApp, type OrthoApp } from '@games-lab/shared';
import * as C from './config';

export interface TowerScene {
  app: OrthoApp;
  /** Slide the camera so the look-centre sits at matter y = `frontY` (world z). */
  setFrontY(frontY: number): void;
  /** Tint the floor for the current level (cycles PALETTE.bands). */
  setBand(level: number): void;
  /** Keep the floor strip + rails centred on the camera so they never run out. */
  followFloor(frontY: number): void;
}

export function setupScene(): TowerScene {
  const app = createOrthoApp({ worldHeight: C.CAMERA.fitRadius * 2, clearColor: C.PALETTE.clear });
  const { scene, camera } = app;

  // Fit a fixed horizontal extent on any aspect (portrait → tall view), reusing
  // Boulon's foreshortening factor. Vertical world coverage follows the tilt.
  function fit(): void {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const r = C.CAMERA.fitRadius;
    const halfH = Math.max(r * C.CAMERA.depthFactor, r / aspect);
    const halfW = halfH * aspect;
    camera.left = -halfW;
    camera.right = halfW;
    camera.top = halfH;
    camera.bottom = -halfH;
    camera.near = 0.1;
    camera.far = C.CAMERA.far;
    camera.updateProjectionMatrix();
  }
  app.onResize = fit;
  fit();

  // --- Light rig (rides with the camera so lighting stays consistent) -------
  const sun = new THREE.DirectionalLight(C.LIGHTS.sun.color, C.LIGHTS.sun.intensity);
  sun.position.copy(C.LIGHTS.sun.position);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(C.LIGHTS.ambient.color, C.LIGHTS.ambient.intensity));
  const fill = new THREE.PointLight(
    C.LIGHTS.fill.color, C.LIGHTS.fill.intensity, C.LIGHTS.fill.distance, C.LIGHTS.fill.decay,
  );
  scene.add(fill);

  // --- Floor strip + side rails ---------------------------------------------
  // A strip several screens long that we recentre on the camera each frame, so
  // it reads as an endless shaft without unbounded geometry.
  const STRIP_LEN = C.TOWER.sectionDepth * 2.2;
  const floorMat = new THREE.MeshLambertMaterial({ color: C.PALETTE.floor, flatShading: true });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(C.LANE_HALF * 2, 0.4, STRIP_LEN), floorMat);
  floor.position.y = -0.2;
  scene.add(floor);

  const grid = new THREE.GridHelper(STRIP_LEN, Math.round(STRIP_LEN), C.PALETTE.floorGrid, C.PALETTE.floorGrid);
  // GridHelper is square; squash it to the lane width so lines stay on the shaft.
  grid.scale.x = (C.LANE_HALF * 2) / STRIP_LEN;
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.5;
  grid.position.y = 0.01;
  scene.add(grid);

  const railMat = new THREE.MeshLambertMaterial({ color: C.PALETTE.rail, flatShading: true });
  const railGeo = new THREE.BoxGeometry(C.RAIL_THICKNESS, C.RAIL_HEIGHT, STRIP_LEN);
  const railOff = C.LANE_HALF + C.RAIL_THICKNESS / 2;
  const leftRail = new THREE.Mesh(railGeo, railMat);
  leftRail.position.set(-railOff, C.RAIL_HEIGHT / 2, 0);
  scene.add(leftRail);
  const rightRail = new THREE.Mesh(railGeo, railMat);
  rightRail.position.set(railOff, C.RAIL_HEIGHT / 2, 0);
  scene.add(rightRail);

  function setFrontY(frontY: number): void {
    // matter y → world z. Keep the same rig, just slid along z.
    camera.position.set(C.CAMERA.offset.x, C.CAMERA.offset.y, frontY + C.CAMERA.offset.z);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, frontY);
    camera.updateProjectionMatrix();
    fill.position.set(C.LIGHTS.fill.position.x, C.LIGHTS.fill.position.y, frontY + C.LIGHTS.fill.position.z);
  }

  function followFloor(frontY: number): void {
    floor.position.z = frontY;
    grid.position.z = frontY;
    leftRail.position.z = frontY;
    rightRail.position.z = frontY;
  }

  function setBand(level: number): void {
    floorMat.color.setHex(C.PALETTE.bands[level % C.PALETTE.bands.length] ?? C.PALETTE.floor);
  }

  setFrontY(0);
  followFloor(0);

  return { app, setFrontY, setBand, followFloor };
}
