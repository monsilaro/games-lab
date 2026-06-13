// Player settings: mute, screen shake, slow-mo, grain, and the arcade theme.
// Persisted to localStorage (fail-soft like the leaderboard player-name).

import type { ThemeName } from './config';

export interface Settings {
  muted: boolean;
  shake: boolean;
  slowmo: boolean;
  grain: boolean;
  arcadeTheme: 'cycle' | ThemeName; // 'cycle' = day→sunset→night per level
}

const KEY = 'slingshot.settings.v1';
const DEFAULTS: Settings = { muted: false, shake: true, slowmo: true, grain: true, arcadeTheme: 'cycle' };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

let state: Settings = load();

export function get(): Readonly<Settings> {
  return state;
}

export function set<K extends keyof Settings>(key: K, value: Settings[K]): void {
  state = { ...state, [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private mode — keep the in-memory value, just don't persist */
  }
}
