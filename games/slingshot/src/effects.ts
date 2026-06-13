// Papercraft background + juice: a warm gradient sky, a paper sun/moon, drifting
// paper clouds, parallax felt hills, the matte ground, optional night stars, and
// flat paper-confetti bursts. Plus the decaying screen-shake offset (kept as-is).
//
// The background fills whatever the camera frames — `setView()` is fed the live
// view rectangle from main's `frameView()` so the sky/sun/clouds track portrait
// zoom-out. Hills + ground are pinned to the ground line (y = 0) and stay put.

import * as THREE from 'three';
import * as C from './config';

let theme: C.Theme = C.THEMES.day;
let inited = false;
let clock = 0;

// live view rectangle (world units): centre + half-extents, set by main
const view = { cx: C.MIN_VIEW_WIDTH / 2 - 1, cy: 6, halfW: 12, halfH: 7 };
const FIELD_X = C.MIN_VIEW_WIDTH / 2 - 1; // playfield centre x (hills/ground)

// --- sky -------------------------------------------------------------------------
const skyCanvas = document.createElement('canvas');
skyCanvas.width = 4;
skyCanvas.height = 256;
const skyTex = new THREE.CanvasTexture(skyCanvas);
const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, depthWrite: false });
const sky = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), skyMat);
sky.position.z = -3;

function drawSky(): void {
  const c = skyCanvas.getContext('2d')!;
  const g = c.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, theme.skyTop);
  g.addColorStop(1, theme.skyBot);
  c.fillStyle = g;
  c.fillRect(0, 0, 4, 256);
  skyTex.needsUpdate = true;
}

// --- sun / moon ------------------------------------------------------------------
const SUN_R = 1.7;
const sunDiscMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false });
const sunRingMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false });
const sun = new THREE.Group();
{
  const disc = new THREE.Mesh(new THREE.CircleGeometry(SUN_R, 40), sunDiscMat);
  const ring = new THREE.Mesh(new THREE.RingGeometry(SUN_R * 1.08, SUN_R * 1.26, 44), sunRingMat);
  ring.position.z = -0.01;
  sun.add(ring, disc);
  sun.position.z = -1;
}

// --- clouds ----------------------------------------------------------------------
const cloudCanvas = document.createElement('canvas');
cloudCanvas.width = 256;
cloudCanvas.height = 140;
const cloudTex = new THREE.CanvasTexture(cloudCanvas);
const CLOUDS = [
  { x: 0, speed: 0.7, yFrac: 0.16, size: 1.0 },
  { x: 0, speed: 0.45, yFrac: 0.3, size: 0.7 },
  { x: 0, speed: 0.9, yFrac: 0.24, size: 0.85 },
];
const cloudMeshes: THREE.Mesh[] = CLOUDS.map((cl) => {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 3.3),
    new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false }),
  );
  m.scale.set(cl.size, cl.size, 1);
  m.position.z = -1;
  return m;
});

function drawClouds(): void {
  const c = cloudCanvas.getContext('2d')!;
  c.clearRect(0, 0, 256, 140);
  const cx = 128;
  const cy = 64;
  const ell = (dx: number, dy: number, rx: number, ry: number): void => {
    c.beginPath();
    c.ellipse(cx + dx, cy + dy, rx, ry, 0, 0, Math.PI * 2);
    c.fill();
  };
  // one soft offset shadow blob behind, then the cloud cluster
  c.fillStyle = 'rgba(70,45,30,0.12)';
  ell(6, 16, 88, 40);
  c.fillStyle = theme.cloud;
  ell(0, 0, 84, 40);
  ell(60, 12, 54, 32);
  ell(-58, 12, 46, 27);
  ell(10, -16, 46, 32);
  cloudTex.needsUpdate = true;
}

// --- parallax hills + ground -----------------------------------------------------
function hillShape(topY: number, amp: number, wl: number): THREE.Shape {
  const s = new THREE.Shape();
  const left = -34;
  const right = 34;
  const bottom = -26;
  s.moveTo(left, bottom);
  for (let x = left; x <= right; x += 1) s.lineTo(x, topY + Math.sin(x / wl) * amp);
  s.lineTo(right, bottom);
  s.closePath();
  return s;
}
const hillBackMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false });
const hillMidMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false });
const hillBack = new THREE.Mesh(new THREE.ShapeGeometry(hillShape(2.6, 0.5, 5)), hillBackMat);
const hillMid = new THREE.Mesh(new THREE.ShapeGeometry(hillShape(1.3, 0.42, 4)), hillMidMat);
hillBack.position.set(FIELD_X, 0, -2.3);
hillMid.position.set(FIELD_X, 0, -2.1);

const groundFillMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false });
const groundEdgeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false });
const groundFill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), groundFillMat);
groundFill.scale.set(68, 26, 1);
groundFill.position.set(FIELD_X, C.GROUND_Y - 13, -1.6);
const groundEdge = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), groundEdgeMat);
groundEdge.scale.set(68, 0.16, 1);
groundEdge.position.set(FIELD_X, C.GROUND_Y - 0.08, -1.5);

// --- night stars -----------------------------------------------------------------
let starMat: THREE.ShaderMaterial | null = null;
let starPoints: THREE.Points | null = null;
const STAR_VERT = `
  attribute float phase;
  uniform float uTime;
  varying float vAlpha;
  void main() {
    vAlpha = 0.35 + 0.45 * abs(sin(uTime * 1.4 + phase));
    gl_PointSize = 2.4;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const STAR_FRAG = `
  varying float vAlpha;
  void main() { gl_FragColor = vec4(0.992, 0.965, 0.890, clamp(vAlpha, 0.0, 1.0)); }
`;

// --- confetti --------------------------------------------------------------------
interface Bit {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  vx: number;
  vy: number;
  vr: number;
  life: number;
  max: number;
  dust: boolean; // pale low-gravity paper-dust puff vs a confetti bit
}
const bits: Bit[] = [];
const quadGeo = new THREE.PlaneGeometry(2, 1.4);
const triGeo = (() => {
  const s = new THREE.Shape();
  s.moveTo(0, 1);
  s.lineTo(1, -0.8);
  s.lineTo(-1, -0.8);
  s.closePath();
  return new THREE.ShapeGeometry(s);
})();
let dustTimer = 0;

function freeBit(): Bit | null {
  for (const b of bits) if (b.life <= 0) return b;
  return null;
}

// --- grain overlay (subtle paper tooth, multiplied over the whole scene) ----------
const grainCanvas = document.createElement('canvas');
grainCanvas.width = grainCanvas.height = 160;
{
  const gc = grainCanvas.getContext('2d')!;
  const img = gc.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 232 + Math.floor(Math.random() * 24); // near-white so multiply stays subtle
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  gc.putImageData(img, 0, 0);
}
const grainTex = new THREE.CanvasTexture(grainCanvas);
grainTex.wrapS = grainTex.wrapT = THREE.RepeatWrapping;
const grainMat = new THREE.MeshBasicMaterial({
  map: grainTex,
  transparent: true,
  blending: THREE.MultiplyBlending,
  depthWrite: false,
});
const grain = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), grainMat);
grain.position.z = 0.6;

/** Settings gate for the paper-grain overlay. */
export function setGrainEnabled(enabled: boolean): void {
  grain.visible = enabled;
}

// --- TNT flash (brief white disc that scales up + fades) --------------------------
const flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
const flashMesh = new THREE.Mesh(new THREE.CircleGeometry(1, 28), flashMat);
flashMesh.position.z = 0.5;
flashMesh.visible = false;
let flashLife = 0;
const FLASH_MAX = 0.32;

export function flash(x: number, y: number): void {
  flashMesh.position.set(x, y, 0.5);
  flashLife = FLASH_MAX;
  flashMesh.visible = true;
}

// --- screen shake ----------------------------------------------------------------
let shakeTime = 0;
let shakeEnabled = true;
export const shakeOffset = { x: 0, y: 0 };

/** Settings gate: when off, shake() is a no-op (offset stays zero). */
export function setShakeEnabled(enabled: boolean): void {
  shakeEnabled = enabled;
}

export function init(scene: THREE.Scene): void {
  scene.add(sky, hillBack, hillMid, groundFill, groundEdge, sun, ...cloudMeshes);
  scene.add(grain, flashMesh);

  // night stars: a wide field above the ground, each twinkling on its own phase
  const positions = new Float32Array(C.STAR_COUNT * 3);
  const phases = new Float32Array(C.STAR_COUNT);
  for (let i = 0; i < C.STAR_COUNT; i++) {
    positions[i * 3] = FIELD_X - 30 + Math.random() * 60;
    positions[i * 3 + 1] = 3 + Math.random() * 42;
    positions[i * 3 + 2] = -2.4; // behind moon + clouds
    phases[i] = Math.random() * Math.PI * 2;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  starGeo.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
  starMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    transparent: true,
    depthWrite: false,
  });
  starPoints = new THREE.Points(starGeo, starMat);
  starPoints.visible = false;
  scene.add(starPoints);

  for (let i = 0; i < C.CONFETTI_POOL; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(quadGeo, mat);
    mesh.visible = false;
    mesh.position.z = 0.4;
    scene.add(mesh);
    bits.push({ mesh, mat, vx: 0, vy: 0, vr: 0, life: 0, max: 1, dust: false });
  }

  inited = true;
  applyTheme();
  applyView();
}

/** Push a new mood: rebuild every paper texture + recolor every material. */
export function setTheme(next: C.Theme): void {
  theme = next;
  if (inited) applyTheme();
}

function applyTheme(): void {
  drawSky();
  drawClouds();
  sunDiscMat.color.set(theme.sun);
  sunRingMat.color.set(theme.sunRing);
  hillBackMat.color.set(theme.hillBack);
  hillMidMat.color.set(theme.hillMid);
  groundFillMat.color.set(theme.hillFront);
  groundEdgeMat.color.set(theme.groundEdge);
  if (starPoints) starPoints.visible = !!theme.stars;
}

/** Fit the sky/sun/clouds to the live camera rectangle (centre + half-extents). */
export function setView(cx: number, cy: number, halfW: number, halfH: number): void {
  view.cx = cx;
  view.cy = cy;
  view.halfW = halfW;
  view.halfH = halfH;
  if (inited) applyView();
}

function applyView(): void {
  const { cx, cy, halfW, halfH } = view;
  sky.scale.set(2 * halfW * 1.1, 2 * halfH * 1.1, 1);
  sky.position.set(cx, cy, -3);
  // sun parked ~17% from the left, ~20% down from the top
  sun.position.set(cx - halfW * 0.66, cy + halfH * 0.6, -1);
  // grain covers the whole view; tile the noise small for fine tooth
  grain.scale.set(2 * halfW * 1.1, 2 * halfH * 1.1, 1);
  grain.position.set(cx, cy, 0.6);
  grainTex.repeat.set((2 * halfW) / 6, (2 * halfH) / 6);
  grainTex.needsUpdate = true;
}

export function burst(x: number, y: number, _color: number, count: number): void {
  const palette = theme.confetti;
  let spawned = 0;
  for (const b of bits) {
    if (spawned >= count) break;
    if (b.life > 0) continue;
    const angle = Math.random() * Math.PI * 2;
    const speed = C.CONFETTI_SPEED * (0.4 + Math.random() * 0.8);
    b.vx = Math.cos(angle) * speed;
    b.vy = Math.sin(angle) * speed + 2.5; // upward bias — bits pop then fall
    b.vr = (Math.random() - 0.5) * 14;
    b.dust = false;
    b.max = C.CONFETTI_LIFE * (0.7 + Math.random() * 0.5);
    b.life = b.max;
    const size = C.CONFETTI_SIZE * (0.7 + Math.random() * 0.7);
    b.mat.color.set(palette[(Math.random() * palette.length) | 0]!);
    b.mesh.geometry = Math.random() < 0.45 ? triGeo : quadGeo;
    b.mesh.scale.set(size, size, 1);
    b.mesh.rotation.z = Math.random() * Math.PI * 2;
    b.mesh.position.set(x, y, 0.4);
    b.mesh.visible = true;
    spawned += 1;
  }
}

export function shake(): void {
  if (!shakeEnabled) return;
  shakeTime = C.SHAKE_DURATION;
}

/** Faint pale paper-dust puff trailing the flying ball, on a fixed interval. */
export function stampTrail(dt: number, x: number, y: number): void {
  dustTimer -= dt;
  if (dustTimer > 0) return;
  dustTimer = 0.05;
  const b = freeBit();
  if (!b) return;
  b.dust = true;
  b.vx = (Math.random() - 0.5) * 0.6;
  b.vy = 0.3 + Math.random() * 0.4;
  b.vr = (Math.random() - 0.5) * 2;
  b.max = 0.4 + Math.random() * 0.2;
  b.life = b.max;
  const size = 0.06 + Math.random() * 0.05;
  b.mat.color.set(theme.cloud);
  b.mesh.geometry = quadGeo;
  b.mesh.scale.set(size, size, 1);
  b.mesh.rotation.z = Math.random() * Math.PI * 2;
  b.mesh.position.set(x, y, 0.4);
  b.mesh.visible = true;
}

export function update(dt: number): void {
  clock += dt;

  // drifting clouds (wrap across the view) — slow horizontal scroll
  const { cx, cy, halfW, halfH } = view;
  const range = halfW + 8;
  for (let i = 0; i < CLOUDS.length; i++) {
    const cl = CLOUDS[i]!;
    cl.x += cl.speed * dt;
    if (cl.x > range) cl.x = -range;
    const m = cloudMeshes[i]!;
    m.position.set(cx + cl.x, cy + halfH * (1 - 2 * cl.yFrac), -1);
  }

  if (starMat) starMat.uniforms.uTime!.value = clock;

  for (const b of bits) {
    if (b.life <= 0) continue;
    b.life -= dt;
    if (b.life <= 0) {
      b.mesh.visible = false;
      continue;
    }
    b.vy -= (b.dust ? C.CONFETTI_GRAVITY * 0.12 : C.CONFETTI_GRAVITY) * dt;
    b.mesh.position.x += b.vx * dt;
    b.mesh.position.y += b.vy * dt;
    // confetti gets a soft ground bounce; dust just drifts and fades
    if (!b.dust && b.mesh.position.y < C.GROUND_Y + 0.05 && b.vy < 0) {
      b.mesh.position.y = C.GROUND_Y + 0.05;
      b.vy *= -0.35;
      b.vx *= 0.6;
      b.vr *= 0.6;
    }
    b.mesh.rotation.z += b.vr * dt;
    b.mat.opacity = b.dust
      ? Math.min(0.45, (b.life / b.max) * 0.6)
      : Math.min(1, (b.life / b.max) * 1.4);
  }

  if (flashLife > 0) {
    flashLife = Math.max(0, flashLife - dt);
    const k = flashLife / FLASH_MAX;
    const s = 1 + (1 - k) * 3.5;
    flashMesh.scale.set(s, s, 1);
    flashMat.opacity = k * 0.8;
    if (flashLife <= 0) flashMesh.visible = false;
  }

  if (shakeTime > 0) {
    shakeTime = Math.max(0, shakeTime - dt);
    const m = (shakeTime / C.SHAKE_DURATION) * C.SHAKE_MAGNITUDE;
    shakeOffset.x = (Math.random() - 0.5) * 2 * m;
    shakeOffset.y = (Math.random() - 0.5) * 2 * m;
  } else {
    shakeOffset.x = 0;
    shakeOffset.y = 0;
  }
}

export function reset(): void {
  for (const b of bits) {
    b.life = 0;
    b.mesh.visible = false;
  }
  shakeTime = 0;
  flashLife = 0;
  flashMesh.visible = false;
}
