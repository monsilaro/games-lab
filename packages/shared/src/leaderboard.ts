// Shared leaderboard client for every games-lab game.
//
// Two layers:
//  1. A tiny network client (`submitScore`, `getTopScores`) that talks to the
//     games-lab-server leaderboard service. Both fail SOFT — a down service or
//     network error resolves to `null` / `[]`, never a throw. The leaderboard is
//     optional; a game must never crash because it's unreachable.
//  2. A reusable vanilla-DOM overlay (`showLeaderboard` + `promptPlayerName`)
//     themed with the repo's AURORA palette, that any game can pop open.
//
// This lives in `packages/shared` deliberately as cross-game infrastructure
// (same as `createOrthoApp`), not via the "duplicated in 2+ games" promotion
// rule — its whole purpose is reuse by every game.

import { AURORA } from './theme';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Replace LEADERBOARD_DOMAIN with your real domain, e.g. leaderboard.monsilaro.ca.
// This is the ONE place the service URL is configured.
export const LEADERBOARD_BASE_URL = 'https://LEADERBOARD_DOMAIN';

const PLAYER_NAME_KEY = 'games-lab.player-name';
const MAX_NAME_LENGTH = 12;
const REQUEST_TIMEOUT_MS = 6000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SortOrder = 'asc' | 'desc';

export interface LeaderboardEntry {
  rank: number;
  name: string;
  score: number;
  meta?: unknown;
  createdAt?: string;
}

export interface SubmitResult {
  rank: number;
  top: LeaderboardEntry[];
}

export interface GetTopOptions {
  limit?: number;
  order?: SortOrder;
}

export interface ShowLeaderboardOptions {
  /** Heading shown at the top of the overlay (defaults to the game name). */
  title?: string;
  limit?: number;
  order?: SortOrder;
  /** Highlight the row(s) belonging to this player (case-insensitive). */
  playerName?: string;
  /** With `playerName`, prefer the exact row matching this just-played score. */
  highlightScore?: number;
}

// ---------------------------------------------------------------------------
// Network client (fail-soft)
// ---------------------------------------------------------------------------

function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

/**
 * Submit a score. Resolves to `{ rank, top }` on success, or `null` on any
 * network/validation/rate-limit error — callers should treat null as "the
 * leaderboard is unavailable right now" and carry on.
 */
export async function submitScore(
  game: string,
  name: string,
  score: number,
  meta?: Record<string, unknown>,
): Promise<SubmitResult | null> {
  try {
    const res = await fetch(`${LEADERBOARD_BASE_URL}/api/scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game, name, score, ...(meta ? { meta } : {}) }),
      signal: timeoutSignal(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<SubmitResult>;
    if (typeof data.rank !== 'number' || !Array.isArray(data.top)) return null;
    return { rank: data.rank, top: data.top };
  } catch {
    return null;
  }
}

/**
 * Fetch the top entries for a game. Resolves to `[]` on any error. `order` is
 * optional — omit it and the server uses the game's natural order.
 */
export async function getTopScores(
  game: string,
  options: GetTopOptions = {},
): Promise<LeaderboardEntry[]> {
  try {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', String(options.limit));
    if (options.order) params.set('order', options.order);
    const qs = params.toString();
    const url = `${LEADERBOARD_BASE_URL}/api/scores/${encodeURIComponent(game)}${
      qs ? `?${qs}` : ''
    }`;
    const res = await fetch(url, { signal: timeoutSignal(REQUEST_TIMEOUT_MS) });
    if (!res.ok) return [];
    const data = (await res.json()) as { entries?: LeaderboardEntry[] };
    return Array.isArray(data.entries) ? data.entries : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Player name (remembered in localStorage, fail-soft)
// ---------------------------------------------------------------------------

export function getStoredPlayerName(): string {
  try {
    return (localStorage.getItem(PLAYER_NAME_KEY) ?? '').slice(0, MAX_NAME_LENGTH);
  } catch {
    return '';
  }
}

export function setStoredPlayerName(name: string): void {
  try {
    localStorage.setItem(PLAYER_NAME_KEY, name.slice(0, MAX_NAME_LENGTH));
  } catch {
    // private browsing etc. — name just won't persist
  }
}

function cleanName(raw: string): string {
  return raw
    .replace(/[\u0000-\u001F\u007F]/g, '') // control characters
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
}

// ---------------------------------------------------------------------------
// DOM overlay
// ---------------------------------------------------------------------------

// All ids are game-namespace-free but prefixed `gl-leaderboard-` so ad-blocker
// cosmetic filters (which target generic ids like #overlay/#popup) leave them be.
const STYLE_ID = 'gl-leaderboard-styles';

function hex(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .gl-leaderboard-backdrop {
      position: fixed; inset: 0; z-index: 2147483000;
      display: flex; align-items: center; justify-content: center;
      padding: calc(env(safe-area-inset-top, 0px) + 16px) 16px
               calc(env(safe-area-inset-bottom, 0px) + 16px);
      background: rgba(4, 8, 20, 0.72);
      backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
      font-family: -apple-system, system-ui, sans-serif;
      -webkit-user-select: none; user-select: none; touch-action: manipulation;
    }
    .gl-leaderboard-panel {
      width: 100%; max-width: 360px; max-height: 80vh; overflow: hidden;
      display: flex; flex-direction: column;
      background: ${hex(AURORA.deepBlue)};
      border: 1px solid ${hex(AURORA.slateBlue)};
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      color: ${hex(AURORA.snow)};
    }
    .gl-leaderboard-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 18px 12px; gap: 8px;
    }
    .gl-leaderboard-title {
      font-size: 20px; font-weight: 800; letter-spacing: 0.5px;
      color: ${hex(AURORA.iceCyan)};
    }
    .gl-leaderboard-close {
      appearance: none; border: 0; background: ${hex(AURORA.slateBlue)};
      color: ${hex(AURORA.snow)}; width: 32px; height: 32px; border-radius: 8px;
      font-size: 18px; line-height: 1; cursor: pointer; flex: 0 0 auto;
    }
    .gl-leaderboard-body { overflow-y: auto; padding: 0 12px 8px; -webkit-overflow-scrolling: touch; }
    .gl-leaderboard-list { list-style: none; margin: 0; padding: 0; }
    .gl-leaderboard-row {
      display: flex; align-items: center; gap: 10px;
      padding: 9px 10px; border-radius: 10px; font-size: 15px;
    }
    .gl-leaderboard-row + .gl-leaderboard-row { margin-top: 2px; }
    .gl-leaderboard-row-rank {
      flex: 0 0 28px; text-align: right; font-weight: 700;
      color: ${hex(AURORA.iceCyan)}; font-variant-numeric: tabular-nums;
    }
    .gl-leaderboard-row-name {
      flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .gl-leaderboard-row-score {
      flex: 0 0 auto; font-weight: 800; font-variant-numeric: tabular-nums;
      color: ${hex(AURORA.emberLight)};
    }
    .gl-leaderboard-row-me {
      background: ${hex(AURORA.ember)};
      color: ${hex(AURORA.night)};
    }
    .gl-leaderboard-row-me .gl-leaderboard-row-rank,
    .gl-leaderboard-row-me .gl-leaderboard-row-score { color: ${hex(AURORA.night)}; }
    .gl-leaderboard-msg { padding: 28px 16px; text-align: center; color: ${hex(AURORA.iceCyan)}; font-size: 15px; }
    .gl-leaderboard-msg-err { color: ${hex(AURORA.emberLight)}; }
    .gl-leaderboard-foot { padding: 10px 18px calc(env(safe-area-inset-bottom, 0px) + 14px); }
    .gl-leaderboard-namerow { display: flex; gap: 8px; align-items: center; }
    .gl-leaderboard-input {
      flex: 1 1 auto; min-width: 0; appearance: none;
      background: ${hex(AURORA.night)}; color: ${hex(AURORA.snow)};
      border: 1px solid ${hex(AURORA.slateBlue)}; border-radius: 8px;
      padding: 9px 11px; font-size: 15px; font-family: inherit;
    }
    .gl-leaderboard-input::placeholder { color: ${hex(AURORA.slateBlue)}; }
    .gl-leaderboard-btn {
      appearance: none; border: 0; cursor: pointer; flex: 0 0 auto;
      background: ${hex(AURORA.auroraGreen)}; color: ${hex(AURORA.night)};
      border-radius: 8px; padding: 9px 14px; font-size: 15px; font-weight: 800;
    }
    .gl-leaderboard-hint { margin-top: 8px; font-size: 11px; color: ${hex(AURORA.slateBlue)}; text-align: center; }
  `;
  document.head.appendChild(style);
}

// Stop a pointer/touch from leaking to the game's window-level "tap to restart"
// listener. Attached to the backdrop so any tap while the overlay is open is
// swallowed before it reaches window.
function swallow(el: HTMLElement): void {
  for (const type of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'click']) {
    el.addEventListener(type, (e) => e.stopPropagation());
  }
}

function buildModal(options: { onDismiss?: () => void } = {}): {
  backdrop: HTMLDivElement;
  panel: HTMLDivElement;
  close: () => void;
} {
  ensureStyles();
  const backdrop = document.createElement('div');
  backdrop.className = 'gl-leaderboard-backdrop';
  const panel = document.createElement('div');
  panel.className = 'gl-leaderboard-panel';
  backdrop.appendChild(panel);

  swallow(backdrop);

  const close = (): void => {
    backdrop.remove();
  };
  // Tapping the dark area outside the panel dismisses; taps on the panel don't.
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      close();
      options.onDismiss?.();
    }
  });

  document.body.appendChild(backdrop);
  return { backdrop, panel, close };
}

/**
 * Ask the player for a name once, via a small themed modal, and remember it.
 * Resolves to the stored/entered name, or `null` if they cancel. If a name is
 * already stored it resolves immediately without showing anything.
 */
export function promptPlayerName(options: { force?: boolean } = {}): Promise<string | null> {
  const existing = getStoredPlayerName();
  if (existing && !options.force) return Promise.resolve(existing);

  return new Promise((resolve) => {
    let settled = false;
    let closeModal = (): void => {};
    const finish = (value: string | null): void => {
      if (settled) return;
      settled = true;
      closeModal();
      resolve(value);
    };
    const { panel, close } = buildModal({ onDismiss: () => finish(null) });
    closeModal = close;

    const head = document.createElement('div');
    head.className = 'gl-leaderboard-head';
    const title = document.createElement('div');
    title.className = 'gl-leaderboard-title';
    title.textContent = 'Your name';
    head.appendChild(title);
    panel.appendChild(head);

    const foot = document.createElement('div');
    foot.className = 'gl-leaderboard-foot';
    const row = document.createElement('div');
    row.className = 'gl-leaderboard-namerow';

    const input = document.createElement('input');
    input.className = 'gl-leaderboard-input';
    input.type = 'text';
    input.maxLength = MAX_NAME_LENGTH;
    input.placeholder = 'Player';
    input.value = existing;
    input.autocapitalize = 'off';
    input.autocomplete = 'off';
    input.spellcheck = false;

    const btn = document.createElement('button');
    btn.className = 'gl-leaderboard-btn';
    btn.textContent = 'OK';

    const hint = document.createElement('div');
    hint.className = 'gl-leaderboard-hint';
    hint.textContent = 'Used on the leaderboard. Max 12 characters.';

    const submit = (): void => {
      const name = cleanName(input.value);
      if (name.length < 1) {
        input.focus();
        return;
      }
      setStoredPlayerName(name);
      finish(name);
    };
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });

    row.append(input, btn);
    foot.append(row, hint);
    panel.appendChild(foot);

    setTimeout(() => input.focus(), 50);
  });
}

/**
 * Open the leaderboard overlay for a game: top-N list, the current player's
 * entry highlighted, a remembered name field, plus loading and error states.
 * Never throws; if the service is down it shows "Leaderboard unavailable".
 */
export function showLeaderboard(game: string, options: ShowLeaderboardOptions = {}): void {
  const { panel, close } = buildModal();

  // Header
  const head = document.createElement('div');
  head.className = 'gl-leaderboard-head';
  const title = document.createElement('div');
  title.className = 'gl-leaderboard-title';
  title.textContent = options.title ?? `${game.charAt(0).toUpperCase()}${game.slice(1)} — Top`;
  const closeBtn = document.createElement('button');
  closeBtn.className = 'gl-leaderboard-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', close);
  head.append(title, closeBtn);
  panel.appendChild(head);

  // Body (loading first)
  const body = document.createElement('div');
  body.className = 'gl-leaderboard-body';
  const loading = document.createElement('div');
  loading.className = 'gl-leaderboard-msg';
  loading.textContent = 'Loading…';
  body.appendChild(loading);
  panel.appendChild(body);

  // Footer: remembered name field
  const foot = document.createElement('div');
  foot.className = 'gl-leaderboard-foot';
  const nameRow = document.createElement('div');
  nameRow.className = 'gl-leaderboard-namerow';
  const input = document.createElement('input');
  input.className = 'gl-leaderboard-input';
  input.type = 'text';
  input.maxLength = MAX_NAME_LENGTH;
  input.placeholder = 'Your name';
  input.value = options.playerName ?? getStoredPlayerName();
  input.autocapitalize = 'off';
  input.autocomplete = 'off';
  input.spellcheck = false;
  const saveBtn = document.createElement('button');
  saveBtn.className = 'gl-leaderboard-btn';
  saveBtn.textContent = 'Save';
  saveBtn.addEventListener('click', () => {
    const name = cleanName(input.value);
    if (name) {
      setStoredPlayerName(name);
      input.value = name;
      saveBtn.textContent = 'Saved';
      setTimeout(() => (saveBtn.textContent = 'Save'), 1200);
    }
  });
  nameRow.append(input, saveBtn);
  foot.appendChild(nameRow);
  panel.appendChild(foot);

  const highlightName = (options.playerName ?? getStoredPlayerName()).trim().toLowerCase();

  void getTopScores(game, { limit: options.limit ?? 10, order: options.order }).then((entries) => {
    body.textContent = '';
    if (entries.length === 0) {
      const msg = document.createElement('div');
      msg.className = 'gl-leaderboard-msg gl-leaderboard-msg-err';
      // Empty list and a down service are indistinguishable from the client; the
      // message covers both honestly.
      msg.textContent = 'No scores yet — or the leaderboard is unavailable.';
      body.appendChild(msg);
      return;
    }

    // Prefer the exact just-played row (name + score); else first name match.
    let highlightedOnce = false;
    const list = document.createElement('ol');
    list.className = 'gl-leaderboard-list';
    for (const entry of entries) {
      const li = document.createElement('li');
      li.className = 'gl-leaderboard-row';

      const isExact =
        !highlightedOnce &&
        options.highlightScore !== undefined &&
        entry.name.trim().toLowerCase() === highlightName &&
        entry.score === options.highlightScore;
      const isNameMatch =
        !highlightedOnce && options.highlightScore === undefined &&
        highlightName.length > 0 && entry.name.trim().toLowerCase() === highlightName;
      if (isExact || isNameMatch) {
        li.classList.add('gl-leaderboard-row-me');
        highlightedOnce = true;
      }

      const rank = document.createElement('span');
      rank.className = 'gl-leaderboard-row-rank';
      rank.textContent = String(entry.rank);
      const name = document.createElement('span');
      name.className = 'gl-leaderboard-row-name';
      name.textContent = entry.name; // textContent — never inject other players' names as HTML
      const score = document.createElement('span');
      score.className = 'gl-leaderboard-row-score';
      score.textContent = String(entry.score);

      li.append(rank, name, score);
      list.appendChild(li);
    }
    body.appendChild(list);
  });
}
