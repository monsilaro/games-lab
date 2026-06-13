import {
  TRAITS,
  ORIGINS,
  ROLES,
  IDENTITY_MOD,
  type Origin,
  type Role,
  type SynergyMod,
  type TraitDef,
} from '../config';
import { HERO_BY_ID } from '../forge/heroes';

export interface SynergyRow {
  id: Origin | Role;
  kind: 'origin' | 'role';
  label: string;
  icon: string;
  count: number;
  tier: number; // 0 = inactive, else the active threshold (2 or 4)
  desc: string; // active tier's bonus text (empty if inactive)
}

/** Highest tier whose count threshold the board meets (tiers ascending). */
function activeTier(def: TraitDef, count: number): { tier: number; desc: string; mod: Partial<SynergyMod> } {
  let best = { tier: 0, desc: '', mod: {} as Partial<SynergyMod> };
  for (const t of def.tiers) {
    if (count >= t.count) best = { tier: t.count, desc: t.desc, mod: t.mod };
  }
  return best;
}

/** Count fielded units per trait and resolve the active tier of each present trait. */
export function activeSynergies(heroIds: string[]): SynergyRow[] {
  const counts = new Map<Origin | Role, number>();
  for (const id of heroIds) {
    const cfg = HERO_BY_ID.get(id);
    if (!cfg) continue;
    counts.set(cfg.origin, (counts.get(cfg.origin) ?? 0) + 1);
    counts.set(cfg.role, (counts.get(cfg.role) ?? 0) + 1);
  }
  const order: (Origin | Role)[] = [...ORIGINS, ...ROLES];
  const rows: SynergyRow[] = [];
  for (const id of order) {
    const count = counts.get(id) ?? 0;
    if (count === 0) continue;
    const def = TRAITS[id];
    const at = activeTier(def, count);
    rows.push({ id, kind: def.kind, label: def.label, icon: def.icon, count, tier: at.tier, desc: at.desc });
  }
  return rows;
}

/** The combined mod for one unit, from its origin + role active tiers. */
export function modifierFor(heroId: string, rows: SynergyRow[]): SynergyMod {
  const cfg = HERO_BY_ID.get(heroId);
  if (!cfg) return IDENTITY_MOD;
  const mod: SynergyMod = { ...IDENTITY_MOD };
  for (const row of rows) {
    if (row.tier === 0) continue;
    if (row.id !== cfg.origin && row.id !== cfg.role) continue;
    const def = TRAITS[row.id];
    const tier = def.tiers.find((t) => t.count === row.tier);
    if (!tier) continue;
    const m = tier.mod;
    if (m.hpMul !== undefined) mod.hpMul *= m.hpMul;
    if (m.atkMul !== undefined) mod.atkMul *= m.atkMul;
    if (m.atkSpeedMul !== undefined) mod.atkSpeedMul *= m.atkSpeedMul;
    if (m.rangeAdd !== undefined) mod.rangeAdd += m.rangeAdd;
    if (m.abilityPowerMul !== undefined) mod.abilityPowerMul *= m.abilityPowerMul;
    if (m.manaGainMul !== undefined) mod.manaGainMul *= m.manaGainMul;
  }
  return mod;
}
