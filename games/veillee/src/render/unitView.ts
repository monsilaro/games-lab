import * as THREE from 'three';
import { buildHero, type BuiltHero } from '../forge/heroFactory';
import type { HeroConfig } from '../forge/heroFactory';
import { BOARD, PALETTE } from '../config';
import type { Team } from '../combat/types';

const LUNGE_DUR = 0.18;
const FLASH_DUR = 0.16;
const DEATH_DUR = 0.6;
const RECOIL_DUR = 0.16;
const RECOIL_DIST = 0.22;
const WHITE = new THREE.Color(0xffffff);

// One shared geometry for every HP bar (bg + fill of every unit).
const BAR_GEO = new THREE.PlaneGeometry(BOARD.hpBarWidth, 0.13);

interface MatBase {
  mat: THREE.MeshLambertMaterial;
  emissive: THREE.Color;
  intensity: number;
  opacity: number;
}

/**
 * A combat unit's visual: wraps Phase 1's `buildHero` and layers procedural
 * combat animation (idle bob, attack lunge, hit flash, death tilt+fade) plus a
 * billboarded HP bar. Knows nothing about the engine — the run loop drives it.
 */
export class UnitView {
  readonly container = new THREE.Group();
  readonly bars = new THREE.Group();
  private hero: BuiltHero;
  private fill: THREE.Mesh;
  private base: MatBase[];
  private baseX = 0;
  private baseZ = 0;
  private facing = 0;
  private lungeT = 0;
  private flashT = 0;
  private deathT = -1;
  private recoilT = 0;
  private recoilDX = 0;
  private recoilDZ = 0;
  removable = false;

  constructor(cfg: HeroConfig, team: Team) {
    this.hero = buildHero(cfg);
    this.container.add(this.hero.root);
    this.container.scale.setScalar(BOARD.unitScale);

    const bg = new THREE.Mesh(BAR_GEO, new THREE.MeshBasicMaterial({ color: 0x0c0f1a }));
    this.fill = new THREE.Mesh(
      BAR_GEO,
      new THREE.MeshBasicMaterial({ color: team === 'player' ? PALETTE.auroraGreen : 0xe5484d }),
    );
    this.fill.position.z = 0.002;
    this.bars.add(bg, this.fill);

    this.base = this.hero.materials.map((m) => ({
      mat: m,
      emissive: m.emissive.clone(),
      intensity: m.emissiveIntensity,
      opacity: m.opacity,
    }));
  }

  addTo(scene: THREE.Scene): void {
    scene.add(this.container);
    scene.add(this.bars);
  }

  removeFrom(scene: THREE.Scene): void {
    scene.remove(this.container);
    scene.remove(this.bars);
    // Dispose per-unit materials (geometries are shared/cached — leave them).
    const disposeMats = (root: THREE.Object3D): void => {
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) (o.material as THREE.Material).dispose();
      });
    };
    disposeMats(this.container);
    disposeMats(this.bars);
  }

  setSlotPosition(x: number, z: number): void {
    this.baseX = x;
    this.baseZ = z;
    this.container.position.set(x, 0, z);
    this.bars.position.set(x, BOARD.hpBarHeight, z);
  }

  setFacing(a: number): void {
    this.facing = a;
  }

  /** Slightly enlarge higher-star units so rank reads at a glance. */
  setStarScale(star: number): void {
    this.container.scale.setScalar(BOARD.unitScale * (1 + 0.14 * (star - 1)));
  }

  showBars(v: boolean): void {
    this.bars.visible = v;
  }

  setHpRatio(r: number): void {
    const c = Math.max(0, Math.min(1, r));
    this.fill.scale.x = c || 0.0001;
    this.fill.position.x = (-BOARD.hpBarWidth * (1 - c)) / 2;
  }

  onAttack(): void {
    this.lungeT = LUNGE_DUR;
  }
  onHit(): void {
    this.flashT = FLASH_DUR;
  }
  /** Shove away from an attacker (dx,dz = attacker→victim direction). */
  onKnockback(dx: number, dz: number): void {
    const len = Math.hypot(dx, dz) || 1;
    this.recoilDX = dx / len;
    this.recoilDZ = dz / len;
    this.recoilT = RECOIL_DUR;
  }
  onDeath(): void {
    if (this.deathT < 0) this.deathT = DEATH_DUR;
  }

  /** Advance animation. `t` = global time (idle bob), `dt` = frame delta. */
  tick(t: number, dt: number, camPos: THREE.Vector3): void {
    this.hero.update(t);

    let ox = 0;
    let oz = 0;
    if (this.lungeT > 0) {
      this.lungeT -= dt;
      const reach = Math.sin((Math.max(0, this.lungeT) / LUNGE_DUR) * Math.PI) * 0.35;
      ox = Math.sin(this.facing) * reach;
      oz = Math.cos(this.facing) * reach;
    }
    if (this.recoilT > 0) {
      this.recoilT -= dt;
      const amt = (Math.max(0, this.recoilT) / RECOIL_DUR) * RECOIL_DIST;
      ox += this.recoilDX * amt;
      oz += this.recoilDZ * amt;
    }
    this.container.rotation.y = this.facing;
    this.container.position.set(this.baseX + ox, 0, this.baseZ + oz);

    if (this.flashT > 0) {
      this.flashT -= dt;
      const a = Math.max(0, this.flashT) / FLASH_DUR;
      for (const b of this.base) {
        b.mat.emissive.copy(b.emissive).lerp(WHITE, a);
        b.mat.emissiveIntensity = b.intensity + a * 1.6;
      }
    } else if (this.deathT < 0) {
      for (const b of this.base) {
        b.mat.emissive.copy(b.emissive);
        b.mat.emissiveIntensity = b.intensity;
      }
    }

    if (this.deathT >= 0) {
      this.deathT -= dt;
      const p = 1 - Math.max(0, this.deathT) / DEATH_DUR;
      this.container.rotation.x = p * (Math.PI / 2) * 0.9;
      for (const b of this.base) {
        b.mat.transparent = true;
        b.mat.opacity = b.opacity * (1 - p);
      }
      this.bars.visible = false;
      if (this.deathT <= 0) this.removable = true;
    }

    this.bars.lookAt(camPos);
  }
}
