import type { Upgrade } from './upgrades';

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
}

const hudBox = el<HTMLDivElement>('arena-hud');
const hpFill = el<HTMLDivElement>('arena-hp-fill');
const xpFill = el<HTMLDivElement>('arena-xp-fill');
const levelLabel = el<HTMLSpanElement>('arena-level-label');
const waveLabel = el<HTMLSpanElement>('arena-wave-label');
const banner = el<HTMLDivElement>('arena-wave-banner');
const vignette = el<HTMLDivElement>('arena-damage-vignette');
const levelFlash = el<HTMLDivElement>('arena-levelup-flash');
const overlay = el<HTMLDivElement>('arena-game-overlay');
const upgradeOverlay = el<HTMLDivElement>('arena-upgrade-overlay');
const cardsBox = el<HTMLDivElement>('arena-upgrade-cards');

function flashOpacity(node: HTMLElement, peak: string, fade: string): void {
  node.style.transition = 'none';
  node.style.opacity = peak;
  void node.offsetWidth; // force reflow so the next transition runs
  node.style.transition = `opacity ${fade} ease-out`;
  node.style.opacity = '0';
}

function restartAnimation(node: HTMLElement, cls: string): void {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

export function setHudVisible(visible: boolean): void {
  hudBox.style.display = visible ? 'flex' : 'none';
}

export function setHp(hp: number, maxHp: number): void {
  hpFill.style.width = `${Math.max(0, (hp / maxHp) * 100)}%`;
}

export function setXp(current: number, needed: number, level: number): void {
  xpFill.style.width = `${Math.min(current / needed, 1) * 100}%`;
  levelLabel.textContent = `Lv ${level}`;
}

export function setWave(wave: number): void {
  waveLabel.textContent = `Wave ${wave}`;
}

export function announceWave(wave: number): void {
  banner.textContent = `Wave ${wave}`;
  restartAnimation(banner, 'show');
}

/** Brief red vignette when the player takes a hit. */
export function damageFlash(): void {
  flashOpacity(vignette, '0.85', '0.5s');
}

/** Cyan screen pulse on level up. */
export function levelUpFlash(): void {
  flashOpacity(levelFlash, '0.8', '0.7s');
}

export function showOverlay(title: string, lines: string[]): void {
  overlay.innerHTML =
    `<h1>${title}</h1>` + lines.map((line) => `<p>${line}</p>`).join('');
  overlay.style.display = 'flex';
}

export function hideOverlay(): void {
  overlay.style.display = 'none';
}

export function showUpgradeCards(
  upgrades: Upgrade[],
  onPick: (upgrade: Upgrade) => void,
): void {
  cardsBox.innerHTML = '';
  upgrades.forEach((upgrade, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'arena-card';
    btn.style.animationDelay = `${i * 80}ms`;
    btn.innerHTML =
      `<span class="arena-card-icon">${upgrade.icon}</span>` +
      `<span class="arena-card-text"><strong>${upgrade.title}</strong>` +
      `<small>${upgrade.desc}</small></span>`;
    btn.addEventListener(
      'pointerdown',
      (e) => {
        e.stopPropagation();
        e.preventDefault();
        onPick(upgrade);
      },
      { once: true },
    );
    cardsBox.appendChild(btn);
  });
  upgradeOverlay.style.display = 'flex';
}

export function hideUpgradeCards(): void {
  upgradeOverlay.style.display = 'none';
  cardsBox.innerHTML = '';
}
