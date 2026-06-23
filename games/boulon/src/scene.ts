// Scene bootstrap for the room climber: a tilted 3/4 camera that frames the
// current room (pans on room change), the lit voxel rig, a scrolling floor
// strip, and the two SOLID side walls that bound play in x. Per-room geometry
// (pillars, gate) lives in rooms.ts; the rising floor in crusher.ts.

import * as THREE from 'three';
import Matter from 'matter-js';
import { createOrthoApp, type OrthoApp } from '@games-lab/shared';
import * as C from './config';
import { addBody, CAT } from './physics';

const { Bodies, Body } = Matter;

export interface TowerScene {
  app: OrthoApp;
  /** Point the camera at matter y = `centerY` (world z); pans toward it. */
  panCameraTo(centerY: number, dt: number): void;
  /** Snap the camera to a room centre instantly (new game / first room). */
  snapCamera(centerY: number): void;
  /** Recentre the endless floor strip + side walls on the view. */
  followStrip(centerY: number): void;
}

export function setupScene(): TowerScene {
  const app = createOrthoApp({ worldHeight: C.ROOM.fitHalf * 2, clearColor: C.PALETTE.clear });
  const { scene, camera } = app;
  let camZ = 0;

  // Fit so BOTH the lane width (±LANE_HALF) and a room's height are visible on
  // any aspect: pick the vertical half-extent to satisfy whichever binds.
  function fit(): void {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const halfH = Math.max(C.ROOM.fitHalf, (C.LANE_HALF + C.ROOM.marginX) / aspect);
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

  // --- Light rig ------------------------------------------------------------
  const sun = new THREE.DirectionalLight(C.LIGHTS.sun.color, C.LIGHTS.sun.intensity);
  sun.position.copy(C.LIGHTS.sun.position);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(C.LIGHTS.ambient.color, C.LIGHTS.ambient.intensity));
  const fill = new THREE.PointLight(
    C.LIGHTS.fill.color, C.LIGHTS.fill.intensity, C.LIGHTS.fill.distance, C.LIGHTS.fill.decay,
  );
  scene.add(fill);

  // --- Endless floor strip + grid ------------------------------------------
  const STRIP = C.ROOM.height * 2.5;
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(C.LANE_HALF * 2, 0.4, STRIP),
    new THREE.MeshLambertMaterial({ color: C.PALETTE.floor, flatShading: true }),
  );
  floor.position.y = -0.2;
  scene.add(floor);
  const grid = new THREE.GridHelper(STRIP, Math.round(STRIP), C.PALETTE.floorGrid, C.PALETTE.floorGrid);
  grid.scale.x = (C.LANE_HALF * 2) / STRIP;
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.5;
  grid.position.y = 0.01;
  scene.add(grid);

  // --- Solid side walls (bodies + meshes), recentred on the view -----------
  const wallMat = new THREE.MeshLambertMaterial({ color: C.PALETTE.rail, flatShading: true });
  const wallGeo = new THREE.BoxGeometry(C.WALL_THICKNESS, C.WALL_HEIGHT, STRIP);
  const wallOff = C.LANE_HALF + C.WALL_THICKNESS / 2;
  const walls: Array<{ body: Matter.Body; mesh: THREE.Mesh }> = [];
  for (const sign of [-1, 1]) {
    const mesh = new THREE.Mesh(wallGeo, wallMat);
    mesh.position.set(sign * wallOff, C.WALL_HEIGHT / 2, 0);
    scene.add(mesh);
    const body = Bodies.rectangle(sign * wallOff, 0, C.WALL_THICKNESS, STRIP, {
      isStatic: true,
      label: 'wall',
      collisionFilter: { category: CAT.wall, mask: CAT.player | CAT.projectile },
    });
    addBody(body); // static: recentred manually in followStrip
    walls.push({ body, mesh });
  }

  function applyCamera(): void {
    camera.position.set(C.CAMERA.offset.x, C.CAMERA.offset.y, camZ + C.CAMERA.offset.z);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, camZ);
    camera.updateProjectionMatrix();
    fill.position.set(C.LIGHTS.fill.position.x, C.LIGHTS.fill.position.y, camZ + C.LIGHTS.fill.position.z);
  }

  function panCameraTo(centerY: number, dt: number): void {
    const k = 1 - Math.exp(-C.CAMERA.panLerp * dt);
    camZ += (centerY - camZ) * k;
    applyCamera();
  }
  function snapCamera(centerY: number): void {
    camZ = centerY;
    applyCamera();
  }
  function followStrip(centerY: number): void {
    floor.position.z = centerY;
    grid.position.z = centerY;
    for (const w of walls) {
      w.mesh.position.z = centerY;
      Body.setPosition(w.body, { x: w.body.position.x, y: centerY });
    }
  }

  snapCamera(0);
  followStrip(0);
  return { app, panCameraTo, snapCamera, followStrip };
}
