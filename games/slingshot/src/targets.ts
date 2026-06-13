// Targets are little papercraft critters with faces — gameplay/physics is
// unchanged (each is still a circle Matter body of TARGET_RADIUS). Each enemy
// gets a random type (sprout/bug/fang), body color, face preset, and blink
// phase at spawn. The face is drawn into a per-enemy CanvasTexture that updates
// when its expression state changes: eyes track the look target (ball in flight,
// else the loaded pouch), a near ball triggers a scared face, and they blink.
// The critter is kept UPRIGHT (we ignore the body angle) so the face reads.

import * as THREE from 'three';
import Matter from 'matter-js';
import * as C from './config';
import * as physics from './physics';
import type { TargetDesc } from './levelgen';
import { lighten, darken } from './paper';

const { Bodies } = Matter;

const S = 160; // face canvas size (px)
const R = S / 3; // drawing radius (px); leaves room for ears/antennae + shadow
const CHAR_R = C.TARGET_RADIUS * 1.18; // visual radius (world) — a touch bigger than the body
const PLANE = CHAR_R * 3; // world size of the textured quad (half-extent = 1.5·r)

interface Face {
  eye: string;
  brow: string;
  mouth: string;
}
const FACES: Face[] = [
  { eye: 'dot', brow: 'flat', mouth: 'smile' },
  { eye: 'happy', brow: 'none', mouth: 'grin' },
  { eye: 'sleepy', brow: 'flat', mouth: 'smirk' },
  { eye: 'wide', brow: 'raise', mouth: 'o' },
  { eye: 'dot', brow: 'angry', mouth: 'fangs' },
  { eye: 'dot', brow: 'none', mouth: 'wavy' },
  { eye: 'wide', brow: 'flat', mouth: 'grin' },
  { eye: 'dot', brow: 'flat', mouth: 'flat' },
];

let theme: C.Theme = C.THEMES.day;

export interface Target {
  alive: boolean;
  body: Matter.Body | null;
  mesh: THREE.Mesh;
  canvas: HTMLCanvasElement;
  tex: THREE.CanvasTexture;
  type: C.EnemyType;
  color: string;
  face: number;
  blink: number;
  key: string; // last drawn expression key — skip redraw when unchanged
}

const pool: Target[] = [];
const byBodyId = new Map<number, Target>();
const geo = new THREE.PlaneGeometry(1, 1);

function pickRandom<T>(arr: readonly T[]): T {
  return arr[(Math.random() * arr.length) | 0]!;
}

/** Draw the critter into its canvas (ported from the reference drawTarget). */
function drawCharacter(t: Target, dirX: number, dirY: number, scared: boolean, blink: boolean): void {
  const ctx = t.canvas.getContext('2d')!;
  ctx.clearRect(0, 0, S, S);
  const body = t.color;
  const dark = darken(body, 0.24);
  const light = lighten(body, 0.2);
  ctx.save();
  ctx.translate(S / 2, S / 2);

  // offset paper shadow
  ctx.fillStyle = 'rgba(70,45,30,0.20)';
  ctx.beginPath();
  ctx.arc(R * 0.096, R * 0.27, R, 0, 7);
  ctx.fill();

  // type features (behind the body)
  if (t.type === 'sprout') {
    ctx.fillStyle = dark;
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(s * R * 0.46, -R * 0.82);
      ctx.rotate(s * 0.5);
      ctx.beginPath();
      ctx.ellipse(0, 0, R * 0.26, R * 0.52, 0, 0, 7);
      ctx.fill();
      ctx.restore();
    }
  } else if (t.type === 'bug') {
    ctx.strokeStyle = dark;
    ctx.lineWidth = R * 0.1;
    ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * R * 0.28, -R * 0.7);
      ctx.quadraticCurveTo(s * R * 0.7, -R * 1.2, s * R * 0.46, -R * 1.42);
      ctx.stroke();
      ctx.fillStyle = theme.ball;
      ctx.beginPath();
      ctx.arc(s * R * 0.46, -R * 1.46, R * 0.13, 0, 7);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = light;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * R * 0.3, -R * 0.82);
      ctx.lineTo(s * R * 0.64, -R * 1.24);
      ctx.lineTo(s * R * 0.66, -R * 0.66);
      ctx.closePath();
      ctx.fill();
    }
  }

  // body + soft highlight
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, 7);
  ctx.fill();
  ctx.fillStyle = light;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.ellipse(-R * 0.28, -R * 0.3, R * 0.3, R * 0.22, 0, 0, 7);
  ctx.fill();
  ctx.globalAlpha = 1;

  // expression (face preset, overridden when scared)
  const f = FACES[t.face % FACES.length]!;
  let eye = f.eye;
  let brow = f.brow;
  let mouth = f.mouth;
  if (scared) {
    eye = 'wide';
    brow = 'worried';
    mouth = 'oBig';
  }
  const eyeY = -R * 0.06;
  const eyeX = R * 0.34;

  for (const s of [-1, 1]) {
    if (eye === 'happy') {
      ctx.strokeStyle = dark;
      ctx.lineWidth = R * 0.09;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(s * eyeX - R * 0.17, eyeY + R * 0.06);
      ctx.lineTo(s * eyeX, eyeY - R * 0.12);
      ctx.lineTo(s * eyeX + R * 0.17, eyeY + R * 0.06);
      ctx.stroke();
      continue;
    }
    const eR = (eye === 'wide' ? 0.36 : 0.3) * R;
    ctx.fillStyle = '#fff7ec';
    ctx.beginPath();
    ctx.arc(s * eyeX, eyeY, eR, 0, 7);
    ctx.fill();
    if (blink) {
      ctx.strokeStyle = dark;
      ctx.lineWidth = R * 0.08;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(s * eyeX - eR * 0.7, eyeY);
      ctx.lineTo(s * eyeX + eR * 0.7, eyeY);
      ctx.stroke();
      continue;
    }
    const pr = (eye === 'wide' ? 0.42 : 0.5) * eR;
    const ox = dirX * eR * 0.4;
    const oy = eye === 'sleepy' ? eR * 0.28 : dirY * eR * 0.4;
    ctx.fillStyle = '#2a2030';
    ctx.beginPath();
    ctx.arc(s * eyeX + ox, eyeY + oy, pr, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(s * eyeX + ox - pr * 0.32, eyeY + oy - pr * 0.32, pr * 0.34, 0, 7);
    ctx.fill();
    if (eye === 'sleepy') {
      ctx.fillStyle = body;
      ctx.fillRect(s * eyeX - eR - 1, eyeY - eR - 1, eR * 2 + 2, eR * 0.85);
      ctx.strokeStyle = dark;
      ctx.lineWidth = R * 0.05;
      ctx.beginPath();
      ctx.moveTo(s * eyeX - eR * 0.8, eyeY - eR * 0.15);
      ctx.lineTo(s * eyeX + eR * 0.8, eyeY - eR * 0.15);
      ctx.stroke();
    }
  }

  if (brow !== 'none') {
    ctx.strokeStyle = dark;
    ctx.lineWidth = R * 0.1;
    ctx.lineCap = 'round';
    const eR = 0.3 * R;
    const by = -R * 0.5;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      if (brow === 'angry') {
        ctx.moveTo(s * eyeX - eR * 0.7, by - R * 0.04);
        ctx.lineTo(s * eyeX + eR * 0.55, by + R * 0.18);
      } else if (brow === 'worried') {
        ctx.moveTo(s * eyeX - eR * 0.6, by + R * 0.12);
        ctx.lineTo(s * eyeX + eR * 0.6, by - R * 0.02);
      } else if (brow === 'raise') {
        ctx.moveTo(s * eyeX - eR * 0.6, by + R * 0.04);
        ctx.lineTo(s * eyeX + eR * 0.6, by - R * 0.06);
      } else {
        ctx.moveTo(s * eyeX - eR * 0.6, by);
        ctx.lineTo(s * eyeX + eR * 0.6, by + R * 0.02);
      }
      ctx.stroke();
    }
  }

  const my = R * 0.44;
  ctx.strokeStyle = dark;
  ctx.lineWidth = R * 0.09;
  ctx.lineCap = 'round';
  if (mouth === 'oBig') {
    ctx.fillStyle = '#3a2030';
    ctx.beginPath();
    ctx.ellipse(0, my, R * 0.16, R * 0.21, 0, 0, 7);
    ctx.fill();
  } else if (mouth === 'o') {
    ctx.fillStyle = '#3a2030';
    ctx.beginPath();
    ctx.ellipse(0, my, R * 0.1, R * 0.13, 0, 0, 7);
    ctx.fill();
  } else if (mouth === 'grin') {
    ctx.fillStyle = '#3a2030';
    ctx.beginPath();
    ctx.moveTo(-R * 0.24, my - R * 0.02);
    ctx.quadraticCurveTo(0, my + R * 0.24, R * 0.24, my - R * 0.02);
    ctx.closePath();
    ctx.fill();
  } else if (mouth === 'fangs') {
    ctx.beginPath();
    ctx.moveTo(-R * 0.3, my);
    ctx.quadraticCurveTo(0, my + R * 0.2, R * 0.3, my);
    ctx.stroke();
    ctx.fillStyle = '#fff7ec';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * R * 0.17, my + R * 0.02);
      ctx.lineTo(s * R * 0.23, my + R * 0.17);
      ctx.lineTo(s * R * 0.09, my + R * 0.11);
      ctx.closePath();
      ctx.fill();
    }
  } else if (mouth === 'smirk') {
    ctx.beginPath();
    ctx.moveTo(-R * 0.16, my + R * 0.02);
    ctx.quadraticCurveTo(R * 0.05, my + R * 0.12, R * 0.22, my - R * 0.06);
    ctx.stroke();
  } else if (mouth === 'wavy') {
    ctx.beginPath();
    ctx.moveTo(-R * 0.2, my);
    ctx.quadraticCurveTo(-R * 0.07, my - R * 0.08, 0, my);
    ctx.quadraticCurveTo(R * 0.07, my + R * 0.08, R * 0.2, my);
    ctx.stroke();
  } else if (mouth === 'flat') {
    ctx.beginPath();
    ctx.moveTo(-R * 0.15, my);
    ctx.lineTo(R * 0.15, my);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(0, my - R * 0.05, R * 0.17, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }

  ctx.restore();
  t.tex.needsUpdate = true;
}

export function init(scene: THREE.Scene): void {
  for (let i = 0; i < C.TARGET_POOL; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = S;
    canvas.height = S;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.set(PLANE, PLANE, 1);
    mesh.position.z = 0.25;
    mesh.visible = false;
    scene.add(mesh);
    pool.push({ alive: false, body: null, mesh, canvas, tex, type: 'sprout', color: '#1aa18f', face: 0, blink: 0, key: '' });
  }
}

export function setTheme(next: C.Theme): void {
  theme = next; // only the bug's antenna tip uses theme.ball; force a redraw
  for (const t of pool) t.key = '';
}

export function spawnFromDescs(descs: TargetDesc[]): void {
  for (const desc of descs) {
    const target = pool.find((t) => !t.alive);
    if (!target) break;
    const body = Bodies.circle(desc.x, desc.y, C.TARGET_RADIUS, {
      label: 'target',
      friction: 0.6,
      restitution: 0.1,
    });
    target.alive = true;
    target.body = body;
    target.type = pickRandom(C.ENEMY_TYPES);
    target.color = pickRandom(C.ENEMY_COLORS);
    target.face = (Math.random() * FACES.length) | 0;
    target.blink = Math.random() * 3.4;
    target.key = '';
    target.mesh.position.set(desc.x, desc.y, 0.25);
    target.mesh.scale.set(PLANE, PLANE, 1);
    target.mesh.rotation.z = 0;
    target.mesh.visible = true;
    drawCharacter(target, 0, 1, false, false);
    byBodyId.set(body.id, target);
    physics.addBody(body, target.mesh);
  }
}

export function fromBody(body: Matter.Body): Target | undefined {
  return byBodyId.get(body.id);
}

export function kill(target: Target): void {
  if (!target.alive) return;
  target.alive = false;
  target.mesh.visible = false;
  if (target.body) {
    byBodyId.delete(target.body.id);
    physics.removeBody(target.body);
    target.body = null;
  }
}

export function aliveCount(): number {
  let n = 0;
  for (const target of pool) if (target.alive) n += 1;
  return n;
}

export function alive(): readonly Target[] {
  return pool; // callers filter on .alive — avoids allocating a new array
}

export function reset(): void {
  for (const target of pool) kill(target);
}

/**
 * Per-frame: keep the critter upright + pulse, point its eyes at the look target,
 * and redraw the face only when the expression state actually changes.
 * `lookX/lookY` is the ball while flying, else the loaded pouch; `lookActive` is
 * true only while the ball is in flight.
 */
export function update(elapsed: number, lookX: number, lookY: number, lookActive: boolean): void {
  for (const t of pool) {
    if (!t.alive || !t.body) continue;
    const { x, y } = t.body.position;
    // pulse + upright (override the physics angle so the face stays readable)
    const s = PLANE * (1 + C.TARGET_PULSE_AMP * Math.sin(elapsed * C.TARGET_PULSE_HZ * Math.PI * 2 + t.blink));
    t.mesh.scale.set(s, s, 1);
    t.mesh.rotation.z = 0;

    // look direction in screen space (world y-up → canvas y-down)
    let dx = lookX - x;
    let dy = -(lookY - y);
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl;
    dy /= dl;
    const scared = lookActive && Math.hypot(lookX - x, lookY - y) < C.ENEMY_SCARE_DIST;
    const blink = (elapsed * 0.6 + t.blink) % 3.4 < 0.12;

    // redraw only when the expression actually changes (quantise the gaze)
    const key = `${Math.round(dx * 6)},${Math.round(dy * 6)},${scared ? 1 : 0},${blink ? 1 : 0}`;
    if (key !== t.key) {
      t.key = key;
      drawCharacter(t, dx, dy, scared, blink);
    }
  }
}
