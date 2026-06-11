// Juice: pooled particle bursts, the ember trail behind the flying ball,
// the static star field, and a decaying screen shake offset.

import * as THREE from 'three';
import * as C from './config';

const particleGeo = new THREE.CircleGeometry(0.09, 8);

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

  // static stars in the night sky (the portrait view extends far above the
  // playfield, so spread them generously upward)
  const positions = new Float32Array(C.STAR_COUNT * 3);
  for (let i = 0; i < C.STAR_COUNT; i++) {
    positions[i * 3] = -3 + Math.random() * (C.MIN_VIEW_WIDTH + 6);
    positions[i * 3 + 1] = 3 + Math.random() * 42;
    positions[i * 3 + 2] = -0.5;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  scene.add(
    new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        color: C.PALETTE.star,
        size: 2,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      }),
    ),
  );
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
