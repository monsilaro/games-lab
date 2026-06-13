import * as THREE from 'three';
import type { OrthoApp } from '@games-lab/shared';
import { SCENE, LIGHTS, type Framing } from './config';

export interface SceneRig {
  moon: THREE.DirectionalLight;
  ambient: THREE.AmbientLight;
  lantern: THREE.PointLight;
}

/**
 * The real Veillée look: tilt the shared ortho camera to a ~30° diorama angle and
 * install the light rig (cold moon + faint blue fill + warm lantern). Both the forge
 * (Phase 1, default `SCENE` framing) and the battle board (Phase 2, `BOARD_VIEW`) call
 * this so they share one identity — pass the framing you want.
 *
 * Safe to call after `createOrthoApp`: its resize handler only rewrites the camera's
 * frustum bounds, never its position/rotation/far — so the tilt persists across resizes.
 */
export function setupScene(app: OrthoApp, framing: Framing = SCENE): SceneRig {
  const { scene, camera } = app;

  camera.up.set(0, 1, 0);
  camera.position.copy(framing.cameraPos);
  camera.lookAt(framing.cameraLookAt);
  camera.far = framing.cameraFar;
  camera.updateProjectionMatrix();

  const moon = new THREE.DirectionalLight(LIGHTS.moon.color, LIGHTS.moon.intensity);
  moon.position.copy(LIGHTS.moon.position);
  scene.add(moon);

  const ambient = new THREE.AmbientLight(LIGHTS.ambient.color, LIGHTS.ambient.intensity);
  scene.add(ambient);

  const lantern = new THREE.PointLight(
    LIGHTS.lantern.color,
    LIGHTS.lantern.intensity,
    LIGHTS.lantern.distance,
    LIGHTS.lantern.decay,
  );
  lantern.position.copy(LIGHTS.lantern.position);
  scene.add(lantern);

  return { moon, ambient, lantern };
}
