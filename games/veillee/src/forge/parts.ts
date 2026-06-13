import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Hero parts library — named, reusable, faceted (MeshLambertMaterial +
// flatShading). Heroes are assembled from these by heroFactory.ts; which parts
// and colors compose each hero is declared in heroes.ts.
//
// Everything here lives in a ~1.8-unit-tall "hero space" (feet at y=0). The
// gabarit scale is applied later by the factory.
// ---------------------------------------------------------------------------

export type BodyShape = 'block' | 'tapered' | 'gaunt' | 'gown' | 'beast' | 'wisp';
export type HeadShape = 'round' | 'box' | 'snout' | 'skull' | 'orb';
export type Headgear = 'none' | 'tuque' | 'hood' | 'furcap' | 'antlers' | 'pointyhat' | 'veil';
export type WeaponKind = 'none' | 'axe' | 'pike' | 'musket' | 'staff' | 'claws';
export type AccessoryKind = 'ceinture' | 'lantern' | 'sack' | 'cage' | 'canoe' | 'plaid' | 'glow';

export interface HeroPalette {
  primary: number; // coat / torso / fur
  secondary: number; // legs / trim / metal-dark
  accent: number; // weapon edge / sash / glow
  skin: number; // head / hands / muzzle
}

/** A body returns its group plus the anchor heights heads/weapons attach to. */
export interface BuiltBody {
  group: THREE.Group;
  top: number; // where the head sits
  shoulderY: number; // where arms / weapons attach
}

export interface BuiltHead {
  group: THREE.Group;
  top: number; // where headgear sits
}

const RADIAL = 6; // low radial segment count → chunky facets

interface MatOpts {
  emissive?: number;
  emissiveIntensity?: number;
  opacity?: number;
}

export function lambert(color: number, opts: MatOpts = {}): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ color, flatShading: true });
  if (opts.emissive !== undefined) {
    m.emissive = new THREE.Color(opts.emissive);
    m.emissiveIntensity = opts.emissiveIntensity ?? 1;
  }
  if (opts.opacity !== undefined) {
    m.transparent = true;
    m.opacity = opts.opacity;
  }
  return m;
}

// Geometry cache: every hero is built from the same handful of primitive shapes,
// so 16 units share a few dozen BufferGeometry instances instead of allocating
// hundreds. Transforms live on the meshes (never the geometry), so sharing is safe.
// Cached geometries are session-lived and must NOT be disposed per-unit.
const geoCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

function box(w: number, h: number, d: number, m: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(cached(`box:${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), m);
}
function cyl(rt: number, rb: number, h: number, m: THREE.Material, seg = RADIAL): THREE.Mesh {
  return new THREE.Mesh(cached(`cyl:${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), m);
}
function cone(r: number, h: number, m: THREE.Material, seg = RADIAL): THREE.Mesh {
  return new THREE.Mesh(cached(`cone:${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg)), m);
}
function ico(r: number, m: THREE.Material, detail = 0): THREE.Mesh {
  return new THREE.Mesh(cached(`ico:${r},${detail}`, () => new THREE.IcosahedronGeometry(r, detail)), m);
}

function addLegs(g: THREE.Group, pal: HeroPalette, h: number, spread = 0.14): void {
  const m = lambert(pal.secondary);
  for (const x of [-spread, spread]) {
    const leg = box(0.18, h, 0.2, m);
    leg.position.set(x, h / 2, 0);
    g.add(leg);
  }
}

function addArms(g: THREE.Group, pal: HeroPalette, shoulderY: number, reach = 0.36, len = 0.55): void {
  const m = lambert(pal.primary);
  for (const x of [-reach, reach]) {
    const arm = box(0.16, len, 0.18, m);
    arm.position.set(x, shoulderY - len / 2, 0);
    g.add(arm);
  }
}

// --- Bodies ----------------------------------------------------------------

export function buildBody(shape: BodyShape, pal: HeroPalette): BuiltBody {
  const g = new THREE.Group();
  switch (shape) {
    case 'block': {
      const base = 0.5;
      const th = 0.85;
      addLegs(g, pal, base);
      const torso = box(0.62, th, 0.42, lambert(pal.primary));
      torso.position.y = base + th / 2;
      g.add(torso);
      const sh = base + th - 0.08;
      addArms(g, pal, sh);
      return { group: g, top: base + th, shoulderY: sh };
    }
    case 'tapered': {
      const base = 0.5;
      const th = 0.9;
      addLegs(g, pal, base, 0.12);
      const coat = cyl(0.24, 0.4, th, lambert(pal.primary));
      coat.position.y = base + th / 2;
      g.add(coat);
      const sh = base + th - 0.1;
      addArms(g, pal, sh, 0.3, 0.5);
      return { group: g, top: base + th, shoulderY: sh };
    }
    case 'gaunt': {
      const base = 0.7;
      const th = 1.0;
      addLegs(g, pal, base, 0.13);
      const torso = box(0.42, th, 0.3, lambert(pal.primary));
      torso.position.y = base + th / 2;
      g.add(torso);
      const ribM = lambert(pal.secondary);
      for (let i = 0; i < 3; i++) {
        const rib = box(0.46, 0.06, 0.32, ribM);
        rib.position.set(0, base + 0.25 + i * 0.28, 0.02);
        g.add(rib);
      }
      const sh = base + th - 0.05;
      addArms(g, pal, sh, 0.3, 0.7);
      return { group: g, top: base + th, shoulderY: sh };
    }
    case 'gown': {
      const skirtH = 1.0;
      const skirt = cone(0.5, skirtH, lambert(pal.primary), RADIAL + 2);
      skirt.position.y = skirtH / 2;
      g.add(skirt);
      const base = 0.9;
      const th = 0.5;
      const torso = cyl(0.16, 0.22, th, lambert(pal.primary));
      torso.position.y = base + th / 2;
      g.add(torso);
      const sh = base + th - 0.05;
      addArms(g, pal, sh, 0.22, 0.45);
      return { group: g, top: base + th, shoulderY: sh };
    }
    case 'beast': {
      const base = 0.42;
      const th = 0.7;
      addLegs(g, pal, base, 0.16);
      const torso = box(0.7, th, 0.6, lambert(pal.primary));
      torso.position.set(0, base + th / 2, 0.05);
      torso.rotation.x = 0.25; // hunch forward
      g.add(torso);
      const sh = base + th - 0.1;
      const am = lambert(pal.primary);
      for (const x of [-0.32, 0.32]) {
        const arm = box(0.16, 0.55, 0.18, am);
        arm.position.set(x, sh - 0.25, 0.18);
        g.add(arm);
      }
      return { group: g, top: base + th + 0.05, shoulderY: sh };
    }
    case 'wisp': {
      const core = ico(0.26, lambert(pal.primary, { emissive: pal.accent, emissiveIntensity: 0.9 }), 1);
      core.position.y = 0.4;
      g.add(core);
      const tail = cone(0.18, 0.5, lambert(pal.primary, { emissive: pal.accent, emissiveIntensity: 0.5, opacity: 0.75 }));
      tail.position.y = 0.05;
      tail.rotation.x = Math.PI; // taper points down
      g.add(tail);
      return { group: g, top: 0.55, shoulderY: 0.4 };
    }
    default: {
      const _exhaustive: never = shape;
      throw new Error(`unknown body ${_exhaustive}`);
    }
  }
}

// --- Heads -----------------------------------------------------------------

export function buildHead(shape: HeadShape, pal: HeroPalette, atY: number): BuiltHead {
  const g = new THREE.Group();
  switch (shape) {
    case 'round': {
      const r = 0.24;
      const h = ico(r, lambert(pal.skin));
      h.position.y = atY + r;
      g.add(h);
      return { group: g, top: atY + 2 * r };
    }
    case 'box': {
      const s = 0.42;
      const h = box(s, s, s, lambert(pal.skin));
      h.position.y = atY + s / 2;
      g.add(h);
      return { group: g, top: atY + s };
    }
    case 'snout': {
      const r = 0.24;
      const head = ico(r, lambert(pal.skin));
      head.position.y = atY + r;
      g.add(head);
      const muzzle = box(0.2, 0.18, 0.28, lambert(pal.skin));
      muzzle.position.set(0, atY + r - 0.03, 0.24);
      g.add(muzzle);
      const em = lambert(pal.secondary);
      for (const x of [-0.13, 0.13]) {
        const ear = cone(0.08, 0.16, em, 4);
        ear.position.set(x, atY + 2 * r - 0.02, -0.02);
        g.add(ear);
      }
      return { group: g, top: atY + 2 * r };
    }
    case 'skull': {
      const r = 0.26;
      const head = ico(r, lambert(pal.skin));
      head.scale.set(0.8, 1.2, 0.9);
      head.position.y = atY + r;
      g.add(head);
      const sm = lambert(0x000000, { emissive: pal.accent, emissiveIntensity: 0.6 });
      for (const x of [-0.1, 0.1]) {
        const eye = box(0.07, 0.07, 0.05, sm);
        eye.position.set(x, atY + r + 0.04, r * 0.85);
        g.add(eye);
      }
      return { group: g, top: atY + 2 * r };
    }
    case 'orb': {
      const r = 0.28;
      const flame = ico(r, lambert(pal.accent, { emissive: pal.accent, emissiveIntensity: 1.1 }), 1);
      flame.position.y = atY + r;
      g.add(flame);
      return { group: g, top: atY + 2 * r };
    }
    default: {
      const _exhaustive: never = shape;
      throw new Error(`unknown head ${_exhaustive}`);
    }
  }
}

// --- Headgear --------------------------------------------------------------

const POMPOM = 0xe8edf2;

export function buildHeadgear(kind: Headgear, pal: HeroPalette, headTop: number): THREE.Group {
  const g = new THREE.Group();
  const center = headTop - 0.24;
  switch (kind) {
    case 'none':
      break;
    case 'tuque': {
      const cap = cone(0.26, 0.3, lambert(pal.accent));
      cap.position.y = headTop + 0.05;
      g.add(cap);
      const pom = ico(0.07, lambert(POMPOM));
      pom.position.y = headTop + 0.22;
      g.add(pom);
      const brim = cyl(0.27, 0.27, 0.08, lambert(pal.secondary));
      brim.position.y = headTop - 0.02;
      g.add(brim);
      break;
    }
    case 'hood': {
      const hood = cone(0.34, 0.6, lambert(pal.primary));
      hood.position.y = center + 0.18;
      g.add(hood);
      break;
    }
    case 'furcap': {
      const cap = cyl(0.27, 0.27, 0.2, lambert(pal.secondary));
      cap.position.y = headTop + 0.02;
      g.add(cap);
      break;
    }
    case 'antlers': {
      const m = lambert(pal.accent);
      for (const side of [-1, 1]) {
        const main = cyl(0.04, 0.05, 0.5, m, 4);
        main.position.set(side * 0.12, headTop + 0.22, 0);
        main.rotation.z = side * 0.5;
        g.add(main);
        for (let i = 0; i < 2; i++) {
          const fork = cyl(0.03, 0.03, 0.22, m, 4);
          fork.position.set(side * (0.22 + i * 0.06), headTop + 0.32 + i * 0.14, 0);
          fork.rotation.z = side * 1.0;
          g.add(fork);
        }
      }
      break;
    }
    case 'pointyhat': {
      const hat = cone(0.22, 0.55, lambert(pal.accent));
      hat.position.y = headTop + 0.22;
      g.add(hat);
      break;
    }
    case 'veil': {
      const veil = cone(0.34, 0.7, lambert(pal.skin, { opacity: 0.55 }), RADIAL + 2);
      veil.position.y = center + 0.2;
      g.add(veil);
      break;
    }
    default: {
      const _exhaustive: never = kind;
      throw new Error(`unknown headgear ${_exhaustive}`);
    }
  }
  return g;
}

// --- Weapons (held at the right hand) --------------------------------------

export function buildWeapon(kind: WeaponKind, pal: HeroPalette, shoulderY: number): THREE.Group {
  const g = new THREE.Group();
  const handX = 0.46;
  const handY = shoulderY - 0.45;
  switch (kind) {
    case 'none':
      break;
    case 'axe': {
      const haft = cyl(0.04, 0.04, 1.0, lambert(pal.secondary), 5);
      haft.position.set(handX, handY + 0.3, 0.1);
      g.add(haft);
      const blade = box(0.07, 0.3, 0.34, lambert(pal.accent));
      blade.position.set(handX + 0.02, handY + 0.75, 0.22);
      g.add(blade);
      break;
    }
    case 'pike': {
      const shaft = cyl(0.035, 0.035, 1.6, lambert(pal.secondary), 5);
      shaft.position.set(handX, handY + 0.6, 0.1);
      g.add(shaft);
      const tip = cone(0.06, 0.22, lambert(pal.accent), 5);
      tip.position.set(handX, handY + 1.5, 0.1);
      g.add(tip);
      break;
    }
    case 'musket': {
      const barrel = box(0.07, 0.07, 1.1, lambert(pal.secondary));
      barrel.position.set(handX, handY + 0.5, 0.15);
      barrel.rotation.x = -0.3;
      g.add(barrel);
      const stock = box(0.1, 0.22, 0.3, lambert(pal.accent));
      stock.position.set(handX, handY + 0.25, -0.1);
      g.add(stock);
      break;
    }
    case 'staff': {
      const rod = cyl(0.04, 0.04, 1.2, lambert(pal.secondary), 5);
      rod.position.set(handX, handY + 0.45, 0.1);
      g.add(rod);
      const orb = ico(0.12, lambert(pal.accent, { emissive: pal.accent, emissiveIntensity: 1.0 }));
      orb.position.set(handX, handY + 1.1, 0.1);
      g.add(orb);
      break;
    }
    case 'claws': {
      const m = lambert(pal.accent);
      for (const side of [-1, 1]) {
        for (let i = -1; i <= 1; i++) {
          const claw = cone(0.03, 0.16, m, 4);
          claw.position.set(side * 0.4 + i * 0.05, shoulderY - 0.55, 0.2 + i * 0.04);
          claw.rotation.x = 0.6;
          g.add(claw);
        }
      }
      break;
    }
    default: {
      const _exhaustive: never = kind;
      throw new Error(`unknown weapon ${_exhaustive}`);
    }
  }
  return g;
}

// --- Accessories -----------------------------------------------------------

export function buildAccessory(kind: AccessoryKind, pal: HeroPalette, body: BuiltBody): THREE.Group {
  const g = new THREE.Group();
  switch (kind) {
    case 'ceinture': {
      const sash = cyl(0.33, 0.33, 0.16, lambert(pal.accent));
      sash.position.y = body.top * 0.55;
      g.add(sash);
      const strap = box(0.1, 0.7, 0.05, lambert(pal.accent));
      strap.position.set(0, body.shoulderY - 0.2, 0.22);
      strap.rotation.z = 0.5;
      g.add(strap);
      break;
    }
    case 'lantern': {
      const housing = box(0.16, 0.22, 0.16, lambert(pal.secondary));
      housing.position.set(0.5, body.shoulderY - 0.55, 0.18);
      g.add(housing);
      const glow = ico(0.07, lambert(0xffd166, { emissive: 0xffd166, emissiveIntensity: 1.4 }));
      glow.position.copy(housing.position);
      g.add(glow);
      break;
    }
    case 'sack': {
      const bag = ico(0.3, lambert(pal.secondary));
      bag.scale.set(0.9, 1.1, 0.9);
      bag.position.set(-0.32, body.shoulderY - 0.05, -0.18);
      g.add(bag);
      break;
    }
    case 'cage': {
      const m = lambert(pal.secondary);
      const h = body.top + 0.5;
      for (const [x, z] of [
        [-0.3, -0.3],
        [0.3, -0.3],
        [-0.3, 0.3],
        [0.3, 0.3],
      ] as const) {
        const bar = box(0.05, h, 0.05, m);
        bar.position.set(x, h / 2, z);
        g.add(bar);
      }
      const ring = cyl(0.42, 0.42, 0.06, m);
      ring.position.y = h;
      g.add(ring);
      const hook = cyl(0.03, 0.03, 0.2, m, 4);
      hook.position.y = h + 0.12;
      g.add(hook);
      break;
    }
    case 'canoe': {
      const hull = cyl(0.3, 0.3, 1.7, lambert(pal.accent));
      hull.rotation.z = Math.PI / 2;
      hull.scale.set(1, 1, 0.55);
      hull.position.set(0, -0.15, 0);
      g.add(hull);
      break;
    }
    case 'plaid': {
      const m = lambert(pal.accent);
      const band = box(0.64, 0.12, 0.44, m);
      band.position.y = body.top * 0.7;
      g.add(band);
      const stripe = box(0.16, 0.86, 0.44, m);
      stripe.position.y = body.top * 0.6;
      g.add(stripe);
      break;
    }
    case 'glow': {
      const aura = ico(0.5, lambert(pal.accent, { emissive: pal.accent, emissiveIntensity: 0.7, opacity: 0.25 }), 1);
      aura.position.y = body.top * 0.5 + 0.2;
      g.add(aura);
      break;
    }
    default: {
      const _exhaustive: never = kind;
      throw new Error(`unknown accessory ${_exhaustive}`);
    }
  }
  return g;
}
