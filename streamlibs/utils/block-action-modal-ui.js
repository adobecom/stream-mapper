/**
 * Injects block selection bar, toast, and fragment modal into the preview document.
 * Markup lives next to block-action-modal.js instead of preview.html.
 */
export function mountBlockActionUi() {
  if (document.getElementById('block-action-modal')) return;

  const html = `
    <div id="block-selection-bar" class="block-selection-bar" hidden>
      <div class="block-selection-bar-text">
        <span id="block-selection-count" class="block-selection-count">1 block selected</span>
        <p id="block-selection-subline" class="block-selection-subline" hidden></p>
      </div>
      <div class="block-selection-bar-actions">
        <button type="button" id="block-selection-create" class="block-selection-create">Create fragment</button>
        <button type="button" id="block-selection-clear" class="block-selection-clear">Clear</button>
      </div>
    </div>
    <div id="block-selection-toast" class="block-selection-toast" hidden></div>
    <div
      id="block-action-modal"
      class="block-action-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="block-action-modal-title"
      hidden
    >
      <div
        id="block-action-modal-backdrop"
        class="block-action-modal-backdrop"
        aria-hidden="true"
      ></div>
      <div class="block-action-modal-panel">
        <button
          type="button"
          id="block-action-modal-close"
          class="block-action-modal-close"
          aria-label="Close"
        >
          <span class="block-action-modal-close-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></span>
        </button>
        <h2 id="block-action-modal-title" class="block-action-modal-title">Create fragment</h2>
        <div id="block-action-modal-body" class="block-action-modal-body block-action-modal-state" data-state="form">
          <p class="block-action-modal-intro">
            The blocks you selected in the DA column will be merged into one fragment. Choose where to save it in DA,
            then the page preview will swap that range for the fragment embed.
          </p>
          <label for="block-action-modal-path" class="block-action-modal-label">Fragment folder path</label>
          <input
            type="text"
            id="block-action-modal-path"
            class="block-action-modal-input block-action-modal-input--compact"
            name="fragment-path"
            placeholder="https://da.live/#/org/repo/drafts/… or org/repo/drafts/…"
            autocomplete="off"
          />
          <label for="block-action-modal-name" class="block-action-modal-label">Fragment name</label>
          <input
            type="text"
            id="block-action-modal-name"
            class="block-action-modal-input"
            name="fragment-name"
            placeholder="e.g. my-fragment"
            autocomplete="off"
          />
          <p id="block-action-modal-error" class="block-action-modal-error" role="alert" hidden></p>
          <div class="block-action-modal-actions">
            <button type="button" id="block-action-modal-create" class="block-action-modal-primary">
              Create fragment
            </button>
            <button type="button" id="block-action-modal-use-existing" class="block-action-modal-secondary">
              Use Existing Fragment
            </button>
          </div>
        </div>
        <div id="block-action-modal-progress" class="block-action-modal-progress block-action-modal-state" data-state="progress" hidden>
          <p class="block-action-modal-progress-text">Creating fragment…</p>
          <div class="block-action-modal-progress-track">
            <div id="block-action-modal-progress-fill" class="block-action-modal-progress-fill"></div>
          </div>
        </div>
        <div id="block-action-modal-replaced" class="block-action-modal-replaced block-action-modal-state" data-state="replaced" hidden>
          <div class="block-action-modal-success-icon" aria-hidden="true">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          </div>
          <p class="block-action-modal-success-text">Fragment replaced.</p>
          <div class="block-action-modal-actions">
            <button type="button" id="block-action-modal-close-replaced" class="block-action-modal-primary">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  `.trim();

  document.body.insertAdjacentHTML('beforeend', html);
}
