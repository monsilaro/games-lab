import * as THREE from 'three';
import type { OrthoApp } from '@games-lab/shared';
import {
  CAMERA_LERP,
  MAP_HEIGHT,
  MAP_WIDTH,
  SHAKE_DURATION,
  SHAKE_MAGNITUDE,
  WORLD_HEIGHT,
} from './config';

/** Lerped follow camera, clamped to the map bounds, with a light shake. */
export class FollowCamera {
  private x = 0;
  private y = 0;
  private shakeTime = 0;

  constructor(private readonly app: OrthoApp) {}

  shake(): void {
    this.shakeTime = SHAKE_DURATION;
  }

  snapTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  update(targetX: number, targetY: number, dt: number): void {
    const k = Math.min(1, CAMERA_LERP * dt);
    this.x += (targetX - this.x) * k;
    this.y += (targetY - this.y) * k;

    // Keep the view inside the map; center the axis if the map is smaller.
    const maxX = Math.max(0, MAP_WIDTH / 2 - this.app.worldWidth / 2);
    const maxY = Math.max(0, MAP_HEIGHT / 2 - WORLD_HEIGHT / 2);
    let cx = THREE.MathUtils.clamp(this.x, -maxX, maxX);
    let cy = THREE.MathUtils.clamp(this.y, -maxY, maxY);

    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      const m = (this.shakeTime / SHAKE_DURATION) * SHAKE_MAGNITUDE;
      cx += (Math.random() - 0.5) * 2 * m;
      cy += (Math.random() - 0.5) * 2 * m;
    }

    this.app.camera.position.x = cx;
    this.app.camera.position.y = cy;
  }
}
