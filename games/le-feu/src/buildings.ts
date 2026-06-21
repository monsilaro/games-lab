// Buildings: a typed registry of placed instances. Each production building has
// a work node (a decor tree/game/rock a step away) that its workers gather from;
// storage buildings raise global capacity; houses raise the population cap. The
// Phase-1 ghost/preview/snap/commit flow is kept, now generalised over building
// types and gated on cost (souple unlock — affordability only, no tech chains).
import * as THREE from 'three';
import {
  BUILDINGS,
  GRID,
  PALETTE,
  type BuildingDef,
  type WorkDecor,
} from './config';
import { cellToWorld, isFree, setOccupied, worldToCell, type Grid, type Cell } from './grid';
import { canAfford, spend, addCapacity, type Store } from './resources';
import type { Villager } from './village/villager';

export interface BuildingInstance {
  def: BuildingDef;
  cx: number;
  cy: number;
  world: { x: number; z: number };
  assigned: Villager[];
  mesh: THREE.Group;
  /** world point workers gather from (production only; null otherwise). */
  workSpot: { x: number; z: number } | null;
}

const GHOST_VALID = 0x2ec4b6;
const GHOST_INVALID = 0xc1121f;

function lambert(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, flatShading: true });
}

// --- Structure meshes ------------------------------------------------------
function buildStructure(def: BuildingDef): THREE.Group {
  const g = new THREE.Group();
  if (def.kind === 'storage') {
    // Crate stack.
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 1.2), lambert(def.color));
    base.position.y = 0.25;
    g.add(base);
    for (const [x, z] of [
      [-0.28, -0.28],
      [0.3, 0.0],
      [-0.05, 0.32],
    ] as const) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), lambert(PALETTE.wood));
      crate.position.set(x, 0.71, z);
      crate.rotation.y = x + z;
      g.add(crate);
    }
    return g;
  }
  // Hut-shaped (production + house): coloured walls, snow pyramid roof, door.
  const wall = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 1.1), lambert(def.color));
  wall.position.y = 0.35;
  g.add(wall);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.7, 4), lambert(PALETTE.snow));
  roof.position.y = 1.05;
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.42, 0.06), lambert(PALETTE.woodDark));
  door.position.set(0, 0.21, 0.56);
  g.add(door);
  // Houses get a warm window so they read as homes.
  if (def.kind === 'house') {
    const win = new THREE.MeshLambertMaterial({ color: PALETTE.fireHot, flatShading: true, emissive: PALETTE.fireHot });
    win.emissiveIntensity = 0.6;
    const window = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.06), win);
    window.position.set(0.28, 0.42, 0.56);
    g.add(window);
  }
  return g;
}

function buildDecor(kind: WorkDecor): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'tree') {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.6, 5), lambert(PALETTE.woodDark));
    trunk.position.y = 0.3;
    g.add(trunk);
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.0, 6), lambert(PALETTE.foliage));
    canopy.position.y = 1.0;
    g.add(canopy);
  } else if (kind === 'rock') {
    const r = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), lambert(PALETTE.stone));
    r.position.y = 0.32;
    r.scale.y = 0.7;
    g.add(r);
  } else {
    // game: a low faceted hump (hunting ground marker).
    const hump = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), lambert(PALETTE.meat));
    hump.position.y = 0.26;
    hump.scale.set(1.1, 0.55, 0.8);
    g.add(hump);
  }
  return g;
}

function buildGhost(def: BuildingDef): { group: THREE.Group; setValid: (v: boolean) => void } {
  const group = buildStructure(def);
  const mats: THREE.MeshLambertMaterial[] = [];
  group.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshLambertMaterial) {
      const m = o.material.clone();
      m.transparent = true;
      m.opacity = 0.55;
      o.material = m;
      mats.push(m);
    }
  });
  return {
    group,
    setValid(v: boolean) {
      const c = v ? GHOST_VALID : GHOST_INVALID;
      for (const m of mats) {
        m.color.setHex(c);
        m.emissive.setHex(c);
        m.emissiveIntensity = 0.35;
      }
    },
  };
}

/** Direction a work node radiates (away from the fire at origin). */
function outwardDir(x: number, z: number): { x: number; z: number } {
  const d = Math.hypot(x, z);
  if (d < 0.001) return { x: 1, z: 0 };
  return { x: x / d, z: z / d };
}

export interface Buildings {
  group: THREE.Group;
  instances: BuildingInstance[];
  setBuildType(defId: string | null): void;
  currentDef(): BuildingDef | null;
  showPreview(grid: Grid, cell: Cell, store: Store): boolean;
  hidePreview(): void;
  /** Commit at a cell (cost-checked); returns the new instance or null. */
  place(grid: Grid, cell: Cell, store: Store): BuildingInstance | null;
  buildingAt(grid: Grid, cell: Cell): BuildingInstance | null;
  /** Nearest dropoff (a storage building, else the fire at origin). */
  nearestDropoff(x: number, z: number): { x: number; z: number };
  houseCapacity(): number;
}

export function createBuildings(scene: THREE.Scene): Buildings {
  const group = new THREE.Group();
  scene.add(group);
  const placed = new THREE.Group();
  group.add(placed);

  const instances: BuildingInstance[] = [];
  let curDef: BuildingDef | null = null;
  let ghost: { group: THREE.Group; setValid: (v: boolean) => void } | null = null;

  function clearGhost(): void {
    if (ghost) {
      group.remove(ghost.group);
      ghost = null;
    }
  }

  function setBuildType(defId: string | null): void {
    clearGhost();
    curDef = defId ? BUILDINGS[defId] ?? null : null;
    if (curDef) {
      ghost = buildGhost(curDef);
      ghost.group.visible = false;
      group.add(ghost.group);
    }
  }

  function placeable(grid: Grid, cell: Cell, store: Store): boolean {
    return curDef !== null && isFree(grid, cell.cx, cell.cy) && canAfford(store, curDef.cost);
  }

  return {
    group,
    instances,
    setBuildType,
    currentDef: () => curDef,
    showPreview(grid, cell, store) {
      if (!ghost || !curDef) return false;
      const ok = placeable(grid, cell, store);
      const w = cellToWorld(grid, cell.cx, cell.cy);
      ghost.group.position.set(w.x, 0, w.z);
      ghost.setValid(ok);
      ghost.group.visible = true;
      return ok;
    },
    hidePreview() {
      if (ghost) ghost.group.visible = false;
    },
    place(grid, cell, store) {
      if (!curDef || !placeable(grid, cell, store)) return null;
      const def = curDef;
      if (!spend(store, def.cost)) return null;

      const world = cellToWorld(grid, cell.cx, cell.cy);
      const mesh = buildStructure(def);
      mesh.position.set(world.x, 0, world.z);
      placed.add(mesh);
      setOccupied(grid, cell.cx, cell.cy, true);

      let workSpot: { x: number; z: number } | null = null;
      if (def.kind === 'production' && def.workSpotOffset) {
        const dir = outwardDir(world.x, world.z);
        const off = def.workSpotOffset * GRID.cell;
        workSpot = { x: world.x + dir.x * off, z: world.z + dir.z * off };
        const decor = buildDecor(def.workDecor ?? 'tree');
        decor.position.set(workSpot.x, 0, workSpot.z);
        placed.add(decor);
        // Mark the work cell occupied if it lands on a real cell (avoid builds there).
        const wc = worldToCell(grid, workSpot.x, workSpot.z);
        if (isFree(grid, wc.cx, wc.cy)) setOccupied(grid, wc.cx, wc.cy, true);
      }
      if (def.kind === 'storage' && def.storageCap) addCapacity(store, def.storageCap);

      const inst: BuildingInstance = { def, cx: cell.cx, cy: cell.cy, world, assigned: [], mesh, workSpot };
      instances.push(inst);
      return inst;
    },
    buildingAt(_grid, cell) {
      for (const b of instances) {
        if (b.cx === cell.cx && b.cy === cell.cy) return b;
      }
      return null;
    },
    nearestDropoff(x, z) {
      let best = { x: 0, z: 0 }; // the fire is always a valid dropoff
      let bestD = x * x + z * z;
      for (const b of instances) {
        if (b.def.kind !== 'storage') continue;
        const dx = b.world.x - x;
        const dz = b.world.z - z;
        const d = dx * dx + dz * dz;
        if (d < bestD) {
          bestD = d;
          best = b.world;
        }
      }
      return best;
    },
    houseCapacity() {
      let cap = 0;
      for (const b of instances) cap += b.def.houseCapacity ?? 0;
      return cap;
    },
  };
}
