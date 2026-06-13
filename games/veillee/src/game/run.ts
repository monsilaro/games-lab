import * as THREE from 'three';
import {
  createOrthoApp,
  startGameLoop,
  submitScore,
  showLeaderboard,
  getStoredPlayerName,
  promptPlayerName,
} from '@games-lab/shared';
import {
  PALETTE,
  BOARD,
  BOARD_VIEW,
  UNITS,
  STAR_SCALE,
  LEVELS,
  COMBAT,
  IDENTITY_MOD,
  TRAITS,
  ABILITY_INFO,
  fieldCap,
  hpLoss,
  sellValue,
  computeScore,
  type SynergyMod,
} from '../config';
import { activeSynergies, modifierFor } from './synergy';
import { setupScene } from '../scene';
import { buildBoard, type Slot } from '../render/board';
import { UnitView } from '../render/unitView';
import { pointerToBoard } from '../render/drag';
import { HERO_BY_ID } from '../forge/heroes';
import { createCombat, step } from '../combat/engine';
import type { CombatState, CombatUnit, Team } from '../combat/types';
import { newRun, boardCount, type OwnedUnit } from './state';
import { grantIncome, rollShop, buy, reroll, autoField, sellUnit } from './economy';
import { createHud } from '../ui/hud';

type Phase = 'shop' | 'combat' | 'result' | 'over';

declare const __BUILD_INFO__: string;

const LEADERBOARD_GAME = 'veillee';
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
  let lastTotal = 0;
  let shake = 0;
  const views = new Map<number, UnitView>(); // iid → view (preview: owned iid; combat: cIid)

  const hud = createHud({
    onBuy: (i) => {
      if (phase === 'shop' && buy(state, i)) {
        refreshPreview();
        renderShopUi();
        renderSynergies();
        if (selected && !state.units.includes(selected)) deselect(); // merged away
        else if (selected) showStats(selected);
      }
    },
    onReroll: () => {
      if (phase === 'shop' && reroll(state)) renderShopUi();
    },
    onReady: () => {
      if (phase === 'shop') startCombat();
    },
    onReplay: () => restart(),
    onSell: () => {
      if (phase !== 'shop' || !selected) return;
      sellUnit(state, selected);
      deselect();
      refreshPreview();
      renderShopUi();
      renderSynergies();
    },
    onLeaderboard: () =>
      showLeaderboard(LEADERBOARD_GAME, {
        title: 'Veillée — Top',
        playerName: getStoredPlayerName(),
        highlightScore: lastTotal,
      }),
  });

  async function submitRun(won: boolean): Promise<void> {
    const name = await promptPlayerName();
    if (!name) {
      hud.setLeaderboardStatus('');
      return;
    }
    const res = await submitScore(LEADERBOARD_GAME, name, lastTotal, {
      build: __BUILD_INFO__,
      niveaux: state.clearedLevels,
      gagne: won,
    });
    hud.setLeaderboardStatus(res ? `Rang #${res.rank} mondial` : 'Hors-ligne — score local');
  }

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
  function makeCombatUnit(
    heroId: string,
    star: 1 | 2 | 3,
    team: Team,
    p: { x: number; z: number },
    mod: SynergyMod = IDENTITY_MOD,
  ): CombatUnit {
    const base = UNITS[heroId]!;
    const mult = Math.pow(STAR_SCALE, star - 1);
    const maxHp = Math.round(base.hp * mult * mod.hpMul);
    return {
      iid: cIid++,
      heroId,
      team,
      star,
      stats: {
        atk: base.atk * mult * mod.atkMul,
        atkInterval: base.atkInterval / mod.atkSpeedMul,
        rangeWorld: (base.range + mod.rangeAdd) * BOARD.cell,
        moveSpeed: base.moveSpeed * BOARD.cell,
        manaMax: base.manaMax,
        manaPerAttack: base.manaPerAttack * mod.manaGainMul,
        ability: base.ability,
        abilityPowerMul: mod.abilityPowerMul,
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
    deselect();
    hud.setShopVisible(false);
    hud.hideBanner();
    hud.flashTransition();
    board.setPlacementVisible(false);
    clearViews();

    const units: CombatUnit[] = [];
    const fielded = state.units.filter((u) => u.placement.kind === 'cell');
    const rows = activeSynergies(fielded.map((u) => u.heroId));
    for (const u of fielded) {
      const cell = u.placement as { col: number; row: number };
      units.push(
        makeCombatUnit(u.heroId, u.star, 'player', board.cellToWorld('player', cell.col, cell.row), modifierFor(u.heroId, rows)),
      );
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
    deselect();
    if (withIncome) grantIncome(state);
    rollShop(state);
    autoField(state); // a cleared level raised the cap — fill it from the bench
    hud.hideBanner();
    hud.setPhaseLabel(null);
    board.setPlacementVisible(true);
    hud.setShopVisible(true);
    refreshPreview();
    renderShopUi();
    renderSynergies();
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

  function renderSynergies(): void {
    const fielded = state.units.filter((u) => u.placement.kind === 'cell').map((u) => u.heroId);
    hud.renderSynergies(activeSynergies(fielded));
  }

  function showStats(unit: OwnedUnit): void {
    const cfg = HERO_BY_ID.get(unit.heroId);
    const base = UNITS[unit.heroId];
    if (!cfg || !base) return;
    const mult = Math.pow(STAR_SCALE, unit.star - 1);
    const fielded = unit.placement.kind === 'cell';
    const rows = activeSynergies(state.units.filter((u) => u.placement.kind === 'cell').map((u) => u.heroId));
    const mod = fielded ? modifierFor(unit.heroId, rows) : IDENTITY_MOD;
    const ab = ABILITY_INFO[base.ability.kind];
    hud.showUnitStats({
      name: cfg.name,
      star: unit.star,
      originLabel: TRAITS[cfg.origin].label,
      roleLabel: TRAITS[cfg.role].label,
      hp: Math.round(base.hp * mult * mod.hpMul),
      atk: Math.round(base.atk * mult * mod.atkMul),
      atkSpeed: mod.atkSpeedMul / base.atkInterval,
      range: base.range + mod.rangeAdd,
      abilityLabel: ab.label,
      abilityDesc: ab.desc,
      fielded,
      value: sellValue(base.cost, unit.star),
    });
  }

  function deselect(): void {
    selected = null;
    hud.hideUnitStats();
    board.setPlacementActive(false);
  }

  function gameOver(won: boolean): void {
    phase = 'over';
    combat = null;
    deselect();
    hud.setShopVisible(false);
    hud.hideBanner();
    board.setPlacementVisible(false);
    clearViews();
    const breakdown = computeScore({
      clearedLevels: state.clearedLevels,
      hp: state.hp,
      gold: state.gold,
      elapsed: state.elapsed,
      won,
    });
    lastTotal = breakdown.total;
    hud.gameOver(won, breakdown);
    void submitRun(won); // fire-and-forget; fail-soft
  }

  function restart(): void {
    hud.hideGameOver();
    state = newRun();
    enterShop(false);
  }

  // ---------- drag placement (shop only) ----------
  const proj = new THREE.Vector3();
  let dragging: OwnedUnit | null = null;
  let selected: OwnedUnit | null = null;

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
    const picked = pickUnit(e.clientX, e.clientY);
    dragging = picked;
    if (picked) {
      selected = picked;
      showStats(picked);
      board.setPlacementActive(true);
    } else {
      deselect(); // tap on empty space clears the preview
    }
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
    renderSynergies();
    if (selected) showStats(selected); // placement/synergy may have changed
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
      const byIid = new Map(combat.units.map((u) => [u.iid, u]));
      for (const ev of events) {
        const v = views.get(ev.iid);
        if (ev.type === 'attack') {
          v?.onAttack();
          const att = byIid.get(ev.iid);
          const vic = byIid.get(ev.targetIid);
          const vv = views.get(ev.targetIid);
          if (att && vic && vv) vv.onKnockback(vic.pos.x - att.pos.x, vic.pos.z - att.pos.z);
        } else if (ev.type === 'cast') {
          v?.onAttack();
        } else if (ev.type === 'hit') {
          v?.onHit();
        } else if (ev.type === 'death') {
          v?.onDeath();
          shake = Math.min(0.4, shake + 0.14);
        }
      }
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

    // Camera shake on impacts (pans the ortho view; orientation untouched).
    if (shake > 0.0005) {
      shake = Math.max(0, shake - dt * 2);
      app.camera.position.set(
        BOARD_VIEW.cameraPos.x + Math.sin(clock * 80) * shake,
        BOARD_VIEW.cameraPos.y + Math.cos(clock * 64) * shake,
        BOARD_VIEW.cameraPos.z,
      );
    } else if (shake !== 0) {
      shake = 0;
      app.camera.position.copy(BOARD_VIEW.cameraPos);
    }

    app.renderer.render(app.scene, app.camera);
  }, COMBAT.maxDt);
}
