import * as THREE from 'three';
import { AURORA } from '@games-lab/shared';

// ---------------------------------------------------------------------------
// Visual / scene tuning — single source of truth for the LOOK (palette, light
// rig, camera framing, gabarits, board layout). Game-rules data lives in the
// sibling config files (units / levels / rules); all re-exported via index.ts.
// ---------------------------------------------------------------------------

// The shared aurora night palette + a few warm Veillée-specific tones.
export const PALETTE = {
  ...AURORA,
  wood: 0x8b5a2b, // warm board / hafts / canoe
  woodDark: 0x5e3b1c, // shadowed wood
  lantern: AURORA.ember, // warm lantern glow
} as const;

export type Build = 'sm' | 'md' | 'lg' | 'float';

// Per-gabarit proportions. `baseY` lifts floaters off the ground; `hover` is
// the idle vertical drift amplitude (0 = grounded).
export const GABARITS: Record<Build, { scale: number; baseY: number; hover: number }> = {
  sm: { scale: 0.78, baseY: 0, hover: 0 },
  md: { scale: 1.0, baseY: 0, hover: 0 },
  lg: { scale: 1.3, baseY: 0, hover: 0 },
  float: { scale: 0.95, baseY: 0.7, hover: 0.12 },
};

// A camera framing: where the tilted ortho camera sits + how far it clips.
export interface Framing {
  worldHeight: number;
  cameraPos: THREE.Vector3;
  cameraLookAt: THREE.Vector3;
  cameraFar: number;
}

// Forge gallery framing (Phase 1).
export const SCENE: Framing = {
  worldHeight: 16,
  cameraPos: new THREE.Vector3(0, 9, 14),
  cameraLookAt: new THREE.Vector3(0, 0.6, -0.5),
  cameraFar: 80,
};

// Battle board framing (Phase 2). worldHeight is tuned near the width-fit floor so
// the board fills the phone (4 cols ≈ 6.8 world units wide → worldHeight·aspect must
// cover it); lookAt is pushed toward the player so the board sits high and the bench
// clears the shop bar at the bottom.
export const BOARD_VIEW: Framing = {
  worldHeight: 15,
  cameraPos: new THREE.Vector3(0, 11, 15.5),
  cameraLookAt: new THREE.Vector3(0, 0, 1.4),
  cameraFar: 90,
};

// The real game light rig: cold moon (directional) + faint blue fill (ambient)
// + warm low lantern (point). Chaud/froid contrast is what gives the faceted depth.
export const LIGHTS = {
  moon: { color: 0xbcd2ff, intensity: 1.15, position: new THREE.Vector3(-7, 13, 5) },
  ambient: { color: 0x2b3a63, intensity: 0.6 },
  lantern: {
    color: PALETTE.lantern,
    intensity: 8,
    distance: 26,
    decay: 1.5,
    position: new THREE.Vector3(3, 1.6, 6),
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

// Battle board geometry. Player 4x4 sits near the camera (+z), enemy 4x4 far
// (-z), with a gap "front line" between; a bench row sits in front of the player.
export const BOARD = {
  cols: 4,
  rows: 4,
  cell: 1.35, // world units per cell (x and z)
  halfGap: 0.85, // half the no-man's-land between the two front lines
  benchGap: 1.0, // extra z between the player's back row and the bench (separation)
  unitScale: 0.62, // shrink heroes vs the forge so 8 rows don't crowd
  hpBarHeight: 2.0, // world-Y of the HP bar above a unit
  hpBarWidth: 0.9,
} as const;
