import * as THREE from 'three';

declare const __BUILD_INFO__: string; // injected by vite.config.ts `define`

// --- TUNING ----------------------------------------------------------------
const WORLD_HEIGHT = 10; // world units visible vertically
const GRAVITY = -28; // units/s²
const FLAP_IMPULSE = 9; // upward velocity on tap, units/s
const PIPE_SPEED = 3.2; // scroll speed, units/s
const PIPE_GAP = 3.0; // vertical gap between pipe pair, units
const PIPE_SPACING = 4.0; // horizontal distance between pairs, units
const PIPE_WIDTH = 1.1; // units
const BIRD_SIZE = 0.55; // bird square side, units
const BIRD_X = -2.2; // bird horizontal position, units
const GAP_MARGIN = 1.2; // min distance from gap center to ground/ceiling edge
const GROUND_HEIGHT = 1.2; // units
const MAX_DT = 0.05; // clamp delta time (background tab, hiccups), s
// ----------------------------------------------------------------------------

const COLORS = {
  sky: 0x4ec0ca,
  bird: 0xffd23f,
  pipe: 0x53a548,
  pipeDark: 0x3e7d36,
  ground: 0xddc380,
};

type GameState = 'ready' | 'playing' | 'gameover';

// --- Renderer / scene / camera ----------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setClearColor(COLORS.sky);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
camera.position.z = 5;

let worldWidth = WORLD_HEIGHT; // recomputed on resize
const groundY = -WORLD_HEIGHT / 2 + GROUND_HEIGHT; // top edge of the ground
const ceilingY = WORLD_HEIGHT / 2;

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  const aspect = w / h;
  worldWidth = WORLD_HEIGHT * aspect;
  camera.left = -worldWidth / 2;
  camera.right = worldWidth / 2;
  camera.top = WORLD_HEIGHT / 2;
  camera.bottom = -WORLD_HEIGHT / 2;
  camera.updateProjectionMatrix();
  ground.scale.x = worldWidth + 2;
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

// --- Meshes -------------------------------------------------------------------
const unitPlane = new THREE.PlaneGeometry(1, 1);

const ground = new THREE.Mesh(
  unitPlane,
  new THREE.MeshBasicMaterial({ color: COLORS.ground }),
);
ground.scale.set(WORLD_HEIGHT * 3, GROUND_HEIGHT, 1);
ground.position.set(0, groundY - GROUND_HEIGHT / 2, 0);
scene.add(ground);

const bird = new THREE.Mesh(
  unitPlane,
  new THREE.MeshBasicMaterial({ color: COLORS.bird }),
);
bird.scale.set(BIRD_SIZE, BIRD_SIZE, 1);
bird.position.set(BIRD_X, 0, 1);
scene.add(bird);

interface PipePair {
  top: THREE.Mesh;
  bottom: THREE.Mesh;
  x: number;
  gapY: number;
  scored: boolean;
}

const pipeMaterial = new THREE.MeshBasicMaterial({ color: COLORS.pipe });
const pipeMaterialDark = new THREE.MeshBasicMaterial({ color: COLORS.pipeDark });
let pipes: PipePair[] = [];

function spawnPipePair(x: number): void {
  const minGapY = groundY + GAP_MARGIN + PIPE_GAP / 2;
  const maxGapY = ceilingY - GAP_MARGIN - PIPE_GAP / 2;
  const gapY = minGapY + Math.random() * (maxGapY - minGapY);

  const topHeight = ceilingY - (gapY + PIPE_GAP / 2);
  const top = new THREE.Mesh(unitPlane, pipeMaterialDark);
  top.scale.set(PIPE_WIDTH, topHeight, 1);
  top.position.set(x, ceilingY - topHeight / 2, 0);

  const bottomHeight = gapY - PIPE_GAP / 2 - groundY;
  const bottom = new THREE.Mesh(unitPlane, pipeMaterial);
  bottom.scale.set(PIPE_WIDTH, bottomHeight, 1);
  bottom.position.set(x, groundY + bottomHeight / 2, 0);

  scene.add(top, bottom);
  pipes.push({ top, bottom, x, gapY, scored: false });
}

function clearPipes(): void {
  for (const pair of pipes) {
    scene.remove(pair.top, pair.bottom);
  }
  pipes = [];
}

// --- HUD ----------------------------------------------------------------------
const scoreEl = document.getElementById('score') as HTMLDivElement;
const overlayEl = document.getElementById('overlay') as HTMLDivElement;

function showOverlay(lines: string[]): void {
  const [title, ...rest] = lines;
  overlayEl.innerHTML =
    `<h1>${title ?? ''}</h1>` + rest.map((line) => `<p>${line}</p>`).join('');
  overlayEl.style.display = 'flex';
}

// --- High score (localStorage can throw in private browsing — fail soft) -------
const HIGHSCORE_KEY = 'flappy.highscore';

function loadHighScore(): number {
  try {
    return Number(localStorage.getItem(HIGHSCORE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveHighScore(value: number): void {
  try {
    localStorage.setItem(HIGHSCORE_KEY, String(value));
  } catch {
    // ignore — score just won't persist
  }
}

// --- Game state -----------------------------------------------------------------
let state: GameState = 'ready';
let birdY = 0;
let birdVelocity = 0;
let score = 0;
let highScore = loadHighScore();

function resetGame(): void {
  birdY = 0;
  birdVelocity = 0;
  score = 0;
  scoreEl.textContent = '0';
  clearPipes();
  bird.position.y = 0;
  bird.rotation.z = 0;
}

function startGame(): void {
  resetGame();
  state = 'playing';
  overlayEl.style.display = 'none';
  scoreEl.style.display = 'block';
  spawnPipePair(worldWidth / 2 + PIPE_SPACING);
  birdVelocity = FLAP_IMPULSE;
}

function gameOver(): void {
  state = 'gameover';
  scoreEl.style.display = 'none';
  const isNewBest = score > highScore;
  if (isNewBest) {
    highScore = score;
    saveHighScore(highScore);
  }
  showOverlay([
    `Score: ${score}`,
    isNewBest ? '🏆 New best!' : `Best: ${highScore}`,
    'Tap to play again',
  ]);
}

window.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (state === 'playing') {
    birdVelocity = FLAP_IMPULSE;
  } else {
    startGame();
  }
});

// Block double-tap zoom / scroll gestures Safari might still attempt.
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());

// --- Collisions -------------------------------------------------------------------
function aabbOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return (
    Math.abs(ax - bx) * 2 < aw + bw &&
    Math.abs(ay - by) * 2 < ah + bh
  );
}

function checkCollisions(): boolean {
  // Ground / ceiling
  if (birdY - BIRD_SIZE / 2 <= groundY || birdY + BIRD_SIZE / 2 >= ceilingY) {
    return true;
  }
  for (const pair of pipes) {
    const topMesh = pair.top;
    const bottomMesh = pair.bottom;
    if (
      aabbOverlap(
        BIRD_X, birdY, BIRD_SIZE, BIRD_SIZE,
        pair.x, topMesh.position.y, PIPE_WIDTH, topMesh.scale.y,
      ) ||
      aabbOverlap(
        BIRD_X, birdY, BIRD_SIZE, BIRD_SIZE,
        pair.x, bottomMesh.position.y, PIPE_WIDTH, bottomMesh.scale.y,
      )
    ) {
      return true;
    }
  }
  return false;
}

// --- Game loop ------------------------------------------------------------------
let lastTime = performance.now();

function update(dt: number): void {
  if (state !== 'playing') return;

  birdVelocity += GRAVITY * dt;
  birdY += birdVelocity * dt;
  bird.position.y = birdY;
  bird.rotation.z = THREE.MathUtils.clamp(birdVelocity * 0.06, -0.6, 0.6);

  for (const pair of pipes) {
    pair.x -= PIPE_SPEED * dt;
    pair.top.position.x = pair.x;
    pair.bottom.position.x = pair.x;
    if (!pair.scored && pair.x + PIPE_WIDTH / 2 < BIRD_X - BIRD_SIZE / 2) {
      pair.scored = true;
      score += 1;
      scoreEl.textContent = String(score);
    }
  }

  // Despawn off-screen pairs, spawn new ones at a fixed spacing.
  pipes = pipes.filter((pair) => {
    if (pair.x < -worldWidth / 2 - PIPE_WIDTH) {
      scene.remove(pair.top, pair.bottom);
      return false;
    }
    return true;
  });
  const spawnX = worldWidth / 2 + PIPE_WIDTH;
  const lastPipe = pipes[pipes.length - 1];
  if (!lastPipe || lastPipe.x <= spawnX - PIPE_SPACING) {
    spawnPipePair(lastPipe ? lastPipe.x + PIPE_SPACING : spawnX);
  }

  if (checkCollisions()) {
    gameOver();
  }
}

function frame(now: number): void {
  const dt = Math.min((now - lastTime) / 1000, MAX_DT);
  lastTime = now;
  update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

showOverlay([
  'Flappy',
  ...(highScore > 0 ? [`Best: ${highScore}`] : []),
  'Tap to play',
  `v ${__BUILD_INFO__}`,
]);

(document.getElementById('build') as HTMLDivElement).textContent = __BUILD_INFO__;

resize();
requestAnimationFrame(frame);
