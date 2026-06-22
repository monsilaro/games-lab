// DOM overlay for Phase 2: the resource/population bar, the build picker (shown
// in build mode), the building assignment sheet, world-anchored markers (recruit
// "!", idle "💤") and the famine warning. No game logic — buttons fire callbacks,
// the overlay only reflects state main.ts pushes in. All ids le-feu- prefixed.
import {
  SPEEDS,
  BUILD_ORDER,
  BUILDINGS,
  RESOURCE_KINDS,
  RESOURCE_ICON,
  WORK,
  type ResourceKind,
} from './config';
import { canAfford, type Store } from './resources';
import type { BuildingInstance } from './buildings';
import type { Quest } from './quests';

export interface HudCallbacks {
  onSpeed(multiplier: number): void;
  onToggleBuild(): void;
  onPickBuilding(defId: string): void;
  onAssignPlus(): void;
  onAssignMinus(): void;
  onCloseSheet(): void;
  onStartGame(): void;
}

export interface MarkerItem {
  sx: number;
  sy: number;
  emoji: string;
}

export interface Hud {
  setClock(day: number, phase: string): void;
  setSpeedActive(multiplier: number): void;
  setBuildActive(on: boolean): void;
  setBuildSelection(defId: string | null): void;
  setStatus(store: Store, pop: number, cap: number, idle: number, starving: boolean): void;
  openSheet(building: BuildingInstance): void;
  refreshSheet(building: BuildingInstance, idle: number): void;
  closeSheet(): void;
  setFire(fuel: number, max: number, warn: boolean): void;
  updateMarkers(items: MarkerItem[]): void;
  setQuest(quest: Quest | null, stepLabel: string): void;
  questToast(quest: Quest): void;
  showIntro(first: Quest | null): void;
  hideIntro(): void;
}

function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`le-feu: missing #${id}`);
  return e as T;
}

function costLabel(cost: Partial<Record<ResourceKind, number>>): string {
  const parts: string[] = [];
  for (const k of RESOURCE_KINDS) {
    const n = cost[k];
    if (n) parts.push(`${RESOURCE_ICON[k]}${n}`);
  }
  return parts.join(' ');
}

function ratePerMin(building: BuildingInstance): number {
  const prod = building.def.produces;
  if (!prod) return 0;
  return Math.round((building.assigned.length * prod.perTrip * 60) / WORK.estCycleSec);
}

export function createHud(cb: HudCallbacks): Hud {
  const dayEl = el('le-feu-day');
  const phaseEl = el('le-feu-phase');
  const stampEl = el('le-feu-build-stamp');
  stampEl.textContent = __BUILD_INFO__;

  // --- Speed + build toggle ---
  const speedBtns = new Map<number, HTMLButtonElement>([
    [SPEEDS[0], el<HTMLButtonElement>('le-feu-pause')],
    [SPEEDS[1], el<HTMLButtonElement>('le-feu-x1')],
    [SPEEDS[2], el<HTMLButtonElement>('le-feu-x2')],
    [SPEEDS[3], el<HTMLButtonElement>('le-feu-x3')],
  ]);
  for (const [mult, btn] of speedBtns) btn.addEventListener('click', () => cb.onSpeed(mult));
  el<HTMLButtonElement>('le-feu-build').addEventListener('click', () => cb.onToggleBuild());

  // --- Resource / population bar (built once, updated each tick) ---
  const resBar = el('le-feu-resources');
  const resSpans = new Map<ResourceKind, HTMLSpanElement>();
  for (const k of RESOURCE_KINDS) {
    const s = document.createElement('span');
    s.className = 'le-feu-res';
    resBar.appendChild(s);
    resSpans.set(k, s);
  }
  const popSpan = document.createElement('span');
  popSpan.className = 'le-feu-res';
  resBar.appendChild(popSpan);
  const idleSpan = document.createElement('span');
  idleSpan.className = 'le-feu-res';
  resBar.appendChild(idleSpan);
  const fireSpan = document.createElement('span');
  fireSpan.className = 'le-feu-res';
  resBar.appendChild(fireSpan);
  const famineEl = el('le-feu-famine');
  const fireWarnEl = el('le-feu-fire-warn');

  // --- Build picker (one button per buildable, generated from config) ---
  const pickerEl = el('le-feu-picker');
  const pickBtns = new Map<string, HTMLButtonElement>();
  for (const id of BUILD_ORDER) {
    const def = BUILDINGS[id];
    if (!def || !def.buildable) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'le-feu-pick';
    btn.innerHTML =
      `<span class="le-feu-pick-ico">${def.icon}</span>` +
      `<span class="le-feu-pick-name">${def.name}</span>` +
      `<span class="le-feu-pick-cost">${costLabel(def.cost)}</span>`;
    btn.addEventListener('click', () => cb.onPickBuilding(id));
    pickerEl.appendChild(btn);
    pickBtns.set(id, btn);
  }

  // --- Assignment sheet ---
  const sheetEl = el('le-feu-sheet');
  const sheetTitle = el('le-feu-sheet-title');
  const sheetRate = el('le-feu-sheet-rate');
  const sheetRow = el('le-feu-sheet-row');
  const sheetWorkers = el('le-feu-sheet-workers');
  const sheetIdle = el('le-feu-sheet-idle');
  const plusBtn = el<HTMLButtonElement>('le-feu-sheet-plus');
  const minusBtn = el<HTMLButtonElement>('le-feu-sheet-minus');
  plusBtn.addEventListener('click', () => cb.onAssignPlus());
  minusBtn.addEventListener('click', () => cb.onAssignMinus());
  el<HTMLButtonElement>('le-feu-sheet-close').addEventListener('click', () => cb.onCloseSheet());

  // --- Marker pool ---
  const markersEl = el('le-feu-markers');
  const markerPool: HTMLSpanElement[] = [];

  // --- Quest panel + toast + intro ---
  const questTitle = el('le-feu-quest-title');
  const questDesc = el('le-feu-quest-desc');
  const questStep = el('le-feu-quest-step');
  const toastEl = el('le-feu-quest-toast');
  let toastTimer = 0;
  const introEl = el('le-feu-intro');
  const introObj = el('le-feu-intro-obj');
  el<HTMLButtonElement>('le-feu-intro-start').addEventListener('click', () => cb.onStartGame());

  return {
    setClock(day, phase) {
      dayEl.textContent = `Jour ${day}`;
      phaseEl.textContent = phase;
    },
    setSpeedActive(multiplier) {
      for (const [mult, btn] of speedBtns) btn.classList.toggle('le-feu-on', mult === multiplier);
    },
    setBuildActive(on) {
      el('le-feu-build').classList.toggle('le-feu-on', on);
      pickerEl.style.display = on ? 'flex' : 'none';
    },
    setBuildSelection(defId) {
      for (const [id, btn] of pickBtns) btn.classList.toggle('le-feu-on', id === defId);
    },
    setStatus(store, pop, cap, idle, starving) {
      for (const k of RESOURCE_KINDS) {
        const s = resSpans.get(k);
        if (!s) continue;
        s.textContent = `${RESOURCE_ICON[k]} ${Math.floor(store.counts[k])}/${store.capacity[k]}`;
        s.classList.toggle('le-feu-full', store.full[k]);
        s.classList.toggle('le-feu-low', k === 'food' && store.counts[k] <= 0);
      }
      popSpan.textContent = `👥 ${pop}/${cap}`;
      idleSpan.textContent = `💤 ${idle}`;
      famineEl.style.display = starving ? 'block' : 'none';
      // Picker affordability.
      for (const [id, btn] of pickBtns) {
        const def = BUILDINGS[id];
        btn.disabled = !def || !canAfford(store, def.cost);
      }
    },
    openSheet(building) {
      sheetTitle.textContent = building.def.name;
      const isProd = building.def.kind === 'production';
      sheetRow.style.display = isProd ? 'flex' : 'none';
      sheetIdle.style.display = isProd ? 'block' : 'none';
      sheetEl.style.display = 'block';
      this.refreshSheet(building, 0);
    },
    refreshSheet(building, idle) {
      const def = building.def;
      if (def.kind === 'production' && def.produces) {
        const max = def.maxWorkers ?? 0;
        const n = building.assigned.length;
        sheetRate.textContent = `${RESOURCE_ICON[def.produces.resource]} +${ratePerMin(building)}/min`;
        sheetWorkers.textContent = `${n} / ${max}`;
        sheetIdle.textContent = `Disponibles : ${idle}`;
        plusBtn.disabled = n >= max || idle <= 0;
        minusBtn.disabled = n <= 0;
      } else if (def.kind === 'storage') {
        sheetRate.textContent = '📦 Augmente la capacité de stockage';
      } else if (def.kind === 'house') {
        sheetRate.textContent = `🏠 +${def.houseCapacity ?? 0} population`;
      }
    },
    closeSheet() {
      sheetEl.style.display = 'none';
    },
    setFire(fuel, max, warn) {
      fireSpan.textContent = `🔥 ${Math.floor(fuel)}/${max}`;
      fireSpan.classList.toggle('le-feu-low', warn);
      fireWarnEl.style.display = warn ? 'block' : 'none';
    },
    updateMarkers(items) {
      for (let i = 0; i < items.length; i++) {
        let span = markerPool[i];
        if (!span) {
          span = document.createElement('span');
          span.className = 'le-feu-marker';
          markersEl.appendChild(span);
          markerPool[i] = span;
        }
        const it = items[i]!;
        span.textContent = it.emoji;
        span.style.left = `${it.sx}px`;
        span.style.top = `${it.sy}px`;
        span.style.display = 'block';
      }
      for (let i = items.length; i < markerPool.length; i++) markerPool[i]!.style.display = 'none';
    },
    setQuest(quest, stepLabel) {
      if (!quest) {
        questTitle.textContent = 'Le camp prospère ✨';
        questDesc.textContent = 'Tous les objectifs sont accomplis — continue à le faire grandir.';
        questStep.textContent = '';
        return;
      }
      questTitle.textContent = quest.title;
      questDesc.textContent = quest.desc;
      questStep.textContent = stepLabel;
    },
    questToast(quest) {
      toastEl.textContent = `✓ ${quest.title}`;
      toastEl.classList.add('le-feu-toast-show');
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => toastEl.classList.remove('le-feu-toast-show'), 2200);
    },
    showIntro(first) {
      introObj.textContent = first ? `Premier objectif : ${first.title}` : '';
      introEl.style.display = 'flex';
    },
    hideIntro() {
      introEl.style.display = 'none';
    },
  };
}
