// Structure blocks: pooled meshes (two shared materials) paired with matter
// rectangles, plus the static ground body and its snow-band visual.

import * as THREE from 'three';
import Matter from 'matter-js';
import * as C from './config';
import * as physics from './physics';
import type { BlockDesc } from './levelgen';

const { Bodies } = Matter;

const unitGeo = new THREE.PlaneGeometry(1, 1);
const darkMat = new THREE.MeshBasicMaterial({ color: C.PALETTE.blockDark });
const lightMat = new THREE.MeshBasicMaterial({ color: C.PALETTE.blockLight });

interface Block {
  mesh: THREE.Mesh;
  body: Matter.Body | null;
}

const pool: Block[] = [];
const colorByBodyId = new Map<number, number>();

export function init(scene: THREE.Scene): void {
  for (let i = 0; i < C.BLOCK_POOL; i++) {
    const mesh = new THREE.Mesh(unitGeo, darkMat);
    mesh.visible = false;
    mesh.position.z = 0.1;
    scene.add(mesh);
    pool.push({ mesh, body: null });
  }

  // static ground: solid floor for matter + the off-white snow band visual
  const ground = Bodies.rectangle(C.MIN_VIEW_WIDTH / 2, C.GROUND_Y - 1, C.MIN_VIEW_WIDTH + 12, 2, {
    isStatic: true,
    label: 'ground',
    friction: 0.8,
  });
  physics.addBody(ground);

  const snow = new THREE.Mesh(
    unitGeo,
    new THREE.MeshBasicMaterial({ color: C.PALETTE.snow }),
  );
  snow.scale.set(C.MIN_VIEW_WIDTH + 12, C.SNOW_BAND, 1);
  snow.position.set(C.MIN_VIEW_WIDTH / 2, C.GROUND_Y - C.SNOW_BAND / 2, 0.05);
  scene.add(snow);
}

export function spawnFromDescs(descs: BlockDesc[]): void {
  for (const desc of descs) {
    const slot = pool.find((b) => b.body === null);
    if (!slot) break; // pool exhausted — levelgen stays under BLOCK_POOL by tuning
    const body = Bodies.rectangle(desc.x, desc.y, desc.w, desc.h, {
      label: 'block',
      friction: C.BLOCK_FRICTION,
      restitution: 0,
    });
    slot.body = body;
    slot.mesh.material = desc.tone === 'dark' ? darkMat : lightMat;
    slot.mesh.scale.set(desc.w, desc.h, 1);
    slot.mesh.rotation.z = 0;
    slot.mesh.visible = true;
    colorByBodyId.set(body.id, desc.tone === 'dark' ? C.PALETTE.blockDark : C.PALETTE.blockLight);
    physics.addBody(body, slot.mesh);
  }
}

export function reset(): void {
  for (const block of pool) {
    if (block.body) physics.removeBody(block.body);
    block.body = null;
    block.mesh.visible = false;
  }
  colorByBodyId.clear();
}

/** Burst color for a struck block (falls back to snow for non-blocks). */
export function colorOf(body: Matter.Body): number {
  return colorByBodyId.get(body.id) ?? C.PALETTE.snow;
}
