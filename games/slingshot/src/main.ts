import * as THREE from 'three';
import Matter from 'matter-js';
import {
  createOrthoApp,
  startGameLoop,
  submitScore,
  showLeaderboard,
  getStoredPlayerName,
  promptPlayerName,
} from '@games-lab/shared';
import * as C from './config';
import * as physics from './physics';
import * as blocks from './blocks';
import * as targets from './targets';
import type { Target } from './targets';
import * as effects from './effects';
import * as audio from './audio';
import * as hud from './hud';
import { generateLevel, type BlockDesc, type TargetDesc } from './levelgen';
import { Slingshot } from './slingshot';
import * as menu from './menu';
import * as settings from './settings';
import * as story from './story';

declare const __BUILD_INFO__: string; // injected by vite.config.ts `define`

const { Bodies, Body } = Matter;

const app = createOrthoApp({ worldHeight: C.WORLD_HEIGHT, clearColor: C.THEMES.day.skyBot });
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
  camBase.y = C.GROUND_Y - C.GROUND_BAND + viewH / 2; // ground band pinned to the bottom
  // feed the live view rectangle to the paper background (sky/sun/clouds track it)
  effects.setView(camBase.x, camBase.y, viewW / 2, viewH / 2);
}
app.onResize = frameView;
frameView();

// --- World --------------------------------------------------------------------
blocks.init(scene);
targets.init(scene);
effects.init(scene);

// --- Paper ball: disc + ring + specular dot + a baked offset shadow ------------
const ballDiscMat = new THREE.MeshBasicMaterial({ color: C.THEMES.day.ball });
const ballRingMat = new THREE.MeshBasicMaterial({ color: C.THEMES.day.ballRing });
const ballMesh = new THREE.Mesh(new THREE.CircleGeometry(C.BALL_RADIUS, 28), ballDiscMat);
ballMesh.position.z = 0.3;
ballMesh.visible = false;
{
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(C.BALL_RADIUS, 24),
    new THREE.MeshBasicMaterial({ color: 0x462d1e, transparent: true, opacity: 0.2 }),
  );
  shadow.position.set(0.05, -0.13, -0.02);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(C.BALL_RADIUS * 0.74, C.BALL_RADIUS * 0.96, 28),
    ballRingMat,
  );
  ring.position.z = 0.01;
  const spec = new THREE.Mesh(
    new THREE.CircleGeometry(C.BALL_RADIUS * 0.2, 12),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }),
  );
  spec.position.set(-C.BALL_RADIUS * 0.3, C.BALL_RADIUS * 0.32, 0.02);
  ballMesh.add(shadow, ring, spec);
}
scene.add(ballMesh);
function setBallTheme(theme: C.Theme): void {
  ballDiscMat.color.set(theme.ball);
  ballRingMat.color.set(theme.ballRing);
}
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
let shotKills = 0; // targets eliminated by the current shot → combo multiplier
let ballBounces = 0; // ground contacts this shot → no-bounce skill bonus
let launchX = 0; // launch X, for the long-shot skill bonus

// current mode + story level pointer
let mode: 'arcade' | 'story' = 'arcade';
let storyId = 0;

// push a paper mood into every render module
function setTheme(theme: C.Theme): void {
  effects.setTheme(theme);
  blocks.setTheme(theme);
  targets.setTheme(theme);
  sling.setTheme(theme);
  setBallTheme(theme);
  app.renderer.setClearColor(theme.skyBot);
}

// brief slow-mo on big moments (multi-kills, TNT); eases the timestep back to 1
const slow = { t: 0, dur: 1, scale: 1 };
function slowmo(dur: number, scale: number): void {
  if (!settings.get().slowmo) return;
  if (slow.t <= 0 || scale < slow.scale) {
    slow.dur = dur;
    slow.t = dur;
    slow.scale = scale;
  }
}

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

interface LevelDesc {
  blocks: BlockDesc[];
  targets: TargetDesc[];
  shots: number;
  theme: C.Theme;
  label: string;
}

function loadLevel(desc: LevelDesc): void {
  removeBall();
  blocks.reset();
  targets.reset();
  setTheme(desc.theme); // set the mood before spawning so paper textures use it
  blocks.spawnFromDescs(desc.blocks);
  targets.spawnFromDescs(desc.targets);
  shotsTotal = desc.shots;
  shotsLeft = desc.shots;
  hud.setLevel(desc.label);
  hud.setShots(shotsLeft, shotsTotal);
  hud.setScore(score);
  hud.showNextButton(false);
  sling.enabled = false;
  sling.release();
  setState('settling');
}

function startArcadeLevel(lv: number): void {
  level = lv;
  const st = settings.get();
  const theme = st.arcadeTheme === 'cycle' ? C.themeForLevel(lv) : C.THEMES[st.arcadeTheme];
  const layout = generateLevel(lv);
  loadLevel({ blocks: layout.blocks, targets: layout.targets, shots: C.levelParams(lv).shots, theme, label: `Level ${lv}` });
}

function loadStoryLevel(id: number): void {
  storyId = id;
  const built = story.buildLevel(id);
  loadLevel({ blocks: built.blocks, targets: built.targets, shots: built.par, theme: built.theme, label: story.labelOf(id) });
}

// --- Leaderboard (shared games-lab service) -----------------------------------
const LEADERBOARD_GAME = 'slingshot';
const leaderboardBtn = document.getElementById('slingshot-leaderboard-btn') as HTMLButtonElement;

// The button is the only interactive element on the game-over screen. Stop
// propagation (like the next-shot button) so the tap doesn't fire the window
// "tap to play again".
leaderboardBtn.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  e.preventDefault();
});
leaderboardBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  showLeaderboard(LEADERBOARD_GAME, {
    title: 'Slingshot — Top',
    playerName: getStoredPlayerName(),
    highlightScore: score,
  });
});

// Submit the run's cumulative score: ask for a name once (remembered after),
// fire-and-forget. Only on game over — level clears continue the same run.
async function submitSlingshotScore(finalScore: number): Promise<void> {
  const name = await promptPlayerName();
  if (!name) return;
  await submitScore(LEADERBOARD_GAME, name, finalScore, { build: __BUILD_INFO__ });
}

// --- local best score (arcade) -------------------------------------------------
const BEST_KEY = 'slingshot.best';
function loadBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}
function saveBest(v: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(v));
  } catch {
    /* private mode */
  }
}

// --- settings → engine ---------------------------------------------------------
function applySettings(): void {
  const s = settings.get();
  audio.setMuted(s.muted);
  effects.setShakeEnabled(s.shake);
  effects.setGrainEnabled(s.grain);
}

// --- screen routing ------------------------------------------------------------
function goHome(): void {
  setState('ready');
  effects.reset();
  hud.setHudVisible(false);
  hud.hideOverlay();
  hud.showNextButton(false);
  leaderboardBtn.style.display = 'none';
  menu.showHome({ best: loadBest(), onStory: goLevelSelect, onArcade: startArcade, onSettings: goSettings });
}

function goLevelSelect(): void {
  menu.showLevelSelect({
    worlds: story.worlds().map((w) => ({
      name: w.name,
      levels: w.ids.map((id) => ({
        id,
        label: story.labelOf(id),
        stars: story.starsOf(id),
        unlocked: story.isUnlocked(id),
      })),
    })),
    totalStars: story.totalStars(),
    maxStars: story.totalLevels() * 3,
    onPick: startStory,
    onBack: goHome,
  });
}

function goSettings(): void {
  menu.showSettings({
    settings: settings.get(),
    onChange: (key, value) => {
      settings.set(key, value);
      applySettings();
    },
    onBack: goHome,
  });
}

function startArcade(): void {
  mode = 'arcade';
  menu.hide();
  score = 0;
  effects.reset();
  leaderboardBtn.style.display = 'none';
  hud.hideOverlay();
  hud.setHudVisible(true);
  startArcadeLevel(1);
}

function startStory(id: number): void {
  mode = 'story';
  menu.hide();
  score = 0;
  effects.reset();
  leaderboardBtn.style.display = 'none';
  hud.hideOverlay();
  hud.setHudVisible(true);
  loadStoryLevel(id);
}

function gameOver(): void {
  setState('gameover');
  sling.enabled = false;
  hud.setHudVisible(false);
  hud.showNextButton(false);
  if (mode === 'arcade') {
    if (score > loadBest()) saveBest(score);
    hud.showOverlay('Game over', [`Level ${level} · score ${score}`, 'Tap to play again']);
    leaderboardBtn.style.display = 'block';
    if (score > 0) void submitSlingshotScore(score);
  } else {
    hud.showOverlay('Out of shots', ['Tap for the map']);
  }
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
  shotKills = 0;
  ballBounces = 0;
  launchX = x;
  audio.launch();
  audio.vibrate(15);
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
  effects.burst(x, y, 0, C.KILL_BURST); // color comes from the theme confetti palette
  audio.vibrate(20);

  // combo: each kill this shot is worth more than the last
  shotKills += 1;
  if (shotKills >= 2) slowmo(C.SLOWMO_COMBO_DUR, C.SLOWMO_COMBO_SCALE);
  audio.targetChime(shotKills);
  const pts = C.POINTS_PER_TARGET * shotKills;
  score += pts;

  // skill-shot bonuses
  let bonus = 0;
  const tags: string[] = [];
  if (ballBounces === 0) {
    bonus += C.SKILL_NOBOUNCE_BONUS;
    tags.push('No bounce');
  }
  if (Math.abs(x - launchX) >= C.LONGSHOT_DIST) {
    bonus += C.SKILL_LONGSHOT_BONUS;
    tags.push('Long shot');
  }
  score += bonus;
  hud.setScore(score);

  // callout: combo name (×2+) or plain points, then any skill tags
  const combo = C.COMBO_NAMES[Math.min(shotKills, C.COMBO_NAMES.length - 1)] ?? '';
  let text = combo ? `${combo}  +${pts}` : shotKills >= 2 ? `+${pts}  ×${shotKills}` : `+${pts}`;
  if (tags.length) text += `  ${tags.join(' ')} +${bonus}`;
  hud.scorePop(text);
}

function maybeKill(target: Target, other: Matter.Body, rel: number): void {
  const threshold = other.label === 'ground' ? C.GROUND_KILL_IMPACT : C.KILL_IMPACT;
  if (rel > threshold) killTarget(target);
}

function shatterBlock(body: Matter.Body): void {
  const mat = blocks.materialOf(body);
  if (!mat) return; // already gone (e.g. caught in a chained explosion)
  const { x, y } = body.position;
  effects.burst(x, y, blocks.colorOf(body), C.MATERIALS[mat].burst);
  if (mat !== 'tnt') audio.shatter(mat);
  blocks.breakBlock(body);
  if (mat === 'tnt') explodeAt(x, y);
}

/** TNT blast: white flash + boom, knock everything back, blow non-stone blocks. */
function explodeAt(x: number, y: number): void {
  effects.shake();
  effects.flash(x, y);
  slowmo(C.SLOWMO_TNT_DUR, C.SLOWMO_TNT_SCALE);
  effects.burst(x, y, 0, C.TNT_BURST);
  audio.boom();
  audio.vibrate([0, 40, 30, 60]);
  for (const b of physics.explode(x, y, C.TNT_RADIUS, C.TNT_SPEED)) {
    const m = blocks.materialOf(b);
    if (m && m !== 'stone') shatterBlock(b); // stone only gets shoved; rest detonate/break
    const t = targets.fromBody(b);
    if (t) killTarget(t);
  }
}

physics.setImpactHandler((a, b, rel, x, y) => {
  if (state !== 'aiming' && state !== 'flying') return;
  if ((a.label === 'ball' && b.label === 'ground') || (b.label === 'ball' && a.label === 'ground')) {
    ballBounces += 1;
  }
  const targetA = targets.fromBody(a);
  const targetB = targets.fromBody(b);
  if (targetA) maybeKill(targetA, b, rel);
  if (targetB) maybeKill(targetB, a, rel);
  if (a.label === 'block' && rel > blocks.breakImpactOf(a)) shatterBlock(a);
  if (b.label === 'block' && rel > blocks.breakImpactOf(b)) shatterBlock(b);
  if (rel > C.SHAKE_IMPACT) {
    effects.shake();
    effects.burst(x, y, blocks.colorOf(a.label === 'block' ? a : b), C.IMPACT_BURST);
    audio.thud(rel);
    audio.vibrate(30);
  }
});

function advanceShot(): void {
  if (state !== 'flying') return;
  removeBall();
  hud.showNextButton(false);
  if (targets.aliveCount() === 0) {
    const stars = shotsLeft >= C.STAR3_SPARE ? 3 : shotsLeft >= C.STAR2_SPARE ? 2 : 1;
    hud.showStars(stars);
    audio.levelClear(stars);
    if (mode === 'arcade') {
      const bonus = shotsLeft * C.BONUS_PER_SHOT;
      score += bonus;
      hud.setScore(score);
      if (bonus > 0) hud.scorePop(`Level clear! +${bonus}`);
      level += 1;
      startArcadeLevel(level);
    } else {
      story.recordStars(storyId, stars);
      const next = storyId + 1;
      if (next < story.totalLevels()) {
        loadStoryLevel(next);
      } else {
        setState('gameover');
        sling.enabled = false;
        hud.setHudVisible(false);
        hud.showOverlay('Campaign complete!', [`★ ${story.totalStars()}/${story.totalLevels() * 3}`, 'Tap for the map']);
      }
    }
  } else if (shotsLeft > 0) {
    setState('aiming');
    sling.enabled = true;
    ballMesh.visible = true;
  } else {
    gameOver();
  }
}

hud.initNextButton(() => {
  audio.uiTap();
  advanceShot();
});

// --- Input: tap the in-game overlay to leave a game-over screen -------------------
window.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  audio.unlock(); // every gesture re-arms audio (iOS needs it inside a gesture)
  if (state === 'gameover' && elapsed - stateAt > 0.6) {
    if (mode === 'arcade') startArcade();
    else goLevelSelect();
  }
});

// --- Boot ----------------------------------------------------------------------------
applySettings();
(document.getElementById('slingshot-build-stamp') as HTMLDivElement).textContent = __BUILD_INFO__;
goHome();

startGameLoop((dt) => {
  // slow-mo: ease the world timestep down then back; the timer runs in real time
  let ts = 1;
  if (slow.t > 0) {
    slow.t -= dt;
    const k = Math.max(0, slow.t / slow.dur);
    ts = slow.scale + (1 - slow.scale) * (1 - k);
    if (slow.t <= 0) ts = 1;
  }
  const dtw = dt * ts;
  elapsed += dtw;
  physics.stepPhysics(dtw);

  // balloons hover (counter gravity); they pop on a light hit and drop their cargo
  for (const b of blocks.buoyantBodies()) {
    if (!b.isSleeping) Body.setVelocity(b, { x: b.velocity.x * C.BALLOON_DAMP, y: 0 });
  }

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
    if (physics.allStill()) stillTime += dtw;
    else stillTime = 0;
    if (stillTime >= C.STILL_TIME || elapsed - stateAt >= C.SHOT_TIMEOUT) advanceShot();
  }

  physics.syncMeshes();
  targets.pulse(elapsed);
  effects.update(dtw);
  app.camera.position.x = camBase.x + effects.shakeOffset.x;
  app.camera.position.y = camBase.y + effects.shakeOffset.y;
  app.renderer.render(scene, app.camera);
}, C.MAX_DT);
