// Boulon — room-by-room tower climber. Each room: destroy every static robot to
// open the top gate, dodge the rising crusher (pinned = instant death), grab up
// to two pickups for stacking upgrades, then climb to the next room. Finger to
// move, auto-fire (auto-aims the nearest robot). Ascent = matter −y.

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
import { Items } from './items';
import { Debris } from './debris';
import { Crusher } from './crusher';
import { buildRoom, type Room } from './rooms';
import { Hud } from './hud';
import {
  freshStats,
  applyUpgrade,
  icon,
  label,
  EASY_POOL,
  HARD_POOL,
  type RunStats,
  type UpgradeKind,
} from './upgrades';

declare const __BUILD_INFO__: string;

const tower = setupScene();
const app = tower.app;
const follow = new Follow(app.camera);
const player = new Player(app.scene);
const projectiles = new Projectiles(app.scene);
const enemies = new Enemies(app.scene);
const items = new Items(app.scene);
const debris = new Debris(app.scene);
const crusher = new Crusher(app.scene);
const hud = new Hud(__BUILD_INFO__);

const LEADERBOARD_GAME = 'boulon';

// --- Run state ------------------------------------------------------------
let stats: RunStats = freshStats();
let collectedIcons = '';
let room: Room = buildRoom(app.scene, 0);
let roomIndex = 0;
let kills = 0;
let fireTimer = 0;
let phase: 'playing' | 'ascending' = 'playing';
let running = true;
let lastScore = 0;

function crusherSpeed(): number {
  return Math.min(C.CRUSHER.maxSpeed, C.CRUSHER.baseSpeed + roomIndex * C.CRUSHER.perRoomSpeed);
}
function score(): number {
  return roomIndex * 100 + kills * 10;
}

// --- Collisions: queue mid-step, resolve after the step -------------------
type Hit =
  | { kind: 'shot'; proj: number; enemy: number }
  | { kind: 'ram'; enemy: number }
  | { kind: 'pickup'; item: number };
const pendingHits: Hit[] = [];

physics.setImpactHandler((a, b) => {
  const la = a.label;
  const lb = b.label;
  if (la === 'projectile' || lb === 'projectile') {
    const proj = la === 'projectile' ? a : b;
    const other = proj === a ? b : a;
    if (other.label === 'enemy') pendingHits.push({ kind: 'shot', proj: proj.id, enemy: other.id });
    else if (other.label === 'wall') projectiles.despawnByBody(proj.id);
  } else if (la === 'player' || lb === 'player') {
    const other = la === 'player' ? b : a;
    if (other.label === 'enemy') pendingHits.push({ kind: 'ram', enemy: other.id });
    else if (other.label === 'item') pendingHits.push({ kind: 'pickup', item: other.id });
  }
});

function resolveHits(): void {
  for (const h of pendingHits) {
    if (h.kind === 'shot') {
      const res = enemies.hitByBody(h.enemy, stats.damage);
      projectiles.despawnByBody(h.proj);
      if (res && res.killed) {
        kills += 1;
        debris.burst(res.x, res.y);
      }
    } else if (h.kind === 'ram') {
      if (player.takeDamage(C.ENEMY.contactDamage)) {
        /* contact: enemy stays an obstacle; just chip the player */
      }
    } else {
      const kind = items.collectByBody(h.item);
      if (kind) collectUpgrade(kind);
    }
  }
  pendingHits.length = 0;
}

function collectUpgrade(kind: UpgradeKind): void {
  const hpAdd = applyUpgrade(stats, kind);
  if (hpAdd > 0) player.addMaxHp(hpAdd);
  collectedIcons += icon(kind);
  hud.setUpgrades(collectedIcons);
  hud.banner(`${icon(kind)} ${label(kind)}`);
}

// --- Room population ------------------------------------------------------
function populateRoom(r: Room): void {
  for (const s of r.enemySpots) enemies.spawnAt(s.x, s.y);
  const easyKind = EASY_POOL[r.index % EASY_POOL.length] as UpgradeKind;
  const hardKind = HARD_POOL[r.index % HARD_POOL.length] as UpgradeKind;
  items.spawnAt(r.easySpot.x, r.easySpot.y, easyKind, false);
  items.spawnAt(r.hardSpot.x, r.hardSpot.y, hardKind, true);
  crusher.reset(r);
  hud.setRoom(r.index + 1);
  hud.setEnemies(r.enemySpots.length);
}

function advanceRoom(): void {
  room.dispose();
  roomIndex += 1;
  room = buildRoom(app.scene, roomIndex);
  populateRoom(room);
  phase = 'playing';
}

// --- HUD overlay ----------------------------------------------------------
const overlayEl = byId('boulon-end-overlay');
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
    title: 'Boulon — Tour',
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
  stats = freshStats();
  collectedIcons = '';
  kills = 0;
  fireTimer = 0;
  roomIndex = 0;
  phase = 'playing';
  enemies.reset();
  items.reset();
  projectiles.reset();
  debris.reset();
  room.dispose();
  room = buildRoom(app.scene, 0);
  player.reset(stats.maxHp, 0, room.bottomY - 3);
  populateRoom(room);
  tower.snapCamera(room.centerY);
  tower.followStrip(room.centerY);
  hud.setHp(player.hp, player.maxHp);
  hud.setUpgrades('');
  overlayEl.classList.remove('boulon-end-active');
  running = true;
}

function endRun(reason: 'crush' | 'hp'): void {
  running = false;
  crusher.stop();
  lastScore = score();
  endSubEl.textContent =
    (reason === 'crush' ? 'Écrasé ! ' : 'Détruit ! ') +
    `Salle ${roomIndex + 1} · ${kills} robots`;
  endScoreEl.textContent = `Score ${lastScore.toLocaleString('fr-FR')}`;
  overlayEl.classList.add('boulon-end-active');
  void submitBoulonScore(lastScore);
}

async function submitBoulonScore(s: number): Promise<void> {
  const name = await promptPlayerName();
  if (!name) return;
  await submitScore(LEADERBOARD_GAME, name, s, {
    room: roomIndex + 1,
    kills,
    build: __BUILD_INFO__,
  });
}

// --- Firing ---------------------------------------------------------------
function fire(): void {
  const px = player.body.position.x;
  const py = player.body.position.y;
  const target = enemies.nearestAlive(px, py, C.WEAPON.autoAimRange);
  let ax = 0;
  let ay = -1;
  if (target) {
    const dx = target.x - px;
    const dy = target.y - py;
    const len = Math.hypot(dx, dy) || 1;
    ax = dx / len;
    ay = dy / len;
  }
  player.setAim(ax, ay);

  const n = stats.multishot;
  const base = Math.atan2(ay, ax);
  const spread = (C.WEAPON.spreadDeg * Math.PI) / 180;
  for (let i = 0; i < n; i++) {
    const ang = base + (i - (n - 1) / 2) * spread;
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    projectiles.spawn(px + dx * C.WEAPON.muzzleOffset, py + dy * C.WEAPON.muzzleOffset, dx, dy);
  }
}

// --- Main loop ------------------------------------------------------------
startGameLoop((dt) => {
  if (running) {
    // Camera: frame the room while fighting, follow the player while climbing out.
    const camTarget = phase === 'ascending' ? player.body.position.y : room.centerY;
    tower.panCameraTo(camTarget, dt);
    tower.followStrip(camTarget);

    // Auto-fire on cadence.
    fireTimer -= dt;
    if (fireTimer <= 0) {
      fire();
      fireTimer += stats.fireInterval;
    }
    projectiles.tick(dt);

    crusher.update(dt, crusherSpeed());

    // Steer: seek the finger (else hold position; the crusher still pushes up).
    let tx = player.body.position.x;
    let ty = player.body.position.y;
    if (follow.active) {
      tx = follow.target.x;
      ty = follow.target.y;
    }
    const xc = C.LANE_HALF - C.PLAYER.radius;
    tx = Math.max(-xc, Math.min(xc, tx));
    player.seek(tx, ty, stats.maxSpeed);

    items.tick(dt);

    physics.stepPhysics(dt);
    resolveHits();
    debris.tick(dt);
    player.tick(dt);

    physics.syncMeshes();
    player.syncMesh();

    // Room cleared → open the gate and start climbing out.
    if (phase === 'playing' && enemies.aliveCount === 0) {
      room.openGate();
      phase = 'ascending';
      hud.setEnemies(0);
      hud.banner('Salle nettoyée !');
    }
    // Crossed the gate → next room.
    if (phase === 'ascending' && player.body.position.y < room.topY) {
      advanceRoom();
    }

    hud.setHp(Math.max(0, player.hp), player.maxHp);
    if (phase === 'playing') hud.setEnemies(enemies.aliveCount);
    hud.tick(dt);

    // Death: crushed, or out of HP.
    if (crusher.crushed(room, player.body.position.y)) endRun('crush');
    else if (player.hp <= 0) endRun('hp');
  } else {
    debris.tick(dt);
    items.tick(dt);
    physics.syncMeshes();
    hud.tick(dt);
  }

  app.renderer.render(app.scene, app.camera);
}, C.MAX_DT);

// Boot the first room.
player.reset(stats.maxHp, 0, room.bottomY - 3);
populateRoom(room);
tower.snapCamera(room.centerY);
hud.setHp(player.hp, player.maxHp);

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}
