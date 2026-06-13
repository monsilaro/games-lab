// ---------------------------------------------------------------------------
// The 10 scripted enemy compositions (data, not procedural). Rising difficulty:
// more units, higher stars, tankier front lines as the run goes on.
// `col`/`row` index the enemy 4x4 (row 0 = front line, nearest the player).
// heroId must match src/forge/heroes.ts; stats come from src/config/units.ts.
// ---------------------------------------------------------------------------

export interface EnemyPlacement {
  heroId: string;
  star: 1 | 2 | 3;
  col: number; // 0..3
  row: number; // 0..3 (0 = front line)
}

export const LEVELS: EnemyPlacement[][] = [
  // 1 — a gentle pair
  [
    { heroId: 'carcajou', star: 1, col: 1, row: 1 },
    { heroId: 'lutin', star: 1, col: 2, row: 1 },
  ],
  // 2 — a front liner shows up
  [
    { heroId: 'draveur', star: 1, col: 1, row: 0 },
    { heroId: 'lutin', star: 1, col: 1, row: 2 },
    { heroId: 'carcajou', star: 1, col: 2, row: 1 },
  ],
  // 3 — a back-line shooter
  [
    { heroId: 'draveur', star: 1, col: 1, row: 0 },
    { heroId: 'carcajou', star: 1, col: 2, row: 0 },
    { heroId: 'coureur-des-bois', star: 1, col: 2, row: 2 },
    { heroId: 'lutin', star: 1, col: 1, row: 2 },
  ],
  // 4 — first ★2 + a caster
  [
    { heroId: 'draveur', star: 1, col: 1, row: 0 },
    { heroId: 'draveur', star: 1, col: 2, row: 0 },
    { heroId: 'carcajou', star: 2, col: 2, row: 1 },
    { heroId: 'coureur-des-bois', star: 1, col: 1, row: 2 },
    { heroId: 'feu-follet', star: 1, col: 2, row: 2 },
  ],
  // 5 — a bruiser leads
  [
    { heroId: 'loup-garou', star: 1, col: 1, row: 0 },
    { heroId: 'draveur', star: 1, col: 2, row: 0 },
    { heroId: 'coureur-des-bois', star: 2, col: 1, row: 2 },
    { heroId: 'lutin', star: 2, col: 2, row: 2 },
    { heroId: 'dame-blanche', star: 1, col: 0, row: 3 },
  ],
  // 6 — two tanks + a healer
  [
    { heroId: 'bucheron', star: 2, col: 1, row: 0 },
    { heroId: 'windigo', star: 1, col: 2, row: 0 },
    { heroId: 'coureur-des-bois', star: 2, col: 1, row: 2 },
    { heroId: 'feu-follet', star: 2, col: 2, row: 2 },
    { heroId: 'chasse-galerie', star: 1, col: 0, row: 1 },
    { heroId: 'dame-blanche', star: 1, col: 3, row: 3 },
  ],
  // 7 — a full front line + double back-line casters (8)
  [
    { heroId: 'bucheron', star: 2, col: 1, row: 0 },
    { heroId: 'loup-garou', star: 2, col: 2, row: 0 },
    { heroId: 'windigo', star: 2, col: 0, row: 0 },
    { heroId: 'draveur', star: 2, col: 3, row: 0 },
    { heroId: 'la-corriveau', star: 2, col: 1, row: 3 },
    { heroId: 'coureur-des-bois', star: 2, col: 2, row: 3 },
    { heroId: 'dame-blanche', star: 2, col: 0, row: 2 },
    { heroId: 'feu-follet', star: 2, col: 3, row: 2 },
  ],
  // 8 — two rows of bruisers + ★3 carries (10)
  [
    { heroId: 'windigo', star: 3, col: 1, row: 0 },
    { heroId: 'bucheron', star: 3, col: 2, row: 0 },
    { heroId: 'loup-garou', star: 2, col: 0, row: 0 },
    { heroId: 'draveur', star: 2, col: 3, row: 0 },
    { heroId: 'carcajou', star: 2, col: 1, row: 1 },
    { heroId: 'loup-garou', star: 2, col: 2, row: 1 },
    { heroId: 'la-corriveau', star: 2, col: 1, row: 3 },
    { heroId: 'coureur-des-bois', star: 3, col: 2, row: 3 },
    { heroId: 'dame-blanche', star: 2, col: 0, row: 3 },
    { heroId: 'feu-follet', star: 3, col: 3, row: 3 },
  ],
  // 9 — a wall of ★3 bruisers, healer-backed (11)
  [
    { heroId: 'windigo', star: 3, col: 1, row: 0 },
    { heroId: 'bucheron', star: 3, col: 2, row: 0 },
    { heroId: 'loup-garou', star: 3, col: 0, row: 0 },
    { heroId: 'draveur', star: 3, col: 3, row: 0 },
    { heroId: 'carcajou', star: 3, col: 1, row: 1 },
    { heroId: 'windigo', star: 2, col: 2, row: 1 },
    { heroId: 'la-corriveau', star: 3, col: 1, row: 3 },
    { heroId: 'coureur-des-bois', star: 3, col: 2, row: 3 },
    { heroId: 'dame-blanche', star: 3, col: 0, row: 3 },
    { heroId: 'dame-blanche', star: 2, col: 3, row: 2 },
    { heroId: 'feu-follet', star: 3, col: 3, row: 3 },
  ],
  // 10 — the final veillée: a near-full ★3 board (10), crackable by a great comp
  [
    { heroId: 'windigo', star: 3, col: 1, row: 0 },
    { heroId: 'loup-garou', star: 3, col: 2, row: 0 },
    { heroId: 'bucheron', star: 3, col: 0, row: 0 },
    { heroId: 'draveur', star: 3, col: 3, row: 0 },
    { heroId: 'windigo', star: 3, col: 1, row: 1 },
    { heroId: 'loup-garou', star: 3, col: 2, row: 1 },
    { heroId: 'la-corriveau', star: 3, col: 1, row: 3 },
    { heroId: 'coureur-des-bois', star: 3, col: 2, row: 3 },
    { heroId: 'dame-blanche', star: 3, col: 0, row: 3 },
    { heroId: 'feu-follet', star: 3, col: 3, row: 3 },
  ],
];
