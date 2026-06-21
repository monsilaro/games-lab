// Thin DOM overlay: the day/phase readout, the speed cluster (⏸ ×1 ×2 ×3) and
// the build toggle. No game logic lives here — buttons fire callbacks and the
// overlay only reflects state main.ts pushes back in. All ids are le-feu- prefixed
// (ad-block cosmetic filters hide generic ids like #score / #overlay).
import { SPEEDS } from './config';

export interface HudCallbacks {
  onSpeed(multiplier: number): void;
  onToggleBuild(): void;
}

export interface Hud {
  setClock(day: number, phase: string): void;
  setSpeedActive(multiplier: number): void;
  setBuildActive(on: boolean): void;
}

function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`le-feu: missing #${id}`);
  return e as T;
}

export function createHud(cb: HudCallbacks): Hud {
  const dayEl = el('le-feu-day');
  const phaseEl = el('le-feu-phase');
  const hintEl = el('le-feu-build-hint');
  const stampEl = el('le-feu-build-stamp');
  stampEl.textContent = __BUILD_INFO__;

  // Speed buttons keyed by their multiplier (0 = pause).
  const speedBtns = new Map<number, HTMLButtonElement>([
    [SPEEDS[0], el<HTMLButtonElement>('le-feu-pause')],
    [SPEEDS[1], el<HTMLButtonElement>('le-feu-x1')],
    [SPEEDS[2], el<HTMLButtonElement>('le-feu-x2')],
    [SPEEDS[3], el<HTMLButtonElement>('le-feu-x3')],
  ]);
  for (const [mult, btn] of speedBtns) {
    btn.addEventListener('click', () => cb.onSpeed(mult));
  }

  const buildBtn = el<HTMLButtonElement>('le-feu-build');
  buildBtn.addEventListener('click', () => cb.onToggleBuild());

  return {
    setClock(day, phase) {
      dayEl.textContent = `Jour ${day}`;
      phaseEl.textContent = phase;
    },
    setSpeedActive(multiplier) {
      for (const [mult, btn] of speedBtns) btn.classList.toggle('le-feu-on', mult === multiplier);
    },
    setBuildActive(on) {
      buildBtn.classList.toggle('le-feu-on', on);
      hintEl.style.display = on ? 'block' : 'none';
    },
  };
}
