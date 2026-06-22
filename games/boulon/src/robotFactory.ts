// Parametric voxel-robot builder. Phase 1 ships two silhouettes (hero + a
// training dummy) assembled from cubes. Deliberately the seed of the richer
// Phase 5 factory (mirrors Veillée's Hero Forge idea): add part kinds here and
// drive them from data. Lit Lambert + flatShading so facets read as cute toy
// plastic — documented exception to the repo's MeshBasicMaterial default.

import * as THREE from 'three';

// Geometry is shared across every robot — dozens of cubes reuse one box.
const UNIT = new THREE.BoxGeometry(1, 1, 1);

export interface RobotConfig {
  body: number; // primary colour
  bodyDark: number; // legs / shading colour
  accent: number; // antenna / trim
  eye: number;
  scale?: number; // overall multiplier (1 = ~1.8 units tall)
}

export interface BuiltRobot {
  group: THREE.Group;
  /** Every Lambert material in the robot — cached for Phase 2 hit-flashes. */
  materials: THREE.MeshLambertMaterial[];
}

function mat(color: number, store: THREE.MeshLambertMaterial[]): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ color, flatShading: true });
  store.push(m);
  return m;
}

function cube(
  w: number, h: number, d: number,
  x: number, y: number, z: number,
  material: THREE.MeshLambertMaterial,
): THREE.Mesh {
  const mesh = new THREE.Mesh(UNIT, material);
  mesh.scale.set(w, h, d);
  mesh.position.set(x, y, z);
  return mesh;
}

/**
 * Assemble a cube-robot standing on the floor (base at y = 0). It faces +Z by
 * default; the owner rotates `group.rotation.y` to aim it. Returns the group
 * plus its materials.
 */
export function buildRobot(cfg: RobotConfig): BuiltRobot {
  const materials: THREE.MeshLambertMaterial[] = [];
  const g = new THREE.Group();

  const bodyMat = mat(cfg.body, materials);
  const darkMat = mat(cfg.bodyDark, materials);
  const accentMat = mat(cfg.accent, materials);
  const eyeMat = mat(cfg.eye, materials);

  // Feet / tracks
  g.add(cube(0.5, 0.4, 0.7, -0.45, 0.2, 0, darkMat));
  g.add(cube(0.5, 0.4, 0.7, 0.45, 0.2, 0, darkMat));

  // Torso
  g.add(cube(1.3, 1.0, 0.95, 0, 0.95, 0, bodyMat));

  // Shoulders / arms
  g.add(cube(0.35, 0.7, 0.35, -0.82, 1.0, 0, darkMat));
  g.add(cube(0.35, 0.7, 0.35, 0.82, 1.0, 0, darkMat));

  // Head
  g.add(cube(0.95, 0.8, 0.85, 0, 1.85, 0, bodyMat));

  // Eyes (face +Z)
  g.add(cube(0.22, 0.26, 0.12, -0.24, 1.92, 0.46, eyeMat));
  g.add(cube(0.22, 0.26, 0.12, 0.24, 1.92, 0.46, eyeMat));

  // Antenna
  g.add(cube(0.1, 0.5, 0.1, 0, 2.5, 0, darkMat));
  g.add(cube(0.26, 0.26, 0.26, 0, 2.85, 0, accentMat));

  const scale = cfg.scale ?? 1;
  g.scale.setScalar(scale);

  return { group: g, materials };
}
