// Pooled voxel bolts. Pre-allocated bodies + meshes (zero allocation per shot).
// Cadence + aim live in main.ts now (auto-aim + multishot); this just spawns,
// ages, and despawns. Bolts are sensors that report hits on enemies/walls.

import * as THREE from 'three';
import Matter from 'matter-js';
import * as C from './config';
import { addBody, CAT, removeBody, toTick } from './physics';

const { Bodies, Body, Sleeping } = Matter;

interface Bolt {
  body: Matter.Body;
  mesh: THREE.Mesh;
  alive: boolean;
  ttl: number;
}

export class Projectiles {
  private readonly pool: Bolt[] = [];
  private readonly byBodyId = new Map<number, Bolt>();

  constructor(scene: THREE.Scene) {
    const s = C.WEAPON.projectileRadius * 2;
    const geo = new THREE.BoxGeometry(s, s, s);
    const mat = new THREE.MeshLambertMaterial({ color: C.PALETTE.projectile, flatShading: true });
    for (let i = 0; i < C.WEAPON.poolSize; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.position.y = 0.6;
      scene.add(mesh);
      const body = Bodies.circle(0, 0, C.WEAPON.projectileRadius, {
        label: 'projectile',
        frictionAir: 0,
        isSensor: true,
        collisionFilter: { category: CAT.projectile, mask: CAT.enemy | CAT.wall },
      });
      this.pool.push({ body, mesh, alive: false, ttl: 0 });
    }
  }

  /** Spawn one bolt at (x, y) heading in unit dir (dx, dy). Drops if pool full. */
  spawn(x: number, y: number, dx: number, dy: number): void {
    const bolt = this.pool.find((b) => !b.alive);
    if (!bolt) return;
    bolt.alive = true;
    bolt.ttl = C.WEAPON.projectileLife;
    Body.setPosition(bolt.body, { x, y });
    Body.setVelocity(bolt.body, {
      x: toTick(dx * C.WEAPON.projectileSpeed),
      y: toTick(dy * C.WEAPON.projectileSpeed),
    });
    if (bolt.body.isSleeping) Sleeping.set(bolt.body, false);
    bolt.mesh.visible = true;
    addBody(bolt.body, bolt.mesh);
    this.byBodyId.set(bolt.body.id, bolt);
  }

  tick(dt: number): void {
    for (const b of this.pool) {
      if (!b.alive) continue;
      b.ttl -= dt;
      if (b.ttl <= 0) this.retire(b);
    }
  }

  despawnByBody(bodyId: number): boolean {
    const bolt = this.byBodyId.get(bodyId);
    if (!bolt || !bolt.alive) return false;
    this.retire(bolt);
    return true;
  }

  reset(): void {
    for (const b of this.pool) if (b.alive) this.retire(b);
  }

  private retire(bolt: Bolt): void {
    bolt.alive = false;
    bolt.mesh.visible = false;
    removeBody(bolt.body);
    this.byBodyId.delete(bolt.body.id);
  }
}
