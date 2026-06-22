// Quest chain (Phase 3): a small, ordered onboarding ladder that frames the game
// and teaches the Phase-2 loop one mechanic at a time. Pure data + predicates —
// no Three.js, no DOM. main.ts builds a QuestSnapshot each HUD tick (a plain read
// of current state) and calls tickQuests; the HUD renders the current objective.
import { QUEST_TUNING, type ResourceKind, type BuildingKind } from './config';

export interface QuestSnapshot {
  day: number;
  pop: number;
  popCap: number;
  idle: number;
  counts: Record<ResourceKind, number>;
  buildingsByKind: Record<BuildingKind, number>;
  buildingCount: Record<string, number>; // by building def id
  assignedWorkers: number; // sum of workers on production buildings
}

export interface Quest {
  id: string;
  title: string;
  desc: string;
  done(s: QuestSnapshot): boolean;
}

export interface QuestState {
  index: number;
  completed: string[];
}

// The ladder. Each step nudges the player toward the next mechanic; numeric
// targets live in QUEST_TUNING so the predicates stay magic-number-free.
export const QUESTS: readonly Quest[] = [
  {
    id: 'bucheron',
    title: 'Du bois pour la nuit',
    desc: 'Construis un Bûcheron 🪓 (touche 🔨, choisis-le, pose-le).',
    done: (s) => (s.buildingCount.bucheron ?? 0) >= 1,
  },
  {
    id: 'assign',
    title: 'Mets-les au travail',
    desc: 'Touche un bâtiment et assigne un villageois avec +.',
    done: (s) => s.assignedWorkers >= 1,
  },
  {
    id: 'nourrir',
    title: 'Nourrir le camp',
    desc: 'Construis une Cabane de chasse 🏹 pour la nourriture.',
    done: (s) => (s.buildingCount.chasse ?? 0) >= 1,
  },
  {
    id: 'maison',
    title: 'Accueillir du monde',
    desc: 'Construis une Maison 🏠 pour augmenter la population.',
    done: (s) => (s.buildingCount.maison ?? 0) >= 1,
  },
  {
    id: 'entrepot',
    title: 'Faire des réserves',
    desc: 'Construis un Entrepôt 📦 pour stocker davantage.',
    done: (s) => (s.buildingCount.entrepot ?? 0) >= 1,
  },
  {
    id: 'peuple',
    title: 'Un vrai village',
    desc: `Atteins ${QUEST_TUNING.popTarget} villageois autour du feu.`,
    done: (s) => s.pop >= QUEST_TUNING.popTarget,
  },
  {
    id: 'survivre',
    title: 'Tenir la saison',
    desc: `Garde le feu vivant jusqu'au Jour ${QUEST_TUNING.dayTarget}.`,
    done: (s) => s.day >= QUEST_TUNING.dayTarget,
  },
];

export function createQuestState(): QuestState {
  return { index: 0, completed: [] };
}

export function currentQuest(st: QuestState): Quest | null {
  return QUESTS[st.index] ?? null;
}

export function allDone(st: QuestState): boolean {
  return st.index >= QUESTS.length;
}

/**
 * Advance through any objectives whose predicate is now satisfied. Returns the
 * LAST newly-completed quest (so the caller fires a single toast), or null.
 */
export function tickQuests(st: QuestState, s: QuestSnapshot): Quest | null {
  let justDone: Quest | null = null;
  let q = QUESTS[st.index];
  while (q && q.done(s)) {
    st.completed.push(q.id);
    justDone = q;
    st.index++;
    q = QUESTS[st.index];
  }
  return justDone;
}
