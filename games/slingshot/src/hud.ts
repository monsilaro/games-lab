function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
}

const hudBox = el<HTMLDivElement>('slingshot-hud');
const levelLabel = el<HTMLSpanElement>('slingshot-level-label');
const shotsBox = el<HTMLDivElement>('slingshot-shots');
const scoreLabel = el<HTMLSpanElement>('slingshot-score-label');
const scorePopEl = el<HTMLDivElement>('slingshot-score-pop');
const starsEl = el<HTMLDivElement>('slingshot-stars');
const nextBtn = el<HTMLButtonElement>('slingshot-next-btn');
const overlay = el<HTMLDivElement>('slingshot-game-overlay');

function restartAnimation(node: HTMLElement, cls: string): void {
  node.classList.remove(cls);
  void node.offsetWidth; // force reflow so the animation retriggers
  node.classList.add(cls);
}

export function setHudVisible(visible: boolean): void {
  hudBox.style.display = visible ? 'flex' : 'none';
}

export function setLevel(label: string): void {
  levelLabel.textContent = label;
}

export function setScore(score: number): void {
  scoreLabel.textContent = String(score);
}

/** One dot per shot in the level's budget, spent ones dimmed. */
export function setShots(remaining: number, total: number): void {
  shotsBox.innerHTML = '';
  for (let i = 0; i < total; i++) {
    const dot = document.createElement('span');
    dot.className = i < remaining ? 'slingshot-shot-dot' : 'slingshot-shot-dot spent';
    shotsBox.appendChild(dot);
  }
}

export function scorePop(text: string): void {
  scorePopEl.textContent = text;
  restartAnimation(scorePopEl, 'show');
}

/** Briefly flash a 1–3 star rating on level clear. */
export function showStars(n: number): void {
  starsEl.textContent = '★'.repeat(n) + '☆'.repeat(Math.max(0, 3 - n));
  restartAnimation(starsEl, 'show');
}

export function initNextButton(onTap: () => void): void {
  nextBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    onTap();
  });
}

export function showNextButton(visible: boolean): void {
  nextBtn.style.display = visible ? 'block' : 'none';
}

export function showOverlay(title: string, lines: string[]): void {
  overlay.innerHTML = `<h1>${title}</h1>` + lines.map((line) => `<p>${line}</p>`).join('');
  overlay.style.display = 'flex';
}

export function hideOverlay(): void {
  overlay.style.display = 'none';
}
