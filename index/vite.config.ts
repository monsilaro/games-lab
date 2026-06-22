import { defineConfig, type Plugin } from 'vite';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const MONTHS_FR = [
  'jan', 'fév', 'mar', 'avr', 'mai', 'jun',
  'jul', 'aoû', 'sep', 'oct', 'nov', 'déc',
];

/** Last commit date (strict ISO 8601) for a repo path, or null if unavailable
 *  (e.g. a shallow clone with no history — the CI checkout uses fetch-depth: 0). */
function lastCommitISO(relPath: string): string | null {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', relPath], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

/** Format an ISO date as "12 jun 2026 · 14:03", using the commit's own wall
 *  clock (sliced from the string) so the label is build-machine-TZ independent. */
function formatStamp(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return null;
  const [, y, mo, d, h, min] = m as unknown as [string, string, string, string, string, string];
  const month = MONTHS_FR[parseInt(mo, 10) - 1] ?? mo;
  return `${parseInt(d, 10)} ${month} ${y} · ${h}:${min}`;
}

/** Stamp each game card with its folder's last-commit date at build time. */
function lastUpdatedPlugin(): Plugin {
  return {
    name: 'games-lab-last-updated',
    transformIndexHtml(html) {
      return html.replace(
        /<a class="card" href="\.\/([a-z0-9-]+)\/">([\s\S]*?)<\/a>/g,
        (match, name: string, inner: string) => {
          const iso = lastCommitISO(`games/${name}`);
          const stamp = iso && formatStamp(iso);
          if (!stamp) return match;
          return `<a class="card" href="./${name}/">${inner}  <p class="card-updated">MAJ ${stamp}</p>\n      </a>`;
        },
      );
    },
  };
}

export default defineConfig({
  base: '/games-lab/',
  plugins: [lastUpdatedPlugin()],
});
