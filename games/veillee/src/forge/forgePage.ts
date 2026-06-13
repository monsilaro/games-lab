import * as THREE from 'three';
import { createOrthoApp, startGameLoop, type OrthoApp } from '@games-lab/shared';
import { PALETTE, SCENE, FORGE } from '../config';
import { setupScene } from '../scene';
import { buildHero, type BuiltHero, type HeroConfig } from './heroFactory';
import { HEROES } from './heroes';

interface Slot {
  group: THREE.Group; // forge-controlled: grid position + turntable
  hero: BuiltHero;
  cfg: HeroConfig;
}

/**
 * The art-direction tool: every hero on a snow pedestal, slowly turning under the
 * real game light rig, names projected as HTML labels, tap to inspect traits.
 */
export function renderForge(): void {
  const app = createOrthoApp({ worldHeight: SCENE.worldHeight, clearColor: PALETTE.night });
  setupScene(app);
  buildBoard(app.scene);
  scatterStars(app.scene);

  const slots = layoutHeroes(app.scene);
  const labels = setupLabels(slots.map((s) => s.cfg));
  const panel = document.getElementById('veillee-trait-panel') as HTMLDivElement | null;

  let selected = -1;
  setupTap(app, slots, (idx) => {
    selected = idx;
    const slot = slots[idx];
    if (panel && slot) showTraits(panel, slot.cfg);
  });

  let elapsed = 0;
  startGameLoop((dt) => {
    elapsed += dt;
    for (const s of slots) {
      s.group.rotation.y += FORGE.turntableSpeed * dt;
      s.hero.update(elapsed);
    }
    projectLabels(labels, slots, app, selected);
    app.renderer.render(app.scene, app.camera);
  });
}

function layoutHeroes(scene: THREE.Scene): Slot[] {
  const { cols, rows, spacingX, spacingZ } = FORGE;
  const slots: Slot[] = [];
  HEROES.forEach((cfg, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = (col - (cols - 1) / 2) * spacingX;
    const z = (row - (rows - 1) / 2) * spacingZ;

    const group = new THREE.Group();
    group.position.set(x, 0, z);
    addPedestal(group);

    const hero = buildHero(cfg);
    group.add(hero.root);
    scene.add(group);
    slots.push({ group, hero, cfg });
  });
  return slots;
}

// --- Diorama dressing ------------------------------------------------------

function buildBoard(scene: THREE.Scene): void {
  const { cols, rows, spacingX, spacingZ, boardInsetX, boardInsetZ, boardThickness, pedestalHeight } = FORGE;
  const w = (cols - 1) * spacingX + boardInsetX * 2;
  const d = (rows - 1) * spacingZ + boardInsetZ * 2;

  const board = new THREE.Mesh(
    new THREE.BoxGeometry(w, boardThickness, d),
    new THREE.MeshLambertMaterial({ color: PALETTE.wood, flatShading: true }),
  );
  board.position.y = -pedestalHeight - boardThickness / 2;
  scene.add(board);

  const snow = new THREE.Mesh(
    new THREE.BoxGeometry(w - 0.2, 0.12, d - 0.2),
    new THREE.MeshLambertMaterial({ color: PALETTE.snow, flatShading: true }),
  );
  snow.position.y = -pedestalHeight - 0.06;
  scene.add(snow);
}

function addPedestal(group: THREE.Group): void {
  const ped = new THREE.Mesh(
    new THREE.CylinderGeometry(FORGE.pedestalRadius, FORGE.pedestalRadius * 1.05, FORGE.pedestalHeight, 8),
    new THREE.MeshLambertMaterial({ color: PALETTE.snow, flatShading: true }),
  );
  ped.position.y = -FORGE.pedestalHeight / 2;
  group.add(ped);
}

function scatterStars(scene: THREE.Scene): void {
  const N = 140;
  const pos = new Float32Array(N * 3);
  // Deterministic scatter (no flicker between reloads while we tune the art).
  let seed = 1337;
  const rnd = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (rnd() - 0.5) * 44;
    pos[i * 3 + 1] = rnd() * 20 + 4;
    pos[i * 3 + 2] = -10 - rnd() * 24;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(
    new THREE.Points(geo, new THREE.PointsMaterial({ color: PALETTE.iceCyan, size: 0.13, sizeAttenuation: true })),
  );
}

// --- Labels + selection ----------------------------------------------------

function setupLabels(cfgs: HeroConfig[]): HTMLDivElement[] {
  const layer = document.getElementById('veillee-forge-labels');
  return cfgs.map((cfg) => {
    const el = document.createElement('div');
    el.className = 'veillee-hero-label';
    el.textContent = cfg.name;
    layer?.appendChild(el);
    return el;
  });
}

const _v = new THREE.Vector3();

function projectLabels(labels: HTMLDivElement[], slots: Slot[], app: OrthoApp, selected: number): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  slots.forEach((s, i) => {
    _v.set(s.group.position.x, FORGE.labelHeight, s.group.position.z).project(app.camera);
    const sx = (_v.x * 0.5 + 0.5) * w;
    const sy = (-_v.y * 0.5 + 0.5) * h;
    const el = labels[i];
    if (!el) return;
    el.style.transform = `translate(-50%, 0) translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
    el.classList.toggle('veillee-hero-label--sel', i === selected);
  });
}

function setupTap(app: OrthoApp, slots: Slot[], onPick: (i: number) => void): void {
  const v = new THREE.Vector3();
  const thresh = FORGE.pickRadiusPx * FORGE.pickRadiusPx;
  app.renderer.domElement.addEventListener('pointerdown', (e: PointerEvent) => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    let best = -1;
    let bestD = thresh;
    slots.forEach((s, i) => {
      v.set(s.group.position.x, FORGE.pickHeight, s.group.position.z).project(app.camera);
      const sx = (v.x * 0.5 + 0.5) * w;
      const sy = (-v.y * 0.5 + 0.5) * h;
      const dx = sx - e.clientX;
      const dy = sy - e.clientY;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best >= 0) onPick(best);
  });
}

function showTraits(panel: HTMLDivElement, cfg: HeroConfig): void {
  panel.innerHTML =
    `<strong class="veillee-trait-name">${cfg.name}</strong>` +
    `<span class="veillee-trait-chips">${cfg.origin} · ${cfg.role}</span>` +
    `<span class="veillee-trait-blurb">${cfg.blurb}</span>`;
  panel.classList.add('veillee-trait-panel--show');
}
