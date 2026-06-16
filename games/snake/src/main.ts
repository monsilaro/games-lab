import {
  submitScore,
  showLeaderboard,
  promptPlayerName,
  getStoredPlayerName,
  startGameLoop,
} from '@games-lab/shared';

// Injected by vite.config.ts define block
declare const __BUILD_INFO__: string;

// --- CONFIGURATION & TUNING --------------------------------------------------
const GRID_SIZE = 20; // Size of each cell in pixels (30x30 cells = 600x600 pixels)
const GRID_COLS = 30;
const GRID_ROWS = 30;
const LEADERBOARD_GAME = 'snake';
const HIGH_SCORE_KEY = 'games-lab.snake.high-score';

interface Position {
  x: number;
  y: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  life: number;
  maxLife: number;
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

type GameState = 'MENU' | 'PLAYING' | 'GAMEOVER';

// --- GAME STATE VARIABLES ----------------------------------------------------
let state: GameState = 'MENU';
let isPaused = false;
let snake: Position[] = [];
let currentDir: Position = { x: 1, y: 0 };
let lastDir: Position = { x: 1, y: 0 };
const inputQueue: Position[] = [];
let food: Position = { x: 0, y: 0 };
let score = 0;
let highScore = loadHighScore();
let shakeIntensity = 0;
let accumulator = 0;
let stepInterval = 0.12; // Time in seconds between movements (accelerates down to 0.06)

const particles: Particle[] = [];
const floatingTexts: FloatingText[] = [];

// --- DOM ELEMENTS ------------------------------------------------------------
const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

const menuOverlay = document.getElementById('menuOverlay')!;
const gameOverOverlay = document.getElementById('gameOverOverlay')!;
const scoreVal = document.getElementById('scoreVal')!;
const highVal = document.getElementById('highVal')!;
const finalScoreVal = document.getElementById('finalScoreVal')!;

const startBtn = document.getElementById('startBtn')!;
const restartBtn = document.getElementById('restartBtn')!;
const menuLeaderboardBtn = document.getElementById('menuLeaderboardBtn')!;
const gameOverLeaderboardBtn = document.getElementById('gameOverLeaderboardBtn')!;

// --- INITIALIZE UI SCORE -----------------------------------------------------
highVal.textContent = String(highScore);

// --- LOCAL STORAGE HELPERS ---------------------------------------------------
function loadHighScore(): number {
  try {
    const val = localStorage.getItem(HIGH_SCORE_KEY);
    if (!val) return 0;
    const num = parseInt(val, 10);
    return isNaN(num) ? 0 : num;
  } catch {
    return 0;
  }
}

function saveHighScore(scoreValNum: number): void {
  try {
    localStorage.setItem(HIGH_SCORE_KEY, String(scoreValNum));
  } catch {
    // Fail silently in private/restricted environments
  }
}

// --- GAME LOGIC --------------------------------------------------------------
function initGame(): void {
  // Center snake initially (head at 15,15, trailing left)
  snake = [
    { x: 15, y: 15 },
    { x: 14, y: 15 },
    { x: 13, y: 15 },
    { x: 12, y: 15 },
  ];
  currentDir = { x: 1, y: 0 };
  lastDir = { x: 1, y: 0 };
  inputQueue.length = 0;
  score = 0;
  updateScoreUI();
  spawnFood();

  state = 'PLAYING';
  isPaused = false;
  shakeIntensity = 0;
  accumulator = 0;
  stepInterval = 0.12;
  particles.length = 0;
  floatingTexts.length = 0;
}

function spawnFood(): void {
  let attempts = 0;
  let rx = 0;
  let ry = 0;
  let valid = false;

  while (!valid && attempts < 100) {
    rx = Math.floor(Math.random() * GRID_COLS);
    ry = Math.floor(Math.random() * GRID_ROWS);
    valid = !snake.some((seg) => seg.x === rx && seg.y === ry);
    attempts++;
  }

  // Backup in case the grid is entirely full (win condition)
  if (!valid) {
    for (let x = 0; x < GRID_COLS; x++) {
      for (let y = 0; y < GRID_ROWS; y++) {
        if (!snake.some((seg) => seg.x === x && seg.y === y)) {
          food = { x, y };
          return;
        }
      }
    }
  } else {
    food = { x: rx, y: ry };
  }
}

function moveSnake(): void {
  if (state !== 'PLAYING') return;

  // Process next turn direction from queue
  if (inputQueue.length > 0) {
    currentDir = inputQueue.shift()!;
  }
  lastDir = currentDir;

  const head = snake[0]!;
  const newHead = {
    x: head.x + currentDir.x,
    y: head.y + currentDir.y,
  };

  // Wall Collision Check
  if (newHead.x < 0 || newHead.x >= GRID_COLS || newHead.y < 0 || newHead.y >= GRID_ROWS) {
    triggerGameOver();
    return;
  }

  // Self Collision Check (any segment)
  const hitSelf = snake.some((seg) => seg.x === newHead.x && seg.y === newHead.y);
  if (hitSelf) {
    triggerGameOver();
    return;
  }

  // Move forward
  snake.unshift(newHead);

  // Check if food eaten
  if (newHead.x === food.x && newHead.y === food.y) {
    score += 100;
    updateScoreUI();
    spawnEatParticles(food.x, food.y);
    shakeIntensity = 5; // gentle impact camera shake on eating

    // Floating text feedback
    floatingTexts.push({
      x: food.x * GRID_SIZE + GRID_SIZE / 2,
      y: food.y * GRID_SIZE,
      text: '+100',
      color: '#00f2fe',
      life: 0.8,
      maxLife: 0.8,
    });

    spawnFood();

    // Gradually speed up grid loop as score increases
    stepInterval = Math.max(0.06, 0.12 - (score / 1500) * 0.01);
  } else {
    // Normal step, pop the tail segment
    snake.pop();
  }
}

function triggerGameOver(): void {
  state = 'GAMEOVER';
  spawnDeathParticles();
  shakeIntensity = 18; // Heavy impact camera shake on crash

  const container = document.getElementById('gameContainer');
  if (container) {
    container.classList.add('game-over-glow');
  }

  let isNewBest = false;
  if (score > highScore) {
    highScore = score;
    saveHighScore(highScore);
    isNewBest = true;
    highVal.textContent = String(highScore);
  }

  finalScoreVal.textContent = String(score);
  if (isNewBest) {
    finalScoreVal.innerHTML = `${score} <span style="color: var(--neon-pink); font-size: 0.75rem; display: block; margin-top: 4px; text-shadow: 0 0 5px var(--neon-pink);">🏆 NEW BEST!</span>`;
  }

  gameOverOverlay.classList.add('active');

  if (score > 0) {
    void submitSnakeScore(score);
  }
}

function updateScoreUI(): void {
  scoreVal.textContent = String(score);
}

// --- VISUAL EFFECTS & JUICE --------------------------------------------------
function spawnEatParticles(x: number, y: number): void {
  const px = x * GRID_SIZE + GRID_SIZE / 2;
  const py = y * GRID_SIZE + GRID_SIZE / 2;
  
  // Neon pink explosion matching food theme
  for (let i = 0; i < 20; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.2 + Math.random() * 3.8;
    particles.push({
      x: px,
      y: py,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      color: '#ff007f',
      size: 2.5 + Math.random() * 3.5,
      life: 0.5 + Math.random() * 0.4,
      maxLife: 0.9,
    });
  }
}

function spawnDeathParticles(): void {
  // Turn all snake segments into a disintegrating rainbow neon wave
  snake.forEach((seg, idx) => {
    const px = seg.x * GRID_SIZE + GRID_SIZE / 2;
    const py = seg.y * GRID_SIZE + GRID_SIZE / 2;
    const t = snake.length > 1 ? idx / (snake.length - 1) : 0;
    
    // Shift color down the tail (Cyan to Pink/Purple)
    const hue = 180 + t * 130;
    const color = `hsl(${hue}, 100%, 55%)`;
    
    const count = idx === 0 ? 35 : 6; // Big splash at head
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (idx === 0 ? 3.5 : 1.2) + Math.random() * 3.5;
      particles.push({
        x: px,
        y: py,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: color,
        size: 2 + Math.random() * 4,
        life: 0.7 + Math.random() * 0.6,
        maxLife: 1.3,
      });
    }
  });
}

// --- RENDER PIPELINE ---------------------------------------------------------
function draw(): void {
  // Clear with dark cyberpunk background
  ctx.fillStyle = '#0c0d14';
  ctx.fillRect(0, 0, 600, 600);

  ctx.save();
  // Camera shake offset
  if (shakeIntensity > 0) {
    const dx = (Math.random() - 0.5) * shakeIntensity;
    const dy = (Math.random() - 0.5) * shakeIntensity;
    ctx.translate(dx, dy);
  }

  // Draw cyber grid grid lines
  ctx.strokeStyle = 'rgba(0, 242, 254, 0.025)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= 600; x += GRID_SIZE) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 600);
    ctx.stroke();
  }
  for (let y = 0; y <= 600; y += GRID_SIZE) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(600, y);
    ctx.stroke();
  }

  // Draw Food (Pulsing glowing radial orb)
  if (state !== 'MENU') {
    const time = performance.now() * 0.006;
    const pulse = Math.sin(time) * 1.5;
    const r = 7 + pulse;
    const fx = food.x * GRID_SIZE + GRID_SIZE / 2;
    const fy = food.y * GRID_SIZE + GRID_SIZE / 2;

    ctx.save();
    const grad = ctx.createRadialGradient(fx, fy, 1, fx, fy, r + 10);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.25, '#ff007f'); // Hot Pink
    grad.addColorStop(0.6, 'rgba(255, 0, 127, 0.35)');
    grad.addColorStop(1, 'rgba(255, 0, 127, 0)');
    
    ctx.beginPath();
    ctx.arc(fx, fy, r + 10, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.shadowColor = '#ff007f';
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.restore();
  }

  // Draw Snake segments
  if (state !== 'MENU' && snake.length > 0) {
    snake.forEach((seg, idx) => {
      const px = seg.x * GRID_SIZE;
      const py = seg.y * GRID_SIZE;
      const t = snake.length > 1 ? idx / (snake.length - 1) : 0;

      // Color sweep: Cyan (hue 180) -> Purple/Pink (hue 310) down tail
      const hue = 180 + t * 130;
      
      // Interpolate size (gently tapers down tail)
      const size = GRID_SIZE - 2 - t * 4;
      const offset = (GRID_SIZE - size) / 2;
      const radius = 6 - t * 3.5;

      ctx.save();
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(px + offset, py + offset, size, size, radius);
      } else {
        ctx.rect(px + offset, py + offset, size, size);
      }

      ctx.fillStyle = `hsla(${hue}, 100%, 55%, ${1 - t * 0.45})`;
      ctx.shadowColor = `hsla(${hue}, 100%, 55%, 0.7)`;
      ctx.shadowBlur = 12 * (1 - t * 0.5);
      ctx.fill();

      // Render eyes on head segment facing direction of movement
      if (idx === 0) {
        ctx.shadowBlur = 0; // eye sharp dots
        ctx.fillStyle = '#ffffff';

        let eye1 = { x: 0, y: 0 };
        let eye2 = { x: 0, y: 0 };

        if (currentDir.x === 1) { // Right
          eye1 = { x: px + 13, y: py + 5 };
          eye2 = { x: px + 13, y: py + 15 };
        } else if (currentDir.x === -1) { // Left
          eye1 = { x: px + 7, y: py + 5 };
          eye2 = { x: px + 7, y: py + 15 };
        } else if (currentDir.y === 1) { // Down
          eye1 = { x: px + 5, y: py + 13 };
          eye2 = { x: px + 15, y: py + 13 };
        } else if (currentDir.y === -1) { // Up
          eye1 = { x: px + 5, y: py + 7 };
          eye2 = { x: px + 15, y: py + 7 };
        } else { // Static fallback
          eye1 = { x: px + 13, y: py + 5 };
          eye2 = { x: px + 13, y: py + 15 };
        }

        ctx.beginPath();
        ctx.arc(eye1.x, eye1.y, 2, 0, Math.PI * 2);
        ctx.arc(eye2.x, eye2.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });
  }

  // Render particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]!;
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.restore();
  }

  // Render floating scores
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts[i]!;
    ctx.save();
    ctx.font = 'bold 15px "Outfit", sans-serif';
    ctx.fillStyle = ft.color;
    ctx.globalAlpha = ft.life / ft.maxLife;
    ctx.textAlign = 'center';
    ctx.shadowColor = ft.color;
    ctx.shadowBlur = 6;
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  }

  ctx.restore(); // Restore camera shake translate offset

  // Overlay Pause text on canvas directly
  if (isPaused) {
    ctx.fillStyle = 'rgba(12, 13, 20, 0.75)';
    ctx.fillRect(0, 0, 600, 600);
    ctx.font = '900 36px "Outfit", sans-serif';
    ctx.fillStyle = '#00f2fe';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#00f2fe';
    ctx.shadowBlur = 12;
    ctx.fillText('PAUSED', 300, 280);
    ctx.font = '600 16px "Outfit", sans-serif';
    ctx.fillStyle = '#a1a1aa';
    ctx.shadowBlur = 0;
    ctx.fillText('Press SPACE to resume', 300, 325);
  }
}

// --- GAME STATE UPDATE -------------------------------------------------------
function update(dt: number): void {
  // Update particles frame positions
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]!;
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.96; // drag friction
    p.vy *= 0.96;
    p.life -= dt;
    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }

  // Update floating text position
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts[i]!;
    ft.y -= 25 * dt; // Rise up
    ft.life -= dt;
    if (ft.life <= 0) {
      floatingTexts.splice(i, 1);
    }
  }

  // Shake decay
  if (shakeIntensity > 0) {
    shakeIntensity -= dt * 35;
    if (shakeIntensity < 0) shakeIntensity = 0;
  }

  // Step grid physics accumulator
  if (state === 'PLAYING' && !isPaused) {
    accumulator += dt;
    while (accumulator >= stepInterval) {
      moveSnake();
      accumulator -= stepInterval;
    }
  }

  draw();
}

// --- INPUT LISTENERS ---------------------------------------------------------
window.addEventListener('keydown', (e) => {
  // Prevent scrolling
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.key) || e.code === 'Space') {
    e.preventDefault();
  }

  // Toggle pause / start on Space
  if (e.code === 'Space' || e.key === ' ') {
    if (state === 'PLAYING') {
      isPaused = !isPaused;
    } else if (state === 'MENU') {
      menuOverlay.classList.remove('active');
      initGame();
    } else if (state === 'GAMEOVER') {
      gameOverOverlay.classList.remove('active');
      const container = document.getElementById('gameContainer')!;
      container.classList.remove('game-over-glow');
      initGame();
    }
    return;
  }

  if (state !== 'PLAYING') return;

  let nextDir: Position | null = null;
  if (e.key === 'ArrowUp' || e.code === 'KeyW') {
    nextDir = { x: 0, y: -1 };
  } else if (e.key === 'ArrowDown' || e.code === 'KeyS') {
    nextDir = { x: 0, y: 1 };
  } else if (e.key === 'ArrowLeft' || e.code === 'KeyA') {
    nextDir = { x: -1, y: 0 };
  } else if (e.key === 'ArrowRight' || e.code === 'KeyD') {
    nextDir = { x: 1, y: 0 };
  }

  if (nextDir) {
    // Look at last direction queued, or head direction if queue empty
    const prev = inputQueue.length > 0 ? inputQueue[inputQueue.length - 1]! : lastDir;
    // Prevent 180 degree instant suicide reversals
    if (nextDir.x !== -prev.x || nextDir.y !== -prev.y) {
      if (nextDir.x !== prev.x || nextDir.y !== prev.y) {
        inputQueue.push(nextDir);
      }
    }
  }
});

// --- GLOBAL LEADERBOARD LOGIC ------------------------------------------------
async function submitSnakeScore(finalScore: number): Promise<void> {
  const name = await promptPlayerName();
  if (!name) return;
  await submitScore(LEADERBOARD_GAME, name, finalScore, { build: __BUILD_INFO__ });
}

function showSnakeLeaderboard(): void {
  showLeaderboard(LEADERBOARD_GAME, {
    title: 'Neon Snake — Top',
    playerName: getStoredPlayerName(),
    highlightScore: score > 0 && state === 'GAMEOVER' ? score : undefined,
  });
}

// --- UI BUTTON ACTIONS -------------------------------------------------------
startBtn.addEventListener('click', () => {
  menuOverlay.classList.remove('active');
  initGame();
});

restartBtn.addEventListener('click', () => {
  gameOverOverlay.classList.remove('active');
  const container = document.getElementById('gameContainer')!;
  container.classList.remove('game-over-glow');
  initGame();
});

menuLeaderboardBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  showSnakeLeaderboard();
});

gameOverLeaderboardBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  showSnakeLeaderboard();
});

// --- INITIALIZE GAME LOOP ----------------------------------------------------
startGameLoop((dt) => {
  update(dt);
});
