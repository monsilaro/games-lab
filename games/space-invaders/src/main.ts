import * as THREE from 'three';
import {
  createOrthoApp,
  startGameLoop,
  submitScore,
  showLeaderboard,
  getStoredPlayerName,
  promptPlayerName,
} from '@games-lab/shared';

declare const __BUILD_INFO__: string; // injected by vite.config.ts `define`

// --- TUNING ----------------------------------------------------------------
const WORLD_HEIGHT = 12; // world units visible vertically
const PLAYER_SPEED = 7; // units/s for keyboard hold-to-steer
const PLAYER_LERP = 16; // how stiffly the ship chases the drag target
const PLAYER_FIRE_INTERVAL = 0.32; // s between auto-fire shots (capped rapid fire)
const PLAYER_SIZE = 0.8; // player ship collision width
const PLAYER_HEIGHT = 0.4;
const BULLET_SPEED = 12; // units/s
const BULLET_SIZE = 0.12;
const ENEMY_ROWS = 5;
const ENEMY_COLS = 10;
const ENEMY_SIZE = 0.7;
const ENEMY_GAP = ENEMY_SIZE * 1.35; // center-to-center spacing (cols + rows)
const ENEMY_DROP = 0.35; // how far enemies drop when they reach an edge
const ENEMY_SPEED_BASE = 1.5; // units/s
const ENEMY_SPEED_INCREMENT = 0.2; // speed increase per wave
const ENEMY_BULLET_SPEED = 4; // units/s
// Enemy fire is throttled + capped, not per-enemy random (that was ~15 shots/s).
const MAX_ENEMY_BULLETS = 3; // max enemy shots on screen at once
const ENEMY_FIRE_INTERVAL = 1.1; // base seconds between enemy shots
const SHIELD_SIZE = 0.8;
const SHIELD_COUNT = 4;
const SHIELD_HEALTH = 4; // hits a bunker takes; each hit erodes it one frame
const MAX_DT = 0.05; // clamp delta time
const INITIAL_LIVES = 3;

// visuals
const STAR_COUNT = 150;
const STAR_LAYER_HEIGHT = 5;
const PIXEL_CELL = 8; // px per sprite cell when rasterising the pixel art

// timing
const ENEMY_MOVE_INTERVAL = 0.5; // seconds between enemy movements
const INVINCIBILITY_TIME = 2.0; // seconds after game start

// --- COLORS -----------------------------------------------------------------
const COLORS = {
  background: 0x0a0a1a,
  player: 0x54ff8a,
  playerGlow: 0x1f9c4f,
  playerBullet: 0xeafff0,
  enemyBullet: 0xff5cc8,
  ground: 0x2bd66b,
};
// Per-tier invader colours — a cyan→green→lime CRT gradient.
const TIER_COLORS = ['#5cf2ff', '#5dff8f', '#c6ff4d'];
const BUNKER_COLOR = '#46d17a';
const EXPLOSION_ENEMY_COLOR = '#fff2a6';
const EXPLOSION_PLAYER_COLOR = '#ff5cc8';

// --- PIXEL-ART SPRITES -------------------------------------------------------
// Classic Space Invaders silhouettes, hand-drawn as pixel grids ('X' = filled).
// Rasterised at runtime to a CanvasTexture (NearestFilter) and mapped onto an
// unlit plane — zero asset files, still inside the flat-MeshBasicMaterial rule.
const PLAYER_ART = [
  '     XX     ',
  '     XX     ',
  '    XXXX    ',
  '   XXXXXX   ',
  ' XXXXXXXXXX ',
  'XXXXXXXXXXXX',
  'XXXXXXXXXXXX',
];

// tier 0 — "squid" (top row)
const SQUID_A = [
  '    XXXX    ',
  '   XXXXXX   ',
  '  XXXXXXXX  ',
  '  XX XX XX  ',
  '  XXXXXXXX  ',
  '   X XX X   ',
  '  X X  X X  ',
  '   X    X   ',
];
const SQUID_B = [
  '    XXXX    ',
  '   XXXXXX   ',
  '  XXXXXXXX  ',
  '  XX XX XX  ',
  '  XXXXXXXX  ',
  '   XX  XX   ',
  '  X  XX  X  ',
  ' X        X ',
];

// tier 1 — "crab" (middle rows)
const CRAB_A = [
  '  X      X  ',
  '   X    X   ',
  '  XXXXXXXX  ',
  ' XX XXXX XX ',
  'XXXXXXXXXXXX',
  'X XXXXXXXX X',
  'X X      X X',
  '   XX  XX   ',
];
const CRAB_B = [
  '  X      X  ',
  '   X    X   ',
  '  XXXXXXXX  ',
  ' XX XXXX XX ',
  'XXXXXXXXXXXX',
  'X XXXXXXXX X',
  '  X      X  ',
  ' X        X ',
];

// tier 2 — "octopus" (bottom rows)
const OCTO_A = [
  '    XXXX    ',
  '  XXXXXXXX  ',
  ' XXXXXXXXXX ',
  'XXX  XX  XXX',
  'XXXXXXXXXXXX',
  '  XXXXXXXX  ',
  '  XX    XX  ',
  ' XX      XX ',
];
const OCTO_B = [
  '    XXXX    ',
  '  XXXXXXXX  ',
  ' XXXXXXXXXX ',
  'XXX  XX  XXX',
  'XXXXXXXXXXXX',
  '  XXXXXXXX  ',
  ' X  XXXX  X ',
  'X  X    X  X',
];

// [tier][frame] — frame toggles each march step for the iconic wiggle.
const INVADER_ART: string[][][] = [
  [SQUID_A, SQUID_B],
  [CRAB_A, CRAB_B],
  [OCTO_A, OCTO_B],
];

const BUNKER_ART = [
  '   XXXXXX   ',
  '  XXXXXXXX  ',
  ' XXXXXXXXXX ',
  'XXXXXXXXXXXX',
  'XXXX    XXXX',
  'XXX      XXX',
];

const SPLAT_ART = [
  'X  X    X  X',
  ' X  X  X  X ',
  '   X XX X   ',
  'XX XXXXXX XX',
  '   X XX X   ',
  ' X  X  X  X ',
  'X  X    X  X',
];

/** Rasterise a pixel grid into a crisp CanvasTexture. */
function makePixelTexture(rows: string[], color: string, cell = PIXEL_CELL): THREE.CanvasTexture {
  const cols = rows[0]?.length ?? 1;
  const canvas = document.createElement('canvas');
  canvas.width = cols * cell;
  canvas.height = rows.length * cell;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = color;
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y];
      if (!row) continue;
      for (let x = 0; x < cols; x++) {
        const c = row[x];
        if (c && c !== ' ' && c !== '.') ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Bunker texture eroded by `damage` (0 = pristine): scatter-clears filled cells. */
function makeBunkerTexture(damage: number, cell = PIXEL_CELL): THREE.CanvasTexture {
  const cols = BUNKER_ART[0]?.length ?? 1;
  const canvas = document.createElement('canvas');
  canvas.width = cols * cell;
  canvas.height = BUNKER_ART.length * cell;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = BUNKER_COLOR;
    for (let y = 0; y < BUNKER_ART.length; y++) {
      const row = BUNKER_ART[y];
      if (!row) continue;
      for (let x = 0; x < cols; x++) {
        const c = row[x];
        if (!c || c === ' ' || c === '.') continue;
        // deterministic scatter so erosion looks chipped, not uniform
        if (((x * 5 + y * 3) % 11) < damage * 3) continue;
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// --- TYPE DEFINITIONS -------------------------------------------------------
type GameState = 'ready' | 'playing' | 'gameover' | 'victory';

interface Enemy {
  mesh: THREE.Mesh;
  x: number;
  y: number;
  col: number;
  row: number;
  tier: number;
  alive: boolean;
}

interface Bullet {
  mesh: THREE.Mesh;
  x: number;
  y: number;
  speed: number;
  direction: 'up' | 'down';
  alive: boolean;
}

interface Shield {
  mesh: THREE.Mesh;
  x: number;
  y: number;
  health: number;
  alive: boolean;
}

interface Explosion {
  mesh: THREE.Mesh;
  x: number;
  y: number;
  life: number;
  maxLife: number;
  alive: boolean;
}

// --- RENDERER / SCENE / CAMERA / LIGHTS ---------------------------------------
const app = createOrthoApp({ worldHeight: WORLD_HEIGHT, clearColor: COLORS.background });
const { renderer, scene, camera } = app;

const groundY = -WORLD_HEIGHT / 2;
const ceilingY = WORLD_HEIGHT / 2;

// Fit the invader formation to the real world width. Portrait phones are narrow
// (worldWidth ≈ 5.5), so a fixed 10-column grid spawned half off-screen and the
// swarm bounced edge-to-edge and dropped onto the player within seconds.
const enemyCols = Math.max(4, Math.min(ENEMY_COLS, Math.floor((app.worldWidth * 0.9) / ENEMY_GAP)));

// Row → tier: top row = squid, next two = crab, bottom two = octopus.
function tierForRow(row: number): number {
  if (row === 0) return 0;
  if (row <= 2) return 1;
  return 2;
}

// --- STARFIELD BACKGROUND -----------------------------------------------------
function createStarfield(): void {
  const positions: number[] = [];
  const colors: number[] = [];

  for (let i = 0; i < STAR_COUNT; i++) {
    const x = (Math.random() - 0.5) * app.worldWidth * 2;
    const y = (Math.random() - 0.5) * WORLD_HEIGHT * 2;
    const z = Math.random() * STAR_LAYER_HEIGHT;

    positions.push(x, y, z);

    const brightness = 0.3 + Math.random() * 0.7;
    colors.push(brightness, brightness, brightness);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.08,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
  });

  const stars = new THREE.Points(geometry, material);
  scene.add(stars);
}

// Classic arcade baseline the bunkers and ship sit on.
function createGroundLine(): void {
  const geo = new THREE.PlaneGeometry(app.worldWidth * 2, 0.06);
  const mat = new THREE.MeshBasicMaterial({ color: COLORS.ground, transparent: true, opacity: 0.55 });
  const line = new THREE.Mesh(geo, mat);
  line.position.set(0, groundY + 0.45, 0.05);
  scene.add(line);
}

// --- PLAYER ------------------------------------------------------------------
let playerX = 0;
let playerY = groundY + 1.5;
let targetX = 0; // drag / keyboard target the ship lerps toward

// White sprite so material.color can tint the ship + its glow halo.
const playerTexture = makePixelTexture(PLAYER_ART, '#ffffff');
const playerGeometry = new THREE.PlaneGeometry(0.9, 0.55);
const playerMaterial = new THREE.MeshBasicMaterial({
  map: playerTexture,
  transparent: true,
  color: COLORS.player,
});
const playerMesh = new THREE.Mesh(playerGeometry, playerMaterial);
playerMesh.position.set(playerX, playerY, 0.1);
scene.add(playerMesh);

// Player glow halo — same sprite, larger, dim green, behind the ship.
const playerGlowGeometry = new THREE.PlaneGeometry(0.9 * 1.35, 0.55 * 1.35);
const playerGlowMaterial = new THREE.MeshBasicMaterial({
  map: playerTexture,
  transparent: true,
  color: COLORS.playerGlow,
  opacity: 0.45,
});
const playerGlowMesh = new THREE.Mesh(playerGlowGeometry, playerGlowMaterial);
playerGlowMesh.position.set(playerX, playerY, -0.1);
scene.add(playerGlowMesh);

// --- BULLETS ------------------------------------------------------------------
const bulletGeometry = new THREE.BoxGeometry(BULLET_SIZE, BULLET_SIZE * 3, 0.1);
const playerBulletMaterial = new THREE.MeshBasicMaterial({ color: COLORS.playerBullet });
const enemyBulletMaterial = new THREE.MeshBasicMaterial({ color: COLORS.enemyBullet });
const bullets: Bullet[] = [];
const MAX_BULLETS = 50;

function initBullets(): void {
  for (let i = 0; i < MAX_BULLETS; i++) {
    const mesh = new THREE.Mesh(bulletGeometry, playerBulletMaterial);
    mesh.visible = false;
    scene.add(mesh);
    bullets.push({
      mesh,
      x: 0,
      y: 0,
      speed: BULLET_SPEED,
      direction: 'up',
      alive: false,
    });
  }
}

function fireBullet(x: number, y: number, direction: 'up' | 'down' = 'up'): void {
  for (const bullet of bullets) {
    if (!bullet.alive) {
      bullet.x = x;
      bullet.y = y;
      bullet.direction = direction;
      // Enemy shots fall slower than the player's shots rise — gives you a chance to dodge
      bullet.speed = direction === 'up' ? BULLET_SPEED : ENEMY_BULLET_SPEED;
      bullet.alive = true;
      bullet.mesh.material = direction === 'up' ? playerBulletMaterial : enemyBulletMaterial;
      bullet.mesh.position.set(x, y, 0.2);
      bullet.mesh.visible = true;
      return;
    }
  }
}

// --- ENEMIES ------------------------------------------------------------------
// Plane sized to keep the 12×8 sprite aspect; collision still uses ENEMY_SIZE.
const enemyGeometry = new THREE.PlaneGeometry(ENEMY_SIZE, (ENEMY_SIZE * 8) / 12);
// [tier][frame] materials, built once and reused — no per-frame allocation.
const invaderMaterials: THREE.MeshBasicMaterial[][] = INVADER_ART.map((frames, tier) =>
  frames.map((art) => {
    const color = TIER_COLORS[tier] ?? '#5dff8f';
    return new THREE.MeshBasicMaterial({ map: makePixelTexture(art, color), transparent: true });
  })
);
const enemies: Enemy[] = [];
let animFrame = 0; // toggled each march step for the wiggle

function initEnemies(): void {
  for (let row = 0; row < ENEMY_ROWS; row++) {
    const tier = tierForRow(row);
    for (let col = 0; col < enemyCols; col++) {
      const frames = invaderMaterials[tier];
      const mesh = new THREE.Mesh(enemyGeometry, frames?.[0] ?? playerMaterial);
      const x = (col - (enemyCols - 1) / 2) * ENEMY_GAP;
      const y = ceilingY - 2 - row * ENEMY_GAP;

      mesh.position.set(x, y, 0.1);
      mesh.visible = true;
      scene.add(mesh);

      enemies.push({ mesh, x, y, col, row, tier, alive: true });
    }
  }
}

let enemyDirection = 1; // 1 for right, -1 for left
let enemySpeed = ENEMY_SPEED_BASE;
let enemyMoveTimer = 0;
let enemyMoveInterval = ENEMY_MOVE_INTERVAL;
let enemyDropNext = false;
let enemyFireCooldown = 0;

function updateEnemies(dt: number): void {
  enemyMoveTimer += dt;

  if (enemyMoveTimer >= enemyMoveInterval) {
    enemyMoveTimer = 0;

    // Check if any enemy would go out of bounds
    let minX = Infinity;
    let maxX = -Infinity;
    let anyAlive = false;

    for (const enemy of enemies) {
      if (enemy.alive) {
        anyAlive = true;
        minX = Math.min(minX, enemy.x);
        maxX = Math.max(maxX, enemy.x);
      }
    }

    if (!anyAlive) return;

    const rightmost = maxX + ENEMY_SIZE / 2;
    const leftmost = minX - ENEMY_SIZE / 2;
    const worldRight = app.worldWidth / 2 - ENEMY_SIZE / 2;
    const worldLeft = -app.worldWidth / 2 + ENEMY_SIZE / 2;

    if ((enemyDirection > 0 && rightmost >= worldRight) ||
        (enemyDirection < 0 && leftmost <= worldLeft)) {
      enemyDirection *= -1;
      enemyDropNext = true;
    }

    // Toggle march frame, then move + re-skin every alive invader.
    animFrame = animFrame === 0 ? 1 : 0;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      if (enemyDropNext) {
        enemy.y -= ENEMY_DROP;
        enemy.mesh.position.y = enemy.y;
      } else {
        enemy.x += enemyDirection * enemySpeed * enemyMoveInterval;
        enemy.mesh.position.x = enemy.x;
      }
      const mat = invaderMaterials[enemy.tier]?.[animFrame];
      if (mat) enemy.mesh.material = mat;
    }

    enemyDropNext = false;

    // Check if enemies reached the bottom (game over)
    for (const enemy of enemies) {
      if (enemy.alive && enemy.y <= groundY + ENEMY_SIZE / 2 + 0.5) {
        gameOver();
        return;
      }
    }
  }

  // Enemy shooting — throttled + capped (a few shots on screen, faster each wave)
  enemyFireCooldown -= dt;
  const activeEnemyBullets = bullets.filter((b) => b.alive && b.direction === 'down').length;
  if (enemyFireCooldown <= 0 && activeEnemyBullets < MAX_ENEMY_BULLETS) {
    const aliveEnemies = enemies.filter((e) => e.alive);
    const shooter = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
    if (shooter) {
      fireBullet(shooter.x, shooter.y - ENEMY_SIZE / 2, 'down');
      const interval = Math.max(0.45, ENEMY_FIRE_INTERVAL - (wave - 1) * 0.12);
      enemyFireCooldown = interval * (0.6 + Math.random() * 0.8);
    }
  }
}

// --- SHIELDS ------------------------------------------------------------------
const shieldGeometry = new THREE.PlaneGeometry(SHIELD_SIZE, (SHIELD_SIZE * 6) / 12);
// Erosion frames: index = SHIELD_HEALTH - health (0 = pristine).
const bunkerMaterials: THREE.MeshBasicMaterial[] = [0, 1, 2, 3].map(
  (d) => new THREE.MeshBasicMaterial({ map: makeBunkerTexture(d), transparent: true })
);
const shields: Shield[] = [];

function bunkerMaterialFor(health: number): THREE.MeshBasicMaterial {
  const idx = Math.min(bunkerMaterials.length - 1, Math.max(0, SHIELD_HEALTH - health));
  return bunkerMaterials[idx] ?? bunkerMaterials[0]!;
}

function initShields(): void {
  for (let i = 0; i < SHIELD_COUNT; i++) {
    const mesh = new THREE.Mesh(shieldGeometry, bunkerMaterials[0]!);
    const x = (i - (SHIELD_COUNT - 1) / 2) * (app.worldWidth / (SHIELD_COUNT + 1));
    const y = groundY + 2;

    mesh.position.set(x, y, 0.1);
    scene.add(mesh);

    shields.push({ mesh, x, y, health: SHIELD_HEALTH, alive: true });
  }
}

function damageShield(shield: Shield): void {
  shield.health--;
  if (shield.health <= 0) {
    shield.alive = false;
    shield.mesh.visible = false;
  } else {
    shield.mesh.material = bunkerMaterialFor(shield.health);
  }
}

// --- EXPLOSIONS --------------------------------------------------------------
const explosionGeometry = new THREE.PlaneGeometry(0.85, 0.85);
const explosionEnemyMaterial = new THREE.MeshBasicMaterial({
  map: makePixelTexture(SPLAT_ART, EXPLOSION_ENEMY_COLOR),
  transparent: true,
});
const explosionPlayerMaterial = new THREE.MeshBasicMaterial({
  map: makePixelTexture(SPLAT_ART, EXPLOSION_PLAYER_COLOR),
  transparent: true,
});
const explosions: Explosion[] = [];
const MAX_EXPLOSIONS = 20;

function initExplosions(): void {
  for (let i = 0; i < MAX_EXPLOSIONS; i++) {
    const mesh = new THREE.Mesh(explosionGeometry, explosionEnemyMaterial);
    mesh.visible = false;
    scene.add(mesh);

    explosions.push({ mesh, x: 0, y: 0, life: 0, maxLife: 0.32, alive: false });
  }
}

function createExplosion(x: number, y: number, kind: 'enemy' | 'player' = 'enemy'): void {
  for (const explosion of explosions) {
    if (!explosion.alive) {
      explosion.x = x;
      explosion.y = y;
      explosion.life = explosion.maxLife;
      explosion.alive = true;
      explosion.mesh.material = kind === 'player' ? explosionPlayerMaterial : explosionEnemyMaterial;
      explosion.mesh.position.set(x, y, 0.3);
      explosion.mesh.scale.set(1, 1, 1);
      explosion.mesh.visible = true;
      return;
    }
  }
}

// --- COLLISION DETECTION -----------------------------------------------------
function checkCollisions(): void {
  // Player bullets vs enemies
  for (const bullet of bullets) {
    if (!bullet.alive || bullet.direction !== 'up') continue;

    for (const enemy of enemies) {
      if (!enemy.alive) continue;

      const dx = bullet.x - enemy.x;
      const dy = bullet.y - enemy.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < (ENEMY_SIZE + BULLET_SIZE) / 2) {
        bullet.alive = false;
        bullet.mesh.visible = false;
        enemy.alive = false;
        enemy.mesh.visible = false;

        createExplosion(enemy.x, enemy.y, 'enemy');
        addScore(100);

        // Check if all enemies are dead
        if (enemies.every(e => !e.alive)) {
          victory();
        }
        break;
      }
    }
  }

  // Enemy bullets vs player
  if (invincibilityTime <= 0) {
    for (const bullet of bullets) {
      if (!bullet.alive || bullet.direction !== 'down') continue;

      const dx = bullet.x - playerX;
      const dy = bullet.y - playerY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < (PLAYER_SIZE + BULLET_SIZE) / 2) {
        bullet.alive = false;
        bullet.mesh.visible = false;

        createExplosion(playerX, playerY, 'player');
        lives--;
        updateLivesDisplay();

        if (lives <= 0) {
          gameOver();
        } else {
          // Brief invincibility after hit
          invincibilityTime = INVINCIBILITY_TIME;
        }
        break;
      }
    }
  }

  // Player bullets vs shields
  for (const bullet of bullets) {
    if (!bullet.alive || bullet.direction !== 'up') continue;

    for (const shield of shields) {
      if (!shield.alive) continue;

      const dx = bullet.x - shield.x;
      const dy = bullet.y - shield.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < (SHIELD_SIZE + BULLET_SIZE) / 2) {
        bullet.alive = false;
        bullet.mesh.visible = false;
        damageShield(shield);
        break;
      }
    }
  }

  // Enemy bullets vs shields
  for (const bullet of bullets) {
    if (!bullet.alive || bullet.direction !== 'down') continue;

    for (const shield of shields) {
      if (!shield.alive) continue;

      const dx = bullet.x - shield.x;
      const dy = bullet.y - shield.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < (SHIELD_SIZE + BULLET_SIZE) / 2) {
        bullet.alive = false;
        bullet.mesh.visible = false;
        damageShield(shield);
        break;
      }
    }
  }
}

// --- GAME STATE -------------------------------------------------------------
let state: GameState = 'ready';
let score = 0;
let lives = INITIAL_LIVES;
let elapsed = 0;
let invincibilityTime = 0;
let wave = 1;
let playerFireCooldown = 0;

const scoreDisplay = document.getElementById('space-invaders-score') as HTMLElement;
const livesDisplay = document.getElementById('space-invaders-lives') as HTMLElement;
const waveDisplay = document.getElementById('space-invaders-wave') as HTMLElement;
const gameOverlay = document.getElementById('space-invaders-game-overlay') as HTMLElement;
const startBtn = document.getElementById('space-invaders-start-btn') as HTMLButtonElement;
const buildStamp = document.getElementById('space-invaders-build-stamp') as HTMLElement;
const leaderboardBtn = document.getElementById('space-invaders-leaderboard-btn') as HTMLButtonElement;
const hud = document.getElementById('space-invaders-hud') as HTMLElement;

// Leaderboard button stops tap propagation
leaderboardBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
leaderboardBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  showLeaderboard('space-invaders', {
    title: 'Space Invaders — Top',
    playerName: getStoredPlayerName(),
    highlightScore: score,
  });
});

// Start button
startBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  startGame();
});

function updateLivesDisplay(): void {
  livesDisplay.textContent = '❤️'.repeat(lives);
}

function updateWaveDisplay(): void {
  waveDisplay.textContent = `WAVE ${wave}`;
}

function addScore(points: number): void {
  score += points;
  scoreDisplay.textContent = score.toString();

  // Flash score briefly
  scoreDisplay.style.transform = 'scale(1.2)';
  setTimeout(() => {
    scoreDisplay.style.transform = 'scale(1)';
  }, 100);
}

// Repopulate the board for a fresh wave (enemies/shields/bullets/explosions + player),
// without touching score or lives. Shared by startGame() and nextWave().
function spawnWave(): void {
  // Reset player to center
  playerX = 0;
  targetX = 0;
  playerY = groundY + 1.5;
  playerFireCooldown = 0;
  playerMesh.position.set(playerX, playerY, 0.1);
  playerGlowMesh.position.set(playerX, playerY, -0.1);
  playerMesh.visible = true;
  playerGlowMesh.visible = true;

  // Reset enemies
  animFrame = 0;
  for (const enemy of enemies) {
    enemy.x = (enemy.col - (enemyCols - 1) / 2) * ENEMY_GAP;
    enemy.y = ceilingY - 2 - enemy.row * ENEMY_GAP;
    enemy.alive = true;
    const frames = invaderMaterials[enemy.tier];
    if (frames && frames[0]) enemy.mesh.material = frames[0];
    enemy.mesh.position.set(enemy.x, enemy.y, 0.1);
    enemy.mesh.visible = true;
  }

  // Reset shields
  for (const shield of shields) {
    shield.health = SHIELD_HEALTH;
    shield.alive = true;
    shield.mesh.material = bunkerMaterials[0]!;
    shield.mesh.visible = true;
  }

  // Clear bullets + explosions
  for (const bullet of bullets) {
    bullet.alive = false;
    bullet.mesh.visible = false;
  }
  for (const explosion of explosions) {
    explosion.alive = false;
    explosion.mesh.visible = false;
  }

  enemyDirection = 1;
  enemyMoveTimer = 0;
  enemyFireCooldown = ENEMY_FIRE_INTERVAL;
  invincibilityTime = INVINCIBILITY_TIME;
}

function showPlayingUI(): void {
  hud.style.display = 'flex';
  gameOverlay.style.display = 'none';
  startBtn.style.display = 'none';
  leaderboardBtn.style.display = 'none';
}

// Full reset — first start and game-over restart.
function startGame(): void {
  state = 'playing';
  score = 0;
  lives = INITIAL_LIVES;
  wave = 1;
  elapsed = 0;
  enemySpeed = ENEMY_SPEED_BASE;

  scoreDisplay.textContent = '0';
  updateLivesDisplay();
  updateWaveDisplay();

  spawnWave();
  showPlayingUI();
}

// Advance to the next wave — keeps score + lives, enemies get faster.
function nextWave(): void {
  state = 'playing';
  wave++;
  enemySpeed = ENEMY_SPEED_BASE + (wave - 1) * ENEMY_SPEED_INCREMENT;
  updateWaveDisplay();

  spawnWave();
  showPlayingUI();
}

function gameOver(): void {
  state = 'gameover';
  hud.style.display = 'none';
  gameOverlay.innerHTML = '<h1>GAME OVER</h1><p>Tap to Restart</p>';
  gameOverlay.style.display = 'flex';
  startBtn.style.display = 'none';
  leaderboardBtn.style.display = 'block';

  // Submit score
  submitSpaceInvadersScore(score);
}

function victory(): void {
  state = 'victory';
  hud.style.display = 'none';
  // wave is incremented in nextWave(); show the wave the player just cleared
  gameOverlay.innerHTML = `<h1>WAVE ${wave} CLEAR</h1><p>Tap to Continue</p>`;
  gameOverlay.style.display = 'flex';
  startBtn.style.display = 'none';
  leaderboardBtn.style.display = 'none';
}

async function submitSpaceInvadersScore(finalScore: number): Promise<void> {
  const name = await promptPlayerName();
  if (!name) return;
  await submitScore('space-invaders', name, finalScore, { build: __BUILD_INFO__ });
}

// --- BUILD STAMP ------------------------------------------------------------
buildStamp.textContent = __BUILD_INFO__;

// --- INITIALIZATION ----------------------------------------------------------
function init(): void {
  createStarfield();
  createGroundLine();
  initBullets();
  initEnemies();
  initShields();
  initExplosions();

  // Hide HUD initially
  hud.style.display = 'none';
  startBtn.style.display = 'block';
  leaderboardBtn.style.display = 'none';

  // Show build stamp
  buildStamp.style.display = 'block';
}

// --- GAME LOOP --------------------------------------------------------------
function update(dt: number): void {
  dt = Math.min(dt, MAX_DT);
  elapsed += dt;

  if (state === 'playing') {

  // Keyboard hold-to-steer slides the target; touch drag sets it directly.
  if (keyLeft) targetX -= PLAYER_SPEED * dt;
  if (keyRight) targetX += PLAYER_SPEED * dt;
  targetX = THREE.MathUtils.clamp(
    targetX,
    -app.worldWidth / 2 + PLAYER_SIZE / 2,
    app.worldWidth / 2 - PLAYER_SIZE / 2
  );

  // Smooth chase toward the target so the ship doesn't teleport under the finger.
  playerX += (targetX - playerX) * Math.min(1, PLAYER_LERP * dt);
  playerMesh.position.x = playerX;
  playerGlowMesh.position.x = playerX;

  // Auto-fire at a capped rate — no tap needed on mobile.
  playerFireCooldown -= dt;
  if (playerFireCooldown <= 0) {
    fireBullet(playerX, playerY + PLAYER_HEIGHT / 2, 'up');
    playerFireCooldown = PLAYER_FIRE_INTERVAL;
  }

  // Update invincibility timer
  if (invincibilityTime > 0) {
    invincibilityTime -= dt;
    if (invincibilityTime <= 0) {
      playerMesh.visible = true;
      playerGlowMesh.visible = true;
    } else {
      // Flash player during invincibility
      if (Math.floor(elapsed * 8) % 2 === 0) {
        playerMesh.visible = true;
        playerGlowMesh.visible = true;
      } else {
        playerMesh.visible = false;
        playerGlowMesh.visible = false;
      }
    }
  }

  // Update bullets
  for (const bullet of bullets) {
    if (!bullet.alive) continue;

    bullet.y += bullet.speed * (bullet.direction === 'up' ? 1 : -1) * dt;
    bullet.mesh.position.y = bullet.y;

    // Remove bullets that go off screen
    if (bullet.y > ceilingY + 1 || bullet.y < groundY - 1) {
      bullet.alive = false;
      bullet.mesh.visible = false;
    }
  }

  // Update enemies
  updateEnemies(dt);

  // Update explosions — pixel splat lingers briefly, then vanishes
  for (const explosion of explosions) {
    if (!explosion.alive) continue;

    explosion.life -= dt;
    if (explosion.life <= 0) {
      explosion.alive = false;
      explosion.mesh.visible = false;
    }
  }

  // Check collisions
  checkCollisions();
  } // end playing-state update

  // Render every frame so the title / game-over screens show the scene, not black
  renderer.render(scene, camera);
}

// --- INPUT HANDLING ----------------------------------------------------------
// Map a screen X (px) edge-to-edge to the ship's world X (mirrors synth-rider).
function setTargetFromClientX(clientX: number): void {
  const viewW = window.visualViewport?.width ?? window.innerWidth;
  const nx = (clientX / viewW) * 2 - 1; // -1 (left) .. 1 (right)
  targetX = THREE.MathUtils.clamp(
    nx * (app.worldWidth / 2),
    -app.worldWidth / 2 + PLAYER_SIZE / 2,
    app.worldWidth / 2 - PLAYER_SIZE / 2
  );
}

let dragging = false;
let keyLeft = false;
let keyRight = false;

window.addEventListener('pointerdown', (e) => {
  const t = e.target as HTMLElement;
  // Ignore UI buttons / the leaderboard modal.
  if (t.closest('#space-invaders-start-btn') ||
      t.closest('#space-invaders-leaderboard-btn') ||
      t.closest('.gl-leaderboard-backdrop')) {
    return;
  }

  if (state === 'ready' || state === 'gameover') {
    startGame();
    return; // don't begin a drag on the gesture that starts the game
  }
  if (state === 'victory') {
    nextWave();
    return;
  }

  // playing — begin dragging the ship
  dragging = true;
  setTargetFromClientX(e.clientX);
});

window.addEventListener('pointermove', (e) => {
  if (dragging && state === 'playing') setTargetFromClientX(e.clientX);
});
window.addEventListener('pointerup', () => {
  dragging = false;
});
window.addEventListener('pointercancel', () => {
  dragging = false;
});

// Keyboard support for desktop — auto-fire handles shooting, arrows/A/D steer.
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault(); // swallow so a focused button doesn't restart / page doesn't scroll
    return;
  }
  if (state !== 'playing') return;
  if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') keyLeft = true;
  else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') keyRight = true;
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') keyLeft = false;
  else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') keyRight = false;
});

// --- START THE GAME ---------------------------------------------------------
init();
startGameLoop(update, MAX_DT);
