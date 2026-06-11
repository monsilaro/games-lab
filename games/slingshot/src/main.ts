import * as THREE from 'three';
import Matter from 'matter-js';
import { createOrthoApp, startGameLoop } from '@games-lab/shared';
import * as C from './config';
import * as physics from './physics';
import * as blocks from './blocks';
import * as targets from './targets';
import type { Target } from './targets';
import * as effects from './effects';
import * as hud from './hud';
import { generateLevel } from './levelgen';
import { Slingshot } from './slingshot';

declare const __BUILD_INFO__: string; // injected by vite.config.ts `define`

const { Bodies, Body } = Matter;

const app = createOrthoApp({ worldHeight: C.WORLD_HEIGHT, clearColor: C.PALETTE.sky });
const { scene } = app;

// --- Camera: fixed, but with a guaranteed minimum horizontal view --------------
// Portrait phones only get ~0.46·WORLD_HEIGHT of width from the shared bootstrap,
// far too narrow for a side-view game — so zoom out until MIN_VIEW_WIDTH fits.
// The extra vertical space is just more night sky, which the stars fill.
const camBase = { x: 0, y: 0 };
function frameView(): void {
  const cam = app.camera;
  let viewW = app.worldWidth;
  let viewH = C.WORLD_HEIGHT;
  if (viewW < C.MIN_VIEW_WIDTH) {
    viewH *= C.MIN_VIEW_WIDTH / viewW;
    viewW = C.MIN_VIEW_WIDTH;
  }
  cam.left = -viewW / 2;
  cam.right = viewW / 2;
  cam.top = viewH / 2;
  cam.bottom = -viewH / 2;
  cam.updateProjectionMatrix();
  camBase.x = C.MIN_VIEW_WIDTH / 2 - 1; // playfield spans x ∈ [-1, MIN_VIEW_WIDTH - 1]
  camBase.y = C.GROUND_Y - C.SNOW_BAND + viewH / 2; // snow band pinned to the bottom
}
app.onResize = frameView;
frameView();

// --- World --------------------------------------------------------------------
blocks.init(scene);
targets.init(scene);
effects.init(scene);

const ballMesh = new THREE.Mesh(
  new THREE.CircleGeometry(C.BALL_RADIUS, 24),
  new THREE.MeshBasicMaterial({ color: C.PALETTE.projectile }),
);
ballMesh.position.z = 0.3;
ballMesh.visible = false;
scene.add(ballMesh);
let ballBody: Matter.Body | null = null;

// --- Game state -----------------------------------------------------------------
type GameState = 'ready' | 'settling' | 'aiming' | 'flying' | 'gameover';
let state: GameState = 'ready';
let level = 1;
let score = 0;
let shotsLeft = 0;
let shotsTotal = 0;
let elapsed = 0;
let stateAt = 0;
let stillTime = 0;

function setState(next: GameState): void {
  state = next;
  stateAt = elapsed;
}

function removeBall(): void {
  if (ballBody) {
    physics.removeBody(ballBody);
    ballBody = null;
  }
  ballMesh.visible = false;
}

function startLevel(lv: number): void {
  removeBall();
  blocks.reset();
  targets.reset();
  const layout = generateLevel(lv);
  blocks.spawnFromDescs(layout.blocks);
  targets.spawnFromDescs(layout.targets);
  const params = C.levelParams(lv);
  shotsTotal = params.shots;
  shotsLeft = params.shots;
  hud.setLevel(lv);
  hud.setShots(shotsLeft, shotsTotal);
  hud.setScore(score);
  hud.showNextButton(false);
  sling.enabled = false;
  sling.release();
  setState('settling');
}

function startGame(): void {
  score = 0;
  level = 1;
  effects.reset();
  hud.hideOverlay();
  hud.setHudVisible(true);
  startLevel(1);
}

function gameOver(): void {
  setState('gameover');
  sling.enabled = false;
  hud.setHudVisible(false);
  hud.showNextButton(false);
  hud.showOverlay('Game over', [`Level ${level} · score ${score}`, 'Tap to play again']);
}

function fire(x: number, y: number, vx: number, vy: number): void {
  if (state !== 'aiming') return;
  ballBody = Bodies.circle(x, y, C.BALL_RADIUS, {
    label: 'ball',
    frictionAir: 0, // pure ballistics — keeps the trajectory preview exact
    restitution: C.BALL_RESTITUTION,
    friction: C.BALL_FRICTION,
    density: C.BALL_DENSITY,
  });
  Body.setVelocity(ballBody, { x: physics.toTick(vx), y: physics.toTick(vy) });
  physics.addBody(ballBody, ballMesh);
  shotsLeft -= 1;
  hud.setShots(shotsLeft, shotsTotal);
  sling.enabled = false;
  stillTime = 0;
  hud.showNextButton(true);
  setState('flying');
}

const sling = new Slingshot(scene, app, fire);

function killTarget(target: Target): void {
  if (!target.alive || !target.body) return;
  const { x, y } = target.body.position;
  targets.kill(target);
  effects.burst(x, y, C.PALETTE.target, C.KILL_BURST);
  score += C.POINTS_PER_TARGET;
  hud.setScore(score);
  hud.scorePop(`+${C.POINTS_PER_TARGET}`);
}

function maybeKill(target: Target, other: Matter.Body, rel: number): void {
  const threshold = other.label === 'ground' ? C.GROUND_KILL_IMPACT : C.KILL_IMPACT;
  if (rel > threshold) killTarget(target);
}

physics.setImpactHandler((a, b, rel, x, y) => {
  if (state !== 'aiming' && state !== 'flying') return;
  const targetA = targets.fromBody(a);
  const targetB = targets.fromBody(b);
  if (targetA) maybeKill(targetA, b, rel);
  if (targetB) maybeKill(targetB, a, rel);
  if (rel > C.SHAKE_IMPACT) {
    effects.shake();
    effects.burst(x, y, blocks.colorOf(a.label === 'block' ? a : b), C.IMPACT_BURST);
  }
});

function advanceShot(): void {
  if (state !== 'flying') return;
  removeBall();
  hud.showNextButton(false);
  if (targets.aliveCount() === 0) {
    const bonus = shotsLeft * C.BONUS_PER_SHOT;
    score += bonus;
    hud.setScore(score);
    if (bonus > 0) hud.scorePop(`Level clear! +${bonus}`);
    level += 1;
    startLevel(level);
  } else if (shotsLeft > 0) {
    setState('aiming');
    sling.enabled = true;
    ballMesh.visible = true;
  } else {
    gameOver();
  }
}

hud.initNextButton(advanceShot);

// --- Input: tap to (re)start ------------------------------------------------------
window.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if ((state === 'ready' || state === 'gameover') && elapsed - stateAt > 0.6) {
    startGame();
  }
});

// --- Boot ----------------------------------------------------------------------------
hud.setHudVisible(false);
hud.showOverlay('Slingshot', [
  'Topple the towers under the aurora',
  'Drag back anywhere to aim, release to fire',
  'Tap to start',
  `v ${__BUILD_INFO__}`,
]);
(document.getElementById('slingshot-build-stamp') as HTMLDivElement).textContent = __BUILD_INFO__;

startGameLoop((dt) => {
  elapsed += dt;
  physics.stepPhysics(dt);

  if (state === 'settling') {
    if (elapsed - stateAt >= C.SETTLE_MIN && physics.allStill()) {
      console.debug(`[slingshot] level ${level} settled, ${physics.sleepingCount()} bodies asleep`);
      setState('aiming');
      sling.enabled = true;
      ballMesh.visible = true;
    }
  } else if (state === 'aiming') {
    ballMesh.position.x = sling.pouch.x;
    ballMesh.position.y = sling.pouch.y;
  } else if (state === 'flying') {
    if (ballBody) {
      effects.stampTrail(dt, ballBody.position.x, ballBody.position.y);
      const { x, y } = ballBody.position;
      if (x < -4 || x > C.MIN_VIEW_WIDTH + 6 || y < C.GROUND_Y - 3) removeBall();
    }
    // targets shoved off the edges of the world count as eliminated
    for (const target of targets.alive()) {
      if (target.alive && target.body && target.body.position.y < C.GROUND_Y - 2) {
        killTarget(target);
      }
    }
    if (physics.allStill()) stillTime += dt;
    else stillTime = 0;
    if (stillTime >= C.STILL_TIME || elapsed - stateAt >= C.SHOT_TIMEOUT) advanceShot();
  }

  physics.syncMeshes();
  targets.pulse(elapsed);
  effects.update(dt);
  app.camera.position.x = camBase.x + effects.shakeOffset.x;
  app.camera.position.y = camBase.y + effects.shakeOffset.y;
  app.renderer.render(scene, app.camera);
}, C.MAX_DT);
