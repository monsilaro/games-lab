# 🕹️ games-lab

**A personal web arcade for rapid game prototyping — built and tested entirely from a phone.**

Small game prototypes built with vanilla [Three.js](https://threejs.org/) and TypeScript, auto-deployed to GitHub Pages, and playable on iPhone straight from Safari.

**▶️ Play the arcade:** <https://monsilaro.github.io/games-lab/>

## The workflow

The whole point of this repo is the iteration loop, which runs **phone-only** — no Mac, no Xcode, no app store:

```
Claude Code (mobile app) → push to main → GitHub Action builds & deploys → refresh Safari
```

From prompt to playable build on device in about a minute.

## Games

|Game  |Description                 |Play                                              |
|------|----------------------------|--------------------------------------------------|
|Flappy|Tap-to-flap, dodge the pipes|[▶️](https://monsilaro.github.io/games-lab/flappy/)|
|Arena |Survivors-like under the aurora: joystick, auto-fire, waves, upgrades|[▶️](https://monsilaro.github.io/games-lab/arena/)|

*(New prototypes appear on the arcade index automatically.)*

## Stack

- **Three.js (vanilla)** — orthographic camera for 2D-style scenes, no framework on top
- **TypeScript** (strict) + **Vite** per game
- **pnpm workspaces** monorepo
- **GitHub Actions → GitHub Pages** for zero-config hosting

## Structure

```
games-lab/
├── packages/shared/     # utils shared between games
├── games/
│   └── flappy/          # one folder per game (Vite + TS + Three.js)
├── index/               # the arcade landing page
└── .github/workflows/   # build & deploy pipeline
```

### Shared code philosophy

`packages/shared` starts almost empty on purpose. Code only gets promoted there once it has been **duplicated in two or more games** — no premature abstraction for games that don’t exist yet.

## Adding a new game

1. Create `games/<name>/` (copy an existing game as a starting point)
1. Set `base: '/games-lab/<name>/'` in its `vite.config.ts`
1. Add it to the arcade index
1. Push to `main` — the Action handles the rest

See [CLAUDE.md](./CLAUDE.md) for full conventions.

## Local development

```bash
pnpm install
pnpm --filter flappy dev    # run a single game locally
pnpm typecheck              # check everything
pnpm build                  # build all games + index
```

## Mobile notes

Every game targets **iPhone Safari** first: full-screen viewport, `touch-action: none`, safe-area handling, capped `devicePixelRatio`, and an apple-touch-icon so the arcade can live on the home screen like a native app.
