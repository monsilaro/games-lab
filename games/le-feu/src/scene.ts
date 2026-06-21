// Scene bootstrap: the lit "Nuit de veillée" rig (mirrors Veillée) + the static
// world geometry (round island disc, surrounding sea). The light intensities and
// colours here are the *current* values — time.ts lerps them between day and
// night targets every frame. The central fire's PointLight lives in the rig so
// the clock can pulse it; its visual logs/flames are built in fire.ts.
import * as THREE from 'three';
import type { OrthoApp } from '@games-lab/shared';
import { LIGHTS, CAMERA, PALETTE, GRID } from './config';

export interface SceneRig {
  moon: THREE.DirectionalLight;
  ambient: THREE.AmbientLight;
  fireLight: THREE.PointLight;
}

export function setupScene(app: OrthoApp): SceneRig {
  const { scene, camera } = app;

  camera.up.set(0, 1, 0);
  camera.far = CAMERA.far;
  camera.updateProjectionMatrix();
  // Actual position/zoom is driven by the camera controller (camera.ts).

  // --- Lights (start at day values; clock overrides on tick) ---------------
  const moon = new THREE.DirectionalLight(LIGHTS.moon.color, LIGHTS.moon.dayIntensity);
  moon.position.copy(LIGHTS.moon.position);
  scene.add(moon);

  const ambient = new THREE.AmbientLight(LIGHTS.ambient.dayColor, LIGHTS.ambient.dayIntensity);
  scene.add(ambient);

  const fireLight = new THREE.PointLight(
    LIGHTS.fire.color,
    LIGHTS.fire.dayIntensity,
    LIGHTS.fire.distance,
    LIGHTS.fire.decay,
  );
  fireLight.position.set(0, LIGHTS.fire.height, 0);
  scene.add(fireLight);

  // --- World geometry ------------------------------------------------------
  const islandR = (GRID.islandRadius + 0.5) * GRID.cell;

  // Sea: a large faceted disc under the island, sitting just below ground top.
  const sea = new THREE.Mesh(
    new THREE.CircleGeometry(islandR * 4.5, 48),
    new THREE.MeshLambertMaterial({ color: PALETTE.water, flatShading: true }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -0.6;
  scene.add(sea);

  // Island: low faceted cylinder, top face at y = 0 (the build plane).
  const islandH = 1.4;
  const island = new THREE.Group();
  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(islandR, islandR * 0.9, islandH, 22),
    new THREE.MeshLambertMaterial({ color: PALETTE.ground, flatShading: true }),
  );
  top.position.y = -islandH / 2;
  island.add(top);
  // Darker rim ring for a bit of cliff depth.
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(islandR * 0.9, islandR * 0.78, islandH * 1.3, 22),
    new THREE.MeshLambertMaterial({ color: PALETTE.groundEdge, flatShading: true }),
  );
  rim.position.y = -islandH;
  island.add(rim);
  scene.add(island);

  return { moon, ambient, fireLight };
}
