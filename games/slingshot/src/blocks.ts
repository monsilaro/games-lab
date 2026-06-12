// Structure blocks: pooled meshes (two shared materials) paired with matter
// rectangles, plus the static ground body and its snow-band visual.

import * as THREE from 'three';
import Matter from 'matter-js';
import * as C from './config';
import * as physics from './physics';
import type { BlockDesc } from './levelgen';

const { Bodies } = Matter;

const unitGeo = new THREE.PlaneGeometry(1, 1);
// One shared material per appearance. Wood keeps the dark/light tone contrast;
// the other materials each have one color (ice is translucent).
const woodDarkMat = new THREE.MeshBasicMaterial({ color: C.PALETTE.blockDark });
const woodLightMat = new THREE.MeshBasicMaterial({ color: C.PALETTE.blockLight });
const iceMat = new THREE.MeshBasicMaterial({
  color: C.PALETTE.ice,
  transparent: true,
  opacity: C.MATERIALS.ice.opacity,
});
const stoneMat = new THREE.MeshBasicMaterial({ color: C.PALETTE.stone });
const tntMat = new THREE.MeshBasicMaterial({ color: C.PALETTE.tnt });

interface Block {
  mesh: THREE.Mesh;
  body: Matter.Body | null;
  color: number;
  material: C.BlockMaterial;
}

const pool: Block[] = [];
const byBodyId = new Map<number, Block>();

export function init(scene: THREE.Scene): void {
  for (let i = 0; i < C.BLOCK_POOL; i++) {
    const mesh = new THREE.Mesh(unitGeo, woodDarkMat);
    mesh.visible = false;
    mesh.position.z = 0.1;
    scene.add(mesh);
    pool.push({ mesh, body: null, color: C.PALETTE.blockDark, material: 'wood' });
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
    const def = C.MATERIALS[desc.material];
    const body = Bodies.rectangle(desc.x, desc.y, desc.w, desc.h, {
      label: 'block',
      friction: C.BLOCK_FRICTION,
      restitution: def.restitution,
      density: def.density,
    });
    let mat: THREE.MeshBasicMaterial;
    let color: number;
    if (desc.material === 'wood') {
      const dark = desc.tone === 'dark';
      mat = dark ? woodDarkMat : woodLightMat;
      color = dark ? C.PALETTE.blockDark : C.PALETTE.blockLight;
    } else if (desc.material === 'ice') {
      mat = iceMat;
      color = C.PALETTE.ice;
    } else if (desc.material === 'stone') {
      mat = stoneMat;
      color = C.PALETTE.stone;
    } else {
      mat = tntMat;
      color = C.PALETTE.tnt;
    }
    slot.body = body;
    slot.material = desc.material;
    slot.color = color;
    slot.mesh.material = mat;
    slot.mesh.scale.set(desc.w, desc.h, 1);
    slot.mesh.rotation.z = 0;
    slot.mesh.visible = true;
    byBodyId.set(body.id, slot);
    physics.addBody(body, slot.mesh);
  }
}

export function reset(): void {
  for (const block of pool) {
    if (block.body) physics.removeBody(block.body);
    block.body = null;
    block.mesh.visible = false;
  }
  byBodyId.clear();
}

/** Shatter a block: remove its body and hide its mesh (no-op for non-blocks). */
export function breakBlock(body: Matter.Body): void {
  const block = byBodyId.get(body.id);
  if (!block || !block.body) return;
  physics.removeBody(block.body);
  byBodyId.delete(body.id);
  block.body = null;
  block.mesh.visible = false;
}

/** Burst color for a struck block (falls back to snow for non-blocks). */
export function colorOf(body: Matter.Body): number {
  return byBodyId.get(body.id)?.color ?? C.PALETTE.snow;
}

/** The block's material, or null if the body isn't a live block. */
export function materialOf(body: Matter.Body): C.BlockMaterial | null {
  return byBodyId.get(body.id)?.material ?? null;
}

/** Speed (units/s) above which this block shatters; ∞ for non-blocks. */
export function breakImpactOf(body: Matter.Body): number {
  const block = byBodyId.get(body.id);
  return block ? C.MATERIALS[block.material].breakImpact : Infinity;
}
