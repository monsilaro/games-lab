// Scene bootstrap: the fixed tilted 3/4 camera that frames the whole arena,
// the soft light rig (lit voxel exception — Lambert + flatShading), the floor,
// and the four static walls that bound play (matter bodies + cube meshes).

import * as THREE from 'three';
import Matter from 'matter-js';
import { createOrthoApp, type OrthoApp } from '@games-lab/shared';
import * as C from './config';
import { addBody, CAT } from './physics';

const { Bodies } = Matter;

export function setupScene(): OrthoApp {
  const app = createOrthoApp({ worldHeight: C.CAMERA.fitRadius * 2, clearColor: C.PALETTE.clear });
  const { scene, camera } = app;

  // Fit the whole arena on any aspect by sizing the ortho frustum ourselves
  // (le-feu's pattern). Floor depth is foreshortened by ~sin(tilt), so the
  // vertical half-extent only needs fitRadius × depthFactor.
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
    camera.position.copy(C.CAMERA.offset);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }
  app.onResize = fit;
  fit();

  // --- Light rig --------------------------------------------------------
  const sun = new THREE.DirectionalLight(C.LIGHTS.sun.color, C.LIGHTS.sun.intensity);
  sun.position.copy(C.LIGHTS.sun.position);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(C.LIGHTS.ambient.color, C.LIGHTS.ambient.intensity));
  const fill = new THREE.PointLight(
    C.LIGHTS.fill.color, C.LIGHTS.fill.intensity, C.LIGHTS.fill.distance, C.LIGHTS.fill.decay,
  );
  fill.position.copy(C.LIGHTS.fill.position);
  scene.add(fill);

  // --- Floor + grid -----------------------------------------------------
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(C.ARENA_HALF * 2, 0.4, C.ARENA_HALF * 2),
    new THREE.MeshLambertMaterial({ color: C.PALETTE.floor, flatShading: true }),
  );
  floor.position.y = -0.2;
  scene.add(floor);

  const grid = new THREE.GridHelper(C.ARENA_HALF * 2, C.ARENA_HALF * 2, C.PALETTE.floorGrid, C.PALETTE.floorGrid);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.5;
  grid.position.y = 0.01;
  scene.add(grid);

  // --- Walls (static bodies + cube meshes) ------------------------------
  const t = C.WALL_THICKNESS;
  const span = C.ARENA_HALF * 2 + t * 2; // overlap corners
  const off = C.ARENA_HALF + t / 2; // wall centreline just outside play
  const wallMat = new THREE.MeshLambertMaterial({ color: C.PALETTE.wall, flatShading: true });

  // sides: [matter x, matter y, matter w, matter h, mesh X-size, mesh Z-size]
  const sides: Array<[number, number, number, number, number, number]> = [
    [0, -off, span, t, span, t], // near (toward camera)
    [0, off, span, t, span, t], // far
    [-off, 0, t, span, t, span], // left
    [off, 0, t, span, t, span], // right
  ];
  for (const [mx, my, mw, mh, sx, sz] of sides) {
    const body = Bodies.rectangle(mx, my, mw, mh, {
      isStatic: true,
      label: 'wall',
      collisionFilter: { category: CAT.wall },
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, C.WALL_HEIGHT, sz), wallMat);
    mesh.position.set(mx, C.WALL_HEIGHT / 2, my);
    scene.add(mesh);
    addBody(body); // static: no per-frame sync needed
  }

  return app;
}
