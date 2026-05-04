/** Shared "create fragment" control for Figma and DA block roots in the preview. */
export function appendBlockActionButton(blockEl) {
  if (!blockEl || typeof blockEl.classList === 'undefined') return;
  blockEl.classList.add('has-block-action');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'block-action-btn';
  const inDaColumn = Boolean(blockEl.closest('.da-panel'));
  const tip = inDaColumn
    ? 'Select this DA block for a fragment (click again to undo). Pick consecutive rows in this column only, then use Create fragment.'
    : 'Select this block for a fragment with other consecutive rows in this column.';
  btn.setAttribute('aria-label', inDaColumn ? 'Select DA block for fragment' : 'Select block for fragment');
  btn.title = tip;
  btn.setAttribute('aria-pressed', 'false');
  const icon = document.createElement('span');
  icon.className = 'block-action-btn-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = `
<svg class="block-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <!-- Stacked sheets + centered plus: include this block in a fragment -->
  <rect x="4.5" y="2.75" width="11" height="14" rx="1.75" ry="1.75"/>
  <rect x="7.25" y="5.75" width="11" height="14" rx="1.75" ry="1.75"/>
  <line x1="12.75" y1="10.5" x2="12.75" y2="15.35"/>
  <line x1="10.18" y1="12.92" x2="15.32" y2="12.92"/>
</svg>`;
  btn.appendChild(icon);
  blockEl.appendChild(btn);
}

/**
 * Re-append the fragment control as the last direct child of each block row so it stays above
 * section-delete, late Milo nodes, and full-bleed media in hit-testing order.
 */
export function elevateBlockFragmentControls(panelRoot) {
  if (!(panelRoot instanceof Element)) return;
  panelRoot.querySelectorAll('.has-block-action').forEach((row) => {
    const btn = row.querySelector(':scope > .block-action-btn');
    if (btn) row.appendChild(btn);
  });
}
