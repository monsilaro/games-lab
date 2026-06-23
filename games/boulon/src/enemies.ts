// Descending voxel-robot enemies. Pooled + recycled (zero alloc per spawn).
// They spawn just above the play window and drift down (+y, toward the player /
// camera) at a level-scaled speed. Sensors: they detect contact (player, bolts)
// without physically shoving anything. Killed → main spawns a debris burst.

import * as THREE from 'three';
import Matter from 'matter-js';
import * as C from './config';
import { addBody, CAT, removeBody, toTick } from './physics';
import { buildRobot } from './robotFactory';

const { Bodies, Body, Sleeping } = Matter;

interface Enemy {
  body: Matter.Body;
  mesh: THREE.Group;
  alive: boolean;
  hp: number;
}

export interface EnemyHit {
  killed: boolean;
  x: number;
  y: number;
}

export class Enemies {
  private readonly pool: Enemy[] = [];
  private readonly byBodyId = new Map<number, Enemy>();

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < C.ENEMY.poolSize; i++) {
      const built = buildRobot({
        body: C.PALETTE.enemy,
        bodyDark: C.PALETTE.enemyDark,
        accent: C.PALETTE.heroAccent,
        eye: C.PALETTE.eye,
        scale: C.ENEMY.scale,
      });
      built.group.visible = false;
      scene.add(built.group);
      const body = Bodies.circle(0, 0, C.ENEMY.radius, {
        label: 'enemy',
        frictionAir: 0,
        inertia: Infinity, // never spin from a graze
        sleepThreshold: Infinity, // velocity-driven — must never sleep
        // Non-sensor so collisionStart fires reliably (matches the original
        // projectile→target pattern). Any physical shove is erased next frame:
        // the player is re-positioned and enemy velocity is reset every tick.
        collisionFilter: { category: CAT.enemy, mask: CAT.player | CAT.projectile },
      });
      this.pool.push({ body, mesh: built.group, alive: false, hp: 0 });
    }
  }

  get aliveCount(): number {
    let n = 0;
    for (const e of this.pool) if (e.alive) n += 1;
    return n;
  }

  private speed(level: number): number {
    return Math.min(C.ENEMY.maxSpeed, C.ENEMY.baseSpeed + level * C.ENEMY.perLevelSpeed);
  }

  /** Spawn one enemy above the window, descending at the level's speed. */
  spawn(frontY: number, level: number): void {
    const e = this.pool.find((x) => !x.alive);
    if (!e) return; // pool exhausted — skip rather than allocate
    const x = (Math.random() * 2 - 1) * (C.LANE_HALF - C.ENEMY.radius);
    const y = frontY - (C.WINDOW.up + C.ENEMY.spawnAhead);
    e.alive = true;
    e.hp = C.ENEMY.hp;
    Body.setPosition(e.body, { x, y });
    Body.setVelocity(e.body, { x: 0, y: toTick(this.speed(level)) }); // +y = downward
    if (e.body.isSleeping) Sleeping.set(e.body, false);
    e.mesh.visible = true;
    addBody(e.body, e.mesh); // synced each frame by physics.syncMeshes
    this.byBodyId.set(e.body.id, e);
  }

  /** Keep the descent speed current and cull anything below the window. */
  update(frontY: number, level: number): void {
    const v = toTick(this.speed(level));
    const cull = frontY + C.WINDOW.down + C.ENEMY.cullBelow;
    for (const e of this.pool) {
      if (!e.alive) continue;
      if (e.body.velocity.y !== v) Body.setVelocity(e.body, { x: 0, y: v });
      if (e.body.position.y > cull) this.retire(e);
    }
  }

  /** Damage the enemy with this body. Returns the outcome, or null if not ours. */
  hitByBody(bodyId: number, dmg: number): EnemyHit | null {
    const e = this.byBodyId.get(bodyId);
    if (!e || !e.alive) return null;
    e.hp -= dmg;
    const pos = { x: e.body.position.x, y: e.body.position.y };
    if (e.hp > 0) return { killed: false, x: pos.x, y: pos.y };
    this.retire(e);
    return { killed: true, x: pos.x, y: pos.y };
  }

  /** Remove the enemy with this body (e.g. it rammed the player). */
  despawnByBody(bodyId: number): { x: number; y: number } | null {
    const e = this.byBodyId.get(bodyId);
    if (!e || !e.alive) return null;
    const pos = { x: e.body.position.x, y: e.body.position.y };
    this.retire(e);
    return pos;
  }

  reset(): void {
    for (const e of this.pool) if (e.alive) this.retire(e);
  }

  private retire(e: Enemy): void {
    e.alive = false;
    e.mesh.visible = false;
    removeBody(e.body);
    this.byBodyId.delete(e.body.id);
  }
}
