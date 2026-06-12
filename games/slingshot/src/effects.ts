// Juice: pooled particle bursts, the ember trail behind the flying ball,
// the static star field, and a decaying screen shake offset.

import * as THREE from 'three';
import * as C from './config';

const particleGeo = new THREE.CircleGeometry(0.09, 8);

// --- living sky: drifting aurora ribbons + twinkling stars ----------------------
const auroraMats: THREE.ShaderMaterial[] = [];
let starMat: THREE.ShaderMaterial | null = null;
let skyTime = 0;

const AURORA_VERT = `
  uniform float uTime;
  uniform float uAmp;
  uniform float uPhase;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    float w = sin(p.x * 0.35 + uTime + uPhase) * 0.6
            + sin(p.x * 0.13 - uTime * 0.6 + uPhase) * 0.4;
    p.y += w * uAmp;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const AURORA_FRAG = `
  uniform vec3 uColor;
  uniform float uAlpha;
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    // brightest mid-band, fading to transparent at the top & bottom edges
    float v = smoothstep(0.0, 0.5, vUv.y) * smoothstep(1.0, 0.5, vUv.y);
    float shimmer = 0.7 + 0.3 * sin(vUv.x * 12.0 + uTime * 1.3);
    gl_FragColor = vec4(uColor, uAlpha * v * shimmer);
  }
`;
const STAR_VERT = `
  attribute float phase;
  uniform float uTime;
  uniform float uHz;
  varying float vAlpha;
  void main() {
    vAlpha = 0.4 + 0.3 * sin(uTime * uHz + phase);
    gl_PointSize = 2.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const STAR_FRAG = `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(uColor, clamp(vAlpha, 0.0, 1.0));
  }
`;

interface Particle {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  vx: number;
  vy: number;
  life: number;
}

const particles: Particle[] = [];

interface TrailStamp {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
}

const trail: TrailStamp[] = [];
let trailCursor = 0;
let trailTimer = 0;

let shakeTime = 0;
export const shakeOffset = { x: 0, y: 0 };

export function init(scene: THREE.Scene): void {
  for (let i = 0; i < C.PARTICLE_POOL; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });
    const mesh = new THREE.Mesh(particleGeo, mat);
    mesh.visible = false;
    mesh.position.z = 0.4;
    scene.add(mesh);
    particles.push({ mesh, mat, vx: 0, vy: 0, life: 0 });
  }

  const trailGeo = new THREE.CircleGeometry(C.BALL_RADIUS * 0.7, 12);
  for (let i = 0; i < C.TRAIL_LENGTH; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: C.PALETTE.trail,
      transparent: true,
      opacity: 0,
    });
    const mesh = new THREE.Mesh(trailGeo, mat);
    mesh.visible = false;
    mesh.position.z = 0.28;
    scene.add(mesh);
    trail.push({ mesh, mat, life: 0 });
  }

  // drifting aurora ribbons, far behind everything; each band's color slides
  // from green to violet and undulates on its own phase
  const width = C.MIN_VIEW_WIDTH + 6;
  const ribbonGeo = new THREE.PlaneGeometry(width, 3.2, 64, 1);
  const colA = new THREE.Color(C.PALETTE.auroraA);
  const colB = new THREE.Color(C.PALETTE.auroraB);
  for (let i = 0; i < C.AURORA_BANDS; i++) {
    const t = C.AURORA_BANDS > 1 ? i / (C.AURORA_BANDS - 1) : 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uAmp: { value: C.AURORA_WAVE_AMP * (0.7 + 0.3 * t) },
        uPhase: { value: i * 1.7 },
        uColor: { value: colA.clone().lerp(colB, t) },
        uAlpha: { value: C.AURORA_ALPHA * (1 - 0.25 * t) },
      },
      vertexShader: AURORA_VERT,
      fragmentShader: AURORA_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const ribbon = new THREE.Mesh(ribbonGeo, mat);
    ribbon.position.set(C.MIN_VIEW_WIDTH / 2 - 1, C.AURORA_BASE_Y + i * 2.2, -0.6);
    ribbon.frustumCulled = false;
    scene.add(ribbon);
    auroraMats.push(mat);
  }

  // stars in the night sky, each twinkling on its own phase (the portrait view
  // extends far above the playfield, so spread them generously upward)
  const positions = new Float32Array(C.STAR_COUNT * 3);
  const phases = new Float32Array(C.STAR_COUNT);
  for (let i = 0; i < C.STAR_COUNT; i++) {
    positions[i * 3] = -3 + Math.random() * (C.MIN_VIEW_WIDTH + 6);
    positions[i * 3 + 1] = 3 + Math.random() * 42;
    positions[i * 3 + 2] = -0.5;
    phases[i] = Math.random() * Math.PI * 2;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  starGeo.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
  starMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uHz: { value: C.STAR_TWINKLE_HZ * Math.PI * 2 },
      uColor: { value: new THREE.Color(C.PALETTE.star) },
    },
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    transparent: true,
    depthWrite: false,
  });
  scene.add(new THREE.Points(starGeo, starMat));
}

export function burst(x: number, y: number, color: number, count: number): void {
  let spawned = 0;
  for (const p of particles) {
    if (spawned >= count) break;
    if (p.life > 0) continue;
    const angle = Math.random() * Math.PI * 2;
    const speed = C.PARTICLE_SPEED * (0.4 + Math.random() * 0.6);
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed + 1.5; // slight upward bias reads better
    p.life = C.PARTICLE_LIFE;
    p.mat.color.setHex(color);
    p.mesh.position.x = x;
    p.mesh.position.y = y;
    p.mesh.visible = true;
    spawned += 1;
  }
}

export function shake(): void {
  shakeTime = C.SHAKE_DURATION;
}

/** While the ball flies, stamp a fading sprite at its position every interval. */
export function stampTrail(dt: number, x: number, y: number): void {
  trailTimer -= dt;
  if (trailTimer > 0) return;
  trailTimer = C.TRAIL_INTERVAL;
  const stamp = trail[trailCursor]!;
  trailCursor = (trailCursor + 1) % C.TRAIL_LENGTH;
  stamp.life = C.TRAIL_LIFE;
  stamp.mesh.position.x = x;
  stamp.mesh.position.y = y;
  stamp.mesh.visible = true;
}

export function update(dt: number): void {
  // living sky: advance the shared sky clock and feed it to the ribbon + star shaders
  skyTime += dt * C.AURORA_DRIFT;
  for (const mat of auroraMats) mat.uniforms.uTime!.value = skyTime;
  if (starMat) starMat.uniforms.uTime!.value = skyTime;

  for (const p of particles) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) {
      p.mesh.visible = false;
      continue;
    }
    p.vy -= C.GRAVITY * 0.4 * dt; // lighter than the world: embers drift
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mat.opacity = p.life / C.PARTICLE_LIFE;
  }

  for (const stamp of trail) {
    if (stamp.life <= 0) continue;
    stamp.life -= dt;
    if (stamp.life <= 0) {
      stamp.mesh.visible = false;
      continue;
    }
    stamp.mat.opacity = 0.55 * (stamp.life / C.TRAIL_LIFE);
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
  for (const p of particles) {
    p.life = 0;
    p.mesh.visible = false;
  }
  for (const stamp of trail) {
    stamp.life = 0;
    stamp.mesh.visible = false;
  }
  shakeTime = 0;
}
