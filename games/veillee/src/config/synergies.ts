// ---------------------------------------------------------------------------
// Trait synergies (data only — no imports from heroes, to keep the config
// barrel acyclic). Two axes, thresholds at 2 and 4 fielded units carrying the
// trait. A tier's bonus applies ONLY to the player's units that have that trait.
// The compute/lookup logic lives in src/game/synergy.ts.
// ---------------------------------------------------------------------------

export type Origin = 'Forêt' | 'Rivière' | 'Nuit';
export type Role = 'Cogneur' | 'Tireur' | 'Mystique';

/** Multiplier bundle a unit accumulates from its active traits. Identity = no-op. */
export interface SynergyMod {
  hpMul: number;
  atkMul: number;
  atkSpeedMul: number; // divides atkInterval
  rangeAdd: number; // cells
  abilityPowerMul: number; // scales ability damage / heal
  manaGainMul: number; // scales mana per attack (cast oftener)
}

export const IDENTITY_MOD: SynergyMod = {
  hpMul: 1,
  atkMul: 1,
  atkSpeedMul: 1,
  rangeAdd: 0,
  abilityPowerMul: 1,
  manaGainMul: 1,
};

export interface TraitTier {
  count: number; // units needed
  mod: Partial<SynergyMod>;
  desc: string; // shown in the panel
}

export interface TraitDef {
  id: Origin | Role;
  kind: 'origin' | 'role';
  label: string;
  tiers: TraitTier[]; // ascending by count
}

export const ORIGINS: Origin[] = ['Forêt', 'Rivière', 'Nuit'];
export const ROLES: Role[] = ['Cogneur', 'Tireur', 'Mystique'];

export const TRAITS: Record<Origin | Role, TraitDef> = {
  // --- Origine ---
  'Forêt': {
    id: 'Forêt',
    kind: 'origin',
    label: '🌲 Forêt',
    tiers: [
      { count: 2, mod: { hpMul: 1.15 }, desc: '+15% PV' },
      { count: 4, mod: { hpMul: 1.35 }, desc: '+35% PV' },
    ],
  },
  'Rivière': {
    id: 'Rivière',
    kind: 'origin',
    label: '🌊 Rivière',
    tiers: [
      { count: 2, mod: { atkSpeedMul: 1.15 }, desc: '+15% vitesse d’attaque' },
      { count: 4, mod: { atkSpeedMul: 1.35 }, desc: '+35% vitesse d’attaque' },
    ],
  },
  'Nuit': {
    id: 'Nuit',
    kind: 'origin',
    label: '🌙 Nuit',
    tiers: [
      { count: 2, mod: { abilityPowerMul: 1.25 }, desc: '+25% puissance de capacité' },
      { count: 4, mod: { abilityPowerMul: 1.6 }, desc: '+60% puissance de capacité' },
    ],
  },
  // --- Rôle ---
  'Cogneur': {
    id: 'Cogneur',
    kind: 'role',
    label: '⚔️ Cogneur',
    tiers: [
      { count: 2, mod: { atkMul: 1.15 }, desc: '+15% attaque' },
      { count: 4, mod: { atkMul: 1.4 }, desc: '+40% attaque' },
    ],
  },
  'Tireur': {
    id: 'Tireur',
    kind: 'role',
    label: '🏹 Tireur',
    tiers: [
      { count: 2, mod: { rangeAdd: 0.5 }, desc: '+0.5 portée' },
      { count: 4, mod: { rangeAdd: 1.2 }, desc: '+1.2 portée' },
    ],
  },
  'Mystique': {
    id: 'Mystique',
    kind: 'role',
    label: '✨ Mystique',
    tiers: [
      { count: 2, mod: { manaGainMul: 1.3 }, desc: '+30% gain de mana' },
      { count: 4, mod: { manaGainMul: 1.7 }, desc: '+70% gain de mana' },
    ],
  },
};
