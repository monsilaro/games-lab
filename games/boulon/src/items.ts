// Pickups: two per room (easy + hard). Each carries a stacking run upgrade.
// Floating, spinning sensor cubes — colliding with the player collects them.
// Pooled (a room only ever needs 2, but pooling keeps spawns alloc-free).

import * as THREE from 'three';
import Matter from 'matter-js';
import * as C from './config';
import { addBody, CAT, removeBody } from './physics';
import type { UpgradeKind } from './upgrades';

const { Bodies } = Matter;

interface Item {
  body: Matter.Body;
  mesh: THREE.Mesh;
  alive: boolean;
  kind: UpgradeKind;
  baseY: number; // world Y to bob around
  phase: number;
}

export class Items {
  private readonly pool: Item[] = [];
  private readonly byBodyId = new Map<number, Item>();
  private readonly easyMat: THREE.MeshLambertMaterial;
  private readonly hardMat: THREE.MeshLambertMaterial;
  private t = 0;

  constructor(scene: THREE.Scene) {
    const s = 0.9 * C.ITEM.scale * 2;
    const geo = new THREE.BoxGeometry(s, s, s);
    this.easyMat = new THREE.MeshLambertMaterial({ color: C.PALETTE.itemEasy, flatShading: true });
    this.hardMat = new THREE.MeshLambertMaterial({ color: C.PALETTE.itemHard, flatShading: true });
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(geo, this.easyMat);
      mesh.visible = false;
      scene.add(mesh);
      const body = Bodies.circle(0, 0, C.ITEM.radius, {
        isStatic: true,
        isSensor: true,
        label: 'item',
        collisionFilter: { category: CAT.item, mask: CAT.player },
      });
      this.pool.push({ body, mesh, alive: false, kind: 'FIRE_RATE', baseY: 1, phase: i });
    }
  }

  spawnAt(x: number, y: number, kind: UpgradeKind, hard: boolean): void {
    const it = this.pool.find((p) => !p.alive);
    if (!it) return;
    it.alive = true;
    it.kind = kind;
    it.baseY = 1.1;
    it.phase = Math.random() * 6.28;
    it.mesh.material = hard ? this.hardMat : this.easyMat;
    Matter.Body.setPosition(it.body, { x, y });
    it.mesh.position.set(x, it.baseY, y);
    it.mesh.visible = true;
    addBody(it.body);
    this.byBodyId.set(it.body.id, it);
  }

  /** Collect the item with this body; returns its upgrade kind, or null. */
  collectByBody(bodyId: number): UpgradeKind | null {
    const it = this.byBodyId.get(bodyId);
    if (!it || !it.alive) return null;
    const kind = it.kind;
    this.retire(it);
    return kind;
  }

  tick(dt: number): void {
    this.t += dt;
    for (const it of this.pool) {
      if (!it.alive) continue;
      it.mesh.position.y = it.baseY + Math.sin(this.t * C.ITEM.bobSpeed + it.phase) * C.ITEM.bobAmp;
      it.mesh.rotation.y += dt * C.ITEM.spin;
      it.mesh.rotation.x += dt * C.ITEM.spin * 0.6;
    }
  }

  reset(): void {
    for (const it of this.pool) if (it.alive) this.retire(it);
  }

  private retire(it: Item): void {
    it.alive = false;
    it.mesh.visible = false;
    removeBody(it.body);
    this.byBodyId.delete(it.body.id);
  }
}
