// The hero robot: a matter circle driven directly by the move stick, a voxel
// body from the factory, and a muzzle that tracks the aim direction. All
// coordinates are matter floor-plane (x, y); the mesh maps y → world Z.

import * as THREE from 'three';
import Matter from 'matter-js';
import * as C from './config';
import { addBody, CAT, toTick } from './physics';
import { buildRobot } from './robotFactory';

const { Bodies, Body, Sleeping } = Matter;

export class Player {
  readonly body: Matter.Body;
  readonly mesh: THREE.Group;
  hp = C.PLAYER.hp;

  // Aim direction in matter space (unit). Defaults to "far" (into the screen).
  private aimX = 0;
  private aimY = 1;

  constructor(scene: THREE.Scene) {
    this.body = Bodies.circle(0, 0, C.PLAYER.radius, {
      label: 'player',
      frictionAir: 0,
      inertia: Infinity, // never spin from collisions; we orient the mesh by aim
      sleepThreshold: Infinity, // driven by setVelocity each frame — must never sleep
      collisionFilter: { category: CAT.player, mask: CAT.wall | CAT.target },
    });
    this.mesh = buildRobot({
      body: C.PALETTE.hero,
      bodyDark: C.PALETTE.heroDark,
      accent: C.PALETTE.heroAccent,
      eye: C.PALETTE.eye,
    }).group;
    scene.add(this.mesh);
    // Registered for physics only (no mesh): the hero's facing is driven by
    // the aim stick, not body.angle, so we sync its transform ourselves.
    addBody(this.body);
  }

  /** Drive velocity from a move vector (matter space, magnitude 0..1). */
  move(mx: number, my: number): void {
    // Belt-and-suspenders: setVelocity never wakes a sleeping body, so if it
    // somehow slept, wake it before driving it (the body also has
    // sleepThreshold: Infinity, so this should never actually trigger).
    if ((mx !== 0 || my !== 0) && this.body.isSleeping) Sleeping.set(this.body, false);
    Body.setVelocity(this.body, {
      x: toTick(mx * C.PLAYER.moveSpeed),
      y: toTick(my * C.PLAYER.moveSpeed),
    });
  }

  /** Point the hero at a matter-space direction (need not be normalised). */
  aimTo(dx: number, dy: number): void {
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) return;
    this.aimX = dx / len;
    this.aimY = dy / len;
  }

  /** Copy the body position onto the mesh and face the current aim. Call once
   *  per rendered frame, after physics.syncMeshes(). */
  syncMesh(): void {
    this.mesh.position.x = this.body.position.x;
    this.mesh.position.z = this.body.position.y; // matter y → world Z
    // mesh +Z is the robot's front; matter (x, y) → world (x, z).
    this.mesh.rotation.y = Math.atan2(this.aimX, this.aimY);
  }

  /** World-floor muzzle point (matter coords) the next bolt spawns from. */
  get muzzle(): { x: number; y: number; dirX: number; dirY: number } {
    return {
      x: this.body.position.x + this.aimX * C.WEAPON.muzzleOffset,
      y: this.body.position.y + this.aimY * C.WEAPON.muzzleOffset,
      dirX: this.aimX,
      dirY: this.aimY,
    };
  }
}
