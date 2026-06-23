// Boulon — vertical tower climber. Wire the systems: scene (scroll-following
// 3/4 camera) + matter physics + finger-follow input + hero ship + auto-fire
// bolts + descending robots + debris. A forced scroll drags the view up the
// shaft; you fly to the finger, auto-fire upward, and climb as high as you can.
//
// Coordinate note: ascent is toward matter −y (the tilt projects −y to the top
// of the screen). matter (x, y) → three (x, 0, z). frontY (matter y of the look
// centre) decreases over time; the height score is −frontY.

import {
  startGameLoop,
  submitScore,
  showLeaderboard,
  promptPlayerName,
  getStoredPlayerName,
} from '@games-lab/shared';
import * as C from './config';
import * as physics from './physics';
import { setupScene } from './scene';
import { Follow } from './input';
import { Player } from './player';
import { Projectiles } from './projectiles';
import { Enemies } from './enemies';
import { Debris } from './debris';
import { Hud } from './hud';

declare const __BUILD_INFO__: string;

const tower = setupScene();
const app = tower.app;
const follow = new Follow(app.camera);
const player = new Player(app.scene);
const projectiles = new Projectiles(app.scene);
const enemies = new Enemies(app.scene);
const debris = new Debris(app.scene);
const hud = new Hud(__BUILD_INFO__);

const LEADERBOARD_GAME = 'boulon';

// --- Run state ------------------------------------------------------------
let frontY = 0;
let prevFrontY = 0;
let level = 1;
let maxClimb = 0;
let kills = 0;
let spawnTimer = C.ENEMY.spawnInterval;
let running = true;
let lastScore = 0;

function scrollSpeed(): number {
  return Math.min(C.SCROLL.maxSpeed, C.SCROLL.baseSpeed + (level - 1) * C.SCROLL.perLevelSpeed);
}
function spawnInterval(): number {
  return Math.max(C.ENEMY.spawnIntervalMin, C.ENEMY.spawnInterval - (level - 1) * C.ENEMY.perLevelSpawn);
}
function scoreOf(): number {
  return Math.floor(maxClimb) + kills * 5;
}

// --- Collisions: queue mid-step, resolve after the physics step -----------
type Hit = { kind: 'shot'; proj: number; enemy: number } | { kind: 'ram'; enemy: number };
const pendingHits: Hit[] = [];

physics.setImpactHandler((a, b) => {
  const pa = a.label;
  const pb = b.label;
  if (pa === 'projectile' || pb === 'projectile') {
    const proj = pa === 'projectile' ? a : b;
    const other = proj === a ? b : a;
    if (other.label === 'enemy') pendingHits.push({ kind: 'shot', proj: proj.id, enemy: other.id });
  } else if (pa === 'player' || pb === 'player') {
    const other = pa === 'player' ? b : a;
    if (other.label === 'enemy') pendingHits.push({ kind: 'ram', enemy: other.id });
  }
});

function resolveHits(): void {
  for (const h of pendingHits) {
    if (h.kind === 'shot') {
      const res = enemies.hitByBody(h.enemy, C.WEAPON.damage);
      projectiles.despawnByBody(h.proj);
      if (res && res.killed) {
        kills += 1;
        debris.burst(res.x, res.y);
      }
    } else if (!player.invulnerable) {
      const pos = enemies.despawnByBody(h.enemy);
      if (pos) {
        debris.burst(pos.x, pos.y);
        player.takeDamage(C.ENEMY.contactDamage);
      }
    }
  }
  pendingHits.length = 0;
}

// --- HUD overlay refs -----------------------------------------------------
const overlayEl = byId('boulon-end-overlay');
const endTitleEl = byId('boulon-end-title');
const endSubEl = byId('boulon-end-sub');
const endScoreEl = byId('boulon-end-score');
const restartBtn = byId('boulon-restart-btn');
const leaderboardBtn = byId('boulon-leaderboard-btn');
const hintEl = document.getElementById('boulon-hint');

restartBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
restartBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  newGame();
});
leaderboardBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
leaderboardBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  showLeaderboard(LEADERBOARD_GAME, {
    title: 'Boulon — Plus haut',
    playerName: getStoredPlayerName(),
    highlightScore: lastScore,
  });
});

let hintDismissed = false;
window.addEventListener('pointerdown', () => {
  if (hintDismissed || !hintEl) return;
  hintDismissed = true;
  hintEl.style.opacity = '0';
});

function newGame(): void {
  frontY = 0;
  prevFrontY = 0;
  level = 1;
  maxClimb = 0;
  kills = 0;
  spawnTimer = C.ENEMY.spawnInterval;
  lastScore = 0;
  player.reset();
  enemies.reset();
  debris.reset();
  tower.setBand(level);
  tower.setFrontY(0);
  tower.followFloor(0);
  hud.setHp(player.hp, C.PLAYER.hp);
  overlayEl.classList.remove('boulon-end-active');
  running = true;
}

function endRun(): void {
  running = false;
  lastScore = scoreOf();
  endTitleEl.textContent = 'Chute';
  endSubEl.textContent = `Tu as grimpé ${Math.floor(maxClimb)} m · ${kills} robots`;
  endScoreEl.textContent = `Score ${lastScore.toLocaleString('fr-FR')}`;
  overlayEl.classList.add('boulon-end-active');
  void submitBoulonScore(lastScore);
}

async function submitBoulonScore(score: number): Promise<void> {
  const name = await promptPlayerName();
  if (!name) return;
  await submitScore(LEADERBOARD_GAME, name, score, {
    height: Math.floor(maxClimb),
    kills,
    build: __BUILD_INFO__,
  });
}

// --- Main loop ------------------------------------------------------------
startGameLoop((dt) => {
  if (running) {
    prevFrontY = frontY;
    frontY -= scrollSpeed() * dt; // ascend toward −y
    if (-frontY > maxClimb) maxClimb = -frontY;

    const newLevel = Math.floor(-frontY / C.TOWER.sectionDepth) + 1;
    if (newLevel > level) {
      level = newLevel;
      tower.setBand(level);
      hud.banner(`Niveau ${level}`);
    }

    tower.setFrontY(frontY);
    tower.followFloor(frontY);

    // Spawn descending robots on the level's cadence.
    spawnTimer -= dt;
    while (spawnTimer <= 0) {
      enemies.spawn(frontY, level);
      spawnTimer += spawnInterval();
    }

    // Steer: follow the finger, else ride the scroll (hold screen position).
    let tx: number;
    let ty: number;
    if (follow.active) {
      tx = follow.target.x;
      ty = follow.target.y;
    } else {
      tx = player.body.position.x;
      ty = player.body.position.y + (frontY - prevFrontY);
    }
    const xClamp = C.LANE_HALF - C.PLAYER.radius;
    tx = Math.max(-xClamp, Math.min(xClamp, tx));
    ty = Math.max(frontY - C.WINDOW.up, Math.min(frontY + C.WINDOW.down, ty));
    player.moveTo(tx, ty, dt);

    // Auto-fire upward (the pool self-throttles to the cadence).
    const m = player.muzzle;
    projectiles.fire(m.x, m.y, m.dirX, m.dirY);
    projectiles.tick(dt);

    enemies.update(frontY, level);

    physics.stepPhysics(dt);
    resolveHits();
    debris.tick(dt);
    player.tick(dt);

    physics.syncMeshes();
    player.syncMesh();

    hud.setHeight(maxClimb);
    hud.setLevel(level);
    hud.setHp(Math.max(0, player.hp), C.PLAYER.hp);
    hud.tick(dt);

    if (player.hp <= 0 || player.body.position.y > frontY + C.WINDOW.deathBelow) {
      endRun();
    }
  } else {
    // Keep debris/banner settling animated under the overlay.
    debris.tick(dt);
    physics.syncMeshes();
    hud.tick(dt);
  }

  app.renderer.render(app.scene, app.camera);
}, C.MAX_DT);

// Kick off the first wave + HUD.
tower.setBand(level);
hud.setHp(player.hp, C.PLAYER.hp);

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}
