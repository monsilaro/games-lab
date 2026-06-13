// ---------------------------------------------------------------------------
// Combat stats per hero id (must match the ids in src/forge/heroes.ts).
// These are ROUGH first-pass values — the real balance pass is Phase 3.
// `range`/`moveSpeed` are in cells; the engine multiplies by BOARD.cell.
// ---------------------------------------------------------------------------

export type AbilityKind = 'strike' | 'volley' | 'hex' | 'ward';

/** Short player-facing copy per ability, for the stats preview. */
export const ABILITY_INFO: Record<AbilityKind, { label: string; desc: string }> = {
  strike: { label: 'Frappe', desc: 'Gros coup sur la cible' },
  volley: { label: 'Salve', desc: 'Touche plusieurs ennemis' },
  hex: { label: 'Maléfice', desc: 'Dégâts + ralentit la cible' },
  ward: { label: 'Bénédiction', desc: 'Soigne l’allié le plus faible' },
};

export interface Ability {
  kind: AbilityKind;
  /** Multiplier on the caster's atk (strike/volley/hex) or fraction of maxHp (ward). */
  power: number;
  /** volley: how many nearest enemies are hit. */
  targets?: number;
  /** hex: movement-speed multiplier applied to the target while slowed. */
  slow?: number;
  /** hex: slow duration in seconds. */
  slowDur?: number;
}

export interface UnitStats {
  cost: 1 | 2 | 3;
  hp: number;
  atk: number;
  atkInterval: number; // seconds between attacks
  range: number; // cells (1 = melee)
  moveSpeed: number; // cells per second
  manaMax: number;
  manaPerAttack: number;
  ability: Ability;
}

// Per-star multiplier on hp/atk (★1 = base, ★2 = ×1.8, ★3 = ×3.24).
export const STAR_SCALE = 1.8;

export const UNITS: Record<string, UnitStats> = {
  'loup-garou': {
    cost: 3,
    hp: 720,
    atk: 62,
    atkInterval: 0.95,
    range: 1,
    moveSpeed: 2.3,
    manaMax: 100,
    manaPerAttack: 28,
    ability: { kind: 'strike', power: 2.4 },
  },
  'bonhomme-sept-heures': {
    cost: 2,
    hp: 560,
    atk: 40,
    atkInterval: 1.15,
    range: 1.4,
    moveSpeed: 1.9,
    manaMax: 90,
    manaPerAttack: 26,
    ability: { kind: 'hex', power: 1.7, slow: 0.45, slowDur: 2.2 },
  },
  'feu-follet': {
    cost: 1,
    hp: 360,
    atk: 34,
    atkInterval: 1.1,
    range: 2.8,
    moveSpeed: 2.0,
    manaMax: 80,
    manaPerAttack: 24,
    ability: { kind: 'hex', power: 1.9, slow: 0.5, slowDur: 1.8 },
  },
  'la-corriveau': {
    cost: 3,
    hp: 520,
    atk: 46,
    atkInterval: 1.2,
    range: 2.6,
    moveSpeed: 1.7,
    manaMax: 110,
    manaPerAttack: 25,
    ability: { kind: 'hex', power: 2.3, slow: 0.4, slowDur: 2.5 },
  },
  'chasse-galerie': {
    cost: 2,
    hp: 540,
    atk: 36,
    atkInterval: 1.1,
    range: 1.5,
    moveSpeed: 2.6,
    manaMax: 100,
    manaPerAttack: 24,
    ability: { kind: 'ward', power: 0.32 },
  },
  draveur: {
    cost: 2,
    hp: 640,
    atk: 48,
    atkInterval: 1.0,
    range: 1.6,
    moveSpeed: 2.1,
    manaMax: 90,
    manaPerAttack: 27,
    ability: { kind: 'strike', power: 2.1 },
  },
  bucheron: {
    cost: 3,
    hp: 780,
    atk: 66,
    atkInterval: 1.05,
    range: 1,
    moveSpeed: 2.0,
    manaMax: 100,
    manaPerAttack: 26,
    ability: { kind: 'strike', power: 2.6 },
  },
  'coureur-des-bois': {
    cost: 2,
    hp: 440,
    atk: 44,
    atkInterval: 1.15,
    range: 3.0,
    moveSpeed: 2.0,
    manaMax: 90,
    manaPerAttack: 25,
    ability: { kind: 'volley', power: 1.2, targets: 3 },
  },
  carcajou: {
    cost: 1,
    hp: 420,
    atk: 38,
    atkInterval: 0.8,
    range: 1,
    moveSpeed: 2.7,
    manaMax: 80,
    manaPerAttack: 24,
    ability: { kind: 'strike', power: 1.9 },
  },
  windigo: {
    cost: 3,
    hp: 900,
    atk: 54,
    atkInterval: 1.1,
    range: 1,
    moveSpeed: 1.9,
    manaMax: 120,
    manaPerAttack: 24,
    ability: { kind: 'strike', power: 2.2 },
  },
  'dame-blanche': {
    cost: 2,
    hp: 460,
    atk: 30,
    atkInterval: 1.2,
    range: 2.8,
    moveSpeed: 2.0,
    manaMax: 100,
    manaPerAttack: 26,
    ability: { kind: 'ward', power: 0.4 },
  },
  lutin: {
    cost: 1,
    hp: 340,
    atk: 36,
    atkInterval: 1.0,
    range: 2.4,
    moveSpeed: 2.3,
    manaMax: 80,
    manaPerAttack: 25,
    ability: { kind: 'volley', power: 1.0, targets: 2 },
  },
};
