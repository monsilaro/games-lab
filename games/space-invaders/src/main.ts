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
const PLAYER_SPEED = 6; // units/s
const PLAYER_SIZE = 0.8; // player ship width
const PLAYER_HEIGHT = 0.4;
const BULLET_SPEED = 12; // units/s
const BULLET_SIZE = 0.12;
const ENEMY_ROWS = 5;
const ENEMY_COLS = 10;
const ENEMY_SIZE = 0.7;
const ENEMY_SPACING = 1.0; // between enemies
const ENEMY_DROP = 0.5; // how far enemies drop when they reach edge
const ENEMY_SPEED_BASE = 1.5; // units/s
const ENEMY_SPEED_INCREMENT = 0.2; // speed increase per wave
const ENEMY_BULLET_SPEED = 4; // units/s
const ENEMY_BULLET_CHANCE = 0.005; // chance per enemy per frame to shoot
const SHIELD_SIZE = 0.8;
const SHIELD_COUNT = 4;
const MAX_DT = 0.05; // clamp delta time
const INITIAL_LIVES = 3;

// visuals
const STAR_COUNT = 150;
const STAR_LAYER_HEIGHT = 5;

// timing
const ENEMY_MOVE_INTERVAL = 0.5; // seconds between enemy movements
const INVINCIBILITY_TIME = 2.0; // seconds after game start

// --- COLORS -----------------------------------------------------------------
const COLORS = {
  background: 0x0a0a1a,
  stars: 0x444466,
  player: 0x00ff88,
  playerGlow: 0x008844,
  bullet: 0x00ff88,
  enemy: 0xff4444,
  enemyGlow: 0x882222,
  enemyBullet: 0xff6666,
  shield: 0x4488ff,
  shieldGlow: 0x224488,
  explosion: 0xffaa44,
  explosionGlow: 0xff6600,
  text: 0xffffff,
  textGlow: 0x00ff88,
};

// --- TYPE DEFINITIONS -------------------------------------------------------
type GameState = 'ready' | 'playing' | 'gameover' | 'victory';

interface Enemy {
  mesh: THREE.Mesh;
  x: number;
  y: number;
  col: number;
  row: number;
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

// Lighting for the glow effects
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const groundY = -WORLD_HEIGHT / 2;
const ceilingY = WORLD_HEIGHT / 2;

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

// --- PLAYER ------------------------------------------------------------------
let playerX = 0;
let playerY = groundY + 1.5;
const playerGeometry = new THREE.BoxGeometry(PLAYER_SIZE, PLAYER_HEIGHT, 0.2);
const playerMaterial = new THREE.MeshBasicMaterial({ color: COLORS.player });
const playerMesh = new THREE.Mesh(playerGeometry, playerMaterial);
playerMesh.position.set(playerX, playerY, 0.1);
scene.add(playerMesh);

// Player glow effect
const playerGlowGeometry = new THREE.BoxGeometry(PLAYER_SIZE * 1.3, PLAYER_HEIGHT * 1.3, 0.3);
const playerGlowMaterial = new THREE.MeshBasicMaterial({
  color: COLORS.playerGlow,
  transparent: true,
  opacity: 0.3,
});
const playerGlowMesh = new THREE.Mesh(playerGlowGeometry, playerGlowMaterial);
playerGlowMesh.position.set(playerX, playerY, -0.1);
scene.add(playerGlowMesh);

// --- BULLETS ------------------------------------------------------------------
const bulletGeometry = new THREE.BoxGeometry(BULLET_SIZE, BULLET_SIZE * 3, 0.1);
const bulletMaterial = new THREE.MeshBasicMaterial({ color: COLORS.bullet });
const bullets: Bullet[] = [];
const MAX_BULLETS = 50;

function initBullets(): void {
  for (let i = 0; i < MAX_BULLETS; i++) {
    const mesh = new THREE.Mesh(bulletGeometry, bulletMaterial);
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
      bullet.alive = true;
      bullet.mesh.position.set(x, y, 0.2);
      bullet.mesh.visible = true;

      // Play sound (visual feedback)
      flashPlayer();
      return;
    }
  }
}

// --- ENEMIES ------------------------------------------------------------------
const enemyGeometry = new THREE.BoxGeometry(ENEMY_SIZE, ENEMY_SIZE * 0.7, 0.2);
const enemyMaterial = new THREE.MeshBasicMaterial({ color: COLORS.enemy });
const enemies: Enemy[] = [];

function initEnemies(): void {
  for (let row = 0; row < ENEMY_ROWS; row++) {
    for (let col = 0; col < ENEMY_COLS; col++) {
      const mesh = new THREE.Mesh(enemyGeometry, enemyMaterial);
      const x = (col - (ENEMY_COLS - 1) / 2) * ENEMY_SPACING;
      const y = ceilingY - 2 - row * ENEMY_SPACING;

      mesh.position.set(x, y, 0.1);
      mesh.visible = true;
      scene.add(mesh);

      enemies.push({
        mesh,
        x,
        y,
        col,
        row,
        alive: true,
      });
    }
  }
}

let enemyDirection = 1; // 1 for right, -1 for left
let enemySpeed = ENEMY_SPEED_BASE;
let enemyMoveTimer = 0;
let enemyMoveInterval = ENEMY_MOVE_INTERVAL;
let enemyDropNext = false;

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

    // Move enemies
    for (const enemy of enemies) {
      if (enemy.alive) {
        if (enemyDropNext) {
          enemy.y -= ENEMY_DROP;
          enemy.mesh.position.y = enemy.y;
        } else {
          enemy.x += enemyDirection * enemySpeed * enemyMoveInterval;
          enemy.mesh.position.x = enemy.x;
        }
      }
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

  // Enemy shooting
  const aliveEnemies = enemies.filter(e => e.alive);
  if (aliveEnemies.length > 0 && Math.random() < ENEMY_BULLET_CHANCE * aliveEnemies.length * dt * 60) {
    const shooter = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
    fireBullet(shooter.x, shooter.y - ENEMY_SIZE / 2, 'down');
  }
}

// --- SHIELDS ------------------------------------------------------------------
const shieldGeometry = new THREE.BoxGeometry(SHIELD_SIZE, SHIELD_SIZE * 0.5, 0.2);
const shieldMaterial = new THREE.MeshBasicMaterial({ color: COLORS.shield });
const shields: Shield[] = [];

function initShields(): void {
  for (let i = 0; i < SHIELD_COUNT; i++) {
    const mesh = new THREE.Mesh(shieldGeometry, shieldMaterial);
    const x = (i - (SHIELD_COUNT - 1) / 2) * (app.worldWidth / (SHIELD_COUNT + 1));
    const y = groundY + 2;

    mesh.position.set(x, y, 0.1);
    scene.add(mesh);

    shields.push({
      mesh,
      x,
      y,
      health: 3,
      alive: true,
    });
  }
}

// --- EXPLOSIONS --------------------------------------------------------------
const explosionGeometry = new THREE.SphereGeometry(0.3, 16, 16);
const explosionMaterial = new THREE.MeshBasicMaterial({ color: COLORS.explosion });
const explosions: Explosion[] = [];
const MAX_EXPLOSIONS = 20;

function initExplosions(): void {
  for (let i = 0; i < MAX_EXPLOSIONS; i++) {
    const mesh = new THREE.Mesh(explosionGeometry, explosionMaterial);
    mesh.visible = false;
    scene.add(mesh);

    explosions.push({
      mesh,
      x: 0,
      y: 0,
      life: 0,
      maxLife: 0.5,
      alive: false,
    });
  }
}

function createExplosion(x: number, y: number): void {
  for (const explosion of explosions) {
    if (!explosion.alive) {
      explosion.x = x;
      explosion.y = y;
      explosion.life = explosion.maxLife;
      explosion.alive = true;
      explosion.mesh.position.set(x, y, 0.3);
      explosion.mesh.visible = true;
      explosion.mesh.scale.set(0.5, 0.5, 0.5);
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

        createExplosion(enemy.x, enemy.y);
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

        createExplosion(playerX, playerY);
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
        shield.health--;

        if (shield.health <= 0) {
          shield.alive = false;
          shield.mesh.visible = false;
        }
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
        shield.health--;

        if (shield.health <= 0) {
          shield.alive = false;
          shield.mesh.visible = false;
        }
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

const scoreDisplay = document.getElementById('space-invaders-score') as HTMLElement;
const livesDisplay = document.getElementById('space-invaders-lives') as HTMLElement;
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
startBtn.addEventListener('click', () => {
  startGame();
});

// Tap to start/restart
window.addEventListener('pointerdown', () => {
  if (state === 'ready') {
    startGame();
  } else if (state === 'gameover' || state === 'victory') {
    startGame();
  }
});

function updateLivesDisplay(): void {
  livesDisplay.textContent = '❤️'.repeat(lives);
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

function flashPlayer(): void {
  playerMesh.material.color.setHex(COLORS.playerGlow);
  setTimeout(() => {
    playerMesh.material.color.setHex(COLORS.player);
  }, 50);
}

function startGame(): void {
  state = 'playing';
  score = 0;
  lives = INITIAL_LIVES;
  wave = 1;
  elapsed = 0;
  invincibilityTime = INVINCIBILITY_TIME;
  enemySpeed = ENEMY_SPEED_BASE + (wave - 1) * ENEMY_SPEED_INCREMENT;

  scoreDisplay.textContent = '0';
  updateLivesDisplay();

  // Reset player
  playerX = 0;
  playerY = groundY + 1.5;
  playerMesh.position.set(playerX, playerY, 0.1);
  playerGlowMesh.position.set(playerX, playerY, -0.1);
  playerMesh.visible = true;
  playerGlowMesh.visible = true;

  // Reset enemies
  for (const enemy of enemies) {
    const col = enemy.col;
    const row = enemy.row;
    enemy.x = (col - (ENEMY_COLS - 1) / 2) * ENEMY_SPACING;
    enemy.y = ceilingY - 2 - row * ENEMY_SPACING;
    enemy.alive = true;
    enemy.mesh.position.set(enemy.x, enemy.y, 0.1);
    enemy.mesh.visible = true;
  }

  // Reset shields
  for (const shield of shields) {
    shield.health = 3;
    shield.alive = true;
    shield.mesh.visible = true;
  }

  // Clear bullets
  for (const bullet of bullets) {
    bullet.alive = false;
    bullet.mesh.visible = false;
  }

  // Clear explosions
  for (const explosion of explosions) {
    explosion.alive = false;
    explosion.mesh.visible = false;
  }

  // Show HUD, hide overlay
  hud.style.display = 'flex';
  gameOverlay.style.display = 'none';
  startBtn.style.display = 'none';
  leaderboardBtn.style.display = 'none';

  enemyDirection = 1;
  enemyMoveTimer = 0;
}

function gameOver(): void {
  state = 'gameover';
  hud.style.display = 'none';
  gameOverlay.innerHTML = '<h1>Game Over</h1><p>Tap to Restart</p>';
  gameOverlay.style.display = 'flex';
  startBtn.style.display = 'none';
  leaderboardBtn.style.display = 'block';

  // Submit score
  submitSpaceInvadersScore(score);
}

function victory(): void {
  state = 'victory';
  hud.style.display = 'none';
  wave++;
  gameOverlay.innerHTML = `<h1>Wave ${wave} Complete!</h1><p>Tap to Continue</p>`;
  gameOverlay.style.display = 'flex';
  startBtn.style.display = 'block';
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

  if (state !== 'playing') return;

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

  // Update explosions
  for (const explosion of explosions) {
    if (!explosion.alive) continue;

    explosion.life -= dt;
    if (explosion.life <= 0) {
      explosion.alive = false;
      explosion.mesh.visible = false;
    } else {
      // Animate explosion
      const progress = explosion.life / explosion.maxLife;
      explosion.mesh.scale.set(
        0.5 * (1 - progress),
        0.5 * (1 - progress),
        0.5 * (1 - progress)
      );
      explosion.mesh.material.color.setHex(
        COLORS.explosion + Math.floor((1 - progress) * 0x44)
      );
    }
  }

  // Check collisions
  checkCollisions();

  // Render
  renderer.render(scene, camera);
}

// --- INPUT HANDLING ----------------------------------------------------------
let touchX = 0;

window.addEventListener('pointermove', (e) => {
  if (state !== 'playing') return;

  // Convert screen coordinates to world coordinates
  const rect = renderer.domElement.getBoundingClientRect();
  const screenX = (e.clientX - rect.left) / rect.width * 2 - 1;

  // Convert to world coordinates
  const worldX = screenX * (app.worldWidth / 2);

  touchX = worldX;

  // Move player
  playerX = THREE.MathUtils.clamp(touchX, -app.worldWidth / 2 + PLAYER_SIZE / 2, app.worldWidth / 2 - PLAYER_SIZE / 2);
  playerMesh.position.x = playerX;
  playerGlowMesh.position.x = playerX;
});

window.addEventListener('pointerdown', (e) => {
  if (state !== 'playing') return;

  // Fire bullet from player position
  fireBullet(playerX, playerY + PLAYER_HEIGHT / 2);
});

// Keyboard support for debugging on desktop
window.addEventListener('keydown', (e) => {
  if (state !== 'playing') return;

  if (e.code === 'Space') {
    fireBullet(playerX, playerY + PLAYER_HEIGHT / 2);
  }
  if (e.code === 'ArrowLeft') {
    playerX = THREE.MathUtils.clamp(playerX - PLAYER_SPEED * 0.016, -app.worldWidth / 2 + PLAYER_SIZE / 2, app.worldWidth / 2 - PLAYER_SIZE / 2);
    playerMesh.position.x = playerX;
    playerGlowMesh.position.x = playerX;
  }
  if (e.code === 'ArrowRight') {
    playerX = THREE.MathUtils.clamp(playerX + PLAYER_SPEED * 0.016, -app.worldWidth / 2 + PLAYER_SIZE / 2, app.worldWidth / 2 - PLAYER_SIZE / 2);
    playerMesh.position.x = playerX;
    playerGlowMesh.position.x = playerX;
  }
});

// --- START THE GAME ---------------------------------------------------------
init();
startGameLoop(update, MAX_DT);
