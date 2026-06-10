// Code gets promoted here ONLY once it is duplicated in 2+ games.
// Currently shared by flappy + arena: renderer/ortho-camera bootstrap and the
// delta-time game loop.

import * as THREE from 'three';

export interface OrthoApp {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  /** World units visible horizontally — updated on every resize. */
  worldWidth: number;
  /** Optional hook invoked after the renderer/camera have been resized. */
  onResize?: () => void;
}

export interface OrthoAppOptions {
  /** World units visible vertically (the camera's fixed dimension). */
  worldHeight: number;
  clearColor: THREE.ColorRepresentation;
}

/**
 * Bootstraps what every prototype needs: fullscreen WebGL canvas appended to
 * <body>, orthographic camera sized from `worldHeight`, devicePixelRatio
 * capped at 2, resize + orientationchange handling, and blocking of the
 * scroll/double-tap-zoom gestures iOS Safari might still attempt.
 */
export function createOrthoApp(options: OrthoAppOptions): OrthoApp {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setClearColor(options.clearColor);
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 30);
  camera.position.z = 5;

  const app: OrthoApp = { renderer, scene, camera, worldWidth: options.worldHeight };

  function resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    app.worldWidth = options.worldHeight * (w / h);
    camera.left = -app.worldWidth / 2;
    camera.right = app.worldWidth / 2;
    camera.top = options.worldHeight / 2;
    camera.bottom = -options.worldHeight / 2;
    camera.updateProjectionMatrix();
    app.onResize?.();
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  resize();

  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  return app;
}

/**
 * requestAnimationFrame loop with delta time in seconds, clamped to `maxDt`
 * so background tabs / hiccups don't produce huge simulation steps.
 */
export function startGameLoop(update: (dt: number) => void, maxDt = 0.05): void {
  let lastTime = performance.now();
  function frame(now: number): void {
    const dt = Math.min((now - lastTime) / 1000, maxDt);
    lastTime = now;
    update(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
