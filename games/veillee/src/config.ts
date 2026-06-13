import * as THREE from 'three';
import { AURORA } from '@games-lab/shared';

// ---------------------------------------------------------------------------
// Veillée tuning — single source of truth. No magic numbers live in the logic;
// they all live here (scene / lighting / gabarits / forge layout). Hero *content*
// (which parts + colors compose each hero) lives in src/forge/heroes.ts.
// ---------------------------------------------------------------------------

// The shared aurora night palette + a few warm Veillée-specific tones.
export const PALETTE = {
  ...AURORA,
  wood: 0x8b5a2b, // warm board / hafts / canoe
  woodDark: 0x5e3b1c, // shadowed wood
  lantern: AURORA.ember, // warm lantern glow
} as const;

export type Build = 'sm' | 'md' | 'lg' | 'float';

// Per-gabarit proportions. `baseY` lifts floaters off the pedestal; `hover` is
// the idle vertical drift amplitude (0 = grounded).
export const GABARITS: Record<Build, { scale: number; baseY: number; hover: number }> = {
  sm: { scale: 0.78, baseY: 0, hover: 0 },
  md: { scale: 1.0, baseY: 0, hover: 0 },
  lg: { scale: 1.3, baseY: 0, hover: 0 },
  float: { scale: 0.95, baseY: 0.7, hover: 0.12 },
};

// Diorama camera + clip. We reuse the shared ortho camera and tilt it ~30° here;
// `cameraFar` overrides the shared default (30) because the tilted diorama is deeper.
export const SCENE = {
  worldHeight: 16,
  cameraPos: new THREE.Vector3(0, 9, 14),
  cameraLookAt: new THREE.Vector3(0, 0.6, -0.5),
  cameraFar: 80,
} as const;

// The real game light rig: cold moon (directional) + faint blue fill (ambient)
// + warm low lantern (point). Chaud/froid contrast is what gives the faceted depth.
export const LIGHTS = {
  moon: { color: 0xbcd2ff, intensity: 1.15, position: new THREE.Vector3(-7, 13, 5) },
  ambient: { color: 0x2b3a63, intensity: 0.55 },
  lantern: {
    color: PALETTE.lantern,
    intensity: 7,
    distance: 22,
    decay: 1.6,
    position: new THREE.Vector3(3, 1.4, 5),
  },
} as const;

// Forge gallery layout (cols * rows must cover the roster).
export const FORGE = {
  cols: 3,
  rows: 4,
  spacingX: 2.7,
  spacingZ: 3.4,
  pedestalRadius: 0.72,
  pedestalHeight: 0.25,
  boardInsetX: 1.4,
  boardInsetZ: 1.3,
  boardThickness: 0.5,
  turntableSpeed: 0.45, // rad/s, slow self-rotation
  idleBobAmp: 0.04,
  idleBobFreq: 1.5,
  hoverFreq: 1.0,
  labelHeight: 2.1, // world-Y of the name label anchor above each pedestal
  pickHeight: 0.9, // world-Y used as the tap target for each hero
  pickRadiusPx: 64, // tap tolerance in screen px
} as const;
