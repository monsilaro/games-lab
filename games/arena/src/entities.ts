import * as THREE from 'three';
import * as C from './config';

// z-layers (ortho camera looks down -z; higher z draws on top)
const Z = {
  gem: 0.3,
  enemy: 0.5,
  halo: 0.68,
  player: 0.7,
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

// Shared materials — pools swap references, never clone. Fades are done by
// scaling to zero so opacity (and thus per-mesh materials) is never needed.
const chaserMat = new THREE.MeshBasicMaterial({ color: C.PALETTE.chaser });
const runnerMat = new THREE.MeshBasicMaterial({ color: C.PALETTE.runner });
const playerMat = new THREE.MeshBasicMaterial({ color: C.PALETTE.player });
const flashMat = new THREE.MeshBasicMaterial({ color: C.PALETTE.flash });
const projectileMat = new THREE.MeshBasicMaterial({ color: C.PALETTE.projectile });
const gemMat = new THREE.MeshBasicMaterial({ color: C.PALETTE.gem });

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
  private readonly mesh: THREE.Mesh;
  private readonly halo: THREE.Sprite;

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.Mesh(discGeo, playerMat);
    this.mesh.scale.setScalar(C.PLAYER_RADIUS);
    this.mesh.position.z = Z.player;
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
    this.halo.scale.setScalar(C.PLAYER_RADIUS * 6);
    this.halo.position.z = Z.halo;
    scene.add(this.halo, this.mesh);
  }

  reset(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.kbX = 0;
    this.kbY = 0;
    this.invuln = 0;
    this.mesh.visible = true;
    this.halo.visible = true;
  }

  hide(): void {
    this.mesh.visible = false;
    this.halo.visible = false;
  }

  /** Position sync + invincibility blink. Call every frame while alive. */
  sync(elapsed: number): void {
    this.mesh.position.x = this.x;
    this.mesh.position.y = this.y;
    this.halo.position.x = this.x;
    this.halo.position.y = this.y;
    this.mesh.visible =
      this.invuln <= 0 || Math.sin(elapsed * C.BLINK_HZ * Math.PI * 2) > 0;
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
      // dumb AI: head straight for the player
      const dx = px - e.x;
      const dy = py - e.y;
      const len = Math.hypot(dx, dy) || 1;
      e.x += ((dx / len) * e.speed + e.kbX) * dt;
      e.y += ((dy / len) * e.speed + e.kbY) * dt;
      e.kbX *= kbDecay;
      e.kbY *= kbDecay;
      if (e.type === 'runner') {
        e.mesh.rotation.z = Math.atan2(dy, dx); // triangle nose toward player
      } else {
        e.mesh.rotation.z += e.spin * dt;
      }
      if (e.flash > 0) e.flash -= dt;
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
      e.mesh.material = e.flash > 0
        ? flashMat
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
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  traveled: number;
  range: number;
  damage: number;
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
        active: false, x: 0, y: 0, vx: 0, vy: 0, speed: 0, traveled: 0, range: 0, damage: 0,
      });
    }
  }

  spawn(
    x: number, y: number, dirX: number, dirY: number,
    speed: number, damage: number, range: number,
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
    p.histX.fill(x);
    p.histY.fill(y);
    p.mesh.visible = true;
    for (const tm of p.trail) tm.visible = true;
  }

  private free(p: Projectile): void {
    p.active = false;
    p.mesh.visible = false;
    for (const tm of p.trail) tm.visible = false;
  }

  reset(): void {
    for (const p of this.list) this.free(p);
  }

  update(dt: number, enemies: Enemy[], onHit: (e: Enemy, damage: number) => void): void {
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

      let hit: Enemy | null = null;
      for (const e of enemies) {
        if (!e.active) continue;
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        const r = e.radius + C.PROJECTILE_RADIUS;
        if (dx * dx + dy * dy < r * r) {
          hit = e;
          break;
        }
      }
      if (hit) {
        this.free(p);
        onHit(hit, p.damage);
        continue;
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
