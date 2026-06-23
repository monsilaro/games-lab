// Tower-climber HUD: live height (the score), current level, an HP pip row, and
// a transient "Niveau N" banner. Plain DOM, all ids prefixed `boulon-` (the
// repo's ad-block rule).

export class Hud {
  private readonly heightEl = byId('boulon-hud-height');
  private readonly levelEl = byId('boulon-hud-level');
  private readonly hpEl = byId('boulon-hud-hp');
  private readonly bannerEl = byId('boulon-banner');
  private bannerT = 0;

  constructor(buildInfo: string) {
    const stamp = document.getElementById('boulon-build-stamp');
    if (stamp) stamp.textContent = buildInfo;
  }

  setHeight(h: number): void {
    this.heightEl.textContent = `${Math.floor(h)} m`;
  }

  setLevel(level: number): void {
    this.levelEl.textContent = `Niv. ${level}`;
  }

  setHp(hp: number, max: number): void {
    let s = '';
    for (let i = 0; i < max; i++) s += i < hp ? '🔩' : '·';
    this.hpEl.textContent = s;
  }

  banner(text: string): void {
    this.bannerEl.textContent = text;
    this.bannerEl.style.opacity = '1';
    this.bannerT = 1.4;
  }

  tick(dt: number): void {
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.bannerEl.style.opacity = '0';
    }
  }
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}
