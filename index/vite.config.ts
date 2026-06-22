import { defineConfig, type Plugin } from 'vite';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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

/** Stamp each game card with its folder's last-commit ISO date at build time.
 *  The human "il y a …" label is computed client-side (index.html) so it stays
 *  fresh on every visit instead of freezing at the build moment. */
function lastUpdatedPlugin(): Plugin {
  return {
    name: 'games-lab-last-updated',
    transformIndexHtml(html) {
      return html.replace(
        /<a class="card" href="\.\/([a-z0-9-]+)\/">([\s\S]*?)<\/a>/g,
        (match, name: string, inner: string) => {
          const iso = lastCommitISO(`games/${name}`);
          if (!iso) return match;
          return `<a class="card" href="./${name}/">${inner}  <p class="card-updated" data-updated="${iso}"></p>\n      </a>`;
        },
      );
    },
  };
}

export default defineConfig({
  base: '/games-lab/',
  plugins: [lastUpdatedPlugin()],
});
