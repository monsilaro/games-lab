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

- **Emprise — 2D canvas, not Three.js.** The other games render with Three.js; Emprise's territory grid is a 40k-cell pixel field drawn on a dedicated 2D canvas (`getContext('2d')`). Three.js is the wrong tool here. The pipeline (`games/emprise/src/render.ts`): a persistent `ImageData` at grid resolution with a `Uint32Array` view, updated for **changed cells only** (the sim's dirty list), `putImageData` to an offscreen canvas, then one nearest-neighbour `drawImage` blit scaled into a centred, letterboxed rect — one blit per frame. State is typed arrays (`Uint8Array` owner id per cell, `Int32Array` front queue), never per-cell objects, and the sim works on the **front** only (no full-grid rescan per tick). Emprise's `tsconfig.json` turns **off** `noUncheckedIndexedAccess` (the only game to) because every read in those hot typed-array loops is provably in-bounds; all other strict checks stay on. Don't "port it back" to the Three.js/ortho stack — the pixel canvas is the whole point of the perf budget. Tuning (grid size, eco curves, costs, palette) lives in `games/emprise/src/config.ts`. Solo-vs-bots is built multi-owner from day one even though Phase 1 ships one player.

- **Boulon — lit voxel + matter-js in the FLOOR plane.** A twin-stick voxel arena shooter. Like Veillée it breaks the `MeshBasicMaterial` default for a lit toy-robot look (`MeshLambertMaterial` + `flatShading: true`, rig in `games/boulon/src/scene.ts` from `config.ts`) — bright primaries on a light workshop floor, deliberately cheerful vs. the rest of the (dark) arcade. Physics is **matter-js 2D simulated in the ground plane**: matter `(x, y)` maps to three `(x, 0, y)` (the XZ floor) and matter `angle` to mesh `rotation.y`; the shared ortho camera is tilted ~50° for a 3/4 view (see `games/boulon/src/physics.ts` `syncMeshes`). **Gravity is OFF** (`engine.gravity.scale = 0`) — this is a top-down field seen at an angle, not a slingshot-style side view; damping is per-body `frictionAir`. Don't "add gravity" or flip the mapping back to XY. Screen-up = matter −y (away from the camera); all input vectors are converted once in `main.ts`. The robot factory (`src/robotFactory.ts`) is a small parametric cube-assembler, the seed of a Veillée-style forge for later phases. The **debris budget** (`config.ts` `DEBRIS`: global cap, bounded cubes per enemy, lifetime/fade, pooling) is a first-order perf constraint — explosions (Phase 2+) must respect it; 60fps always wins over spectacle.

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
