/** Shared "create fragment" control for Figma and DA block roots in the preview. */
export function appendBlockActionButton(blockEl) {
  if (!blockEl || typeof blockEl.classList === 'undefined') return;
  blockEl.classList.add('has-block-action');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'block-action-btn';
  btn.setAttribute('aria-label', 'Create fragment');
  btn.setAttribute('aria-pressed', 'false');
  const icon = document.createElement('span');
  icon.className = 'block-action-btn-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = '<svg class="block-action-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>';
  btn.appendChild(icon);
  blockEl.appendChild(btn);
}
