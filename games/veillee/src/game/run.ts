import * as THREE from 'three';
import { createOrthoApp, startGameLoop } from '@games-lab/shared';
import {
  PALETTE,
  BOARD,
  BOARD_VIEW,
  UNITS,
  STAR_SCALE,
  LEVELS,
  COMBAT,
  fieldCap,
  hpLoss,
  computeScore,
} from '../config';
import { setupScene } from '../scene';
import { buildBoard, type Slot } from '../render/board';
import { UnitView } from '../render/unitView';
import { pointerToBoard } from '../render/drag';
import { HERO_BY_ID } from '../forge/heroes';
import { createCombat, step } from '../combat/engine';
import type { CombatState, CombatUnit, Team } from '../combat/types';
import { newRun, boardCount, type OwnedUnit } from './state';
import { grantIncome, rollShop, buy, reroll } from './economy';
import { createHud } from '../ui/hud';

type Phase = 'shop' | 'combat' | 'result' | 'over';

const COMBAT_END_PAUSE = 0.8; // let deaths finish before resolving
const RESULT_PAUSE = 1.6; // banner dwell before next shop

export function startGame(): void {
  const app = createOrthoApp({ worldHeight: BOARD_VIEW.worldHeight, clearColor: PALETTE.night });
  setupScene(app, BOARD_VIEW);
  const board = buildBoard(app.scene);

  let state = newRun();
  let phase: Phase = 'shop';
  let combat: CombatState | null = null;
  let combatEndTimer = 0;
  let resultTimer = 0;
  let clock = 0;
  let cIid = 0;
  const views = new Map<number, UnitView>(); // iid → view (preview: owned iid; combat: cIid)

  const hud = createHud({
    onBuy: (i) => {
      if (phase === 'shop' && buy(state, i)) {
        refreshPreview();
        renderShopUi();
      }
    },
    onReroll: () => {
      if (phase === 'shop' && reroll(state)) renderShopUi();
    },
    onReady: () => {
      if (phase === 'shop') startCombat();
    },
    onReplay: () => restart(),
  });

  // ---------- view helpers ----------
  function clearViews(): void {
    for (const v of views.values()) v.removeFrom(app.scene);
    views.clear();
  }

  function refreshPreview(): void {
    clearViews();
    for (const u of state.units) {
      const cfg = HERO_BY_ID.get(u.heroId);
      if (!cfg) continue;
      const v = new UnitView(cfg, 'player');
      v.setStarScale(u.star);
      const w = board.slotToWorld(u.placement);
      v.setSlotPosition(w.x, w.z);
      v.setFacing(0);
      v.showBars(false);
      v.addTo(app.scene);
      views.set(u.iid, v);
    }
  }

  // ---------- combat ----------
  function makeCombatUnit(heroId: string, star: 1 | 2 | 3, team: Team, p: { x: number; z: number }): CombatUnit {
    const base = UNITS[heroId]!;
    const mult = Math.pow(STAR_SCALE, star - 1);
    const maxHp = Math.round(base.hp * mult);
    return {
      iid: cIid++,
      heroId,
      team,
      star,
      stats: {
        atk: base.atk * mult,
        atkInterval: base.atkInterval,
        rangeWorld: base.range * BOARD.cell,
        moveSpeed: base.moveSpeed * BOARD.cell,
        manaMax: base.manaMax,
        manaPerAttack: base.manaPerAttack,
        ability: base.ability,
      },
      hp: maxHp,
      maxHp,
      mana: 0,
      pos: { x: p.x, z: p.z },
      state: 'moving',
      attackTimer: 0,
      slowTimer: 0,
      slowFactor: 1,
      targetIid: null,
    };
  }

  function startCombat(): void {
    phase = 'combat';
    combatEndTimer = COMBAT_END_PAUSE;
    cIid = 0;
    hud.setShopVisible(false);
    hud.hideBanner();
    board.setPlacementVisible(false);
    clearViews();

    const units: CombatUnit[] = [];
    for (const u of state.units) {
      if (u.placement.kind !== 'cell') continue;
      units.push(makeCombatUnit(u.heroId, u.star, 'player', board.cellToWorld('player', u.placement.col, u.placement.row)));
    }
    for (const e of LEVELS[state.level - 1]!) {
      units.push(makeCombatUnit(e.heroId, e.star, 'enemy', board.cellToWorld('enemy', e.col, e.row)));
    }

    for (const cu of units) {
      const cfg = HERO_BY_ID.get(cu.heroId);
      if (!cfg) continue;
      const v = new UnitView(cfg, cu.team);
      v.setStarScale(cu.star);
      v.setSlotPosition(cu.pos.x, cu.pos.z);
      v.setFacing(cu.team === 'player' ? 0 : Math.PI);
      v.setHpRatio(1);
      v.showBars(true);
      v.addTo(app.scene);
      views.set(cu.iid, v);
    }

    combat = createCombat(units);
    hud.setPhaseLabel(`Niveau ${state.level}`);
    if (!units.some((u) => u.team === 'player')) finishCombat('enemy'); // fielded nothing
  }

  function finishCombat(winner: Team): void {
    phase = 'result';
    resultTimer = RESULT_PAUSE;
    if (winner === 'player') {
      state.clearedLevels++;
      if (state.level >= LEVELS.length) return gameOver(true);
      state.level++;
      hud.banner('Victoire', `Niveau ${state.level - 1} vaincu`);
    } else {
      const dmg = hpLoss(state.level);
      state.hp = Math.max(0, state.hp - dmg);
      if (state.hp <= 0) return gameOver(false);
      hud.banner('Défaite', `−${dmg} PV · rejoue niveau ${state.level}`);
    }
  }

  // ---------- shop ----------
  function enterShop(withIncome: boolean): void {
    phase = 'shop';
    combat = null;
    if (withIncome) grantIncome(state);
    rollShop(state);
    hud.hideBanner();
    hud.setPhaseLabel(null);
    board.setPlacementVisible(true);
    hud.setShopVisible(true);
    refreshPreview();
    renderShopUi();
  }

  function renderShopUi(): void {
    hud.renderShop(state.shop, state.gold);
    renderHud();
  }

  function renderHud(): void {
    hud.setStats({
      level: state.level,
      gold: state.gold,
      hp: state.hp,
      fieldUsed: boardCount(state),
      fieldCap: fieldCap(state.clearedLevels),
      elapsed: state.elapsed,
    });
  }

  function gameOver(won: boolean): void {
    phase = 'over';
    combat = null;
    hud.setShopVisible(false);
    hud.hideBanner();
    board.setPlacementVisible(false);
    clearViews();
    hud.gameOver(
      won,
      computeScore({
        clearedLevels: state.clearedLevels,
        hp: state.hp,
        gold: state.gold,
        elapsed: state.elapsed,
        won,
      }),
    );
  }

  function restart(): void {
    hud.hideGameOver();
    state = newRun();
    enterShop(false);
  }

  // ---------- drag placement (shop only) ----------
  const proj = new THREE.Vector3();
  let dragging: OwnedUnit | null = null;

  function pickUnit(cx: number, cy: number): OwnedUnit | null {
    let best: OwnedUnit | null = null;
    let bestD = 72 * 72;
    for (const u of state.units) {
      const v = views.get(u.iid);
      if (!v) continue;
      proj.set(v.container.position.x, 0.8, v.container.position.z).project(app.camera);
      const sx = (proj.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (-proj.y * 0.5 + 0.5) * window.innerHeight;
      const d = (sx - cx) ** 2 + (sy - cy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = u;
      }
    }
    return best;
  }

  function sameSlot(a: Slot, b: Slot): boolean {
    if (a.kind !== b.kind) return false;
    return a.kind === 'cell' && b.kind === 'cell' ? a.col === b.col && a.row === b.row : (a as { i: number }).i === (b as { i: number }).i;
  }

  function dropTo(unit: OwnedUnit, slot: Slot): void {
    const occ = state.units.find((u) => u !== unit && sameSlot(u.placement, slot));
    if (occ) {
      const from = unit.placement;
      unit.placement = slot;
      occ.placement = from; // swap keeps board count stable
      return;
    }
    const intoEmptyCellFromBench = slot.kind === 'cell' && unit.placement.kind === 'bench';
    if (intoEmptyCellFromBench && boardCount(state) >= fieldCap(state.clearedLevels)) return; // over cap → bounce
    unit.placement = slot;
  }

  app.renderer.domElement.addEventListener('pointerdown', (e: PointerEvent) => {
    if (phase !== 'shop') return;
    dragging = pickUnit(e.clientX, e.clientY);
  });
  window.addEventListener('pointermove', (e: PointerEvent) => {
    if (!dragging) return;
    const p = pointerToBoard(app, e.clientX, e.clientY, board);
    const v = views.get(dragging.iid);
    if (p && v) v.setSlotPosition(p.x, p.z);
  });
  window.addEventListener('pointerup', (e: PointerEvent) => {
    if (!dragging) return;
    const p = pointerToBoard(app, e.clientX, e.clientY, board);
    const slot = p ? board.nearestSlot(p) : null;
    if (slot) dropTo(dragging, slot);
    dragging = null;
    refreshPreview();
    renderHud();
  });

  // ---------- main loop ----------
  enterShop(false);
  startGameLoop((dt) => {
    clock += dt;
    state.elapsed += dt;

    if (phase === 'shop') {
      for (const v of views.values()) v.tick(clock, dt, app.camera.position);
    } else if (phase === 'combat' && combat) {
      const events = step(combat, dt);
      for (const ev of events) {
        const v = views.get(ev.iid);
        if (!v) continue;
        if (ev.type === 'attack' || ev.type === 'cast') v.onAttack();
        else if (ev.type === 'hit') v.onHit();
        else if (ev.type === 'death') v.onDeath();
      }
      const byIid = new Map(combat.units.map((u) => [u.iid, u]));
      for (const cu of combat.units) {
        const v = views.get(cu.iid);
        if (!v) continue;
        v.setSlotPosition(cu.pos.x, cu.pos.z);
        if (cu.targetIid != null) {
          const t = byIid.get(cu.targetIid);
          if (t) v.setFacing(Math.atan2(t.pos.x - cu.pos.x, t.pos.z - cu.pos.z));
        }
        v.setHpRatio(cu.hp / cu.maxHp);
        v.tick(clock, dt, app.camera.position);
      }
      for (const [iid, v] of [...views]) {
        if (v.removable) {
          v.removeFrom(app.scene);
          views.delete(iid);
        }
      }
      renderHud();
      if (combat.done) {
        combatEndTimer -= dt;
        if (combatEndTimer <= 0) finishCombat(combat.winner ?? 'enemy');
      }
    } else if (phase === 'result') {
      for (const v of views.values()) v.tick(clock, dt, app.camera.position);
      for (const [iid, v] of [...views]) {
        if (v.removable) {
          v.removeFrom(app.scene);
          views.delete(iid);
        }
      }
      resultTimer -= dt;
      if (resultTimer <= 0) enterShop(true);
    }

    app.renderer.render(app.scene, app.camera);
  }, COMBAT.maxDt);
}
