// A villager: a small faceted figure (boxy body, tuque, a torch lit at night)
// plus the data the AI drives. Built locally rather than importing Veillée's
// forge — that part kit isn't promoted to shared yet, so per the repo's additive
// rule le-feu keeps its own trimmed factory and we promote later if a 2nd game
// wants it. Procedural walk: hip-pivoted legs swing, the body bobs.
import * as THREE from 'three';
import { PALETTE, VILLAGER, LIGHTS } from './../config';

export type VillagerState = 'wander' | 'pause' | 'toFire' | 'idleFire';

export interface Villager {
  x: number;
  z: number;
  tx: number; // target world x
  tz: number; // target world z
  state: VillagerState;
  pauseT: number; // seconds left to idle before next wander hop
  facing: number; // yaw (radians)
  moving: boolean;
  bobPhase: number; // per-villager phase offset so the crowd desyncs
  root: THREE.Group; // positioned + yawed by the sim
  body: THREE.Group; // inner group that bobs vertically
  legL: THREE.Group; // hip pivots
  legR: THREE.Group;
  torchLight: THREE.PointLight;
}

function lambert(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, flatShading: true });
}

export function createVillager(x: number, z: number, tuque: number, bobPhase: number): Villager {
  const root = new THREE.Group();
  root.position.set(x, 0, z);

  const body = new THREE.Group();
  root.add(body);

  // Legs on hip pivots (rotate about y≈0.4 so they swing from the hip).
  const legMat = lambert(PALETTE.woodDark);
  const legGeo = new THREE.BoxGeometry(0.16, 0.4, 0.18);
  function makeLeg(px: number): THREE.Group {
    const pivot = new THREE.Group();
    pivot.position.set(px, 0.4, 0);
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.y = -0.2;
    pivot.add(leg);
    body.add(pivot);
    return pivot;
  }
  const legL = makeLeg(-0.12);
  const legR = makeLeg(0.12);

  // Torso.
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.3), lambert(PALETTE.wood));
  torso.position.y = 0.4 + 0.275;
  body.add(torso);

  // Arms.
  const armMat = lambert(PALETTE.woodDark);
  const armGeo = new THREE.BoxGeometry(0.13, 0.5, 0.15);
  const armL = new THREE.Mesh(armGeo, armMat);
  armL.position.set(-0.3, 0.62, 0);
  body.add(armL);
  const armR = new THREE.Mesh(armGeo, armMat);
  armR.position.set(0.3, 0.62, 0.05);
  armR.rotation.x = -0.5; // raised to hold the torch forward
  body.add(armR);

  // Head + tuque.
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), lambert(PALETTE.skin));
  head.position.y = 1.12;
  body.add(head);
  const tuqueMesh = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.28, 6), lambert(tuque));
  tuqueMesh.position.y = 1.34;
  body.add(tuqueMesh);
  const pom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), lambert(PALETTE.snow));
  pom.position.y = 1.5;
  body.add(pom);

  // Torch: handle + emissive tip + a small point light (lit only at night).
  const torch = new THREE.Group();
  torch.position.set(0.34, 0.78, 0.22);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 5), lambert(PALETTE.woodDark));
  handle.rotation.z = 0.25;
  torch.add(handle);
  const tipMat = new THREE.MeshLambertMaterial({
    color: PALETTE.fireHot,
    flatShading: true,
    emissive: PALETTE.fireHot,
  });
  tipMat.emissiveIntensity = 1.2;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.26, 6), tipMat);
  tip.position.y = 0.32;
  torch.add(tip);
  const torchLight = new THREE.PointLight(LIGHTS.torch.color, 0, LIGHTS.torch.distance, LIGHTS.torch.decay);
  torchLight.position.y = 0.38;
  torch.add(torchLight);
  body.add(torch);

  root.scale.setScalar(VILLAGER.scale);

  return {
    x,
    z,
    tx: x,
    tz: z,
    state: 'pause',
    pauseT: 0,
    facing: 0,
    moving: false,
    bobPhase,
    root,
    body,
    legL,
    legR,
    torchLight,
  };
}

const lerp = THREE.MathUtils.lerp;

/**
 * Drive the procedural walk + torch from the villager's sim state. `moving` is
 * passed explicitly (rather than read off `v.moving`) so a paused sim freezes
 * the legs instead of moonwalking in place.
 */
export function updateVillagerVisual(v: Villager, t: number, dt: number, night: boolean, moving: boolean): void {
  v.root.position.x = v.x;
  v.root.position.z = v.z;
  // Smoothly turn toward facing.
  let d = v.facing - v.root.rotation.y;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  v.root.rotation.y += d * Math.min(1, dt * 10);

  if (moving) {
    const ph = t * VILLAGER.walkBobHz + v.bobPhase;
    const swing = Math.sin(ph) * 0.6;
    v.legL.rotation.x = swing;
    v.legR.rotation.x = -swing;
    v.body.position.y = Math.abs(Math.sin(ph)) * VILLAGER.walkBobAmp;
  } else {
    v.legL.rotation.x = lerp(v.legL.rotation.x, 0, Math.min(1, dt * 8));
    v.legR.rotation.x = lerp(v.legR.rotation.x, 0, Math.min(1, dt * 8));
    v.body.position.y = lerp(v.body.position.y, 0, Math.min(1, dt * 8));
  }

  const target = night ? LIGHTS.torch.intensity : 0;
  v.torchLight.intensity = lerp(v.torchLight.intensity, target, Math.min(1, dt * 4));
}
