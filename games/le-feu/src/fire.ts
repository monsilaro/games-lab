// The central fire — the showpiece. A little stack of logs with emissive flame
// cones that breathe, a warm glow disc pooling on the snow, and a stream of
// rising embers. The warm PointLight that actually lights the camp lives in the
// scene rig (scene.ts) and is pulsed by the clock; this is just the visual, kept
// emissive so the flames glow on their own against the night.
import * as THREE from 'three';
import { PALETTE, LIGHTS, FIRE_FX } from './config';

export interface Fire {
  group: THREE.Group;
  /**
   * t = free-running real seconds (flicker), dt = real delta (ember motion),
   * strength = fuel 0..1, radius = the protective light ring radius (world units,
   * so the glow disc visually matches where shades are held back).
   */
  update(t: number, dt: number, strength: number, radius: number): void;
}

function emissive(color: number, intensity: number, opacity = 1): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ color, flatShading: true, emissive: color });
  m.emissiveIntensity = intensity;
  if (opacity < 1) {
    m.transparent = true;
    m.opacity = opacity;
  }
  return m;
}

export function createFire(): Fire {
  const group = new THREE.Group();

  // --- Warm glow disc pooling on the ground around the hearth ---
  const glowMat = new THREE.MeshBasicMaterial({
    color: PALETTE.fire,
    transparent: true,
    opacity: FIRE_FX.glowIntensity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const glow = new THREE.Mesh(new THREE.CircleGeometry(FIRE_FX.glowRadius, 28), glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.03;
  glow.renderOrder = 1;
  group.add(glow);

  // --- Logs: crossed cylinders laid flat in a small star ---
  const logMat = new THREE.MeshLambertMaterial({ color: PALETTE.wood, flatShading: true });
  const logGeo = new THREE.CylinderGeometry(0.12, 0.14, 1.3, 6);
  for (let i = 0; i < 4; i++) {
    const log = new THREE.Mesh(logGeo, logMat);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = (i / 4) * Math.PI;
    log.position.y = 0.14 + (i % 2) * 0.06;
    group.add(log);
  }

  // --- Ember bed ---
  const bed = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), emissive(PALETTE.fire, 0.9));
  bed.position.y = 0.16;
  bed.scale.y = 0.45;
  group.add(bed);

  // --- Flames: nested cones, brightest at the core (emissive bumped so they
  // read vividly against the now-darker night sky) ---
  const outer = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.5, 7), emissive(PALETTE.fire, 1.2, 0.92));
  outer.position.y = 0.95;
  group.add(outer);

  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.1, 7), emissive(PALETTE.fireHot, 1.4, 0.95));
  inner.position.y = 0.85;
  group.add(inner);

  const core = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.7, 6), emissive(0xffffff, 1.5));
  core.position.y = 0.7;
  group.add(core);

  // --- Rising embers: ONE Points system, fixed pool, one upload per frame ---
  const N = FIRE_FX.emberCount;
  const positions = new Float32Array(N * 3);
  const colors = new Float32Array(N * 3);
  // Parallel JS state (never per-particle objects).
  const vy = new Float32Array(N);
  const phase = new Float32Array(N);
  const freq = new Float32Array(N);
  const life = new Float32Array(N);
  const maxLife = new Float32Array(N);
  const hot = new THREE.Color(PALETTE.fireHot);

  const respawn = (i: number, prewarm: boolean): void => {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * FIRE_FX.emberSpawnR;
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = 0.2 + (prewarm ? Math.random() * 1.5 : 0);
    positions[i * 3 + 2] = Math.sin(a) * r;
    vy[i] = FIRE_FX.emberRise * (0.7 + Math.random() * 0.6);
    phase[i] = Math.random() * Math.PI * 2;
    freq[i] = 2 + Math.random() * 3;
    const lf = FIRE_FX.emberLifeMin + Math.random() * (FIRE_FX.emberLifeMax - FIRE_FX.emberLifeMin);
    life[i] = prewarm ? Math.random() * lf : lf;
    maxLife[i] = lf;
  };
  for (let i = 0; i < N; i++) respawn(i, true);

  const emberGeo = new THREE.BufferGeometry();
  emberGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  emberGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const emberMat = new THREE.PointsMaterial({
    size: FIRE_FX.emberSize,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const embers = new THREE.Points(emberGeo, emberMat);
  group.add(embers);

  const f = LIGHTS.fire;
  return {
    group,
    update(t: number, dt: number, strength: number, radius: number) {
      // Breathing flicker — two out-of-phase sines so it never looks periodic.
      const a = Math.sin(t * Math.PI * 2 * f.flickerHz) * 0.5;
      const b = Math.sin(t * Math.PI * 2 * f.flickerHz * 0.37 + 1.3) * 0.5;
      const s = 1 + (a + b) * f.flickerAmp;
      // Flames shrink as the fire weakens (low fuel = a guttering flame).
      const fs = 0.4 + 0.6 * strength;
      outer.scale.set((1 + b * 0.06) * fs, s * fs, (1 + b * 0.06) * fs);
      inner.scale.set(fs, (1 + a * f.flickerAmp * 1.4) * fs, fs);
      core.scale.set(fs, (1 + a * 0.2) * fs, fs);
      outer.rotation.y = t * 0.6;
      inner.rotation.y = -t * 0.9;
      // Glow disc spans the protective ring so the lit ground = where shades stop.
      glow.scale.setScalar(radius / FIRE_FX.glowRadius);
      glowMat.opacity = FIRE_FX.glowIntensity * (0.5 + 0.5 * strength) * (1 + (a + b) * 0.5);

      // Embers: rise, curl, fade (additive → dimming colour reads as a fade-out).
      const emberK = 0.35 + 0.65 * strength; // fewer/dimmer embers when weak
      const d = Math.min(dt, 0.05); // clamp so a stalled tab doesn't teleport them
      for (let i = 0; i < N; i++) {
        let lf = life[i]! - d;
        if (lf <= 0) {
          respawn(i, false);
          lf = life[i]!;
        }
        life[i] = lf;
        const o = i * 3;
        const ph = t * freq[i]! + phase[i]!;
        positions[o + 1] = positions[o + 1]! + vy[i]! * d;
        positions[o] = positions[o]! + Math.sin(ph) * FIRE_FX.emberDrift * d;
        positions[o + 2] = positions[o + 2]! + Math.cos(ph) * FIRE_FX.emberDrift * d;
        const k = Math.max(0, lf / maxLife[i]!) * emberK;
        colors[o] = hot.r * k;
        colors[o + 1] = hot.g * k;
        colors[o + 2] = hot.b * k;
      }
      (emberGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (emberGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    },
  };
}
