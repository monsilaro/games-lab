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

// visuals
const PIPE_LIP_WIDTH = 1.35; // collar diameter, > PIPE_WIDTH
const PIPE_LIP_HEIGHT = 0.45; // units
const PIPE_RADIAL_SEGS = 20;
const HILLS_SPEED_FACTOR = 0.2; // fraction of PIPE_SPEED
const CLOUDS_SPEED_FACTOR = 0.4;
const IDLE_SCROLL_FACTOR = 0.35; // parallax speed multiplier when not playing
const HILLS_TILE_WIDTH = 8; // world units per texture repeat
const CLOUDS_TILE_WIDTH = 10;
const GROUND_TILE_WIDTH = 2;
const HILLS_HEIGHT = 3.2; // hills layer plane height, units
const CLOUDS_HEIGHT = 2.6; // clouds layer plane height, units
const CLOUDS_Y = 2.2; // clouds layer center, units
const GROUND_DEPTH = 2; // ground slab depth, units
const GRASS_HEIGHT = 0.18; // grass strip, units
const WING_IDLE_HZ = 3.5; // sinusoidal idle flap
const WING_SNAP_HZ = 13; // fast wing beat right after a flap
const WING_SNAP_TIME = 0.18; // fast wing beat duration after flap, s
const READY_BOB_HZ = 2.2; // idle bobbing on the start screen
const READY_BOB_AMP = 0.18; // units
const SQUASH_AMOUNT = 0.22; // flap stretch: scaleY 1+a, scaleX 1-a
const SQUASH_RECOVER = 8; // exp recovery rate, 1/s
const PARTICLE_COUNT = 14;
const PARTICLE_SPEED = 6; // initial burst speed, units/s
const PARTICLE_LIFE = 0.7; // s
const SHAKE_DURATION = 0.35; // s
const SHAKE_MAGNITUDE = 0.25; // world units
const DUSK_AT_SCORE = 20; // score at which the sky reaches full dusk
// ----------------------------------------------------------------------------

const COLORS = {
  skyTopDay: 0x4ec0ca,
  skyBottomDay: 0xbfeef2,
  skyTopDusk: 0x3b3f7a,
  skyBottomDusk: 0xf2a65a,
  ambientDay: 0xffffff,
  ambientDusk: 0xffd9b8,
  bird: 0xffd23f,
  birdWing: 0xffe28a,
  beak: 0xf08c1b,
  eye: 0xffffff,
  pupil: 0x303030,
  pipe: 0x53a548,
  pipeDark: 0x3e7d36,
  groundSand: '#ddc380',
  groundStripe: '#c9ae6a',
  grass: 0x7ec850,
  cloud: 'rgba(255, 255, 255, 0.92)',
};

type GameState = 'ready' | 'playing' | 'gameover';

// --- Renderer / scene / camera / lights ---------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setClearColor(COLORS.skyTopDay);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 30);
camera.position.z = 5;

// No shadow maps — too expensive on mobile; the light angle alone sells the 3D.
const dirLight = new THREE.DirectionalLight(0xffffff, 2.2);
dirLight.position.set(3, 5, 6);
const ambientLight = new THREE.AmbientLight(COLORS.ambientDay, 0.7);
scene.add(dirLight, ambientLight);

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
  layoutScenery();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

// --- Canvas texture helpers -----------------------------------------------------
// Runtime-generated textures only — the repo stays asset-free.
function makeTilingTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas context unavailable');
  draw(ctx, width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

// Shapes are drawn at x and x ± w so the left/right edges always tile seamlessly.
function makeGroundTexture(): THREE.CanvasTexture {
  return makeTilingTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = COLORS.groundSand;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = COLORS.groundStripe;
    ctx.lineWidth = 14;
    for (let x = -w; x <= w * 2; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, -8);
      ctx.lineTo(x - w, h + 8);
      ctx.stroke();
    }
  });
}

function makeHillsTexture(): THREE.CanvasTexture {
  return makeTilingTexture(512, 256, (ctx, w, h) => {
    const hills = [
      { x: 70, r: 170, color: '#b8e0a8' },
      { x: 250, r: 210, color: '#9ed492' },
      { x: 430, r: 180, color: '#aadc9c' },
    ];
    for (const hill of hills) {
      ctx.fillStyle = hill.color;
      for (const dx of [-w, 0, w]) {
        ctx.beginPath();
        ctx.arc(hill.x + dx, h + hill.r * 0.25, hill.r, Math.PI, 0);
        ctx.fill();
      }
    }
  });
}

function makeCloudsTexture(): THREE.CanvasTexture {
  return makeTilingTexture(512, 256, (ctx, w) => {
    const clouds = [
      { x: 70, y: 80, s: 1 },
      { x: 260, y: 160, s: 0.75 },
      { x: 420, y: 60, s: 1.15 },
    ];
    ctx.fillStyle = COLORS.cloud;
    for (const cloud of clouds) {
      for (const dx of [-w, 0, w]) {
        const x = cloud.x + dx;
        const { y, s } = cloud;
        ctx.beginPath();
        ctx.arc(x, y, 26 * s, 0, Math.PI * 2);
        ctx.arc(x + 24 * s, y - 14 * s, 20 * s, 0, Math.PI * 2);
        ctx.arc(x + 50 * s, y, 22 * s, 0, Math.PI * 2);
        ctx.arc(x + 25 * s, y + 8 * s, 24 * s, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
}

// --- Background (sky / hills / clouds) -------------------------------------------
const unitPlane = new THREE.PlaneGeometry(1, 1);

// Gradient sky: 4 vertex colors on a unit plane (vertices 0,1 = top, 2,3 = bottom).
// Day→dusk is just 12 floats updated, no texture upload.
const skyGeo = new THREE.PlaneGeometry(1, 1);
const skyColorAttr = new THREE.BufferAttribute(new Float32Array(12), 3);
skyGeo.setAttribute('color', skyColorAttr);
const sky = new THREE.Mesh(
  skyGeo,
  new THREE.MeshBasicMaterial({ vertexColors: true }),
);
sky.position.z = -6;
scene.add(sky);

const skyTopDay = new THREE.Color(COLORS.skyTopDay);
const skyBottomDay = new THREE.Color(COLORS.skyBottomDay);
const skyTopDusk = new THREE.Color(COLORS.skyTopDusk);
const skyBottomDusk = new THREE.Color(COLORS.skyBottomDusk);
const ambientDay = new THREE.Color(COLORS.ambientDay);
const ambientDusk = new THREE.Color(COLORS.ambientDusk);
const scratchTop = new THREE.Color();
const scratchBottom = new THREE.Color();

function applySky(mix: number): void {
  scratchTop.lerpColors(skyTopDay, skyTopDusk, mix);
  scratchBottom.lerpColors(skyBottomDay, skyBottomDusk, mix);
  skyColorAttr.setXYZ(0, scratchTop.r, scratchTop.g, scratchTop.b);
  skyColorAttr.setXYZ(1, scratchTop.r, scratchTop.g, scratchTop.b);
  skyColorAttr.setXYZ(2, scratchBottom.r, scratchBottom.g, scratchBottom.b);
  skyColorAttr.setXYZ(3, scratchBottom.r, scratchBottom.g, scratchBottom.b);
  skyColorAttr.needsUpdate = true;
  ambientLight.color.lerpColors(ambientDay, ambientDusk, mix);
}

let skyMix = 0;
applySky(0);

// Distant layers are deliberately unlit (MeshBasicMaterial): cheaper, and depth
// is conveyed by parallax speed, not shading.
const hillsTex = makeHillsTexture();
const hills = new THREE.Mesh(
  unitPlane,
  new THREE.MeshBasicMaterial({ map: hillsTex, transparent: true }),
);
hills.position.set(0, groundY + HILLS_HEIGHT / 2, -5);
scene.add(hills);

const cloudsTex = makeCloudsTexture();
const clouds = new THREE.Mesh(
  unitPlane,
  new THREE.MeshBasicMaterial({ map: cloudsTex, transparent: true }),
);
clouds.position.set(0, CLOUDS_Y, -4);
scene.add(clouds);

// --- Ground -------------------------------------------------------------------
const unitBox = new THREE.BoxGeometry(1, 1, 1);

const groundTex = makeGroundTexture();
const ground = new THREE.Mesh(
  unitBox,
  new THREE.MeshLambertMaterial({ map: groundTex }),
);
ground.position.set(0, groundY - GROUND_HEIGHT / 2, 0);
scene.add(ground);

// Grass strip: its top edge is flush with groundY so visuals match the hitbox.
const grass = new THREE.Mesh(
  unitBox,
  new THREE.MeshLambertMaterial({ color: COLORS.grass }),
);
grass.scale.set(1, GRASS_HEIGHT, GROUND_DEPTH + 0.1);
grass.position.set(0, groundY - GRASS_HEIGHT / 2, 0);
scene.add(grass);

function layoutScenery(): void {
  const w = worldWidth + 2;
  sky.scale.set(w, WORLD_HEIGHT + 2, 1);
  hills.scale.set(w, HILLS_HEIGHT, 1);
  hillsTex.repeat.x = w / HILLS_TILE_WIDTH;
  clouds.scale.set(w, CLOUDS_HEIGHT, 1);
  cloudsTex.repeat.x = w / CLOUDS_TILE_WIDTH;
  ground.scale.set(w, GROUND_HEIGHT, GROUND_DEPTH);
  groundTex.repeat.x = w / GROUND_TILE_WIDTH;
  grass.scale.x = w;
}

// --- Pipes ----------------------------------------------------------------------
// Shared geometry/materials — per spawn we only allocate meshes and a group.
const pipeGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, PIPE_RADIAL_SEGS);
const pipeBodyMaterial = new THREE.MeshLambertMaterial({ color: COLORS.pipe });
const pipeLipMaterial = new THREE.MeshLambertMaterial({ color: COLORS.pipeDark });

// Column centered on its group origin; the collar sits at the gap-facing end,
// inside the column's vertical extent, so the hitbox is exactly the body rect.
function makePipeColumn(height: number, lipAtTop: boolean): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(pipeGeo, pipeBodyMaterial);
  body.scale.set(PIPE_WIDTH, height, PIPE_WIDTH);
  const lip = new THREE.Mesh(pipeGeo, pipeLipMaterial);
  lip.scale.set(PIPE_LIP_WIDTH, PIPE_LIP_HEIGHT, PIPE_LIP_WIDTH);
  const lipY = height / 2 - PIPE_LIP_HEIGHT / 2;
  lip.position.y = lipAtTop ? lipY : -lipY;
  group.add(body, lip);
  return group;
}

interface PipePair {
  top: THREE.Group;
  bottom: THREE.Group;
  x: number;
  gapY: number;
  topHeight: number;
  bottomHeight: number;
  scored: boolean;
}

let pipes: PipePair[] = [];

function spawnPipePair(x: number): void {
  const minGapY = groundY + GAP_MARGIN + PIPE_GAP / 2;
  const maxGapY = ceilingY - GAP_MARGIN - PIPE_GAP / 2;
  const gapY = minGapY + Math.random() * (maxGapY - minGapY);

  const topHeight = ceilingY - (gapY + PIPE_GAP / 2);
  const top = makePipeColumn(topHeight, false); // gap-facing end is the bottom
  top.position.set(x, ceilingY - topHeight / 2, 0);

  const bottomHeight = gapY - PIPE_GAP / 2 - groundY;
  const bottom = makePipeColumn(bottomHeight, true);
  bottom.position.set(x, groundY + bottomHeight / 2, 0);

  scene.add(top, bottom);
  pipes.push({ top, bottom, x, gapY, topHeight, bottomHeight, scored: false });
}

function clearPipes(): void {
  for (const pair of pipes) {
    scene.remove(pair.top, pair.bottom);
  }
  pipes = [];
}

// --- Bird -----------------------------------------------------------------------
const sphereGeo = new THREE.SphereGeometry(0.5, 20, 14);
const coneGeo = new THREE.ConeGeometry(0.5, 1, 8);

interface BirdParts {
  group: THREE.Group;
  wingPivot: THREE.Group;
}

// Children are sized in world units; the group's scale is reserved for
// squash & stretch and its position/rotation for the existing gameplay code.
function buildBird(): BirdParts {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    sphereGeo,
    new THREE.MeshLambertMaterial({ color: COLORS.bird }),
  );
  body.scale.set(BIRD_SIZE * 1.15, BIRD_SIZE * 0.95, BIRD_SIZE * 0.9);
  group.add(body);

  const wingPivot = new THREE.Group();
  wingPivot.position.set(-BIRD_SIZE * 0.1, BIRD_SIZE * 0.1, BIRD_SIZE * 0.42);
  const wing = new THREE.Mesh(
    sphereGeo,
    new THREE.MeshLambertMaterial({ color: COLORS.birdWing }),
  );
  wing.scale.set(BIRD_SIZE * 0.5, BIRD_SIZE * 0.2, BIRD_SIZE * 0.14);
  wing.position.set(-BIRD_SIZE * 0.2, 0, 0);
  wingPivot.add(wing);
  group.add(wingPivot);

  const eyeMaterial = new THREE.MeshLambertMaterial({ color: COLORS.eye });
  const eye = new THREE.Mesh(sphereGeo, eyeMaterial);
  eye.scale.setScalar(BIRD_SIZE * 0.24);
  eye.position.set(BIRD_SIZE * 0.2, BIRD_SIZE * 0.14, BIRD_SIZE * 0.34);
  group.add(eye);

  const pupil = new THREE.Mesh(
    sphereGeo,
    new THREE.MeshLambertMaterial({ color: COLORS.pupil }),
  );
  pupil.scale.setScalar(BIRD_SIZE * 0.11);
  pupil.position.set(BIRD_SIZE * 0.28, BIRD_SIZE * 0.14, BIRD_SIZE * 0.42);
  group.add(pupil);

  const beak = new THREE.Mesh(
    coneGeo,
    new THREE.MeshLambertMaterial({ color: COLORS.beak }),
  );
  beak.scale.set(BIRD_SIZE * 0.3, BIRD_SIZE * 0.4, BIRD_SIZE * 0.3);
  beak.rotation.z = -Math.PI / 2; // cone points +x
  beak.position.set(BIRD_SIZE * 0.58, -BIRD_SIZE * 0.02, 0);
  group.add(beak);

  return { group, wingPivot };
}

const { group: bird, wingPivot } = buildBird();
bird.position.set(BIRD_X, 0, 1);
scene.add(bird);

let timeSinceFlap = Infinity;

// --- Particles (death burst) ------------------------------------------------------
// Pool allocated once at startup; nothing is allocated at death time.
// Particles fade by shrinking to zero so materials stay shared and opaque.
const particleGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
const particleMaterials = [
  new THREE.MeshLambertMaterial({ color: COLORS.bird }),
  new THREE.MeshLambertMaterial({ color: COLORS.beak }),
];

interface Particle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  spinX: number;
  spinZ: number;
  life: number;
  maxLife: number;
}

const particles: Particle[] = [];
for (let i = 0; i < PARTICLE_COUNT; i++) {
  const material = particleMaterials[i % particleMaterials.length];
  if (!material) continue;
  const mesh = new THREE.Mesh(particleGeo, material);
  mesh.visible = false;
  scene.add(mesh);
  particles.push({ mesh, vx: 0, vy: 0, spinX: 0, spinZ: 0, life: 0, maxLife: 1 });
}

function burstParticles(x: number, y: number): void {
  for (const p of particles) {
    const angle = Math.random() * Math.PI * 2;
    const speed = PARTICLE_SPEED * (0.5 + Math.random() * 0.7);
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed + 2; // upward bias
    p.spinX = (Math.random() - 0.5) * 12;
    p.spinZ = (Math.random() - 0.5) * 12;
    p.maxLife = PARTICLE_LIFE * (0.7 + Math.random() * 0.5);
    p.life = p.maxLife;
    p.mesh.position.set(x, y, 1);
    p.mesh.scale.setScalar(1);
    p.mesh.visible = true;
  }
}

function hideParticles(): void {
  for (const p of particles) {
    p.life = 0;
    p.mesh.visible = false;
  }
}

function updateParticles(dt: number): void {
  for (const p of particles) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) {
      p.mesh.visible = false;
      continue;
    }
    p.vy += GRAVITY * 0.5 * dt;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.rotation.x += p.spinX * dt;
    p.mesh.rotation.z += p.spinZ * dt;
    p.mesh.scale.setScalar(p.life / p.maxLife);
  }
}

// --- Camera shake / flash ----------------------------------------------------------
let shakeTime = 0;

function updateShake(dt: number): void {
  if (shakeTime > 0) {
    shakeTime = Math.max(0, shakeTime - dt);
    const k = (shakeTime / SHAKE_DURATION) * SHAKE_MAGNITUDE;
    camera.position.x = (Math.random() - 0.5) * 2 * k;
    camera.position.y = (Math.random() - 0.5) * 2 * k;
  } else {
    camera.position.x = 0;
    camera.position.y = 0;
  }
}

const flashEl = document.getElementById('flappy-death-flash') as HTMLDivElement;

function triggerFlash(): void {
  flashEl.style.transition = 'none';
  flashEl.style.opacity = '0.9';
  void flashEl.offsetWidth; // force reflow so the next transition runs
  flashEl.style.transition = 'opacity 0.45s ease-out';
  flashEl.style.opacity = '0';
}

// --- HUD ----------------------------------------------------------------------
const scoreEl = document.getElementById('flappy-hud-score') as HTMLDivElement;
const overlayEl = document.getElementById('flappy-game-overlay') as HTMLDivElement;

function popScore(): void {
  scoreEl.classList.remove('pop');
  void scoreEl.offsetWidth; // restart the CSS animation
  scoreEl.classList.add('pop');
}

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
  hideParticles();
  shakeTime = 0;
  skyMix = 0;
  applySky(0);
  timeSinceFlap = Infinity;
  bird.visible = true;
  bird.position.y = 0;
  bird.rotation.z = 0;
  bird.scale.set(1, 1, 1);
}

function startGame(): void {
  resetGame();
  state = 'playing';
  overlayEl.style.display = 'none';
  scoreEl.style.display = 'block';
  spawnPipePair(worldWidth / 2 + PIPE_SPACING);
  birdVelocity = FLAP_IMPULSE;
  timeSinceFlap = 0;
}

function gameOver(): void {
  state = 'gameover';
  scoreEl.style.display = 'none';
  bird.visible = false; // the bird "bursts" into the particles
  burstParticles(BIRD_X, birdY);
  shakeTime = SHAKE_DURATION;
  triggerFlash();
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

// --- Input ----------------------------------------------------------------------
window.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (state === 'playing') {
    birdVelocity = FLAP_IMPULSE;
    timeSinceFlap = 0;
    bird.scale.set(1 - SQUASH_AMOUNT, 1 + SQUASH_AMOUNT, 1);
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
  // Pipe rects derived from the same formulas as spawnPipePair — the visuals
  // are 3D but the hitboxes are unchanged.
  for (const pair of pipes) {
    if (
      aabbOverlap(
        BIRD_X, birdY, BIRD_SIZE, BIRD_SIZE,
        pair.x, ceilingY - pair.topHeight / 2, PIPE_WIDTH, pair.topHeight,
      ) ||
      aabbOverlap(
        BIRD_X, birdY, BIRD_SIZE, BIRD_SIZE,
        pair.x, groundY + pair.bottomHeight / 2, PIPE_WIDTH, pair.bottomHeight,
      )
    ) {
      return true;
    }
  }
  return false;
}

// --- Game loop ------------------------------------------------------------------
let lastTime = performance.now();
let elapsed = 0;

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
      popScore();
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

// Runs every frame regardless of state: parallax, wing, squash, particles, shake.
function updateVisuals(dt: number): void {
  elapsed += dt;

  // Parallax always drifts (slower when idle); ground freezes on game over.
  const scroll = state === 'playing' ? 1 : IDLE_SCROLL_FACTOR;
  hillsTex.offset.x += (PIPE_SPEED * HILLS_SPEED_FACTOR * scroll * dt) / HILLS_TILE_WIDTH;
  cloudsTex.offset.x += (PIPE_SPEED * CLOUDS_SPEED_FACTOR * scroll * dt) / CLOUDS_TILE_WIDTH;
  if (state !== 'gameover') {
    groundTex.offset.x += (PIPE_SPEED * dt) / GROUND_TILE_WIDTH;
  }

  // Wing: fast beat right after a flap, lazy sinusoid otherwise.
  timeSinceFlap += dt;
  const snapping = timeSinceFlap < WING_SNAP_TIME;
  const hz = snapping ? WING_SNAP_HZ : WING_IDLE_HZ;
  const amplitude = snapping ? 0.95 : 0.5;
  wingPivot.rotation.z = Math.sin(elapsed * hz * Math.PI * 2) * amplitude;

  // Squash & stretch relaxes back to 1.
  const k = Math.min(1, SQUASH_RECOVER * dt);
  bird.scale.x += (1 - bird.scale.x) * k;
  bird.scale.y += (1 - bird.scale.y) * k;

  if (state === 'ready') {
    bird.position.y = Math.sin(elapsed * READY_BOB_HZ) * READY_BOB_AMP;
  }

  updateParticles(dt);
  updateShake(dt);

  // Day → dusk glides toward the score-driven target.
  const targetMix = Math.min(score / DUSK_AT_SCORE, 1);
  if (Math.abs(targetMix - skyMix) > 0.0005) {
    skyMix += (targetMix - skyMix) * Math.min(1, dt * 1.5);
    applySky(skyMix);
  }
}

function frame(now: number): void {
  const dt = Math.min((now - lastTime) / 1000, MAX_DT);
  lastTime = now;
  updateVisuals(dt);
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

(document.getElementById('flappy-build-stamp') as HTMLDivElement).textContent = __BUILD_INFO__;

resize();
requestAnimationFrame(frame);
