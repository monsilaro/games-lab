// The central fire — the showpiece. A little stack of logs with emissive flame
// cones that breathe. The warm PointLight that actually lights the camp lives in
// the scene rig (scene.ts) and is pulsed by the clock; this is just the visual,
// kept emissive so the flames glow on their own against the night.
import * as THREE from 'three';
import { PALETTE, LIGHTS } from './config';

export interface Fire {
  group: THREE.Group;
  update(t: number): void;
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
  const bed = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), emissive(PALETTE.fire, 0.7));
  bed.position.y = 0.16;
  bed.scale.y = 0.45;
  group.add(bed);

  // --- Flames: nested cones, brightest at the core ---
  const outer = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.5, 7), emissive(PALETTE.fire, 0.9, 0.92));
  outer.position.y = 0.95;
  group.add(outer);

  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.1, 7), emissive(PALETTE.fireHot, 1.1, 0.95));
  inner.position.y = 0.85;
  group.add(inner);

  const core = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.7, 6), emissive(0xffffff, 1.2));
  core.position.y = 0.7;
  group.add(core);

  const f = LIGHTS.fire;
  return {
    group,
    update(t: number) {
      // Breathing flicker — two out-of-phase sines so it never looks periodic.
      const a = Math.sin(t * Math.PI * 2 * f.flickerHz) * 0.5;
      const b = Math.sin(t * Math.PI * 2 * f.flickerHz * 0.37 + 1.3) * 0.5;
      const s = 1 + (a + b) * f.flickerAmp;
      outer.scale.set(1 + b * 0.06, s, 1 + b * 0.06);
      inner.scale.set(1, 1 + a * f.flickerAmp * 1.4, 1);
      core.scale.y = 1 + a * 0.2;
      outer.rotation.y = t * 0.6;
      inner.rotation.y = -t * 0.9;
    },
  };
}
