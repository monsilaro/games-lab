import { renderForge } from './forge/forgePage';
import { startGame } from './game/run';

declare const __BUILD_INFO__: string;

const stamp = document.getElementById('veillee-build-stamp');
if (stamp) stamp.textContent = __BUILD_INFO__;

// ?forge=1 → the Phase 1 hero gallery; otherwise the game.
if (new URLSearchParams(location.search).has('forge')) {
  renderForge();
} else {
  startGame();
}
