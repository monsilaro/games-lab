import { UPGRADE_VALUES as V, type PlayerStats } from './config';

export interface Upgrade {
  icon: string;
  title: string;
  desc: string;
  apply: (stats: PlayerStats) => void;
}

const pct = (mult: number): string => `${Math.round(Math.abs(mult - 1) * 100)}%`;

export const UPGRADE_POOL: Upgrade[] = [
  {
    icon: '💥',
    title: 'Power',
    desc: `+${pct(V.damageMult)} projectile damage`,
    apply: (s) => { s.damage *= V.damageMult; },
  },
  {
    icon: '⚡️',
    title: 'Frenzy',
    desc: `${pct(V.fireIntervalMult)} faster attacks`,
    apply: (s) => { s.fireInterval *= V.fireIntervalMult; },
  },
  {
    icon: '❄️',
    title: 'Swift',
    desc: `+${pct(V.moveSpeedMult)} move speed`,
    apply: (s) => { s.moveSpeed *= V.moveSpeedMult; },
  },
  {
    icon: '❤️',
    title: 'Vitality',
    desc: `+${V.maxHpBonus} max HP, heal ${V.healAmount}`,
    apply: (s) => {
      s.maxHp += V.maxHpBonus;
      s.hp = Math.min(s.maxHp, s.hp + V.healAmount);
    },
  },
  {
    icon: '🧲',
    title: 'Magnet',
    desc: `+${pct(V.magnetMult)} pickup radius`,
    apply: (s) => { s.magnetRadius *= V.magnetMult; },
  },
];

/** Fisher–Yates shuffle of the pool, then take the first `count` cards. */
export function rollUpgrades(count = 3): Upgrade[] {
  const pool = [...UPGRADE_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
  }
  return pool.slice(0, count);
}
