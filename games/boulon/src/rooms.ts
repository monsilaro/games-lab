// Room generator + lifecycle. A room is a bounded chamber stacked along matter
// −y: solid free-standing pillars (the "existing walls" the crusher can pin you
// against), a closed top gate (removed on clear), plus deterministic spots for
// the static enemies and the two pickups. One room is built/disposed at a time.

import * as THREE from 'three';
import Matter from 'matter-js';
import * as C from './config';
import { addBody, CAT, removeBody } from './physics';

const { Bodies } = Matter;

export interface Spot {
  x: number;
  y: number;
}
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Solid {
  body: Matter.Body;
  mesh: THREE.Mesh;
}

export interface Room {
  index: number;
  bottomY: number;
  topY: number;
  centerY: number;
  enemySpots: Spot[];
  easySpot: Spot;
  hardSpot: Spot;
  pillars: Rect[];
  gateOpen: boolean;
  openGate(): void;
  dispose(): void;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSolid(scene: THREE.Scene, r: Rect, color: number, height: number): Solid {
  const body = Bodies.rectangle(r.x, r.y, r.w, r.h, {
    isStatic: true,
    label: 'wall',
    collisionFilter: { category: CAT.wall, mask: CAT.player | CAT.projectile },
  });
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(r.w, height, r.h),
    new THREE.MeshLambertMaterial({ color, flatShading: true }),
  );
  mesh.position.set(r.x, height / 2, r.y);
  scene.add(mesh);
  addBody(body);
  return { body, mesh };
}

function disposeSolid(scene: THREE.Scene, s: Solid): void {
  removeBody(s.body);
  scene.remove(s.mesh);
  s.mesh.geometry.dispose();
  (s.mesh.material as THREE.Material).dispose();
}

export function buildRoom(scene: THREE.Scene, index: number): Room {
  const rng = mulberry32((index * 0x9e3779b1) >>> 0);
  const bottomY = -index * C.ROOM.height;
  const topY = bottomY - C.ROOM.height;
  const centerY = (bottomY + topY) / 2;

  // --- Pillars (free-standing solid blocks; always leave a side gap) --------
  const pillarCount = Math.min(3, 1 + Math.floor(index / 2));
  const pillars: Rect[] = [];
  const solids: Solid[] = [];
  for (let i = 0; i < pillarCount; i++) {
    const w = 4 + rng() * 4; // 4..8 wide (lane is 16) → always a gap
    const h = 2 + rng() * 1.5;
    const side = i % 2 === 0 ? -1 : 1; // hug alternating sides
    const x = side * (C.LANE_HALF - w / 2 - 0.4 - rng() * 1.5);
    // Spread blocks across the room height, away from gate + entrance.
    const frac = (i + 1) / (pillarCount + 1);
    const y = topY + C.ROOM.height * (0.25 + 0.5 * frac) + (rng() - 0.5) * 3;
    const rect = { x, y, w, h };
    pillars.push(rect);
    solids.push(makeSolid(scene, rect, C.PALETTE.pillar, C.ROOM.wallTop));
  }

  // --- Top gate (full width; removed on clear) -----------------------------
  const gateRect: Rect = { x: 0, y: topY + 0.6, w: C.LANE_HALF * 2, h: 1.0 };
  const gate = makeSolid(scene, gateRect, C.PALETTE.gate, C.ROOM.wallTop + 0.6);

  // --- Enemy spots ----------------------------------------------------------
  const count = Math.min(C.ENEMY.maxCount, Math.round(C.ENEMY.baseCount + index * C.ENEMY.perRoomCount));
  const xLo = -(C.LANE_HALF - C.ENEMY.placeMargin);
  const xHi = C.LANE_HALF - C.ENEMY.placeMargin;
  const yTop = topY + C.ENEMY.placeMargin + 1.0;
  const yBot = bottomY - C.ENEMY.placeMargin * 1.6;
  const enemySpots: Spot[] = [];
  let tries = 0;
  while (enemySpots.length < count && tries < 400) {
    tries++;
    const x = xLo + rng() * (xHi - xLo);
    const y = yTop + rng() * (yBot - yTop);
    if (hitsPillar(pillars, x, y, C.ENEMY.radius + 0.6)) continue;
    let ok = true;
    for (const s of enemySpots) {
      if (Math.hypot(s.x - x, s.y - y) < C.ENEMY.minSpacing) {
        ok = false;
        break;
      }
    }
    if (ok) enemySpots.push({ x, y });
  }

  // --- Item spots: easy near the entrance, hard high near a corner ---------
  const easySpot: Spot = { x: (rng() - 0.5) * 4, y: bottomY - C.ROOM.height * 0.16 };
  const hardSide = rng() < 0.5 ? -1 : 1;
  const hardSpot: Spot = { x: hardSide * (C.LANE_HALF - 1.6), y: topY + 2.6 };

  let gateOpen = false;
  return {
    index,
    bottomY,
    topY,
    centerY,
    enemySpots,
    easySpot,
    hardSpot,
    pillars,
    get gateOpen() {
      return gateOpen;
    },
    openGate() {
      if (gateOpen) return;
      gateOpen = true;
      disposeSolid(scene, gate);
    },
    dispose() {
      if (!gateOpen) disposeSolid(scene, gate);
      for (const s of solids) disposeSolid(scene, s);
    },
  };
}

function hitsPillar(pillars: Rect[], x: number, y: number, pad: number): boolean {
  for (const p of pillars) {
    if (Math.abs(x - p.x) < p.w / 2 + pad && Math.abs(y - p.y) < p.h / 2 + pad) return true;
  }
  return false;
}
