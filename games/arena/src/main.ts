import * as THREE from 'three';
import {
  createOrthoApp,
  startGameLoop,
  submitScore,
  showLeaderboard,
  getStoredPlayerName,
  promptPlayerName,
} from '@games-lab/shared';
import * as C from './config';
import { basePlayerStats, type PlayerStats } from './config';
import { FollowCamera } from './camera';
import {
  EnemyPool, GemPool, OrbitalPool, ParticlePool, Player, ProjectilePool, type Enemy,
} from './entities';
import * as hud from './hud';
import { Joystick } from './input';
import { rollUpgrades } from './upgrades';
import { WaveManager } from './waves';

declare const __BUILD_INFO__: string; // injected by vite.config.ts `define`

const app = createOrthoApp({ worldHeight: C.WORLD_HEIGHT, clearColor: C.PALETTE.night });
const { scene } = app;

// --- Map: bounds walls + static snow dots (they sell the camera motion) --------
{
  const wallMat = new THREE.MeshBasicMaterial({ color: C.PALETTE.wall });
  const unit = new THREE.PlaneGeometry(1, 1);
  const t = C.WALL_THICKNESS;
  const walls: Array<[number, number, number, number]> = [
    [0, C.MAP_HEIGHT / 2 + t / 2, C.MAP_WIDTH + 2 * t, t],
    [0, -C.MAP_HEIGHT / 2 - t / 2, C.MAP_WIDTH + 2 * t, t],
    [C.MAP_WIDTH / 2 + t / 2, 0, t, C.MAP_HEIGHT],
    [-C.MAP_WIDTH / 2 - t / 2, 0, t, C.MAP_HEIGHT],
  ];
  for (const [x, y, w, h] of walls) {
    const mesh = new THREE.Mesh(unit, wallMat);
    mesh.position.set(x, y, 0.1);
    mesh.scale.set(w, h, 1);
    scene.add(mesh);
  }

  const positions = new Float32Array(C.SNOW_DOT_COUNT * 3);
  for (let i = 0; i < C.SNOW_DOT_COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * (C.MAP_WIDTH - 1);
    positions[i * 3 + 1] = (Math.random() - 0.5) * (C.MAP_HEIGHT - 1);
    positions[i * 3 + 2] = 0.05;
  }
  const snowGeo = new THREE.BufferGeometry();
  snowGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  scene.add(
    new THREE.Points(
      snowGeo,
      new THREE.PointsMaterial({
        color: C.PALETTE.snow,
        size: 2.5,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
      }),
    ),
  );
}

// --- World objects ----------------------------------------------------------------
const player = new Player(scene);
const enemies = new EnemyPool(scene);
const projectiles = new ProjectilePool(scene);
const orbitals = new OrbitalPool(scene);
const gems = new GemPool(scene);
const particles = new ParticlePool(scene);
const joystick = new Joystick();
const cam = new FollowCamera(app);
const waves = new WaveManager();

// --- Game state ---------------------------------------------------------------------
type GameState = 'ready' | 'playing' | 'levelup' | 'gameover';
let state: GameState = 'ready';
let stats: PlayerStats = basePlayerStats();
let level = 1;
let xp = 0;
let kills = 0;
let fireTimer = 0;
let shotCount = 0; // for comet cadence
let elapsed = 0;
let stateChangedAt = 0;

function xpNeeded(): number {
  return C.XP_BASE + (level - 1) * C.XP_GROWTH;
}

/** Shots between comets shrinks as the Comète upgrade stacks. */
function cometInterval(): number {
  return Math.max(C.COMET_INTERVAL_MIN, C.COMET_INTERVAL_BASE - (stats.cometLevel - 1));
}

/** Projectile radius grows with damage so Power picks are visible. */
function projectileRadius(): number {
  return Math.min(
    C.PROJECTILE_RADIUS_MAX,
    C.PROJECTILE_RADIUS + (stats.damage - C.PLAYER_BASE.damage) * C.PROJECTILE_DMG_SCALE,
  );
}

/** Refresh the build-driven player rings after a stat change. */
function refreshPlayerRings(): void {
  player.setAura(stats.auraLevel);
  player.setMagnet(stats.magnetRadius);
  orbitals.setCount(stats.orbitalCount);
}

// --- Leaderboard (shared games-lab service) -----------------------------------
const LEADERBOARD_GAME = 'arena';
const leaderboardBtn = document.getElementById('arena-leaderboard-btn') as HTMLButtonElement;

// The button is the only interactive element on the game-over screen. Stopping
// propagation keeps the tap from also firing the window "tap to play again".
leaderboardBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
leaderboardBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  showLeaderboard(LEADERBOARD_GAME, {
    title: 'Arena — Top',
    playerName: getStoredPlayerName(),
    highlightScore: kills,
  });
});

// Submit the run's kills: ask for a name once (remembered after), fire-and-forget.
async function submitArenaScore(finalScore: number): Promise<void> {
  const name = await promptPlayerName();
  if (!name) return;
  await submitScore(LEADERBOARD_GAME, name, finalScore, { build: __BUILD_INFO__ });
}

function startGame(): void {
  stats = basePlayerStats();
  level = 1;
  xp = 0;
  kills = 0;
  fireTimer = 0;
  shotCount = 0;
  player.reset(0, 0);
  enemies.reset();
  projectiles.reset();
  orbitals.reset();
  gems.reset();
  particles.reset();
  waves.reset();
  refreshPlayerRings();
  cam.snapTo(0, 0);
  hud.hideOverlay();
  hud.hideUpgradeCards();
  leaderboardBtn.style.display = 'none';
  hud.setHudVisible(true);
  hud.setHp(stats.hp, stats.maxHp);
  hud.setXp(0, xpNeeded(), level);
  hud.setWave(1);
  state = 'playing';
  joystick.enabled = true;
}

function gameOver(): void {
  state = 'gameover';
  stateChangedAt = elapsed;
  joystick.enabled = false;
  joystick.release();
  particles.burst(player.x, player.y, 'player', C.DEATH_BURST * 3);
  cam.shake();
  player.hide();
  orbitals.reset();
  hud.setHudVisible(false);
  hud.showOverlay('Game over', [
    `Wave ${waves.wave} · ${kills} kills`,
    'Tap to play again',
  ]);

  // Offer the leaderboard, and submit non-zero runs (asks the name once).
  leaderboardBtn.style.display = 'block';
  if (kills > 0) void submitArenaScore(kills);
}

function enterLevelUp(): void {
  state = 'levelup';
  joystick.enabled = false;
  joystick.release();
  hud.levelUpFlash();
  hud.showUpgradeCards(rollUpgrades(), (upgrade) => {
    xp -= xpNeeded();
    level += 1;
    upgrade.apply(stats);
    refreshPlayerRings();
    // Pickup juice — a warm burst at the player so every pick is felt; the heal
    // upgrade gets a bigger bloom.
    particles.burst(
      player.x, player.y, 'player',
      upgrade.title === 'Vitality' ? C.DEATH_BURST * 4 : C.DEATH_BURST * 2,
    );
    player.pulse();
    hud.setHp(stats.hp, stats.maxHp);
    hud.setXp(xp, xpNeeded(), level);
    hud.hideUpgradeCards();
    state = 'playing';
    joystick.enabled = true;
  });
}

function gainXp(amount: number): void {
  xp += amount;
  hud.setXp(xp, xpNeeded(), level);
}

function hitPlayer(e: Enemy): void {
  stats.hp -= e.damage;
  player.invuln = C.INVULN_TIME;
  let dx = player.x - e.x;
  let dy = player.y - e.y;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  player.kbX = dx * C.KNOCKBACK_PLAYER;
  player.kbY = dy * C.KNOCKBACK_PLAYER;
  e.kbX = -dx * C.KNOCKBACK_ENEMY;
  e.kbY = -dy * C.KNOCKBACK_ENEMY;
  cam.shake();
  hud.damageFlash();
  hud.setHp(stats.hp, stats.maxHp);
  if (stats.hp <= 0) gameOver();
}

function onEnemyKilled(e: Enemy): void {
  kills += 1;
  particles.burst(e.x, e.y, e.type);
  gems.spawn(e.x, e.y, e.xp);
  enemies.free(e);
}

function nearestEnemy(): { e: Enemy; d2: number } | null {
  let best: Enemy | null = null;
  let bestD2 = Infinity;
  for (const e of enemies.list) {
    if (!e.active) continue;
    const dx = e.x - player.x;
    const dy = e.y - player.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = e;
    }
  }
  return best ? { e: best, d2: bestD2 } : null;
}

// --- Per-frame simulation (only while playing) ----------------------------------------
function updateWorld(dt: number): void {
  // movement: joystick (touch) or cursor-follow (desktop) + decaying knockback,
  // clamped inside the walls
  joystick.updateCursor(
    app.camera.position.x, app.camera.position.y,
    app.worldWidth, C.WORLD_HEIGHT, player.x, player.y,
  );
  const kbDecay = Math.exp(-C.KNOCKBACK_DECAY * dt);
  const boundX = C.MAP_WIDTH / 2 - C.PLAYER_RADIUS;
  const boundY = C.MAP_HEIGHT / 2 - C.PLAYER_RADIUS;
  player.x = THREE.MathUtils.clamp(
    player.x + (joystick.value.x * stats.moveSpeed + player.kbX) * dt,
    -boundX, boundX,
  );
  player.y = THREE.MathUtils.clamp(
    player.y + (joystick.value.y * stats.moveSpeed + player.kbY) * dt,
    -boundY, boundY,
  );
  player.kbX *= kbDecay;
  player.kbY *= kbDecay;
  player.invuln = Math.max(0, player.invuln - dt);

  const startedWave = waves.update(dt, enemies.activeCount(), (type, x, y, hpMult) =>
    enemies.spawn(type, x, y, hpMult),
  );
  if (startedWave !== null) {
    hud.setWave(startedWave);
    hud.announceWave(startedWave);
  }

  enemies.update(dt, player.x, player.y);

  // contact damage
  if (player.invuln <= 0) {
    for (const e of enemies.list) {
      if (!e.active) continue;
      const dx = e.x - player.x;
      const dy = e.y - player.y;
      const r = e.radius + C.PLAYER_RADIUS;
      if (dx * dx + dy * dy < r * r) {
        hitPlayer(e);
        break;
      }
    }
  }
  if (state !== 'playing') return; // died this frame

  // aim the barrel at the nearest enemy (regardless of range)
  const near = nearestEnemy();
  if (near) player.setAim(near.e.x, near.e.y);

  // auto-attack when the nearest enemy is in range
  fireTimer -= dt;
  if (fireTimer <= 0) {
    if (near && near.d2 <= stats.attackRange * stats.attackRange) {
      const e = near.e;
      const baseAngle = Math.atan2(e.y - player.y, e.x - player.x);
      const range = stats.attackRange * 1.25;
      shotCount += 1;
      const isComet = stats.cometLevel > 0 && shotCount % cometInterval() === 0;
      if (isComet) {
        // one big icy comet — pierces the line and freezes everything it touches
        projectiles.spawn(
          player.x, player.y, Math.cos(baseAngle), Math.sin(baseAngle),
          stats.projectileSpeed * C.COMET_SPEED_MULT,
          stats.damage * C.COMET_DMG_MULT, range,
          C.COMET_RADIUS, true, true,
        );
      } else {
        // normal volley, fanned out by projectileCount (multishot)
        const r = projectileRadius();
        const n = stats.projectileCount;
        for (let k = 0; k < n; k++) {
          const a = baseAngle + (k - (n - 1) / 2) * C.MULTISHOT_SPREAD;
          projectiles.spawn(
            player.x, player.y, Math.cos(a), Math.sin(a),
            stats.projectileSpeed, stats.damage, range, r,
          );
        }
      }
      player.pulse();
      fireTimer = stats.fireInterval;
    } else {
      fireTimer = 0; // don't bank shots while nothing is in range
    }
  }

  projectiles.update(dt, enemies.list, (enemy, damage, slow) => {
    if (slow) enemy.slow = C.COMET_SLOW_TIME;
    if (enemies.damage(enemy, damage)) onEnemyKilled(enemy);
  });

  // orbiting sentinels: advance, then damage what they touch (per-enemy cooldown)
  orbitals.update(dt, player.x, player.y);
  if (stats.orbitalCount > 0) {
    for (const o of orbitals.list) {
      if (!o.active) continue;
      for (const e of enemies.list) {
        if (!e.active || e.orbCd > 0) continue;
        const dx = e.x - o.x;
        const dy = e.y - o.y;
        const rr = e.radius + C.ORBITAL_SIZE;
        if (dx * dx + dy * dy < rr * rr) {
          e.orbCd = C.ORBITAL_HIT_CD;
          if (enemies.damage(e, C.ORBITAL_DAMAGE)) onEnemyKilled(e);
        }
      }
    }
  }

  // warmth aura ("Brasier"): continuous drain on enemies inside the ring
  if (stats.auraLevel > 0) {
    const radius = C.AURA_RADIUS_BASE + (stats.auraLevel - 1) * C.AURA_RADIUS_PER;
    const dmg = (C.AURA_DPS_BASE + (stats.auraLevel - 1) * C.AURA_DPS_PER) * dt;
    const r2 = radius * radius;
    for (const e of enemies.list) {
      if (!e.active) continue;
      const dx = e.x - player.x;
      const dy = e.y - player.y;
      if (dx * dx + dy * dy <= r2) {
        e.hp -= dmg; // raw drain — no per-frame flash spam; the ring is the tell
        if (e.hp <= 0) onEnemyKilled(e);
      }
    }
  }

  gems.update(dt, player.x, player.y, stats.magnetRadius, elapsed, gainXp);
  particles.update(dt);

  if (xp >= xpNeeded()) enterLevelUp();
}

// --- Input: tap to (re)start ------------------------------------------------------------
window.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (
    (state === 'ready' || state === 'gameover') &&
    elapsed - stateChangedAt > 0.6
  ) {
    startGame();
  }
});

// --- Boot --------------------------------------------------------------------------------
hud.setHudVisible(false);
hud.showOverlay('Arena', [
  'Survive the aurora night',
  'Drag to move — attacks are automatic',
  'Tap to start',
  `v ${__BUILD_INFO__}`,
]);
(document.getElementById('arena-build-stamp') as HTMLDivElement).textContent = __BUILD_INFO__;

startGameLoop((dt) => {
  elapsed += dt;
  if (state === 'playing') {
    updateWorld(dt);
  } else if (state === 'gameover') {
    particles.update(dt); // let the death burst finish
  }
  if (state !== 'gameover') player.sync(elapsed, dt);
  cam.update(player.x, player.y, dt);
  app.renderer.render(scene, app.camera);
}, C.MAX_DT);
