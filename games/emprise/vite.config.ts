import { defineConfig } from 'vite';

// Build stamp shown in-game so you can tell stale CDN cache from fresh deploys.
const sha = process.env.GITHUB_SHA?.slice(0, 7) ?? 'local';
const builtAt = new Date().toISOString().slice(5, 16).replace('T', ' ');

export default defineConfig({
  base: '/games-lab/emprise/',
  server: {
    port: 3008,
  },
  define: {
    __BUILD_INFO__: JSON.stringify(`${sha} · ${builtAt}Z`),
  },
});
