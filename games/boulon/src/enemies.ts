// Static voxel-robot enemies. Solid obstacles you must destroy to clear a room;
// touching one costs the player HP (handled in main via i-frames). Pooled +
// recycled. main asks `nearestAlive` for the auto-aim target.

import * as THREE from 'three';
import Matter from 'matter-js';
import * as C from './config';
import { addBody, CAT, removeBody } from './physics';
import { buildRobot } from './robotFactory';

const { Bodies } = Matter;

interface Enemy {
  body: Matter.Body;
  mesh: THREE.Group;
  alive: boolean;
  hp: number;
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
        isStatic: true,
        label: 'enemy',
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

  /** Place one static enemy at matter (x, y). */
  spawnAt(x: number, y: number): void {
    const e = this.pool.find((x2) => !x2.alive);
    if (!e) return;
    e.alive = true;
    e.hp = C.ENEMY.hp;
    Matter.Body.setPosition(e.body, { x, y });
    e.mesh.position.set(x, 0, y);
    e.mesh.rotation.y = 0; // faces +z = toward the player / camera
    e.mesh.visible = true;
    addBody(e.body); // static: positioned once, no per-frame sync
    this.byBodyId.set(e.body.id, e);
  }

  /** Nearest living enemy to (px, py) within range — the auto-aim target. */
  nearestAlive(px: number, py: number, range: number): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestD = range * range;
    for (const e of this.pool) {
      if (!e.alive) continue;
      const dx = e.body.position.x - px;
      const dy = e.body.position.y - py;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = { x: e.body.position.x, y: e.body.position.y };
      }
    }
    return best;
  }

  /** Damage the enemy with this body. Returns kill outcome, or null. */
  hitByBody(bodyId: number, dmg: number): { killed: boolean; x: number; y: number } | null {
    const e = this.byBodyId.get(bodyId);
    if (!e || !e.alive) return null;
    e.hp -= dmg;
    const x = e.body.position.x;
    const y = e.body.position.y;
    if (e.hp > 0) return { killed: false, x, y };
    this.retire(e);
    return { killed: true, x, y };
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
