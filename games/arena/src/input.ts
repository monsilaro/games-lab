import {
  CURSOR_DEADZONE,
  CURSOR_FULL_DIST,
  JOYSTICK_DEADZONE,
  JOYSTICK_RADIUS_PX,
} from './config';

/**
 * Movement input. On touch, a floating virtual joystick: the base appears
 * wherever the thumb lands (anywhere on screen), the knob follows within
 * JOYSTICK_RADIUS_PX. On desktop (a mouse moves), the joystick hides and the
 * player walks toward the cursor — call `updateCursor` each frame.
 */
export class Joystick {
  /** Direction * intensity, magnitude 0..1, +y = screen up. */
  readonly value = { x: 0, y: 0 };
  /** Set false while paused/in menus — taps are then ignored. */
  enabled = false;

  /** Flips to true the first time a mouse is seen → cursor-follow mode. */
  private mouseMode = false;
  private mouseX = 0;
  private mouseY = 0;

  private pointerId: number | null = null;
  private baseX = 0;
  private baseY = 0;
  private readonly baseEl: HTMLDivElement;
  private readonly knobEl: HTMLDivElement;

  constructor() {
    this.baseEl = document.getElementById('arena-stick-base') as HTMLDivElement;
    this.knobEl = document.getElementById('arena-stick-knob') as HTMLDivElement;
    window.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));
  }

  /** Force-release the stick (when pausing for upgrades / game over). */
  release(): void {
    this.pointerId = null;
    this.value.x = 0;
    this.value.y = 0;
    this.baseEl.style.display = 'none';
    this.knobEl.style.display = 'none';
  }

  /**
   * Desktop only: drive `value` toward the cursor's world position. No-op on
   * touch or while disabled. Camera args map the screen-space cursor into the
   * world (ortho camera centered at camX/camY spanning worldW × worldH).
   */
  updateCursor(
    camX: number, camY: number, worldW: number, worldH: number,
    playerX: number, playerY: number,
  ): void {
    if (!this.mouseMode) return;
    if (!this.enabled) {
      this.value.x = 0;
      this.value.y = 0;
      return;
    }
    const worldX = camX + (this.mouseX / window.innerWidth - 0.5) * worldW;
    const worldY = camY + (0.5 - this.mouseY / window.innerHeight) * worldH;
    const dx = worldX - playerX;
    const dy = worldY - playerY;
    const dist = Math.hypot(dx, dy);
    if (dist < CURSOR_DEADZONE) {
      this.value.x = 0;
      this.value.y = 0;
      return;
    }
    const intensity = Math.min(
      (dist - CURSOR_DEADZONE) / (CURSOR_FULL_DIST - CURSOR_DEADZONE), 1,
    );
    this.value.x = (dx / dist) * intensity;
    this.value.y = (dy / dist) * intensity;
  }

  private onDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse') return; // desktop steers with the cursor
    if (!this.enabled || this.pointerId !== null) return;
    this.pointerId = e.pointerId;
    this.baseX = e.clientX;
    this.baseY = e.clientY;
    this.baseEl.style.display = 'block';
    this.knobEl.style.display = 'block';
    this.baseEl.style.transform =
      `translate(${this.baseX}px, ${this.baseY}px) translate(-50%, -50%)`;
    this.track(e);
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerType === 'mouse') {
      if (!this.mouseMode) {
        this.mouseMode = true;
        this.release(); // ditch any visible touch stick
      }
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      return;
    }
    if (e.pointerId === this.pointerId) this.track(e);
  }

  private onUp(e: PointerEvent): void {
    if (e.pointerId === this.pointerId) this.release();
  }

  private track(e: PointerEvent): void {
    const rawX = e.clientX - this.baseX;
    const rawY = e.clientY - this.baseY;
    const dist = Math.hypot(rawX, rawY);
    const clampK = dist > JOYSTICK_RADIUS_PX ? JOYSTICK_RADIUS_PX / dist : 1;
    this.knobEl.style.transform =
      `translate(${this.baseX + rawX * clampK}px, ${this.baseY + rawY * clampK}px) ` +
      'translate(-50%, -50%)';

    const mag = Math.min(dist / JOYSTICK_RADIUS_PX, 1);
    if (mag < JOYSTICK_DEADZONE || dist === 0) {
      this.value.x = 0;
      this.value.y = 0;
      return;
    }
    const intensity = (mag - JOYSTICK_DEADZONE) / (1 - JOYSTICK_DEADZONE);
    this.value.x = (rawX / dist) * intensity;
    this.value.y = (-rawY / dist) * intensity; // screen y is down, world y is up
  }
}
