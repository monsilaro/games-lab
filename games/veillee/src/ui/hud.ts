import { ECONOMY, TRAITS, type ScoreBreakdown } from '../config';
import { HERO_BY_ID } from '../forge/heroes';
import type { ShopOffer } from '../game/state';
import type { SynergyRow } from '../game/synergy';

export interface HudHandlers {
  onBuy: (i: number) => void;
  onReroll: () => void;
  onReady: () => void;
  onReplay: () => void;
}

export interface HudStats {
  level: number;
  gold: number;
  hp: number;
  fieldUsed: number;
  fieldCap: number;
  elapsed: number;
}

export interface UnitStatsInfo {
  name: string;
  star: number;
  originLabel: string;
  roleLabel: string;
  hp: number;
  atk: number;
  atkSpeed: number; // attacks per second
  range: number; // cells
  abilityLabel: string;
  abilityDesc: string;
  fielded: boolean; // true → stats include active synergies
}

export interface Hud {
  setStats(s: HudStats): void;
  renderSynergies(rows: SynergyRow[]): void;
  showUnitStats(u: UnitStatsInfo): void;
  hideUnitStats(): void;
  renderShop(shop: (ShopOffer | null)[], gold: number): void;
  setShopVisible(v: boolean): void;
  setPhaseLabel(text: string | null): void;
  banner(title: string, sub: string): void;
  hideBanner(): void;
  gameOver(won: boolean, b: ScoreBreakdown): void;
  hideGameOver(): void;
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const heroName = (id: string): string => HERO_BY_ID.get(id)?.name ?? id;

/** "🌲 ⚔️" — the hero's Origine + Rôle icons, to read its traits at a glance. */
function heroTraits(id: string): string {
  const cfg = HERO_BY_ID.get(id);
  if (!cfg) return '';
  return `${TRAITS[cfg.origin].icon} ${TRAITS[cfg.role].icon}`;
}

export function createHud(h: HudHandlers): Hud {
  const statLevel = el<HTMLSpanElement>('veillee-stat-level');
  const statGold = el<HTMLSpanElement>('veillee-stat-gold');
  const statHp = el<HTMLSpanElement>('veillee-stat-hp');
  const statField = el<HTMLSpanElement>('veillee-stat-field');
  const statTimer = el<HTMLSpanElement>('veillee-stat-timer');
  const phase = el<HTMLDivElement>('veillee-phase');
  const shop = el<HTMLDivElement>('veillee-shop');
  const offers = el<HTMLDivElement>('veillee-shop-offers');
  const rerollBtn = el<HTMLButtonElement>('veillee-reroll-btn');
  const readyBtn = el<HTMLButtonElement>('veillee-ready-btn');
  const banner = el<HTMLDivElement>('veillee-banner');
  const gameover = el<HTMLDivElement>('veillee-gameover');
  const synergies = el<HTMLDivElement>('veillee-synergies');
  const unitStats = el<HTMLDivElement>('veillee-unit-stats');

  rerollBtn.addEventListener('click', h.onReroll);
  readyBtn.addEventListener('click', h.onReady);

  el<HTMLDivElement>('veillee-hud').style.display = 'flex'; // reveal the game HUD bar

  return {
    setStats(s) {
      statLevel.textContent = `Niv ${s.level}/10`;
      statGold.textContent = `${s.gold}`;
      statHp.textContent = `${s.hp}`;
      statField.textContent = `${s.fieldUsed}/${s.fieldCap}`;
      statTimer.textContent = fmtTime(s.elapsed);
    },

    renderSynergies(rows) {
      if (rows.length === 0) {
        synergies.style.display = 'none';
        return;
      }
      synergies.style.display = 'flex';
      synergies.innerHTML = rows
        .map((r) => {
          const on = r.tier > 0;
          return (
            `<div class="veillee-syn${on ? ' veillee-syn--on' : ''}">` +
            `<span class="veillee-syn-head"><span>${r.label}</span>` +
            `<span class="veillee-syn-count">${r.count}${r.tier ? `·${r.tier}` : ''}</span></span>` +
            (on ? `<span class="veillee-syn-desc">${r.desc}</span>` : '') +
            `</div>`
          );
        })
        .join('');
    },

    showUnitStats(u) {
      unitStats.innerHTML =
        `<div class="veillee-us-head"><span class="veillee-us-name">${u.name}</span>` +
        `<span class="veillee-us-star">${'★'.repeat(u.star)}</span></div>` +
        `<div class="veillee-us-traits">${u.originLabel} · ${u.roleLabel}</div>` +
        `<div class="veillee-us-grid">` +
        `<span>PV</span><span>${u.hp}</span>` +
        `<span>ATQ</span><span>${u.atk}</span>` +
        `<span>Vitesse</span><span>${u.atkSpeed.toFixed(2)}/s</span>` +
        `<span>Portée</span><span>${u.range.toFixed(1)}</span>` +
        `</div>` +
        `<div class="veillee-us-abil"><strong>${u.abilityLabel}</strong> — ${u.abilityDesc}</div>` +
        (u.fielded ? `<div class="veillee-us-note">stats avec synergies</div>` : '');
      unitStats.style.display = 'flex';
    },

    hideUnitStats() {
      unitStats.style.display = 'none';
    },

    renderShop(shopOffers, gold) {
      rerollBtn.textContent = `Reroll (${ECONOMY.rerollCost})`;
      rerollBtn.disabled = gold < ECONOMY.rerollCost;
      offers.innerHTML = '';
      shopOffers.forEach((offer, i) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'veillee-offer';
        if (!offer) {
          card.classList.add('veillee-offer--empty');
          card.disabled = true;
        } else {
          card.classList.toggle('veillee-offer--poor', gold < offer.cost);
          card.innerHTML =
            `<span class="veillee-offer-name">${heroName(offer.heroId)}</span>` +
            `<span class="veillee-offer-traits">${heroTraits(offer.heroId)}</span>` +
            `<span class="veillee-offer-cost">⬢ ${offer.cost}</span>`;
          card.addEventListener('click', () => h.onBuy(i));
        }
        offers.appendChild(card);
      });
    },

    setShopVisible(v) {
      shop.style.display = v ? 'flex' : 'none';
    },

    setPhaseLabel(text) {
      phase.textContent = text ?? '';
      phase.style.display = text ? 'block' : 'none';
    },

    banner(title, sub) {
      banner.innerHTML = `<strong>${title}</strong><span>${sub}</span>`;
      banner.classList.add('veillee-banner--show');
    },

    hideBanner() {
      banner.classList.remove('veillee-banner--show');
    },

    gameOver(won, b) {
      gameover.innerHTML =
        `<h1>${won ? '🍁 Veillée gagnée' : 'Fin de la veillée'}</h1>` +
        `<div class="veillee-score">` +
        `<div><span>Niveaux</span><span>${b.levels}</span></div>` +
        `<div><span>PV restants</span><span>${b.hp}</span></div>` +
        `<div><span>Or</span><span>${b.gold}</span></div>` +
        `<div><span>Vitesse</span><span>${b.speed}</span></div>` +
        `<div class="veillee-score-total"><span>Score</span><span>${b.total}</span></div>` +
        `</div>` +
        `<button type="button" id="veillee-replay-btn">Rejouer</button>`;
      gameover.style.display = 'flex';
      el<HTMLButtonElement>('veillee-replay-btn').addEventListener('click', h.onReplay);
    },

    hideGameOver() {
      gameover.style.display = 'none';
    },
  };
}
