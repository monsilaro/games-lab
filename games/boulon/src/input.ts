// Single-pointer "follow" input — replaces the clunky twin-stick. One thumb
// drags; the ship flies to a world target a little ABOVE the finger so the
// thumb never covers it (the mobile-shmup standard). We unproject the pointer
// onto the floor plane (y = 0) with a raycaster, which stays correct under the
// tilted camera without any manual foreshortening math.
//
// Desktop fallback (iteration only): hold the mouse to steer the same way.

import * as THREE from 'three';
import { WINDOW } from './config';

export class Follow {
  /** True while a thumb/mouse is down and steering. */
  active = false;
  /** Steer target in matter coords (x, y); matter y maps to world z. */
  readonly target = { x: 0, y: 0 };

  private pointerId: number | null = null;
  private readonly ray = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly hit = new THREE.Vector3();

  constructor(private readonly camera: THREE.Camera) {
    window.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));
    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private updateFromScreen(clientX: number, clientY: number): void {
    this.ndc.x = (clientX / window.innerWidth) * 2 - 1;
    this.ndc.y = -(clientY / window.innerHeight) * 2 + 1;
    this.ray.setFromCamera(this.ndc, this.camera);
    if (this.ray.ray.intersectPlane(this.plane, this.hit)) {
      this.target.x = this.hit.x;
      this.target.y = this.hit.z - WINDOW.followOffset; // float above the finger (−y = up-screen)
    }
  }

  private onDown(e: PointerEvent): void {
    if (e.pointerType !== 'mouse') this.pointerId = e.pointerId;
    this.active = true;
    this.updateFromScreen(e.clientX, e.clientY);
  }

  private onMove(e: PointerEvent): void {
    if (!this.active) return;
    if (e.pointerType === 'mouse' || e.pointerId === this.pointerId) {
      this.updateFromScreen(e.clientX, e.clientY);
    }
  }

  private onUp(e: PointerEvent): void {
    if (e.pointerType === 'mouse' || e.pointerId === this.pointerId) {
      this.active = false;
      this.pointerId = null;
    }
  }
}
