import { renderForge } from './forge/forgePage';

declare const __BUILD_INFO__: string;

const stamp = document.getElementById('veillee-build-stamp');
if (stamp) stamp.textContent = __BUILD_INFO__;

// Phase 1 ships only the Hero Forge. The battle game arrives in Phase 2; until
// then the default page is a placeholder that links into the forge.
if (new URLSearchParams(location.search).has('forge')) {
  document.getElementById('veillee-placeholder')?.remove();
  renderForge();
} else {
  const el = document.getElementById('veillee-placeholder');
  if (el) el.style.display = 'flex';
}
