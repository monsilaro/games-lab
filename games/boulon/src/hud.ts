// Minimal Phase 1 HUD: a kill counter and the build stamp. Grows into the
// wave/score HUD in later phases.

export class Hud {
  private readonly hudEl: HTMLElement;
  private kills = 0;

  constructor(buildInfo: string) {
    this.hudEl = byId('boulon-hud');
    const stamp = document.getElementById('boulon-build-stamp');
    if (stamp) stamp.textContent = buildInfo;
    this.render();
  }

  addKill(): void {
    this.kills += 1;
    this.render();
  }

  private render(): void {
    this.hudEl.textContent = `🔩 ${this.kills}`;
  }
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}
