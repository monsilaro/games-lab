import * as THREE from 'three';
import { GABARITS, FORGE, type Build, type Origin, type Role } from '../config';
import {
  buildBody,
  buildHead,
  buildHeadgear,
  buildWeapon,
  buildAccessory,
  type BodyShape,
  type HeadShape,
  type Headgear,
  type WeaponKind,
  type AccessoryKind,
  type HeroPalette,
} from './parts';

// ---------------------------------------------------------------------------
// HeroConfig — the schema of a hero. heroes.ts is a list of these and is the
// design source of truth; this factory turns one into a renderable group.
//
//   build       gabarit: 'sm' | 'md' | 'lg' | 'float'
//   origin/role narrative trait labels shown in the forge (Origine / Rôle;
//               formalized into real synergies in Phase 3)
//   blurb       one-line folklore note
//   palette     primary (coat) / secondary (legs, metal) / accent (edge, glow) / skin
//   body/head/headgear/weapon  pick one part each (see parts.ts unions)
//   accessories zero or more narrative props
// ---------------------------------------------------------------------------
export interface HeroConfig {
  id: string;
  name: string;
  build: Build;
  origin: Origin;
  role: Role;
  blurb: string;
  palette: HeroPalette;
  body: BodyShape;
  head: HeadShape;
  headgear: Headgear;
  weapon: WeaponKind;
  accessories: AccessoryKind[];
}

export interface BuiltHero {
  root: THREE.Group;
  /** Every Lambert material in the hero — Phase 2 uses these for hit-flash. */
  materials: THREE.MeshLambertMaterial[];
  /** Procedural idle: bob (+ hover for floaters). Forge drives the turntable. */
  update(t: number): void;
}

export function buildHero(cfg: HeroConfig): BuiltHero {
  const g = GABARITS[cfg.build];
  const root = new THREE.Group();

  const body = buildBody(cfg.body, cfg.palette);
  root.add(body.group);

  const head = buildHead(cfg.head, cfg.palette, body.top);
  root.add(head.group);

  root.add(buildHeadgear(cfg.headgear, cfg.palette, head.top));
  root.add(buildWeapon(cfg.weapon, cfg.palette, body.shoulderY));
  for (const acc of cfg.accessories) {
    root.add(buildAccessory(acc, cfg.palette, body));
  }

  root.scale.setScalar(g.scale);

  const materials: THREE.MeshLambertMaterial[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshLambertMaterial) {
      materials.push(o.material);
    }
  });

  const baseY = g.baseY;
  // Desync bob between heroes so the gallery doesn't pulse in unison.
  const phase = cfg.id.length * 0.7;
  return {
    root,
    materials,
    update(t: number) {
      const bob = Math.sin(t * FORGE.idleBobFreq + phase) * FORGE.idleBobAmp;
      const hover = g.hover > 0 ? (Math.sin(t * FORGE.hoverFreq) * 0.5 + 0.5) * g.hover : 0;
      root.position.y = baseY + bob + hover;
    },
  };
}
