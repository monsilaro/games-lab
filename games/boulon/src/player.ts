// The hero ship: a dynamic matter circle that SEEKS the finger target by
// velocity (so solid pillars / walls / the rising crusher resolve naturally),
// a small voxel body, auto-aim facing, and an HP pool with brief i-frames.

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
  maxHp = C.PLAYER.hp;
  private aimX = 0;
  private aimY = -1; // default: up-screen
  private iframe = 0;
  private blinkT = 0;

  constructor(scene: THREE.Scene) {
    this.body = Bodies.circle(0, 0, C.PLAYER.radius, {
      label: 'player',
      frictionAir: 0,
      inertia: Infinity, // never spin from contacts
      sleepThreshold: Infinity, // velocity-driven each frame — must never sleep
      collisionFilter: { category: CAT.player, mask: CAT.wall | CAT.enemy | CAT.item },
    });
    this.mesh = buildRobot({
      body: C.PALETTE.hero,
      bodyDark: C.PALETTE.heroDark,
      accent: C.PALETTE.heroAccent,
      eye: C.PALETTE.eye,
      scale: C.PLAYER.scale,
    }).group;
    scene.add(this.mesh);
    addBody(this.body); // physics only; mesh synced here (custom facing)
  }

  reset(maxHp: number, x: number, y: number): void {
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.iframe = 0;
    this.blinkT = 0;
    this.mesh.visible = true;
    Body.setPosition(this.body, { x, y });
    Body.setVelocity(this.body, { x: 0, y: 0 });
    if (this.body.isSleeping) Sleeping.set(this.body, false);
  }

  /** Seek a matter-space target, capped at `maxSpeed` (units/s). */
  seek(tx: number, ty: number, maxSpeed: number): void {
    const p = this.body.position;
    let vx = (tx - p.x) * C.PLAYER.seekGain;
    let vy = (ty - p.y) * C.PLAYER.seekGain;
    const sp = Math.hypot(vx, vy);
    if (sp > maxSpeed) {
      const k = maxSpeed / sp;
      vx *= k;
      vy *= k;
    }
    Body.setVelocity(this.body, { x: toTick(vx), y: toTick(vy) });
    if (this.body.isSleeping) Sleeping.set(this.body, false);
  }

  setAim(dx: number, dy: number): void {
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) return;
    this.aimX = dx / len;
    this.aimY = dy / len;
  }

  takeDamage(amount: number): boolean {
    if (this.iframe > 0) return false;
    this.hp -= amount;
    this.iframe = C.PLAYER.iframes;
    return true;
  }
  get invulnerable(): boolean {
    return this.iframe > 0;
  }
  heal(n: number): void {
    this.hp = Math.min(this.maxHp, this.hp + n);
  }
  addMaxHp(n: number): void {
    this.maxHp += n;
    this.hp += n;
  }

  tick(dt: number): void {
    if (this.iframe > 0) {
      this.iframe -= dt;
      this.blinkT += dt;
      this.mesh.visible = Math.floor(this.blinkT * 20) % 2 === 0;
    } else if (!this.mesh.visible) {
      this.mesh.visible = true;
    }
  }

  syncMesh(): void {
    this.mesh.position.x = this.body.position.x;
    this.mesh.position.z = this.body.position.y; // matter y → world z
    this.mesh.rotation.y = Math.atan2(this.aimX, this.aimY);
  }

  get muzzle(): { x: number; y: number } {
    return {
      x: this.body.position.x + this.aimX * C.WEAPON.muzzleOffset,
      y: this.body.position.y + this.aimY * C.WEAPON.muzzleOffset,
    };
  }
  get aim(): { x: number; y: number } {
    return { x: this.aimX, y: this.aimY };
  }
}
