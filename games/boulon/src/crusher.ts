// The rising floor (crusher). A full-width solid slab that climbs the room
// toward the gate after a short grace delay, shoving the player up. You die if
// it pins you against the closed gate or a pillar/ceiling. One instance, reused
// per room (reset places it at the room's bottom).

import * as THREE from 'three';
import Matter from 'matter-js';
import * as C from './config';
import { addBody, CAT, removeBody } from './physics';
import type { Room } from './rooms';

const { Bodies, Body } = Matter;

export class Crusher {
  private readonly body: Matter.Body;
  private readonly mesh: THREE.Group;
  private centerY = 0; // matter y of the slab centre
  private delay = 0;
  private active = false;

  constructor(scene: THREE.Scene) {
    const w = C.LANE_HALF * 2;
    this.body = Bodies.rectangle(0, 0, w, C.CRUSHER.thickness, {
      isStatic: true,
      label: 'wall',
      collisionFilter: { category: CAT.wall, mask: CAT.player | CAT.projectile },
    });
    this.mesh = new THREE.Group();
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(w, 1.6, C.CRUSHER.thickness),
      new THREE.MeshLambertMaterial({ color: C.PALETTE.crusher, flatShading: true }),
    );
    slab.position.y = 0.8;
    this.mesh.add(slab);
    // Danger stripe on the leading (−z) edge.
    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(w, 1.9, 0.4),
      new THREE.MeshLambertMaterial({ color: C.PALETTE.crusherEdge, flatShading: true }),
    );
    edge.position.set(0, 0.95, -C.CRUSHER.thickness / 2);
    this.mesh.add(edge);
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  /** Place at the bottom of `room`, reset the grace delay, and start tracking. */
  reset(room: Room): void {
    this.centerY = room.bottomY + C.CRUSHER.thickness / 2; // top face at the entrance
    this.delay = C.CRUSHER.startDelay;
    this.active = true;
    this.sync();
    this.mesh.visible = true;
    if (!this.inWorld) {
      addBody(this.body);
      this.inWorld = true;
    }
  }
  private inWorld = false;

  stop(): void {
    this.active = false;
    this.mesh.visible = false;
    if (this.inWorld) {
      removeBody(this.body);
      this.inWorld = false;
    }
  }

  /** Rise after the grace delay. `speed` in units/s. */
  update(dt: number, speed: number): void {
    if (!this.active) return;
    if (this.delay > 0) {
      this.delay -= dt;
      return;
    }
    this.centerY -= speed * dt; // toward −y (up)
    this.sync();
  }

  /** Matter y of the leading (top) face. */
  get topY(): number {
    return this.centerY - C.CRUSHER.thickness / 2;
  }

  /** True when the player should die: gate sealed, or pinned past the margin. */
  crushed(room: Room, playerY: number): boolean {
    if (!this.active || this.delay > 0) return false;
    // Sealed against the closed gate → no room left.
    if (!room.gateOpen && this.topY <= room.topY + 1.2) return true;
    // Pinned: the slab has overrun the player (blocked from above).
    if (playerY + C.PLAYER.radius - this.topY > C.CRUSHER.crushMargin) return true;
    return false;
  }

  private sync(): void {
    Body.setPosition(this.body, { x: 0, y: this.centerY });
    this.mesh.position.z = this.centerY;
  }
}
