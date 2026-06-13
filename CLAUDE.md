# games-lab — conventions

Monorepo of small web game prototypes. Target platform: **iPhone Safari** via GitHub Pages.
Iteration loop: push to `main` → GitHub Action builds everything → live at <https://monsilaro.github.io/games-lab/>.

## Structure

```
games-lab/
├── packages/shared/         # shared utils (almost empty on purpose — see promotion rule)
├── games/<name>/            # one folder per game: Vite + TypeScript + vanilla Three.js
├── index/                   # arcade landing page (plain HTML/CSS built by Vite)
├── .github/workflows/deploy.yml
├── pnpm-workspace.yaml
└── tsconfig.base.json       # strict TS config extended by every package
```

## Conventions

- **One folder per game** under `games/`. Keep a prototype self-contained — ideally a single `src/main.ts` with tuning constants grouped at the top of the file.
- **Three.js vanilla only** — no React, no react-three-fiber, no framework on top.
- **Vite base path**: every game sets `base: '/games-lab/<name>/'` in its `vite.config.ts`; the index uses `base: '/games-lab/'`. Without this, assets 404 on GitHub Pages.
- **TypeScript strict**: every `tsconfig.json` extends `../../tsconfig.base.json` and must pass `tsc --noEmit`.
- **Mobile first** (iPhone Safari): `viewport-fit=cover` meta, `touch-action: none` on the canvas, no scroll/bounce/double-tap zoom, safe-area insets for HTML overlays, `devicePixelRatio` capped at 2, apple-touch-icon + minimal web manifest.
- **Zero assets** for prototypes: colored geometry, HTML overlays for UI.
- **No generic HTML ids** (`overlay`, `score`, `banner`, `popup`, `ad`…): ad-blocker cosmetic filters (EasyList via Brave Shields, uBlock, AdGuard) hide them, silently nuking the game UI. Prefix with the game name: `flappy-game-overlay`, `flappy-hud-score`.

### Per-game exceptions

- **Veillée — lit, faceted materials.** Most games use `MeshBasicMaterial` (flat, unlit). Veillée deliberately breaks this for its "Nuit de veillée" low-poly look: `MeshLambertMaterial` with `flatShading: true`, lit by a fixed rig (cold directional "moon" + faint blue ambient + warm low "lantern" point light) defined in `games/veillee/src/scene.ts` from `config.ts`. The chaud/froid contrast on facets is the whole point — don't "fix" it back to unlit. The shared ortho camera is reused and tilted ~30° for the diorama.

## Veillée — Hero Forge workflow

The hero roster is 100% data-driven. To iterate on a hero's silhouette: **edit `games/veillee/src/forge/heroes.ts`** (the design source of truth — one `HeroConfig` per hero), then reload **`?forge=1`** to see every hero turning on its pedestal under the real light rig. Composable parts (bodies/heads/headgear/weapons/accessories) live in `src/forge/parts.ts`; the factory that assembles them is `src/forge/heroFactory.ts`. Add a new part kind there, expose it in a `parts.ts` union, then reference it from `heroes.ts`.

## Adding a new game

1. Copy an existing game: `cp -r games/flappy games/<name>` (drop its `dist/` and `node_modules/` if present).
2. In `games/<name>/package.json`, set `"name": "<name>"`.
3. In `games/<name>/vite.config.ts`, set `base: '/games-lab/<name>/'`.
4. Update its `index.html` title/manifest.
5. Add a card for the game in `index/index.html` (link to `./<name>/`).
6. **Add a row for the game to the “Games” table in `README.md`.**
7. `pnpm install`, then `pnpm --filter <name> dev` to iterate.
8. Push to `main` — the deploy workflow picks up every folder in `games/*` automatically.

## Shared code promotion rule

`packages/shared` stays almost empty. Promote code there **only when it is duplicated in 2+ games** — never preemptively. When promoting, add `"@games-lab/shared": "workspace:*"` to the consuming games' dependencies.

## Commands

```bash
pnpm install                # install the whole workspace
pnpm --filter flappy dev    # dev server for one game
pnpm typecheck              # tsc --noEmit across all packages
pnpm build                  # build all games + index
```

## Deploy

`.github/workflows/deploy.yml` runs on every push to `main`: install → typecheck → build, then assembles the site (index at the root, each game under `/games-lab/<name>/`) and publishes via GitHub Pages (Source: GitHub Actions).
