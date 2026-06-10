import { JOYSTICK_DEADZONE, JOYSTICK_RADIUS_PX } from './config';

/**
 * Floating virtual joystick: the base appears wherever the thumb lands
 * (anywhere on screen), the knob follows within JOYSTICK_RADIUS_PX.
 */
export class Joystick {
  /** Direction * intensity, magnitude 0..1, +y = screen up. */
  readonly value = { x: 0, y: 0 };
  /** Set false while paused/in menus — taps are then ignored. */
  enabled = false;

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

  private onDown(e: PointerEvent): void {
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
