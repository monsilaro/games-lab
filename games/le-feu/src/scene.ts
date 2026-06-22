// Scene bootstrap: the lit "Nuit de veillée" rig (mirrors Veillée) + the static
// world geometry (round island disc, surrounding sea, snowy rim band, night
// aurora). The light intensities and colours here are the *current* values —
// time.ts lerps them between day and night targets every frame. The central
// fire's PointLight lives in the rig so the clock can pulse it; its visual logs
// /flames/embers are built in fire.ts.
import * as THREE from 'three';
import type { OrthoApp } from '@games-lab/shared';
import { LIGHTS, CAMERA, PALETTE, GRID, DECOR, AURORA_FX } from './config';
import { cellToWorld, isFree, setOccupied, type Grid } from './grid';

export interface SceneRig {
  moon: THREE.DirectionalLight;
  ambient: THREE.AmbientLight;
  fireLight: THREE.PointLight;
  /** Night aurora ribbon — its opacity is ramped by the clock (time.ts). */
  aurora: THREE.Mesh;
}

function lambert(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, flatShading: true });
}

// --- Night aurora curtain --------------------------------------------------
// A gently arced ribbon in the sky behind the island, vertex-coloured
// aurora→violet with a soft vertical fade. A glowing *sky backdrop* (additive,
// unlit) — NOT diorama geometry, so it's the documented exception to the "keep
// the lit faceted look" rule (same class as a gradient sky, and like the fire's
// additive glow disc). Unlit vertex colours are what let the gradient and the
// vertical fade actually read. Opacity is ramped by (1 - daylight) in time.ts.
function buildAurora(): THREE.Mesh {
  const { width, height, segments, ySegments, arc, y, z } = AURORA_FX;
  const geo = new THREE.PlaneGeometry(width, height, segments, ySegments);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const cA = new THREE.Color(PALETTE.aurora);
  const cB = new THREE.Color(PALETTE.violet);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const vy = pos.getY(i);
    const tx = x / width + 0.5; // 0..1 left→right (aurora→violet gradient)
    const ty = vy / height + 0.5; // 0..1 bottom→top
    // Bow the ends toward the camera (out of the plane) for a curtain feel.
    pos.setZ(i, arc * (2 * tx - 1) * (2 * tx - 1));
    // Soft vertical falloff (bright middle, fading edges). Additive blending →
    // dimmer colour reads as transparency, so this gives feathered top/bottom.
    const fade = Math.sin(Math.PI * ty);
    c.copy(cA).lerp(cB, tx).multiplyScalar(fade);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, y, z);
  mesh.renderOrder = -1; // draw behind everything
  return mesh;
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
  // Bright snow band hugging the island edge — the cold rim that makes the
  // diorama "pop" against the ground (canonical Veillée read).
  const snowBand = new THREE.Mesh(
    new THREE.RingGeometry(islandR * 0.74, islandR, 36),
    new THREE.MeshLambertMaterial({ color: PALETTE.snow, flatShading: true }),
  );
  snowBand.rotation.x = -Math.PI / 2;
  snowBand.position.y = 0.02;
  island.add(snowBand);
  scene.add(island);

  // Night aurora behind the island.
  const aurora = buildAurora();
  scene.add(aurora);

  return { moon, ambient, fireLight, aurora };
}

// --- Scattered island decor ------------------------------------------------
function buildTree(): THREE.Group {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.6, 5), lambert(PALETTE.woodDark));
  trunk.position.y = 0.3;
  g.add(trunk);
  const lower = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.0, 6), lambert(PALETTE.foliage));
  lower.position.y = 0.95;
  g.add(lower);
  const upper = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.8, 6), lambert(PALETTE.foliage));
  upper.position.y = 1.5;
  g.add(upper);
  // A dusting of snow on the tip so it reads "winter".
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.3, 6), lambert(PALETTE.snow));
  cap.position.y = 1.95;
  g.add(cap);
  return g;
}

function buildDrift(): THREE.Group {
  const g = new THREE.Group();
  const d = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), lambert(PALETTE.snowDim));
  d.position.y = 0.12;
  d.scale.set(1.3, 0.4, 1.0);
  d.rotation.y = Math.random() * Math.PI;
  g.add(d);
  return g;
}

function buildRock(): THREE.Group {
  const g = new THREE.Group();
  const r = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 0), lambert(PALETTE.stone));
  r.position.y = 0.26;
  r.scale.set(1.0, 0.7, 1.0);
  r.rotation.y = Math.random() * Math.PI;
  g.add(r);
  // Snow on top.
  const snow = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), lambert(PALETTE.snow));
  snow.position.y = 0.5;
  snow.scale.set(1.0, 0.45, 1.0);
  g.add(snow);
  return g;
}

type DecorKind = 'tree' | 'drift' | 'rock';
function pickKind(): DecorKind {
  const w = DECOR.weights;
  const total = w.tree + w.drift + w.rock;
  let r = Math.random() * total;
  if ((r -= w.tree) < 0) return 'tree';
  if ((r -= w.drift) < 0) return 'drift';
  return 'rock';
}

/**
 * Dress the island rim with static low-poly props. Runs once at boot; each prop
 * claims its grid cell so buildings and villager AI never collide with it.
 */
export function scatterDecor(scene: THREE.Scene, grid: Grid): void {
  const group = new THREE.Group();
  let placed = 0;
  let guard = 0;
  while (placed < DECOR.count && guard < DECOR.count * 12) {
    guard++;
    const ang = Math.random() * Math.PI * 2;
    const rad = DECOR.ringMin + Math.random() * (DECOR.ringMax - DECOR.ringMin);
    const cx = grid.centre + Math.round(Math.cos(ang) * rad);
    const cy = grid.centre + Math.round(Math.sin(ang) * rad);
    if (!isFree(grid, cx, cy)) continue;
    setOccupied(grid, cx, cy, true);
    const kind = pickKind();
    const prop = kind === 'tree' ? buildTree() : kind === 'drift' ? buildDrift() : buildRock();
    const w = cellToWorld(grid, cx, cy);
    prop.position.set(w.x, 0, w.z);
    prop.rotation.y = Math.random() * Math.PI * 2;
    group.add(prop);
    placed++;
  }
  scene.add(group);
}
