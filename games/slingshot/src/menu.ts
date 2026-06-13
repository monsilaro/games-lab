// Paper-card menu overlays: home (Story / Arcade / Settings), the story
// level-select map, and the settings panel. Built in vanilla DOM and injected
// once (mirrors packages/shared/src/leaderboard.ts). All classes are prefixed
// `slingshot-menu-` so ad-blocker cosmetic filters leave them alone.

import type { Settings } from './settings';
import type { ThemeName } from './config';

let root: HTMLDivElement | null = null;
let stylesAdded = false;

const CSS = `
#slingshot-menu-root {
  position: fixed; inset: 0; z-index: 40;
  display: none; align-items: center; justify-content: center;
  padding: calc(env(safe-area-inset-top,0px) + 16px) 16px calc(env(safe-area-inset-bottom,0px) + 16px);
  background: rgba(255,244,226,0.94); overflow-y: auto;
  font-family: 'Baloo 2', -apple-system, system-ui, sans-serif; color: #5a3d22;
}
.slingshot-menu-card {
  background: #fff7ec; border: 1px solid rgba(120,80,40,0.12); border-radius: 18px;
  box-shadow: 0 6px 0 rgba(120,80,40,0.12), 0 12px 28px rgba(120,80,40,0.16);
  padding: 22px; width: min(92vw, 360px); display: flex; flex-direction: column; gap: 12px; text-align: center;
}
.slingshot-menu-card.wide { width: min(94vw, 480px); }
.slingshot-menu-title { color: #ef6f51; font-size: 40px; font-weight: 800; text-shadow: 0 3px 0 rgba(255,255,255,0.7); }
.slingshot-menu-sub { color: #b58a5e; font-size: 14px; margin-top: -8px; }
.slingshot-menu-btn, .slingshot-menu-btn2 {
  appearance: none; border: 0; cursor: pointer; font-family: inherit; font-weight: 800; font-size: 18px;
  padding: 13px 18px; border-radius: 14px; box-shadow: 0 4px 0 rgba(120,80,40,0.18);
}
.slingshot-menu-btn { color: #fff6e9; background: #1f9d8f; }
.slingshot-menu-btn:active { transform: translateY(2px); box-shadow: 0 2px 0 rgba(120,80,40,0.18); background: #15786d; }
.slingshot-menu-btn2 { color: #5a3d22; background: #ffe7c8; }
.slingshot-menu-btn2:active { transform: translateY(2px); box-shadow: 0 2px 0 rgba(120,80,40,0.18); }
.slingshot-menu-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.slingshot-menu-back { appearance: none; border: 0; background: #ffe7c8; color: #5a3d22; font: inherit; font-weight: 800;
  cursor: pointer; border-radius: 10px; padding: 6px 12px; }
.slingshot-menu-h2 { color: #ef6f51; font-size: 24px; font-weight: 800; }
.slingshot-menu-best { color: #7a5230; font-size: 15px; font-weight: 700; }
.slingshot-menu-world { text-align: left; }
.slingshot-menu-wname { color: #7a5230; font-size: 13px; font-weight: 700; margin: 6px 0 4px; text-transform: uppercase; letter-spacing: 0.05em; }
.slingshot-menu-levels { display: flex; gap: 8px; flex-wrap: wrap; }
.slingshot-menu-lvl {
  appearance: none; border: 1px solid rgba(120,80,40,0.12); cursor: pointer; font-family: inherit;
  width: 70px; height: 70px; border-radius: 14px; background: #fffaf2; color: #5a3d22;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  box-shadow: 0 3px 0 rgba(120,80,40,0.1);
}
.slingshot-menu-lvl:active { transform: translateY(2px); box-shadow: 0 1px 0 rgba(120,80,40,0.1); }
.slingshot-menu-lvl.locked { opacity: 0.4; pointer-events: none; }
.slingshot-menu-lvlnum { font-size: 18px; font-weight: 800; }
.slingshot-menu-lvlstars { font-size: 12px; color: #f4a261; letter-spacing: 1px; }
.slingshot-menu-toggle { display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 8px 4px; font-size: 16px; font-weight: 700; }
.slingshot-menu-switch { appearance: none; border: 0; cursor: pointer; font: inherit; font-weight: 800;
  border-radius: 10px; padding: 6px 16px; min-width: 64px; }
.slingshot-menu-switch.on { background: #1f9d8f; color: #fff6e9; }
.slingshot-menu-switch.off { background: #e7d8c4; color: #9a7a55; }
.slingshot-menu-themes { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }
.slingshot-menu-theme { appearance: none; border: 1px solid rgba(120,80,40,0.12); cursor: pointer; font: inherit;
  font-weight: 700; border-radius: 10px; padding: 7px 12px; background: #fffaf2; color: #5a3d22; }
.slingshot-menu-theme.active { background: #1f9d8f; color: #fff6e9; border-color: transparent; }
`;

function ensureStyles(): void {
  if (stylesAdded) return;
  const style = document.createElement('style');
  style.id = 'slingshot-menu-styles';
  style.textContent = CSS;
  document.head.appendChild(style);
  stylesAdded = true;
}

function ensureRoot(): HTMLDivElement {
  ensureStyles();
  if (!root) {
    root = document.createElement('div');
    root.id = 'slingshot-menu-root';
    // swallow taps so they don't reach the window "tap to play" handler
    root.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.body.appendChild(root);
  }
  root.style.display = 'flex';
  root.innerHTML = '';
  return root;
}

export function hide(): void {
  if (root) {
    root.style.display = 'none';
    root.innerHTML = '';
  }
}

function btn(label: string, cls: string, onTap: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = label;
  b.addEventListener('click', onTap);
  return b;
}

// --- home ------------------------------------------------------------------------
export function showHome(opts: {
  best: number;
  onStory: () => void;
  onArcade: () => void;
  onSettings: () => void;
}): void {
  const r = ensureRoot();
  const card = document.createElement('div');
  card.className = 'slingshot-menu-card';

  const title = document.createElement('div');
  title.className = 'slingshot-menu-title';
  title.textContent = 'Slingshot';
  const sub = document.createElement('div');
  sub.className = 'slingshot-menu-sub';
  sub.textContent = 'paper slingshot';

  const best = document.createElement('div');
  best.className = 'slingshot-menu-best';
  best.textContent = opts.best > 0 ? `Arcade best: ${opts.best}` : 'No arcade score yet';

  card.append(
    title,
    sub,
    btn('Story', 'slingshot-menu-btn', opts.onStory),
    btn('Arcade', 'slingshot-menu-btn2', opts.onArcade),
    btn('Settings', 'slingshot-menu-btn2', opts.onSettings),
    best,
  );
  r.appendChild(card);
}

// --- level select ----------------------------------------------------------------
export interface LevelCell {
  id: number;
  label: string;
  stars: number;
  unlocked: boolean;
}
export interface WorldRow {
  name: string;
  levels: LevelCell[];
}
export function showLevelSelect(opts: {
  worlds: WorldRow[];
  totalStars: number;
  maxStars: number;
  onPick: (id: number) => void;
  onBack: () => void;
}): void {
  const r = ensureRoot();
  const card = document.createElement('div');
  card.className = 'slingshot-menu-card wide';

  const head = document.createElement('div');
  head.className = 'slingshot-menu-head';
  head.append(btn('‹ Back', 'slingshot-menu-back', opts.onBack));
  const h2 = document.createElement('div');
  h2.className = 'slingshot-menu-h2';
  h2.textContent = 'Story';
  head.append(h2);
  const stars = document.createElement('div');
  stars.className = 'slingshot-menu-best';
  stars.textContent = `★ ${opts.totalStars}/${opts.maxStars}`;
  head.append(stars);
  card.append(head);

  for (const world of opts.worlds) {
    const wrap = document.createElement('div');
    wrap.className = 'slingshot-menu-world';
    const name = document.createElement('div');
    name.className = 'slingshot-menu-wname';
    name.textContent = world.name;
    const row = document.createElement('div');
    row.className = 'slingshot-menu-levels';
    for (const cell of world.levels) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'slingshot-menu-lvl' + (cell.unlocked ? '' : ' locked');
      const num = document.createElement('div');
      num.className = 'slingshot-menu-lvlnum';
      num.textContent = cell.unlocked ? cell.label : '🔒';
      const st = document.createElement('div');
      st.className = 'slingshot-menu-lvlstars';
      st.textContent = '★'.repeat(cell.stars) + '☆'.repeat(Math.max(0, 3 - cell.stars));
      b.append(num, st);
      if (cell.unlocked) b.addEventListener('click', () => opts.onPick(cell.id));
      row.append(b);
    }
    wrap.append(name, row);
    card.append(wrap);
  }
  r.appendChild(card);
}

// --- settings --------------------------------------------------------------------
const THEME_OPTIONS: ('cycle' | ThemeName)[] = ['cycle', 'day', 'sunset', 'night', 'meadow'];

export function showSettings(opts: {
  settings: Settings;
  onChange: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  onBack: () => void;
}): void {
  // local copy so toggles re-render immediately
  const s: Settings = { ...opts.settings };
  const render = (): void => {
    const r = ensureRoot();
    const card = document.createElement('div');
    card.className = 'slingshot-menu-card';

    const head = document.createElement('div');
    head.className = 'slingshot-menu-head';
    head.append(btn('‹ Back', 'slingshot-menu-back', opts.onBack));
    const h2 = document.createElement('div');
    h2.className = 'slingshot-menu-h2';
    h2.textContent = 'Settings';
    head.append(h2);
    const spacer = document.createElement('div');
    spacer.style.width = '54px';
    head.append(spacer);
    card.append(head);

    const toggle = (label: string, key: 'muted' | 'shake' | 'slowmo' | 'grain', invert = false): HTMLElement => {
      const row = document.createElement('div');
      row.className = 'slingshot-menu-toggle';
      const lab = document.createElement('span');
      lab.textContent = label;
      const on = invert ? !s[key] : s[key];
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'slingshot-menu-switch ' + (on ? 'on' : 'off');
      sw.textContent = on ? 'On' : 'Off';
      sw.addEventListener('click', () => {
        s[key] = !s[key];
        opts.onChange(key, s[key]);
        render();
      });
      row.append(lab, sw);
      return row;
    };

    card.append(
      toggle('Sound', 'muted', true), // shown as Sound On = not muted
      toggle('Screen shake', 'shake'),
      toggle('Slow-mo', 'slowmo'),
      toggle('Paper grain', 'grain'),
    );

    const themeLab = document.createElement('div');
    themeLab.className = 'slingshot-menu-wname';
    themeLab.style.textAlign = 'center';
    themeLab.textContent = 'Arcade theme';
    const themes = document.createElement('div');
    themes.className = 'slingshot-menu-themes';
    for (const t of THEME_OPTIONS) {
      const tb = document.createElement('button');
      tb.type = 'button';
      tb.className = 'slingshot-menu-theme' + (s.arcadeTheme === t ? ' active' : '');
      tb.textContent = t[0]!.toUpperCase() + t.slice(1);
      tb.addEventListener('click', () => {
        s.arcadeTheme = t;
        opts.onChange('arcadeTheme', t);
        render();
      });
      themes.append(tb);
    }
    card.append(themeLab, themes);
    r.appendChild(card);
  };
  render();
}
