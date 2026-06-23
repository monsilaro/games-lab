// Run upgrades collected from room pickups. A flat, stacking RunStats the player
// + weapon read each frame — the seed of a later skill tree (serialise this).

import { UPGRADE, PLAYER, WEAPON } from './config';

export type UpgradeKind = 'FIRE_RATE' | 'SPEED' | 'DAMAGE' | 'MAX_HP' | 'MULTISHOT';

export interface RunStats {
  fireInterval: number;
  maxSpeed: number;
  damage: number;
  maxHp: number;
  multishot: number;
}

export function freshStats(): RunStats {
  return {
    fireInterval: WEAPON.fireInterval,
    maxSpeed: PLAYER.maxSpeed,
    damage: WEAPON.damage,
    maxHp: PLAYER.hp,
    multishot: 1,
  };
}

const META: Record<UpgradeKind, { icon: string; label: string }> = {
  FIRE_RATE: { icon: '⚡', label: 'Cadence' },
  SPEED: { icon: '💨', label: 'Vitesse' },
  DAMAGE: { icon: '💥', label: 'Dégâts' },
  MAX_HP: { icon: '❤️', label: 'PV max' },
  MULTISHOT: { icon: '✳️', label: 'Multishot' },
};

// Easy pickups give safe stat bumps; hard pickups the punchy offensive ones.
export const EASY_POOL: UpgradeKind[] = ['FIRE_RATE', 'SPEED', 'MAX_HP'];
export const HARD_POOL: UpgradeKind[] = ['DAMAGE', 'MULTISHOT', 'FIRE_RATE'];

export function icon(kind: UpgradeKind): string {
  return META[kind].icon;
}
export function label(kind: UpgradeKind): string {
  return META[kind].label;
}

/** Apply one upgrade in place. Returns HP added (so the caller can heal). */
export function applyUpgrade(stats: RunStats, kind: UpgradeKind): number {
  switch (kind) {
    case 'FIRE_RATE':
      stats.fireInterval *= UPGRADE.fireRateMul;
      return 0;
    case 'SPEED':
      stats.maxSpeed *= UPGRADE.speedMul;
      return 0;
    case 'DAMAGE':
      stats.damage += UPGRADE.damageAdd;
      return 0;
    case 'MAX_HP':
      stats.maxHp += UPGRADE.hpAdd;
      return UPGRADE.hpAdd;
    case 'MULTISHOT':
      stats.multishot += UPGRADE.multishotAdd;
      return 0;
  }
}
