// The hero ship: a matter circle whose position is lerped toward the finger
// target each frame (no velocity steering — it's a fly-to-cursor shmum ship),
// a small voxel body from the factory facing UP-screen, auto-fire straight up,
// and an HP pool with brief i-frames + a blink after each hit.

import * as THREE from 'three';
import Matter from 'matter-js';
import * as C from './config';
import { addBody, CAT } from './physics';
import { buildRobot } from './robotFactory';

const { Bodies, Body, Sleeping } = Matter;

export class Player {
  readonly body: Matter.Body;
  readonly mesh: THREE.Group;
  hp = C.PLAYER.hp;
  private iframe = 0;
  private blinkT = 0;

  constructor(scene: THREE.Scene) {
    this.body = Bodies.circle(0, 0, C.PLAYER.radius, {
      label: 'player',
      frictionAir: 0,
      inertia: Infinity,
      sleepThreshold: Infinity, // position-driven each frame — must never sleep
      collisionFilter: { category: CAT.player, mask: CAT.enemy },
    });
    this.mesh = buildRobot({
      body: C.PALETTE.hero,
      bodyDark: C.PALETTE.heroDark,
      accent: C.PALETTE.heroAccent,
      eye: C.PALETTE.eye,
      scale: C.PLAYER.scale,
    }).group;
    this.mesh.rotation.y = Math.PI; // face −z = up-screen (mesh front is +z)
    scene.add(this.mesh);
    addBody(this.body); // physics only; we sync the mesh ourselves (custom facing)
  }

  reset(): void {
    this.hp = C.PLAYER.hp;
    this.iframe = 0;
    this.blinkT = 0;
    this.mesh.visible = true;
    Body.setPosition(this.body, { x: 0, y: 0 });
    if (this.body.isSleeping) Sleeping.set(this.body, false);
  }

  /** Lerp the ship toward a matter-space target (already clamped by the caller). */
  moveTo(tx: number, ty: number, dt: number): void {
    const k = 1 - Math.exp(-C.PLAYER.followLerp * dt);
    const p = this.body.position;
    Body.setPosition(this.body, { x: p.x + (tx - p.x) * k, y: p.y + (ty - p.y) * k });
    if (this.body.isSleeping) Sleeping.set(this.body, false);
  }

  /** Apply a hit if not invulnerable. Returns true if HP was actually removed. */
  takeDamage(amount: number): boolean {
    if (this.iframe > 0) return false;
    this.hp -= amount;
    this.iframe = C.PLAYER.iframes;
    return true;
  }

  get invulnerable(): boolean {
    return this.iframe > 0;
  }

  /** Advance i-frames + blink. Call once per frame. */
  tick(dt: number): void {
    if (this.iframe > 0) {
      this.iframe -= dt;
      this.blinkT += dt;
      this.mesh.visible = Math.floor(this.blinkT * 20) % 2 === 0;
    } else if (!this.mesh.visible) {
      this.mesh.visible = true;
    }
  }

  /** Copy body position onto the mesh. Call after physics.syncMeshes(). */
  syncMesh(): void {
    this.mesh.position.x = this.body.position.x;
    this.mesh.position.z = this.body.position.y; // matter y → world z
  }

  /** Muzzle point + fixed upward (−y) direction for the next bolt. */
  get muzzle(): { x: number; y: number; dirX: number; dirY: number } {
    return {
      x: this.body.position.x,
      y: this.body.position.y - C.WEAPON.muzzleOffset,
      dirX: 0,
      dirY: -1,
    };
  }
}
