import * as THREE from 'three';
import {
  promptPlayerName,
  submitScore,
  showLeaderboard,
  getStoredPlayerName,
  AURORA
} from '@games-lab/shared';

declare const __BUILD_INFO__: string;

// --- Game Settings & Constants ---------------------------------------------
const LEADERBOARD_GAME = 'synth-rider';
const LANES = [-3.5, 0, 3.5];
const BASE_SPEED = 35;
const MAX_SPEED = 80;
const SPEED_ACCEL = 0.4; // speed increases by this much per second
const SPAWN_INTERVAL_BASE = 1.6; // spawn obstacle every 1.6s
const SPAWN_INTERVAL_MIN = 0.8;

// --- Game State -----------------------------------------------------------
type GameState = 'title' | 'playing' | 'gameover';
let state: GameState = 'title';

let score = 0;
let bestScore = 0;
let scrollSpeed = BASE_SPEED;
let elapsed = 0;
let obstacleTimer = 0;
let laneIndex = 1; // Start in middle lane (LANES[1] = 0)
let targetX = 0;

// Camera base configuration
const camBasePos = new THREE.Vector3(0, 2.8, 5.5);
const camLookAt = new THREE.Vector3(0, 0.8, -15);
let shakeTime = 0;
let shakeIntensity = 0;

// Load best score from localStorage
try {
  bestScore = parseInt(localStorage.getItem('synth-rider.best-score') ?? '0', 10);
  if (isNaN(bestScore)) bestScore = 0;
} catch {
  bestScore = 0;
}

// --- DOM References -------------------------------------------------------
const titleOverlay = document.getElementById('title-overlay') as HTMLDivElement;
const gameoverOverlay = document.getElementById('gameover-overlay') as HTMLDivElement;
const hud = document.getElementById('hud') as HTMLDivElement;
const scoreVal = document.getElementById('score-val') as HTMLSpanElement;
const bestVal = document.getElementById('best-val') as HTMLSpanElement;
const finalScoreVal = document.getElementById('final-score-val') as HTMLSpanElement;

const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
const restartBtn = document.getElementById('restart-btn') as HTMLButtonElement;
const menuLeaderboardBtn = document.getElementById('menu-leaderboard-btn') as HTMLButtonElement;
const gameoverLeaderboardBtn = document.getElementById('gameover-leaderboard-btn') as HTMLButtonElement;
const stamp = document.getElementById('synth-rider-build-stamp') as HTMLDivElement;

if (stamp) {
  stamp.textContent = __BUILD_INFO__;
}

// Update high score display initially
bestVal.textContent = String(bestScore);

// --- Three.js Globals -----------------------------------------------------
let renderer: THREE.WebGLRenderer;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;

let playerGroup: THREE.Group;
let thrusterMesh: THREE.Mesh;
let gridMesh: THREE.Mesh;
let gridWireMesh: THREE.Mesh;
let gridGeo: THREE.PlaneGeometry;
let gridOffset = 0;

interface Obstacle {
  mesh: THREE.Group;
  lane: number;
  rotSpeedX: number;
  rotSpeedY: number;
}
let obstacles: Obstacle[] = [];

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  rotSpeed: THREE.Vector3;
  life: number;
}
let particles: Particle[] = [];

// --- Sun Texture Generator ------------------------------------------------
function createSunTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Draw background gradient (hot pink to orange/yellow)
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#ff1a75'); // neon hot pink
  grad.addColorStop(0.5, '#ff9f1c'); // neon orange
  grad.addColorStop(1, '#ffd166'); // neon yellow
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  // Create horizontal scanlines by clearing bars
  // Lines become progressively thicker towards the bottom
  ctx.fillStyle = '#08090f'; // matches night background
  for (let y = 120; y < 256; y += 10) {
    const h = Math.floor((y - 120) / 16) + 2;
    ctx.fillRect(0, y, 256, h);
  }

  return new THREE.CanvasTexture(canvas);
}

// --- Grid Wave Calculations -----------------------------------------------
function getWaveHeight(x: number, z: number, time: number): number {
  // Wave components
  const waveX = Math.sin(x * 0.12 + time * 1.5);
  const waveZ = Math.cos(z * 0.08 - time * 2.0);
  const baseHeight = waveX * waveZ * 2.2;

  // Flatten the grid in the lane area (x is between -5 and 5)
  // Transition smoothly from flat at center to full waves on the sides
  const trackWidth = 5.5;
  const smoothFactor = Math.max(0, Math.min(1, (Math.abs(x) - trackWidth) / 6.0));
  return baseHeight * smoothFactor;
}

// --- Build Scene -----------------------------------------------------------
function initEngine(): void {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false
  });
  renderer.setClearColor(0x08090f, 1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x08090f, 0.008);

  camera = new THREE.PerspectiveCamera(
    65,
    window.innerWidth / window.innerHeight,
    0.1,
    500
  );
  camera.position.copy(camBasePos);

  // --- Background: Retro Sun & Stars ---------------------------------------
  // Sun plane
  const sunGeo = new THREE.CircleGeometry(16, 32);
  const sunMat = new THREE.MeshBasicMaterial({
    map: createSunTexture(),
    transparent: true,
    side: THREE.DoubleSide
  });
  const sunMesh = new THREE.Mesh(sunGeo, sunMat);
  sunMesh.position.set(0, 5, -100);
  scene.add(sunMesh);

  // Starfield
  const starsGeo = new THREE.BufferGeometry();
  const starsCount = 250;
  const starsPos = new Float32Array(starsCount * 3);
  for (let i = 0; i < starsCount; i++) {
    starsPos[i * 3] = (Math.random() - 0.5) * 200; // x
    starsPos[i * 3 + 1] = Math.random() * 60 + 2;   // y
    starsPos[i * 3 + 2] = -Math.random() * 120 - 20; // z
  }
  starsGeo.setAttribute('position', new THREE.BufferAttribute(starsPos, 3));
  const starsMat = new THREE.PointsMaterial({
    color: AURORA.white,
    size: 0.6,
    transparent: true,
    opacity: 0.7
  });
  const stars = new THREE.Points(starsGeo, starsMat);
  scene.add(stars);

  // --- Infinite scrolling vertex-animated grid ------------------------------
  // Width=80, Depth=180, SegmentsX=40, SegmentsZ=90
  const width = 80;
  const depth = 180;
  const segX = 40;
  const segZ = 90;
  gridGeo = new THREE.PlaneGeometry(width, depth, segX, segZ);
  gridGeo.rotateX(-Math.PI / 2); // Lay it flat

  // Solid dark floor base
  const gridBaseMat = new THREE.MeshBasicMaterial({
    color: AURORA.night
  });
  gridMesh = new THREE.Mesh(gridGeo, gridBaseMat);
  gridMesh.position.set(0, 0, -depth / 2 + 10);
  scene.add(gridMesh);

  // Wireframe cyber overlay
  const gridWireMat = new THREE.MeshBasicMaterial({
    color: AURORA.iceCyan,
    wireframe: true,
    transparent: true,
    opacity: 0.35
  });
  gridWireMesh = new THREE.Mesh(gridGeo, gridWireMat);
  gridWireMesh.position.copy(gridMesh.position);
  scene.add(gridWireMesh);

  // --- Player spaceship ----------------------------------------------------
  playerGroup = new THREE.Group();

  // Ship Main Fuselage (Diamond wedge shape)
  const bodyGeo = new THREE.ConeGeometry(0.5, 2.0, 4);
  bodyGeo.rotateX(Math.PI / 2); // Point along -Z
  bodyGeo.rotateY(Math.PI / 4); // Diamond rotation
  const bodyMat = new THREE.MeshBasicMaterial({
    color: AURORA.ember
  });
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  playerGroup.add(bodyMesh);

  // Glowing wireframe outline for neon game juice
  const bodyWireMat = new THREE.MeshBasicMaterial({
    color: AURORA.emberLight,
    wireframe: true
  });
  const bodyWire = new THREE.Mesh(bodyGeo, bodyWireMat);
  bodyWire.scale.set(1.06, 1.06, 1.06);
  playerGroup.add(bodyWire);

  // Left Wing
  const leftWingGeo = new THREE.ConeGeometry(0.25, 1.1, 3);
  leftWingGeo.rotateZ(Math.PI / 2);
  leftWingGeo.rotateY(Math.PI / 6);
  const wingMat = new THREE.MeshBasicMaterial({
    color: AURORA.deepBlue
  });
  const leftWing = new THREE.Mesh(leftWingGeo, wingMat);
  leftWing.position.set(-0.85, -0.15, 0.1);
  playerGroup.add(leftWing);

  // Glowing wing outline
  const wingWireMat = new THREE.MeshBasicMaterial({
    color: AURORA.slateBlue,
    wireframe: true
  });
  const leftWingWire = new THREE.Mesh(leftWingGeo, wingWireMat);
  leftWingWire.scale.set(1.08, 1.08, 1.08);
  leftWingWire.position.copy(leftWing.position);
  playerGroup.add(leftWingWire);

  // Right Wing
  const rightWing = new THREE.Mesh(leftWingGeo, wingMat);
  rightWing.position.set(0.85, -0.15, 0.1);
  rightWing.rotation.z = -Math.PI / 2;
  rightWing.rotation.y = -Math.PI / 6;
  playerGroup.add(rightWing);

  const rightWingWire = new THREE.Mesh(leftWingGeo, wingWireMat);
  rightWingWire.scale.set(1.08, 1.08, 1.08);
  rightWingWire.position.copy(rightWing.position);
  rightWingWire.rotation.z = -Math.PI / 2;
  rightWingWire.rotation.y = -Math.PI / 6;
  playerGroup.add(rightWingWire);

  // Thruster Fire
  const thrusterGeo = new THREE.ConeGeometry(0.25, 0.9, 4);
  thrusterGeo.rotateX(-Math.PI / 2); // Point backward (+Z)
  const thrusterMat = new THREE.MeshBasicMaterial({
    color: 0xff3366 // vibrant neon pink
  });
  thrusterMesh = new THREE.Mesh(thrusterGeo, thrusterMat);
  thrusterMesh.position.set(0, -0.05, 1.15);
  playerGroup.add(thrusterMesh);

  playerGroup.position.set(0, 0.5, 0);
  scene.add(playerGroup);
}

// --- Obstacle Factory ------------------------------------------------------
function createObstacleMesh(type: number): { group: THREE.Group; color: number } {
  const group = new THREE.Group();

  let geo: THREE.BufferGeometry;
  if (type === 0) {
    // Cube
    geo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
  } else if (type === 1) {
    // Pyramid
    geo = new THREE.ConeGeometry(0.8, 1.6, 4);
    geo.rotateX(Math.PI / 2); // Align Z
  } else {
    // Crystal (Octahedron)
    geo = new THREE.OctahedronGeometry(0.9);
  }

  // Neon color theme: Green or Purple
  const color = type === 0 ? AURORA.auroraGreen : AURORA.violet;

  const baseMat = new THREE.MeshBasicMaterial({
    color: AURORA.deepBlue
  });
  const wireMat = new THREE.MeshBasicMaterial({
    color: color,
    wireframe: true
  });

  const baseMesh = new THREE.Mesh(geo, baseMat);
  const wireMesh = new THREE.Mesh(geo, wireMat);
  wireMesh.scale.set(1.06, 1.06, 1.06);

  group.add(baseMesh);
  group.add(wireMesh);

  return { group, color };
}

function spawnObstacle(): void {
  const type = Math.floor(Math.random() * 3);
  const lane = Math.floor(Math.random() * 3);
  const x = LANES[lane]!;
  const z = -140; // Horizon spawn

  const { group } = createObstacleMesh(type);
  group.position.set(x, 0.6, z);
  scene.add(group);

  obstacles.push({
    mesh: group,
    lane,
    rotSpeedX: (Math.random() - 0.5) * 3,
    rotSpeedY: (Math.random() - 0.5) * 3
  });
}

// --- Collision Particle Explosion -------------------------------------------
function spawnExplosion(pos: THREE.Vector3): void {
  const geo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
  const colors = [AURORA.ember, AURORA.emberLight, 0xff3366];

  for (let i = 0; i < 40; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: colors[Math.floor(Math.random() * colors.length)],
      transparent: true,
      opacity: 1.0
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);

    // Calculate velocity vector flying outward
    const velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 14,
      Math.random() * 9 + 4,
      (Math.random() - 0.5) * 14 - scrollSpeed * 0.4
    );

    const rotSpeed = new THREE.Vector3(
      Math.random() * 12,
      Math.random() * 12,
      Math.random() * 12
    );

    scene.add(mesh);
    particles.push({
      mesh,
      velocity,
      rotSpeed,
      life: 1.0
    });
  }
}

// --- Leaderboard Actions (Soft Failing) ------------------------------------
async function submitSynthRiderScore(finalScore: number): Promise<void> {
  const name = await promptPlayerName();
  if (!name) return;
  await submitScore(LEADERBOARD_GAME, name, finalScore, { build: __BUILD_INFO__ });
}

// --- Game Control Actions --------------------------------------------------
function startGame(): void {
  state = 'playing';
  score = 0;
  elapsed = 0;
  scrollSpeed = BASE_SPEED;
  obstacleTimer = 0;
  laneIndex = 1;
  targetX = LANES[1]!;

  // Reset player
  playerGroup.position.set(0, 0.5, 0);
  playerGroup.rotation.set(0, 0, 0);
  playerGroup.visible = true;

  // Clear obstacles
  for (const obs of obstacles) {
    scene.remove(obs.mesh);
    disposeGroup(obs.mesh);
  }
  obstacles = [];

  // Clear particles
  for (const p of particles) {
    scene.remove(p.mesh);
    p.mesh.geometry.dispose();
    (p.mesh.material as THREE.Material).dispose();
  }
  particles = [];

  // UI switches
  titleOverlay.classList.add('hidden');
  gameoverOverlay.classList.add('hidden');
  hud.style.display = 'flex';
  scoreVal.textContent = '0';
}

function gameOver(): void {
  state = 'gameover';
  hud.style.display = 'none';
  gameoverOverlay.classList.remove('hidden');
  finalScoreVal.textContent = String(score);

  // Trigger impact effects
  shakeTime = 0.5;
  shakeIntensity = 0.85;
  spawnExplosion(playerGroup.position);
  playerGroup.visible = false;

  // Update best score
  if (score > bestScore) {
    bestScore = score;
    bestVal.textContent = String(bestScore);
    try {
      localStorage.setItem('synth-rider.best-score', String(bestScore));
    } catch {
      // Fail silently if localStorage is blocked
    }
  }

  // Soft leaderboard score submission
  if (score > 0) {
    void submitSynthRiderScore(score);
  }
}

// --- Garbage Collection Helper --------------------------------------------
function disposeGroup(group: THREE.Group): void {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    }
  });
}

// --- Window Resizing ------------------------------------------------------
function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

// --- Input Controls -------------------------------------------------------
function handleLeft(): void {
  if (state !== 'playing') return;
  if (laneIndex > 0) {
    laneIndex--;
    targetX = LANES[laneIndex]!;
    showTouchFeedback('left');
  }
}

function handleRight(): void {
  if (state !== 'playing') return;
  if (laneIndex < 2) {
    laneIndex++;
    targetX = LANES[laneIndex]!;
    showTouchFeedback('right');
  }
}

// Keyboard
window.addEventListener('keydown', (e) => {
  if (document.querySelector('.gl-leaderboard-backdrop')) {
    return;
  }
  if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') {
    handleLeft();
  } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') {
    handleRight();
  }
});

// Touch (Lane Switch)
window.addEventListener('pointerdown', (e) => {
  if (state !== 'playing') return;

  // Block touch switches if tapping UI buttons or overlays
  const target = e.target as HTMLElement;
  if (target.closest('.neon-btn') || target.closest('.gl-leaderboard-backdrop')) {
    return;
  }

  const halfWidth = window.innerWidth / 2;
  if (e.clientX < halfWidth) {
    handleLeft();
  } else {
    handleRight();
  }
});

function showTouchFeedback(side: 'left' | 'right'): void {
  const el = document.getElementById(side === 'left' ? 'touch-left' : 'touch-right');
  if (el) {
    el.classList.add('active');
    setTimeout(() => el.classList.remove('active'), 150);
  }
}

// Prevent pinch-zooming / scrolling gestures on iOS
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());

// --- UI Button Listeners ---------------------------------------------------
startBtn.addEventListener('click', () => {
  startGame();
});

restartBtn.addEventListener('click', () => {
  startGame();
});

// Stopping event propagation so modal taps don't trigger restart/controls
menuLeaderboardBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
menuLeaderboardBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  showLeaderboard(LEADERBOARD_GAME, {
    title: 'SynthRider 3D — Top',
    playerName: getStoredPlayerName()
  });
});

gameoverLeaderboardBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
gameoverLeaderboardBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  showLeaderboard(LEADERBOARD_GAME, {
    title: 'SynthRider 3D — Top',
    playerName: getStoredPlayerName(),
    highlightScore: score
  });
});

// --- Main Loop -------------------------------------------------------------
let lastTime = performance.now();

function gameLoop(now: number): void {
  requestAnimationFrame(gameLoop);

  // Delta calculation (seconds, clamped to max 0.05)
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  const time = now / 1000;

  // 1. Grid Vertex Animation & Infinite Scroll
  if (state === 'playing') {
    gridOffset += scrollSpeed * dt;
    const spacing = 180 / 90; // Depth / SegmentsZ
    gridMesh.position.z = (gridOffset % spacing) - (180 / 2) + 10;
    gridWireMesh.position.z = gridMesh.position.z;
  }

  // Update vertex Y heights in CPU
  const posAttr = gridGeo.attributes.position;
  if (posAttr) {
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      // Align wave to world Z so there is no visual jump when resetting mesh Z coordinate
      const worldZ = z - gridOffset;
      const y = getWaveHeight(x, worldZ, time);
      posAttr.setY(i, y);
    }
    posAttr.needsUpdate = true;
  }

  // 2. Play mode logic
  if (state === 'playing') {
    elapsed += dt;
    scrollSpeed = Math.min(MAX_SPEED, BASE_SPEED + elapsed * SPEED_ACCEL);

    // Score accumulation
    score = Math.floor(elapsed * 12);
    scoreVal.textContent = String(score);

    // Interpolate spaceship X position
    playerGroup.position.x += (targetX - playerGroup.position.x) * 15 * dt;

    // Game juice: Banking ship rotation on X axis
    const bankRoll = -(targetX - playerGroup.position.x) * 0.16;
    playerGroup.rotation.z += (bankRoll - playerGroup.rotation.z) * 12 * dt;
    // Slight yaw pivot
    playerGroup.rotation.y = (targetX - playerGroup.position.x) * 0.08;

    // Animate thruster scale pulse
    const thrusterScale = 1.0 + Math.sin(time * 60) * 0.25;
    thrusterMesh.scale.set(1, 1, thrusterScale);

    // Spawn Obstacles
    obstacleTimer += dt;
    const spawnInterval = Math.max(
      SPAWN_INTERVAL_MIN,
      SPAWN_INTERVAL_BASE - (scrollSpeed - BASE_SPEED) * 0.02
    );
    if (obstacleTimer >= spawnInterval) {
      obstacleTimer = 0;
      spawnObstacle();
    }

    // Move Obstacles & Collision Check
    const playerBox = new THREE.Box3().setFromCenterAndSize(
      playerGroup.position,
      new THREE.Vector3(1.3, 0.75, 1.5) // Ship bounding box dimensions
    );
    const obsBox = new THREE.Box3();

    for (let i = obstacles.length - 1; i >= 0; i--) {
      const obs = obstacles[i]!;
      obs.mesh.position.z += scrollSpeed * dt;

      // Spin obstacles
      obs.mesh.rotation.x += obs.rotSpeedX * dt;
      obs.mesh.rotation.y += obs.rotSpeedY * dt;

      // Collision check
      obsBox.setFromObject(obs.mesh);
      if (playerBox.intersectsBox(obsBox)) {
        gameOver();
        break;
      }

      // Cleanup when past player camera view
      if (obs.mesh.position.z > 15) {
        scene.remove(obs.mesh);
        disposeGroup(obs.mesh);
        obstacles.splice(i, 1);
      }
    }
  }

  // 3. Update explosion particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]!;
    p.mesh.position.addScaledVector(p.velocity, dt);
    p.mesh.rotation.x += p.rotSpeed.x * dt;
    p.mesh.rotation.y += p.rotSpeed.y * dt;

    // Apply gravity
    p.velocity.y -= 13 * dt;

    // Fade out life
    p.life -= dt * 1.3;
    const mat = p.mesh.material as THREE.MeshBasicMaterial;
    mat.opacity = Math.max(0, p.life);

    if (p.life <= 0) {
      scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      mat.dispose();
      particles.splice(i, 1);
    }
  }

  // 4. Camera Shake & Render
  if (shakeTime > 0) {
    shakeTime -= dt;
    const dx = (Math.random() - 0.5) * shakeIntensity;
    const dy = (Math.random() - 0.5) * shakeIntensity;
    const dz = (Math.random() - 0.5) * shakeIntensity;
    camera.position.set(camBasePos.x + dx, camBasePos.y + dy, camBasePos.z + dz);
  } else {
    // Interpolate camera back to its home base position smoothly
    camera.position.lerp(camBasePos, 8 * dt);
  }
  camera.lookAt(camLookAt);

  renderer.render(scene, camera);
}

// --- Start Game Initializations -------------------------------------------
initEngine();
resize();
requestAnimationFrame(gameLoop);
