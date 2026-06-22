// Boulon — Phase 1: the playable twin-stick core. Wires the systems together:
// scene + physics + twin-stick input + hero + bolts + training targets.
//
// Coordinate note: the sim is the matter FLOOR plane. Screen-up maps to matter
// −y (away from the tilted camera), screen-right to matter +x. Every input
// vector is converted once, here, before it reaches an entity.

import * as THREE from 'three';
import { startGameLoop } from '@games-lab/shared';
import * as C from './config';
import * as physics from './physics';
import { setupScene } from './scene';
import { TwinStick } from './input';
import { Player } from './player';
import { Projectiles } from './projectiles';
import { Targets } from './targets';
import { Hud } from './hud';

declare const __BUILD_INFO__: string;

const app = setupScene();
const input = new TwinStick();
const player = new Player(app.scene);
const projectiles = new Projectiles(app.scene);
const targets = new Targets(app.scene);
const hud = new Hud(__BUILD_INFO__);

// Collisions fire mid-step; queue the outcomes and resolve them after the
// physics step so we never mutate the world while matter is iterating pairs.
const pendingHits: Array<{ proj: number; target: number }> = [];
physics.setImpactHandler((a, b) => {
  const proj = a.label === 'projectile' ? a : b.label === 'projectile' ? b : null;
  if (!proj) return;
  const other = proj === a ? b : a;
  if (other.label === 'target') pendingHits.push({ proj: proj.id, target: other.id });
  else if (other.label === 'wall') pendingHits.push({ proj: proj.id, target: 0 });
});

function resolveHits(): void {
  for (const hit of pendingHits) {
    if (hit.target !== 0) {
      const killed = targets.hitByBody(hit.target, C.WEAPON.damage);
      if (killed) hud.addKill();
    }
    projectiles.despawnByBody(hit.proj);
  }
  pendingHits.length = 0;
}

// Resolve the desktop mouse cursor into a matter aim direction relative to the
// hero's projected screen position. Z is foreshortened by the camera tilt, so
// undo depthFactor to keep the aim angle honest.
const projected = new THREE.Vector3();
function mouseAim(): { x: number; y: number } {
  projected.set(player.body.position.x, 0.9, player.body.position.y).project(app.camera);
  const sx = (projected.x * 0.5 + 0.5) * window.innerWidth;
  const sy = (-projected.y * 0.5 + 0.5) * window.innerHeight;
  return { x: input.mouseX - sx, y: (input.mouseY - sy) / C.CAMERA.depthFactor };
}

targets.spawnWave(player.body.position.x, player.body.position.y);

startGameLoop((dt) => {
  // --- Move (left stick / WASD): screen-up → matter −y ---
  const move = input.move;
  player.move(move.x, -move.y);

  // --- Aim + fire (right stick / mouse) ---
  let firing = false;
  if (input.aimActive) {
    const a = input.aim;
    player.aimTo(a.x, -a.y);
    firing = true;
  } else if (input.mouseMode && input.mouseDown) {
    const a = mouseAim();
    player.aimTo(a.x, a.y);
    firing = true;
  }
  if (firing) {
    const m = player.muzzle;
    projectiles.fire(m.x, m.y, m.dirX, m.dirY);
  }

  projectiles.tick(dt);
  if (targets.aliveCount === 0) {
    targets.spawnWave(player.body.position.x, player.body.position.y);
  }

  physics.stepPhysics(dt);
  resolveHits();
  physics.syncMeshes();
  player.syncMesh();
  app.renderer.render(app.scene, app.camera);
}, C.MAX_DT);
