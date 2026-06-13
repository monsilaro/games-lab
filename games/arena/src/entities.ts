import * as THREE from 'three';
import * as C from './config';

// z-layers (ortho camera looks down -z; higher z draws on top)
const Z = {
  magnet: 0.08, // faint pickup-radius rim, under the horde
  aura: 0.12, // warmth aura ground glow, under the horde
  gem: 0.3,
  enemy: 0.5,
  halo: 0.64,
  playerTrail: 0.66,
  playerRing: 0.69,
  player: 0.7,
  playerInner: 0.71,
  barrel: 0.72,
  orbital: 0.74,
  trail: 0.76,
  projectile: 0.8,
  particle: 0.9,
} as const;

// Shared unit geometries — meshes are sized via scale, never re-allocated.
const discGeo = new THREE.CircleGeometry(1, 20);
const squareGeo = new THREE.PlaneGeometry(1, 1);
const triangleGeo = new THREE.CircleGeometry(1, 3);
const diamondGeo = new THREE.CircleGeometry(1, 4);
const particleGeo = new THREE.PlaneGeometry(0.14, 0.14);
const ringGeo = new THREE.RingGeometry(0.74, 1.0, 36); // unit ring band, scaled per use

// Shared materials — pools swap references, never clone. Fades are done by
// scaling to zero so opacity (and thus per-mesh materials) is never needed.
const chaserMat = new THREE.MeshBasicMaterial({ color: C.PALETTE.chaser });
const runnerMat = new THREE.MeshBasicMaterial({ color: C.PALETTE.runner });
const playerMat = new THREE.MeshBasicMaterial({ color: C.PALETTE.player });
const flashMat = new THREE.MeshBasicMaterial({ color: C.PALETTE.flash });
const projectileMat = new THREE.MeshBasicMaterial({ color: C.PALETTE.projectile });
const gemMat = new THREE.MeshBasicMaterial({ color: C.PALETTE.gem });
// Frozen tint for slowed enemies (ice-cyan).
const slowMat = new THREE.MeshBasicMaterial({ color: C.PALETTE.gem });

// Player glow-up materials (additive, warm).
const playerInnerMat = new THREE.MeshBasicMaterial({ color: C.PALETTE.projectile });
const barrelMat = new THREE.MeshBasicMaterial({ color: C.PALETTE.projectile });
const additive = (color: number, opacity: number): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({
    color, opacity, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
const playerRingMat = additive(C.PALETTE.projectile, 0.8);
const playerTrailMat = additive(C.PALETTE.player, 0.5);
const auraMat = additive(C.PALETTE.player, 0.16); // soft warm pool under the horde
const magnetMat = additive(C.PALETTE.gem, 0.16);
// Big icy comet projectile + its trail.
const cometMat = additive(C.PALETTE.gem, 0.95);
const orbitalMat = additive(C.PALETTE.gem, 0.95);

export type EnemyType = 'chaser' | 'runner';

function makeGlowTexture(r: number, g: number, b: number): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas context unavailable');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.8)`);
  grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

// --- Player ---------------------------------------------------------------------
export class Player {
  x = 0;
  y = 0;
  kbX = 0;
  kbY = 0;
  invuln = 0;

  // Layered body + facing barrel + glow.
  private readonly core: THREE.Mesh;
  private readonly inner: THREE.Mesh;
  private readonly ring: THREE.Mesh;
  private readonly barrel: THREE.Mesh;
  private readonly halo: THREE.Sprite;
  // Build-driven rings (warmth aura + magnet rim) and the motion trail.
  private readonly aura: THREE.Mesh;
  private readonly magnetRing: THREE.Mesh;
  private readonly trail: THREE.Mesh[] = [];
  private readonly histX: number[];
  private readonly histY: number[];

  private aimAngle = 0; // smoothed facing
  private aimTarget = 0; // desired facing (toward nearest enemy)
  private firePulse = 0; // s remaining on the muzzle punch
  private prevX = 0;
  private prevY = 0;
  private speed = 0; // units/s, derived from position delta
  private auraRadius = 0; // 0 = aura off
  private magnetRadius = 0;

  constructor(scene: THREE.Scene) {
    this.core = new THREE.Mesh(discGeo, playerMat);
    this.core.position.z = Z.player;

    this.inner = new THREE.Mesh(discGeo, playerInnerMat);
    this.inner.position.z = Z.playerInner;

    this.ring = new THREE.Mesh(ringGeo, playerRingMat);
    this.ring.position.z = Z.playerRing;

    this.barrel = new THREE.Mesh(triangleGeo, barrelMat);
    this.barrel.position.z = Z.barrel;

    // Soft additive ember glow behind the player — the only warm light.
    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeGlowTexture(255, 159, 28),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.6,
      }),
    );
    this.halo.position.z = Z.halo;

    // Filled disc (not a rim) so the warmth reads as a pool the horde wades into.
    this.aura = new THREE.Mesh(discGeo, auraMat);
    this.aura.position.z = Z.aura;
    this.aura.visible = false;

    this.magnetRing = new THREE.Mesh(ringGeo, magnetMat);
    this.magnetRing.position.z = Z.magnet;
    this.magnetRing.visible = false;

    this.histX = new Array<number>(C.PLAYER_TRAIL_LENGTH).fill(0);
    this.histY = new Array<number>(C.PLAYER_TRAIL_LENGTH).fill(0);
    for (let i = 0; i < C.PLAYER_TRAIL_LENGTH; i++) {
      const ghost = new THREE.Mesh(discGeo, playerTrailMat);
      ghost.position.z = Z.playerTrail;
      ghost.visible = false;
      this.trail.push(ghost);
      scene.add(ghost);
    }

    scene.add(this.magnetRing, this.aura, this.halo, this.ring, this.core, this.inner, this.barrel);
  }

  /** Point the barrel toward a world position (the nearest enemy). */
  setAim(tx: number, ty: number): void {
    this.aimTarget = Math.atan2(ty - this.y, tx - this.x);
  }

  /** Muzzle punch — call on every shot fired. */
  pulse(): void {
    this.firePulse = C.FIRE_PULSE_TIME;
  }

  /** Show/size the warmth aura ("Brasier"); level 0 hides it. */
  setAura(level: number): void {
    this.auraRadius = level > 0 ? C.AURA_RADIUS_BASE + (level - 1) * C.AURA_RADIUS_PER : 0;
    this.aura.visible = level > 0;
  }

  /** Show/size the magnet rim so pickup-radius growth is legible. */
  setMagnet(radius: number): void {
    this.magnetRadius = radius;
    this.magnetRing.visible = radius > 0;
  }

  reset(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.kbX = 0;
    this.kbY = 0;
    this.invuln = 0;
    this.aimAngle = 0;
    this.aimTarget = 0;
    this.firePulse = 0;
    this.prevX = x;
    this.prevY = y;
    this.speed = 0;
    this.histX.fill(x);
    this.histY.fill(y);
    this.core.visible = true;
    this.inner.visible = true;
    this.ring.visible = true;
    this.barrel.visible = true;
    this.halo.visible = true;
    for (const g of this.trail) g.visible = false;
  }

  hide(): void {
    this.core.visible = false;
    this.inner.visible = false;
    this.ring.visible = false;
    this.barrel.visible = false;
    this.halo.visible = false;
    this.aura.visible = false;
    this.magnetRing.visible = false;
    for (const g of this.trail) g.visible = false;
  }

  /** Position sync + animation + invincibility blink. Call every frame while alive. */
  sync(elapsed: number, dt: number): void {
    const r = C.PLAYER_RADIUS;
    this.speed = dt > 0 ? Math.hypot(this.x - this.prevX, this.y - this.prevY) / dt : 0;
    const moving = this.speed > 0.25;

    // Smoothly turn the barrel toward the target (shortest angular path).
    const delta = Math.atan2(
      Math.sin(this.aimTarget - this.aimAngle),
      Math.cos(this.aimTarget - this.aimAngle),
    );
    this.aimAngle += delta * Math.min(1, 12 * dt);

    this.firePulse = Math.max(0, this.firePulse - dt);
    const fp = this.firePulse / C.FIRE_PULSE_TIME; // 1 → 0
    const bob = moving ? 0 : Math.sin(elapsed * 3) * 0.04;
    const cx = this.x;
    const cy = this.y + bob;

    const pop = 1 + 0.18 * fp;
    this.core.position.set(cx, cy, Z.player);
    this.core.scale.setScalar(r * pop);
    this.inner.position.set(cx, cy, Z.playerInner);
    this.inner.scale.setScalar(r * 0.45 * (1 + 0.4 * fp));
    this.ring.position.set(cx, cy, Z.playerRing);
    this.ring.rotation.z += dt * 0.6;
    this.ring.scale.setScalar(r * 1.35 * (1 + 0.12 * fp));

    const bx = cx + Math.cos(this.aimAngle) * r * 1.05;
    const by = cy + Math.sin(this.aimAngle) * r * 1.05;
    this.barrel.position.set(bx, by, Z.barrel);
    this.barrel.rotation.z = this.aimAngle;
    this.barrel.scale.setScalar(r * (0.62 + 0.18 * fp));

    this.halo.position.set(cx, cy, Z.halo);
    this.halo.scale.setScalar(r * 6 * (1 + 0.25 * fp));

    if (this.auraRadius > 0) {
      this.aura.position.set(this.x, this.y, Z.aura);
      this.aura.scale.setScalar(this.auraRadius * (1 + 0.06 * Math.sin(elapsed * 4)));
    }
    if (this.magnetRadius > 0) {
      this.magnetRing.position.set(this.x, this.y, Z.magnet);
      this.magnetRing.scale.setScalar(this.magnetRadius * (1 + 0.04 * Math.sin(elapsed * 2.5)));
    }

    // Motion trail: afterimage ghosts lagging behind, scaled by speed so faster
    // builds (Swift) leave a longer, brighter wake; they vanish when idle.
    for (let i = C.PLAYER_TRAIL_LENGTH - 1; i > 0; i--) {
      this.histX[i] = this.histX[i - 1] ?? this.x;
      this.histY[i] = this.histY[i - 1] ?? this.y;
    }
    this.histX[0] = this.x;
    this.histY[0] = this.y;
    const tf = Math.min(1, this.speed / 5);
    for (let i = 0; i < this.trail.length; i++) {
      const g = this.trail[i];
      if (!g) continue;
      const s = r * (1 - i / this.trail.length) * 0.85 * tf;
      g.visible = s > 0.02;
      g.position.set(this.histX[i] ?? this.x, this.histY[i] ?? this.y, Z.playerTrail);
      g.scale.setScalar(s);
    }

    // Invincibility blink — only the solid body parts flicker.
    const visible = this.invuln <= 0 || Math.sin(elapsed * C.BLINK_HZ * Math.PI * 2) > 0;
    this.core.visible = visible;
    this.inner.visible = visible;
    this.ring.visible = visible;
    this.barrel.visible = visible;

    this.prevX = this.x;
    this.prevY = this.y;
  }
}

// --- Enemies ----------------------------------------------------------------------
export interface Enemy {
  readonly mesh: THREE.Mesh;
  active: boolean;
  type: EnemyType;
  x: number;
  y: number;
  hp: number;
  speed: number;
  damage: number;
  radius: number;
  xp: number;
  kbX: number;
  kbY: number;
  flash: number;
  spin: number;
  slow: number; // s remaining of comet freeze
  orbCd: number; // s before an orbital can hit this enemy again
}

export class EnemyPool {
  readonly list: Enemy[] = [];

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < C.ENEMY_POOL; i++) {
      const mesh = new THREE.Mesh(squareGeo, chaserMat);
      mesh.visible = false;
      mesh.position.z = Z.enemy;
      scene.add(mesh);
      this.list.push({
        mesh, active: false, type: 'chaser', x: 0, y: 0, hp: 1,
        speed: 0, damage: 0, radius: 0.5, xp: 1, kbX: 0, kbY: 0, flash: 0, spin: 0,
        slow: 0, orbCd: 0,
      });
    }
  }

  activeCount(): number {
    let n = 0;
    for (const e of this.list) if (e.active) n++;
    return n;
  }

  spawn(type: EnemyType, x: number, y: number, hpMult: number): void {
    const e = this.list.find((it) => !it.active);
    if (!e) return; // pool exhausted — skip; the wave still ends when these die
    const base = type === 'chaser' ? C.CHASER : C.RUNNER;
    e.active = true;
    e.type = type;
    e.x = x;
    e.y = y;
    e.hp = Math.round(base.hp * hpMult);
    e.speed = base.speed;
    e.damage = base.damage;
    e.radius = base.radius;
    e.xp = base.xp;
    e.kbX = 0;
    e.kbY = 0;
    e.flash = 0;
    e.slow = 0;
    e.orbCd = 0;
    e.spin = (Math.random() - 0.5) * 2;
    e.mesh.geometry = type === 'chaser' ? squareGeo : triangleGeo;
    e.mesh.material = type === 'chaser' ? chaserMat : runnerMat;
    e.mesh.rotation.z = 0;
    e.mesh.visible = true;
  }

  /** Applies damage + hit flash. @returns true if the enemy died. */
  damage(e: Enemy, amount: number): boolean {
    e.hp -= amount;
    e.flash = C.HIT_FLASH_TIME;
    return e.hp <= 0;
  }

  free(e: Enemy): void {
    e.active = false;
    e.mesh.visible = false;
  }

  reset(): void {
    for (const e of this.list) this.free(e);
  }

  update(dt: number, px: number, py: number): void {
    const kbDecay = Math.exp(-C.KNOCKBACK_DECAY * dt);
    const boundX = C.MAP_WIDTH / 2 - 0.2;
    const boundY = C.MAP_HEIGHT / 2 - 0.2;

    for (const e of this.list) {
      if (!e.active) continue;
      // dumb AI: head straight for the player (slowed while frozen by a comet)
      const sp = e.slow > 0 ? e.speed * C.COMET_SLOW_FACTOR : e.speed;
      const dx = px - e.x;
      const dy = py - e.y;
      const len = Math.hypot(dx, dy) || 1;
      e.x += ((dx / len) * sp + e.kbX) * dt;
      e.y += ((dy / len) * sp + e.kbY) * dt;
      e.kbX *= kbDecay;
      e.kbY *= kbDecay;
      if (e.type === 'runner') {
        e.mesh.rotation.z = Math.atan2(dy, dx); // triangle nose toward player
      } else {
        e.mesh.rotation.z += e.spin * dt;
      }
      if (e.flash > 0) e.flash -= dt;
      if (e.slow > 0) e.slow -= dt;
      if (e.orbCd > 0) e.orbCd -= dt;
    }

    // O(n²) pairwise separation keeps the horde from collapsing into one blob.
    for (let i = 0; i < this.list.length; i++) {
      const a = this.list[i];
      if (!a || !a.active) continue;
      for (let j = i + 1; j < this.list.length; j++) {
        const b = this.list[j];
        if (!b || !b.active) continue;
        const ddx = b.x - a.x;
        const ddy = b.y - a.y;
        const minDist = (a.radius + b.radius) * 0.9;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 >= minDist * minDist || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = (((minDist - d) / d) * C.ENEMY_SEPARATION * dt) / 2;
        a.x -= ddx * push;
        a.y -= ddy * push;
        b.x += ddx * push;
        b.y += ddy * push;
      }
    }

    for (const e of this.list) {
      if (!e.active) continue;
      e.x = THREE.MathUtils.clamp(e.x, -boundX, boundX);
      e.y = THREE.MathUtils.clamp(e.y, -boundY, boundY);
      e.mesh.position.x = e.x;
      e.mesh.position.y = e.y;
      // hit juice: white flash + micro scale punch
      const size = e.type === 'chaser' ? e.radius * 2 : e.radius * 1.6;
      const punch = e.flash > 0 ? 1 + 0.35 * (e.flash / C.HIT_FLASH_TIME) : 1;
      e.mesh.scale.setScalar(size * punch);
      // flash (hit) wins, then frozen tint, then the base color.
      e.mesh.material = e.flash > 0
        ? flashMat
        : e.slow > 0
          ? slowMat
          : e.type === 'chaser' ? chaserMat : runnerMat;
    }
  }
}

// --- Projectiles --------------------------------------------------------------------
interface Projectile {
  readonly mesh: THREE.Mesh;
  readonly trail: THREE.Mesh[];
  readonly histX: number[];
  readonly histY: number[];
  readonly hitSet: Set<Enemy>; // enemies already pierced (comet only)
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  traveled: number;
  range: number;
  damage: number;
  radius: number;
  pierce: boolean; // passes through enemies (comet)
  slow: boolean; // freezes enemies it hits (comet)
}

const TRAIL_SCALES = [0.65, 0.42, 0.24];

export class ProjectilePool {
  private readonly list: Projectile[] = [];

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < C.PROJECTILE_POOL; i++) {
      const mesh = new THREE.Mesh(discGeo, projectileMat);
      mesh.scale.setScalar(C.PROJECTILE_RADIUS);
      mesh.position.z = Z.projectile;
      mesh.visible = false;
      scene.add(mesh);
      const trail: THREE.Mesh[] = [];
      for (let t = 0; t < C.TRAIL_LENGTH; t++) {
        const tm = new THREE.Mesh(discGeo, projectileMat);
        tm.scale.setScalar(C.PROJECTILE_RADIUS * (TRAIL_SCALES[t] ?? 0.3));
        tm.position.z = Z.trail;
        tm.visible = false;
        scene.add(tm);
        trail.push(tm);
      }
      this.list.push({
        mesh, trail,
        histX: new Array<number>(C.TRAIL_LENGTH).fill(0),
        histY: new Array<number>(C.TRAIL_LENGTH).fill(0),
        hitSet: new Set<Enemy>(),
        active: false, x: 0, y: 0, vx: 0, vy: 0, speed: 0, traveled: 0, range: 0, damage: 0,
        radius: C.PROJECTILE_RADIUS, pierce: false, slow: false,
      });
    }
  }

  spawn(
    x: number, y: number, dirX: number, dirY: number,
    speed: number, damage: number, range: number,
    radius = C.PROJECTILE_RADIUS, pierce = false, slow = false,
  ): void {
    const p = this.list.find((it) => !it.active);
    if (!p) return;
    p.active = true;
    p.x = x;
    p.y = y;
    p.vx = dirX * speed;
    p.vy = dirY * speed;
    p.speed = speed;
    p.traveled = 0;
    p.range = range;
    p.damage = damage;
    p.radius = radius;
    p.pierce = pierce;
    p.slow = slow;
    p.hitSet.clear();
    p.histX.fill(x);
    p.histY.fill(y);
    // Comet shots are big icy piercers; normal shots stay warm.
    const mat = pierce ? cometMat : projectileMat;
    p.mesh.material = mat;
    p.mesh.scale.setScalar(radius);
    p.mesh.visible = true;
    for (let t = 0; t < p.trail.length; t++) {
      const tm = p.trail[t];
      if (!tm) continue;
      tm.material = mat;
      tm.scale.setScalar(radius * (TRAIL_SCALES[t] ?? 0.3));
      tm.visible = true;
    }
  }

  private free(p: Projectile): void {
    p.active = false;
    p.mesh.visible = false;
    for (const tm of p.trail) tm.visible = false;
  }

  reset(): void {
    for (const p of this.list) this.free(p);
  }

  update(
    dt: number, enemies: Enemy[],
    onHit: (e: Enemy, damage: number, slow: boolean) => void,
  ): void {
    const boundX = C.MAP_WIDTH / 2;
    const boundY = C.MAP_HEIGHT / 2;
    for (const p of this.list) {
      if (!p.active) continue;

      // trail = where the projectile was on the previous frames (scale-faded)
      for (let i = C.TRAIL_LENGTH - 1; i > 0; i--) {
        p.histX[i] = p.histX[i - 1] ?? p.x;
        p.histY[i] = p.histY[i - 1] ?? p.y;
      }
      p.histX[0] = p.x;
      p.histY[0] = p.y;

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.traveled += p.speed * dt;
      if (
        p.traveled > p.range ||
        Math.abs(p.x) > boundX || Math.abs(p.y) > boundY
      ) {
        this.free(p);
        continue;
      }

      if (p.pierce) {
        // Comet: damage every enemy on its line once, then fly on (freed by range).
        for (const e of enemies) {
          if (!e.active || p.hitSet.has(e)) continue;
          const dx = e.x - p.x;
          const dy = e.y - p.y;
          const r = e.radius + p.radius;
          if (dx * dx + dy * dy < r * r) {
            p.hitSet.add(e);
            onHit(e, p.damage, p.slow);
          }
        }
      } else {
        let hit: Enemy | null = null;
        for (const e of enemies) {
          if (!e.active) continue;
          const dx = e.x - p.x;
          const dy = e.y - p.y;
          const r = e.radius + p.radius;
          if (dx * dx + dy * dy < r * r) {
            hit = e;
            break;
          }
        }
        if (hit) {
          this.free(p);
          onHit(hit, p.damage, p.slow);
          continue;
        }
      }

      p.mesh.position.x = p.x;
      p.mesh.position.y = p.y;
      for (let i = 0; i < p.trail.length; i++) {
        const tm = p.trail[i];
        if (!tm) continue;
        tm.position.x = p.histX[i] ?? p.x;
        tm.position.y = p.histY[i] ?? p.y;
      }
    }
  }
}

// --- Orbiting sentinels ("Sentinelle") -------------------------------------------------
export interface Orbital {
  readonly mesh: THREE.Mesh;
  active: boolean;
  x: number;
  y: number;
}

export class OrbitalPool {
  readonly list: Orbital[] = [];
  private angle = 0;
  private count = 0;

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < C.ORBITAL_POOL; i++) {
      const mesh = new THREE.Mesh(discGeo, orbitalMat);
      mesh.scale.setScalar(C.ORBITAL_SIZE);
      mesh.position.z = Z.orbital;
      mesh.visible = false;
      scene.add(mesh);
      this.list.push({ mesh, active: false, x: 0, y: 0 });
    }
  }

  setCount(n: number): void {
    this.count = Math.max(0, Math.min(C.ORBITAL_POOL, n));
  }

  reset(): void {
    this.count = 0;
    this.angle = 0;
    for (const o of this.list) {
      o.active = false;
      o.mesh.visible = false;
    }
  }

  update(dt: number, px: number, py: number): void {
    this.angle += C.ORBITAL_SPEED * dt;
    const step = this.count > 0 ? (Math.PI * 2) / this.count : 0;
    for (let i = 0; i < this.list.length; i++) {
      const o = this.list[i];
      if (!o) continue;
      const active = i < this.count;
      o.active = active;
      o.mesh.visible = active;
      if (!active) continue;
      const a = this.angle + i * step;
      o.x = px + Math.cos(a) * C.ORBITAL_RADIUS;
      o.y = py + Math.sin(a) * C.ORBITAL_RADIUS;
      o.mesh.position.set(o.x, o.y, Z.orbital);
    }
  }
}

// --- XP gems --------------------------------------------------------------------------
interface Gem {
  readonly mesh: THREE.Mesh;
  active: boolean;
  x: number;
  y: number;
  xp: number;
  phase: number;
  magnetized: boolean;
}

export class GemPool {
  private readonly list: Gem[] = [];
  private next = 0; // round-robin overwrite when the pool is full

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < C.GEM_POOL; i++) {
      const mesh = new THREE.Mesh(diamondGeo, gemMat);
      mesh.scale.setScalar(C.GEM_RADIUS);
      mesh.position.z = Z.gem;
      mesh.visible = false;
      scene.add(mesh);
      this.list.push({ mesh, active: false, x: 0, y: 0, xp: 1, phase: 0, magnetized: false });
    }
  }

  spawn(x: number, y: number, xp: number): void {
    let g = this.list.find((it) => !it.active);
    if (!g) {
      g = this.list[this.next];
      this.next = (this.next + 1) % this.list.length;
      if (!g) return;
    }
    g.active = true;
    g.x = x;
    g.y = y;
    g.xp = xp;
    g.phase = Math.random() * Math.PI * 2;
    g.magnetized = false;
    g.mesh.visible = true;
  }

  reset(): void {
    for (const g of this.list) {
      g.active = false;
      g.mesh.visible = false;
    }
  }

  update(
    dt: number, px: number, py: number, magnetRadius: number,
    elapsed: number, onCollect: (xp: number) => void,
  ): void {
    for (const g of this.list) {
      if (!g.active) continue;
      const dx = px - g.x;
      const dy = py - g.y;
      const d = Math.hypot(dx, dy);
      if (d < C.GEM_COLLECT_DIST) {
        g.active = false;
        g.mesh.visible = false;
        onCollect(g.xp);
        continue;
      }
      if (g.magnetized || d < magnetRadius) {
        g.magnetized = true; // sticky: once hooked, always flies to the player
        g.x += (dx / d) * C.GEM_FLY_SPEED * dt;
        g.y += (dy / d) * C.GEM_FLY_SPEED * dt;
      }
      g.mesh.position.x = g.x;
      g.mesh.position.y = g.y;
      g.mesh.scale.setScalar(C.GEM_RADIUS * (1 + 0.2 * Math.sin(elapsed * 5 + g.phase)));
    }
  }
}

// --- Death-burst particles ---------------------------------------------------------------
interface Particle {
  readonly mesh: THREE.Mesh;
  active: boolean;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

export class ParticlePool {
  private readonly list: Particle[] = [];
  private next = 0;

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < C.PARTICLE_POOL; i++) {
      const mesh = new THREE.Mesh(particleGeo, chaserMat);
      mesh.position.z = Z.particle;
      mesh.visible = false;
      scene.add(mesh);
      this.list.push({ mesh, active: false, vx: 0, vy: 0, life: 0, maxLife: 1 });
    }
  }

  burst(x: number, y: number, type: EnemyType | 'player', count = C.DEATH_BURST): void {
    const mat = type === 'chaser' ? chaserMat : type === 'runner' ? runnerMat : playerMat;
    for (let k = 0; k < count; k++) {
      const p = this.list[this.next];
      this.next = (this.next + 1) % this.list.length;
      if (!p) continue;
      const angle = Math.random() * Math.PI * 2;
      const speed = C.PARTICLE_SPEED * (0.5 + Math.random() * 0.8);
      p.active = true;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.maxLife = C.PARTICLE_LIFE * (0.7 + Math.random() * 0.6);
      p.life = p.maxLife;
      p.mesh.material = mat;
      p.mesh.position.x = x;
      p.mesh.position.y = y;
      p.mesh.rotation.z = angle;
      p.mesh.scale.setScalar(1);
      p.mesh.visible = true;
    }
  }

  reset(): void {
    for (const p of this.list) {
      p.active = false;
      p.mesh.visible = false;
    }
  }

  update(dt: number): void {
    for (const p of this.list) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.scale.setScalar(p.life / p.maxLife); // fade by shrinking
    }
  }
}
