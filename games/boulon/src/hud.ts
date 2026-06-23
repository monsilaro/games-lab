// Room-climber HUD: room number, enemies remaining, HP pips, collected-upgrade
// icons, and a transient banner. Plain DOM, ids prefixed `boulon-`.

export class Hud {
  private readonly roomEl = byId('boulon-hud-room');
  private readonly enemiesEl = byId('boulon-hud-enemies');
  private readonly hpEl = byId('boulon-hud-hp');
  private readonly upgradesEl = byId('boulon-hud-upgrades');
  private readonly bannerEl = byId('boulon-banner');
  private bannerT = 0;

  constructor(buildInfo: string) {
    const stamp = document.getElementById('boulon-build-stamp');
    if (stamp) stamp.textContent = buildInfo;
  }

  setRoom(n: number): void {
    this.roomEl.textContent = `Salle ${n}`;
  }

  setEnemies(n: number): void {
    this.enemiesEl.textContent = n > 0 ? `☠️ ${n}` : '✅ sortie ouverte';
  }

  setHp(hp: number, max: number): void {
    let s = '';
    for (let i = 0; i < max; i++) s += i < hp ? '🔩' : '·';
    this.hpEl.textContent = s;
  }

  setUpgrades(icons: string): void {
    this.upgradesEl.textContent = icons;
  }

  banner(text: string): void {
    this.bannerEl.textContent = text;
    this.bannerEl.style.opacity = '1';
    this.bannerT = 1.3;
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
