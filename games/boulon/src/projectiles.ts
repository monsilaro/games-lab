// Pooled voxel bolts. Pre-allocated bodies + meshes (zero allocation per shot,
// per the spec). Fire respects the weapon cadence; bolts despawn on lifetime,
// or when main.ts reports a hit, and return to the pool.

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
  private cooldown = 0;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(
      C.WEAPON.projectileRadius * 2, C.WEAPON.projectileRadius * 2, C.WEAPON.projectileRadius * 2,
    );
    const mat = new THREE.MeshLambertMaterial({ color: C.PALETTE.projectile, flatShading: true });
    for (let i = 0; i < C.WEAPON.poolSize; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.position.y = 0.6; // float a little above the floor
      scene.add(mesh);
      const body = Bodies.circle(0, 0, C.WEAPON.projectileRadius, {
        label: 'projectile',
        frictionAir: 0,
        isSensor: true, // detect hits without bouncing; despawn on contact
        collisionFilter: { category: CAT.projectile, mask: CAT.enemy },
      });
      const bolt: Bolt = { body, mesh, alive: false, ttl: 0 };
      this.pool.push(bolt);
    }
  }

  /** Count down the cadence timer; call once per frame. */
  tick(dt: number): void {
    if (this.cooldown > 0) this.cooldown -= dt;
    for (const b of this.pool) {
      if (!b.alive) continue;
      b.ttl -= dt;
      if (b.ttl <= 0) this.retire(b);
    }
  }

  /** Fire from the muzzle if the cadence allows. No-op while on cooldown. */
  fire(x: number, y: number, dirX: number, dirY: number): void {
    if (this.cooldown > 0) return;
    const bolt = this.pool.find((b) => !b.alive);
    if (!bolt) return; // pool exhausted — drop the shot rather than allocate
    this.cooldown = C.WEAPON.fireInterval;
    bolt.alive = true;
    bolt.ttl = C.WEAPON.projectileLife;
    Body.setPosition(bolt.body, { x, y });
    Body.setVelocity(bolt.body, {
      x: toTick(dirX * C.WEAPON.projectileSpeed),
      y: toTick(dirY * C.WEAPON.projectileSpeed),
    });
    if (bolt.body.isSleeping) Sleeping.set(bolt.body, false);
    bolt.mesh.visible = true;
    addBody(bolt.body, bolt.mesh);
    this.byBodyId.set(bolt.body.id, bolt);
  }

  /** Despawn the bolt with this matter body, if it's one of ours. */
  despawnByBody(bodyId: number): boolean {
    const bolt = this.byBodyId.get(bodyId);
    if (!bolt || !bolt.alive) return false;
    this.retire(bolt);
    return true;
  }

  private retire(bolt: Bolt): void {
    bolt.alive = false;
    bolt.mesh.visible = false;
    removeBody(bolt.body);
    this.byBodyId.delete(bolt.body.id);
  }
}
