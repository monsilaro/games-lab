// Static training robots. Phase 1 placeholder for real enemies: they stand in
// the arena, take hits, and simply DISAPPEAR when killed (explosions arrive in
// Phase 2). Pooled and recycled — zero allocation per wave.

import * as THREE from 'three';
import Matter from 'matter-js';
import * as C from './config';
import { addBody, CAT, removeBody } from './physics';
import { buildRobot } from './robotFactory';

const { Bodies } = Matter;

interface Target {
  body: Matter.Body;
  mesh: THREE.Group;
  alive: boolean;
  hp: number;
}

export class Targets {
  private readonly pool: Target[] = [];
  private readonly byBodyId = new Map<number, Target>();

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < C.TARGETS.poolSize; i++) {
      const built = buildRobot({
        body: C.PALETTE.target,
        bodyDark: C.PALETTE.targetDark,
        accent: C.PALETTE.heroAccent,
        eye: C.PALETTE.eye,
        scale: 0.95,
      });
      built.group.visible = false;
      scene.add(built.group);
      const body = Bodies.circle(0, 0, C.TARGETS.radius, {
        isStatic: true,
        label: 'target',
        collisionFilter: { category: CAT.target, mask: CAT.player | CAT.projectile },
      });
      this.pool.push({ body, mesh: built.group, alive: false, hp: 0 });
    }
  }

  get aliveCount(): number {
    let n = 0;
    for (const t of this.pool) if (t.alive) n += 1;
    return n;
  }

  /** Fill the arena with a fresh set, none too close to the hero. */
  spawnWave(playerX: number, playerY: number): void {
    let spawned = 0;
    for (const t of this.pool) {
      if (spawned >= C.TARGETS.count) break;
      if (t.alive) continue;
      const pos = this.findSpot(playerX, playerY);
      this.activate(t, pos.x, pos.y);
      spawned += 1;
    }
  }

  /** Apply damage to the target with this body. Returns true if it was killed. */
  hitByBody(bodyId: number, dmg: number): boolean {
    const t = this.byBodyId.get(bodyId);
    if (!t || !t.alive) return false;
    t.hp -= dmg;
    if (t.hp > 0) return false;
    this.retire(t);
    return true;
  }

  private activate(t: Target, x: number, y: number): void {
    t.alive = true;
    t.hp = C.TARGETS.hp;
    Matter.Body.setPosition(t.body, { x, y });
    t.mesh.position.set(x, 0, y);
    t.mesh.rotation.y = Math.random() * Math.PI * 2;
    t.mesh.visible = true;
    // Static + positioned here once: no per-frame mesh sync needed (and we keep
    // the random facing, which syncMeshes would otherwise reset from angle 0).
    addBody(t.body);
    this.byBodyId.set(t.body.id, t);
  }

  private retire(t: Target): void {
    t.alive = false;
    t.mesh.visible = false;
    removeBody(t.body);
    this.byBodyId.delete(t.body.id);
  }

  private findSpot(px: number, py: number): { x: number; y: number } {
    const range = C.ARENA_HALF - C.TARGETS.spawnMargin;
    for (let tries = 0; tries < 20; tries++) {
      const x = (Math.random() * 2 - 1) * range;
      const y = (Math.random() * 2 - 1) * range;
      if (Math.hypot(x - px, y - py) >= C.TARGETS.minPlayerDist) return { x, y };
    }
    return { x: range, y: range };
  }
}
