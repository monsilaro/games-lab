// Twin-stick input — the make-or-break system. Two independent floating sticks
// keyed by screen half: a thumb in the LEFT half drives movement, a thumb in
// the RIGHT half aims + fires. Each tracks its own pointerId for true
// multi-touch, appears under the thumb with a deadzone, and clamps to radius.
// Floating-stick logic ported from games/arena/src/input.ts.
//
// Desktop fallback (for iteration only): WASD moves, the mouse aims, mouse-down
// fires. main.ts resolves the final aim from `mouse*` against the hero's
// projected screen position.

import { STICK } from './config';

interface Vec2 {
  x: number;
  y: number;
}

/** One floating joystick bound to a base/knob DOM pair. +y = screen up. */
class Stick {
  readonly value: Vec2 = { x: 0, y: 0 };
  active = false;
  pointerId: number | null = null;

  private baseX = 0;
  private baseY = 0;

  constructor(
    private readonly base: HTMLElement,
    private readonly knob: HTMLElement,
  ) {}

  claim(e: PointerEvent): void {
    this.pointerId = e.pointerId;
    this.active = true;
    this.baseX = e.clientX;
    this.baseY = e.clientY;
    this.base.style.display = 'block';
    this.knob.style.display = 'block';
    this.base.style.transform = `translate(${this.baseX}px, ${this.baseY}px)`;
    this.track(e);
  }

  track(e: PointerEvent): void {
    const rawX = e.clientX - this.baseX;
    const rawY = e.clientY - this.baseY;
    const dist = Math.hypot(rawX, rawY);
    const clampK = dist > STICK.radiusPx ? STICK.radiusPx / dist : 1;
    this.knob.style.transform =
      `translate(${this.baseX + rawX * clampK}px, ${this.baseY + rawY * clampK}px)`;

    const mag = Math.min(dist / STICK.radiusPx, 1);
    if (mag < STICK.deadzone || dist === 0) {
      this.value.x = 0;
      this.value.y = 0;
      return;
    }
    const intensity = (mag - STICK.deadzone) / (1 - STICK.deadzone);
    this.value.x = (rawX / dist) * intensity;
    this.value.y = (-rawY / dist) * intensity; // screen y is down, world +y is up
  }

  release(): void {
    this.pointerId = null;
    this.active = false;
    this.value.x = 0;
    this.value.y = 0;
    this.base.style.display = 'none';
    this.knob.style.display = 'none';
  }
}

export class TwinStick {
  /** Set false in menus / game-over so taps and keys are ignored. */
  enabled = true;

  /** Mouse fallback state — read by main.ts to resolve desktop aim. */
  mouseMode = false;
  mouseX = 0;
  mouseY = 0;
  mouseDown = false;

  private readonly moveStick: Stick;
  private readonly aimStick: Stick;
  private readonly keys = new Set<string>();

  constructor() {
    this.moveStick = new Stick(byId('boulon-stick-move-base'), byId('boulon-stick-move-knob'));
    this.aimStick = new Stick(byId('boulon-stick-aim-base'), byId('boulon-stick-aim-knob'));

    window.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));
    window.addEventListener('keydown', (e) => this.keys.add(e.key.toLowerCase()));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Movement vector, magnitude 0..1, +y = screen up. Touch stick or WASD. */
  get move(): Vec2 {
    if (this.moveStick.active) return this.moveStick.value;
    if (!this.enabled) return ZERO;
    let x = 0;
    let y = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) x -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) x += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) y += 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) y -= 1;
    if (x === 0 && y === 0) return ZERO;
    const m = Math.hypot(x, y);
    return { x: x / m, y: y / m };
  }

  /** True while the right thumb is on the aim stick (touch only). */
  get aimActive(): boolean {
    return this.aimStick.active;
  }

  /** Aim direction from the right stick, +y = screen up (touch only). */
  get aim(): Vec2 {
    return this.aimStick.value;
  }

  private onDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse') {
      this.mouseDown = true;
      return;
    }
    if (!this.enabled) return;
    const leftHalf = e.clientX < window.innerWidth / 2;
    const stick = leftHalf ? this.moveStick : this.aimStick;
    if (stick.pointerId === null) stick.claim(e);
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerType === 'mouse') {
      this.mouseMode = true;
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      return;
    }
    if (e.pointerId === this.moveStick.pointerId) this.moveStick.track(e);
    else if (e.pointerId === this.aimStick.pointerId) this.aimStick.track(e);
  }

  private onUp(e: PointerEvent): void {
    if (e.pointerType === 'mouse') {
      this.mouseDown = false;
      return;
    }
    if (e.pointerId === this.moveStick.pointerId) this.moveStick.release();
    else if (e.pointerId === this.aimStick.pointerId) this.aimStick.release();
  }
}

const ZERO: Vec2 = { x: 0, y: 0 };

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}
