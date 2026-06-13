import * as THREE from 'three';
import { PALETTE, BOARD, ECONOMY } from '../config';
import type { Team } from '../combat/types';

export type Slot = { kind: 'cell'; col: number; row: number } | { kind: 'bench'; i: number };

export interface Board {
  group: THREE.Group;
  plane: THREE.Plane; // y=0, for drag raycasts
  cellToWorld(side: Team, col: number, row: number): { x: number; z: number };
  benchToWorld(i: number): { x: number; z: number };
  slotToWorld(slot: Slot): { x: number; z: number };
  /** Snap a board-plane point to the nearest player cell or bench slot (null on the enemy side). */
  nearestSlot(p: { x: number; z: number }): Slot | null;
  setPlacementVisible(v: boolean): void;
  /** Brighten the placement cells while a unit is selected/dragged. */
  setPlacementActive(v: boolean): void;
  /** Glow the suggested rows for the selected unit (front rows, back rows, or none). */
  setSuggestion(kind: 'front' | 'back' | null): void;
}

const { cols, rows, cell, halfGap, benchGap } = BOARD;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

const colX = (col: number): number => (col - (cols - 1) / 2) * cell;
const playerZ = (row: number): number => halfGap + (row + 0.5) * cell; // row 0 = front line
const enemyZ = (row: number): number => -(halfGap + (row + 0.5) * cell);
const benchZ = halfGap + rows * cell + benchGap;

export function buildBoard(scene: THREE.Scene): Board {
  const group = new THREE.Group();
  scene.add(group);

  // Floating wood slab + snow top spanning both grids and the bench.
  const minZ = enemyZ(rows - 1) - cell * 0.8;
  const maxZ = benchZ + cell * 0.7;
  const midZ = (minZ + maxZ) / 2;
  const w = cols * cell + cell;
  const d = maxZ - minZ;

  const wood = new THREE.Mesh(
    new THREE.BoxGeometry(w, 0.5, d),
    new THREE.MeshLambertMaterial({ color: PALETTE.wood, flatShading: true }),
  );
  wood.position.set(0, -0.3, midZ);
  group.add(wood);

  const snow = new THREE.Mesh(
    new THREE.BoxGeometry(w - 0.2, 0.12, d - 0.2),
    new THREE.MeshLambertMaterial({ color: PALETTE.snow, flatShading: true }),
  );
  snow.position.set(0, -0.04, midZ);
  group.add(snow);

  // A faint front-line seam at the gap.
  const seam = new THREE.Mesh(
    new THREE.PlaneGeometry(w - 0.4, 0.06),
    new THREE.MeshBasicMaterial({ color: PALETTE.iceCyan, transparent: true, opacity: 0.25 }),
  );
  seam.rotation.x = -Math.PI / 2;
  seam.position.set(0, 0.05, 0);
  group.add(seam);

  // Separate the bench from the battlefield: a raised wood rail between them,
  // and a darker wood "shelf" the bench sits on, so the two zones read distinctly.
  const railZ = (playerZ(rows - 1) + benchZ) / 2;
  const rail = new THREE.Mesh(
    new THREE.BoxGeometry(cols * cell + cell, 0.18, 0.12),
    new THREE.MeshLambertMaterial({ color: PALETTE.woodDark, flatShading: true }),
  );
  rail.position.set(0, 0.09, railZ);
  group.add(rail);

  const shelf = new THREE.Mesh(
    new THREE.BoxGeometry(cols * cell + cell * 0.6, 0.08, cell + 0.5),
    new THREE.MeshLambertMaterial({ color: PALETTE.woodDark, flatShading: true }),
  );
  shelf.position.set(0, 0.0, benchZ);
  group.add(shelf);

  // Placement markers (player cells + bench), hidden during combat.
  const placement = new THREE.Group();
  group.add(placement);
  const cellGeo = new THREE.PlaneGeometry(cell * 0.86, cell * 0.86);
  const cellMat = new THREE.MeshBasicMaterial({ color: PALETTE.iceCyan, transparent: true, opacity: 0.08 });
  // Warm glow for the rows suggested for the selected unit.
  const suggestMat = new THREE.MeshBasicMaterial({ color: PALETTE.ember, transparent: true, opacity: 0.2 });
  const cellFills: THREE.Mesh[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const m = new THREE.Mesh(cellGeo, cellMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(colX(c), 0.06, playerZ(r)); // clearly above the snow top (y≈0.02) to avoid z-fighting
      m.userData.row = r;
      cellFills.push(m);
      placement.add(m);
      // crisp outline so the grid reads even when faint
      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(cellGeo),
        new THREE.LineBasicMaterial({ color: PALETTE.iceCyan, transparent: true, opacity: 0.35 }),
      );
      edge.rotation.x = -Math.PI / 2;
      edge.position.set(colX(c), 0.065, playerZ(r));
      placement.add(edge);
    }
  }
  const benchMat = new THREE.MeshBasicMaterial({ color: PALETTE.ember, transparent: true, opacity: 0.12 });
  for (let i = 0; i < ECONOMY.benchSize; i++) {
    const m = new THREE.Mesh(cellGeo, benchMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(colX(i), 0.06, benchZ);
    placement.add(m);
  }

  const cellToWorld = (side: Team, col: number, row: number): { x: number; z: number } => ({
    x: colX(col),
    z: side === 'player' ? playerZ(row) : enemyZ(row),
  });
  const benchToWorld = (i: number): { x: number; z: number } => ({ x: colX(i), z: benchZ });
  const slotToWorld = (slot: Slot): { x: number; z: number } =>
    slot.kind === 'cell' ? cellToWorld('player', slot.col, slot.row) : benchToWorld(slot.i);

  const nearestSlot = (p: { x: number; z: number }): Slot | null => {
    if (p.z <= 0) return null; // enemy half / no-man's-land
    const col = clamp(Math.round(p.x / cell + (cols - 1) / 2), 0, cols - 1);
    const row = clamp(Math.round((p.z - halfGap) / cell - 0.5), 0, rows - 1);
    const cc = cellToWorld('player', col, row);
    const cellD = Math.hypot(p.x - cc.x, p.z - cc.z);
    const bi = clamp(Math.round(p.x / cell + (cols - 1) / 2), 0, ECONOMY.benchSize - 1);
    const bc = benchToWorld(bi);
    const benchD = Math.hypot(p.x - bc.x, p.z - bc.z);
    return cellD <= benchD ? { kind: 'cell', col, row } : { kind: 'bench', i: bi };
  };

  return {
    group,
    plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    cellToWorld,
    benchToWorld,
    slotToWorld,
    nearestSlot,
    setPlacementVisible: (v: boolean) => {
      placement.visible = v;
    },
    setPlacementActive: (v: boolean) => {
      cellMat.opacity = v ? 0.26 : 0.08;
      benchMat.opacity = v ? 0.28 : 0.12;
      suggestMat.opacity = v ? 0.42 : 0.2;
    },
    setSuggestion: (kind: 'front' | 'back' | null) => {
      for (const m of cellFills) {
        const front = (m.userData.row as number) <= 1;
        const want = kind === 'front' ? front : kind === 'back' ? !front : false;
        m.material = want ? suggestMat : cellMat;
      }
    },
  };
}
