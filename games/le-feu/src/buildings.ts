// Placeable structures. Phase 1 ships a single test hut so the finger-placement
// interaction (ghost preview → snap to cell → commit on a free cell) can be
// validated; the real production buildings arrive in Phase 2. The central fire
// is NOT a building here — it's pre-placed and immovable (see fire.ts).
import * as THREE from 'three';
import { PALETTE } from './config';
import { cellToWorld, isFree, setOccupied, type Grid, type Cell } from './grid';

const HUT_VALID = 0x2ec4b6; // aurora green
const HUT_INVALID = 0xc1121f; // refusal red

function buildHut(): THREE.Group {
  const g = new THREE.Group();
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.7, 1.1),
    new THREE.MeshLambertMaterial({ color: PALETTE.wood, flatShading: true }),
  );
  wall.position.y = 0.35;
  g.add(wall);
  // 4-sided pyramid roof, snow-capped so it reads against the night.
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(0.95, 0.7, 4),
    new THREE.MeshLambertMaterial({ color: PALETTE.snow, flatShading: true }),
  );
  roof.position.y = 1.05;
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.42, 0.06),
    new THREE.MeshLambertMaterial({ color: PALETTE.woodDark, flatShading: true }),
  );
  door.position.set(0, 0.21, 0.56);
  g.add(door);
  return g;
}

function buildGhost(): { group: THREE.Group; setValid: (v: boolean) => void } {
  const group = buildHut();
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
      const c = v ? HUT_VALID : HUT_INVALID;
      for (const m of mats) {
        m.color.setHex(c);
        m.emissive.setHex(c);
        m.emissiveIntensity = 0.35;
      }
    },
  };
}

export interface Buildings {
  group: THREE.Group;
  showPreview(grid: Grid, cell: Cell): boolean; // returns whether the cell is placeable
  hidePreview(): void;
  place(grid: Grid, cell: Cell): boolean; // commit; returns success
}

export function createBuildings(scene: THREE.Scene): Buildings {
  const group = new THREE.Group();
  scene.add(group);

  const placed = new THREE.Group();
  group.add(placed);

  const ghost = buildGhost();
  ghost.group.visible = false;
  group.add(ghost.group);

  function placeable(grid: Grid, cell: Cell): boolean {
    return isFree(grid, cell.cx, cell.cy);
  }

  return {
    group,
    showPreview(grid, cell) {
      const ok = placeable(grid, cell);
      const w = cellToWorld(grid, cell.cx, cell.cy);
      ghost.group.position.set(w.x, 0, w.z);
      ghost.setValid(ok);
      ghost.group.visible = true;
      return ok;
    },
    hidePreview() {
      ghost.group.visible = false;
    },
    place(grid, cell) {
      if (!placeable(grid, cell)) return false;
      const hut = buildHut();
      const w = cellToWorld(grid, cell.cx, cell.cy);
      hut.position.set(w.x, 0, w.z);
      placed.add(hut);
      setOccupied(grid, cell.cx, cell.cy, true);
      return true;
    },
  };
}
