// Drag-to-aim input, the violet sling visual + elastic band, and the dashed
// trajectory preview. The preview iterates the exact discrete Verlet recurrence
// matter uses for a frictionAir-0 body under constant gravity, so the dots lie
// on the real flight path.

import * as THREE from 'three';
import type { OrthoApp } from '@games-lab/shared';
import * as C from './config';

export class Slingshot {
  /** Where the ball rests / is being held, in world units. */
  readonly pouch: { x: number; y: number } = { x: C.ANCHOR.x, y: C.ANCHOR.y };
  enabled = false;

  private dragging = false;
  private pointerId = -1;
  private startX = 0; // where the drag began, world units
  private startY = 0;
  private dragX = 0; // drag vector d = start − pointer, clamped
  private dragY = 0;
  private readonly elasticPos: THREE.BufferAttribute;
  private readonly dots: THREE.Mesh[] = [];
  private readonly dotMats: THREE.MeshBasicMaterial[] = [];

  constructor(
    scene: THREE.Scene,
    private readonly app: OrthoApp,
    private readonly onFire: (x: number, y: number, vx: number, vy: number) => void,
  ) {
    // the wooden "Y": a post and two fork arms, purely decorative
    const slingMat = new THREE.MeshBasicMaterial({ color: C.PALETTE.sling });
    const unit = new THREE.PlaneGeometry(1, 1);
    const post = new THREE.Mesh(unit, slingMat);
    post.scale.set(0.18, C.ANCHOR.y - 0.35, 1);
    post.position.set(C.ANCHOR.x, (C.ANCHOR.y - 0.35) / 2, 0.3);
    scene.add(post);
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(unit, slingMat);
      arm.scale.set(0.14, 0.75, 1);
      arm.position.set(C.ANCHOR.x + side * 0.26, C.ANCHOR.y - 0.12, 0.3);
      arm.rotation.z = -side * 0.45;
      scene.add(arm);
    }

    // elastic band: left fork tip → pouch → right fork tip
    const elasticGeo = new THREE.BufferGeometry();
    this.elasticPos = new THREE.BufferAttribute(new Float32Array(9), 3);
    elasticGeo.setAttribute('position', this.elasticPos);
    const elastic = new THREE.Line(
      elasticGeo,
      new THREE.LineBasicMaterial({ color: C.PALETTE.sling }),
    );
    elastic.position.z = 0.45;
    elastic.frustumCulled = false;
    scene.add(elastic);

    // dashed trajectory preview: pooled ice-cyan dots fading along the arc
    const dotGeo = new THREE.CircleGeometry(0.15, 10);
    for (let i = 0; i < C.PREVIEW_DOTS; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: C.PALETTE.preview,
        transparent: true,
        opacity: 0.9 * (1 - i / C.PREVIEW_DOTS) + 0.1,
      });
      const dot = new THREE.Mesh(dotGeo, mat);
      dot.visible = false;
      dot.position.z = 0.25;
      scene.add(dot);
      this.dots.push(dot);
      this.dotMats.push(mat);
    }

    this.writeElastic();

    window.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));
  }

  /** Cancel any in-progress drag and put the pouch back at rest. */
  release(): void {
    this.dragging = false;
    this.dragX = 0;
    this.dragY = 0;
    this.pouch.x = C.ANCHOR.x;
    this.pouch.y = C.ANCHOR.y;
    this.writeElastic();
    this.hidePreview();
  }

  private toWorldX(e: PointerEvent): number {
    const cam = this.app.camera;
    return cam.position.x + cam.left + (e.clientX / window.innerWidth) * (cam.right - cam.left);
  }

  private toWorldY(e: PointerEvent): number {
    const cam = this.app.camera;
    return cam.position.y + cam.top - (e.clientY / window.innerHeight) * (cam.top - cam.bottom);
  }

  private onDown(e: PointerEvent): void {
    if (!this.enabled || this.dragging) return;
    // Aiming is relative to where the finger lands, so the drag can start
    // anywhere on screen — the anchor sits near the bottom edge, and absolute
    // aiming would leave no room to pull down for steep, powerful shots.
    this.dragging = true;
    this.pointerId = e.pointerId;
    this.startX = this.toWorldX(e);
    this.startY = this.toWorldY(e);
    this.onMove(e);
  }

  private onMove(e: PointerEvent): void {
    if (!this.dragging || e.pointerId !== this.pointerId) return;
    let dx = this.startX - this.toWorldX(e);
    let dy = this.startY - this.toWorldY(e);
    const len = Math.hypot(dx, dy);
    if (len > C.MAX_DRAG) {
      dx *= C.MAX_DRAG / len;
      dy *= C.MAX_DRAG / len;
    }
    this.dragX = dx;
    this.dragY = dy;
    // The pouch is the launch point (fire + preview both read it): keep it on
    // screen and above the ground so the ball never spawns inside the floor.
    this.pouch.x = Math.max(C.ANCHOR.x - dx, -0.6);
    this.pouch.y = Math.max(C.ANCHOR.y - dy, C.GROUND_Y + C.BALL_RADIUS);
    this.writeElastic();
    this.updatePreview();
  }

  private onUp(e: PointerEvent): void {
    if (!this.dragging || e.pointerId !== this.pointerId) return;
    const power = Math.hypot(this.dragX, this.dragY);
    const x = this.pouch.x;
    const y = this.pouch.y;
    const vx = this.dragX * C.LAUNCH_K;
    const vy = this.dragY * C.LAUNCH_K;
    this.release();
    if (power >= C.MIN_DRAG) this.onFire(x, y, vx, vy);
  }

  private writeElastic(): void {
    const a = this.elasticPos.array as Float32Array;
    a[0] = C.ANCHOR.x - 0.34;
    a[1] = C.ANCHOR.y + 0.1;
    a[3] = this.pouch.x;
    a[4] = this.pouch.y;
    a[6] = C.ANCHOR.x + 0.34;
    a[7] = C.ANCHOR.y + 0.1;
    this.elasticPos.needsUpdate = true;
  }

  private hidePreview(): void {
    for (const dot of this.dots) dot.visible = false;
  }

  private updatePreview(): void {
    if (Math.hypot(this.dragX, this.dragY) < C.MIN_DRAG) {
      this.hidePreview();
      return;
    }
    const vx = this.dragX * C.LAUNCH_K;
    const vy = this.dragY * C.LAUNCH_K;
    // matter's integration for a frictionAir-0 body:
    //   p[n+1] = 2·p[n] − p[n−1] + g·dt²,  setVelocity ⇒ p[−1] = p[0] − v·dt
    let px = this.pouch.x;
    let py = this.pouch.y;
    let prevX = px - vx * C.FIXED_DT;
    let prevY = py - vy * C.FIXED_DT;
    const gdt2 = -C.GRAVITY * C.FIXED_DT * C.FIXED_DT;
    let dotIndex = 0;
    for (let tick = 1; dotIndex < C.PREVIEW_DOTS; tick++) {
      const nx = 2 * px - prevX;
      const ny = 2 * py - prevY + gdt2;
      prevX = px;
      prevY = py;
      px = nx;
      py = ny;
      if (py < C.GROUND_Y + C.BALL_RADIUS) break;
      if (tick % C.PREVIEW_STEP === 0) {
        const dot = this.dots[dotIndex]!;
        dot.position.x = px;
        dot.position.y = py;
        dot.visible = true;
        dotIndex += 1;
      }
    }
    for (let i = dotIndex; i < C.PREVIEW_DOTS; i++) this.dots[i]!.visible = false;
  }
}
