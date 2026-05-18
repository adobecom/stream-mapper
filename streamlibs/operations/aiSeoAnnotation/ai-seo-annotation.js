/* eslint-disable no-console */
import {
  annotationOperation,
  recordTextRegenAsEdit,
  recordImageRegenAsLocalAsset,
} from '../annotation.js';

// ---------------------------------------------------------------------------
// Content (text) regeneration
// ---------------------------------------------------------------------------

const CONTENT_REGEN_STYLES = `
.stream-regen-btn {
  position: fixed;
  display: none;
  align-items: center;
  justify-content: center;
  width: 28px; height: 28px;
  border-radius: 50%;
  background: #1473e6;
  border: none;
  cursor: pointer;
  z-index: 2147483500;
  box-shadow: 0 2px 6px rgba(0,0,0,0.3);
  padding: 0;
  transition: transform 0.1s, background 0.15s;
}
.stream-regen-btn:hover { transform: scale(1.12); background: #0d66d0; }
.stream-regen-btn.stream-regen-visible { display: flex; }
.stream-regen-btn.stream-regen-loading { background: #888; cursor: wait; pointer-events: none; }
.stream-regen-btn svg { width: 15px; height: 15px; fill: #fff; }
`;

// eslint-disable-next-line max-len
/** Walk up from el to find the first ancestor directly inside a .section div; return its first class. */
function getBlockName(el) {
  let cur = el;
  while (cur && cur !== document.body) {
    const parent = cur.parentElement;
    if (parent && parent.classList.contains('section')) {
      return cur.classList[0] || '';
    }
    cur = parent;
  }
  return '';
}

function getRegenEndpoint() {
  return `${window.streamConfig?.streamMapper?.serviceEP || ''}/api/content-regeneration`;
}

const regenState = {
  btn: null,
  target: null,
  hideTimer: null,
};

function hideRegenBtn() {
  regenState.hideTimer = null;
  if (regenState.btn) regenState.btn.classList.remove('stream-regen-visible');
  regenState.target = null;
}

function scheduleHideRegenBtn() {
  regenState.hideTimer = setTimeout(hideRegenBtn, 180);
}

function cancelHideRegenBtn() {
  if (regenState.hideTimer) {
    clearTimeout(regenState.hideTimer);
    regenState.hideTimer = null;
  }
}

function ensureRegenButton() {
  if (regenState.btn) return regenState.btn;

  const style = document.createElement('style');
  style.id = 'stream-regen-inline-styles';
  style.textContent = CONTENT_REGEN_STYLES;
  document.head.appendChild(style);

  const btn = document.createElement('button');
  btn.className = 'stream-regen-btn';
  btn.title = 'Regenerate content';
  btn.setAttribute('aria-label', 'Regenerate content');
  btn.innerHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">'
    + '<path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74Z"/>'
    + '<path d="M19 15l1.09 2.91L23 19l-2.91 1.09L19 23l-1.09-2.91L15 19l2.91-1.09Z"/>'
    + '</svg>';
  document.body.appendChild(btn);

  btn.addEventListener('mouseenter', cancelHideRegenBtn);
  btn.addEventListener('mouseleave', scheduleHideRegenBtn);

  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const el = regenState.target;
    if (!el || btn.classList.contains('stream-regen-loading')) return;

    const text = el.textContent.trim();
    if (!text) return;

    const block = getBlockName(el);
    const threadId = new URLSearchParams(window.location.search).get('thread_id') || '';
    const token = (window.streamConfig && window.streamConfig.token) || '';
    const endpoint = getRegenEndpoint();

    btn.classList.add('stream-regen-loading');
    btn.title = 'Regenerating…';

    const fromHtml = el.innerHTML;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text, block, thread_id: threadId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const newText = json?.response?.text || json.text || json.content || json.result || '';
      if (newText && el.isConnected) {
        el.textContent = newText;
        recordTextRegenAsEdit(el, text, newText, fromHtml);
      }
    } catch (err) {
      console.error('[ai-seo-annotation] content-regeneration failed', err);
    } finally {
      btn.classList.remove('stream-regen-loading');
      btn.title = 'Regenerate content';
      hideRegenBtn();
    }
  });

  regenState.btn = btn;
  return btn;
}

function showRegenBtn(el) {
  const op = window.streamConfig?.operation;
  if (op !== 'aiSeoAnnotation') return;
  if (!document.body.classList.contains('annotation-inline-edit-mode')) return;
  cancelHideRegenBtn();
  regenState.target = el;
  const btn = ensureRegenButton();
  const r = el.getBoundingClientRect();
  // Anchor to the top-right corner of the hovered element, slightly inset
  btn.style.top = `${Math.max(4, r.top + 2)}px`;
  btn.style.left = `${r.right - 32}px`;
  btn.classList.add('stream-regen-visible');
}

function attachContentRegenHandlers() {
  const main = document.querySelector('main');
  if (!main) return;

  const TEXT_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th';

  main.addEventListener('mouseover', (e) => {
    const el = e.target.closest(TEXT_SELECTOR);
    if (!el || !el.textContent.trim()) return;
    showRegenBtn(el);
  });

  main.addEventListener('mouseout', (e) => {
    const to = e.relatedTarget;
    if (regenState.btn && (to === regenState.btn || regenState.btn.contains(to))) return;
    // Ignore child-to-child transitions within the same text element
    if (regenState.target && regenState.target.contains(to)) return;
    scheduleHideRegenBtn();
  });

  // Hide on scroll so the button doesn't drift from its target
  window.addEventListener('scroll', hideRegenBtn, { passive: true });
}

// ---------------------------------------------------------------------------
// Image regeneration
// ---------------------------------------------------------------------------

const IMAGE_REGEN_STYLES = `
.stream-img-regen-btn {
  position: fixed;
  display: none;
  align-items: center;
  justify-content: center;
  width: 32px; height: 32px;
  border-radius: 50%;
  background: #1473e6;
  border: none;
  cursor: pointer;
  z-index: 2147483500;
  box-shadow: 0 2px 8px rgba(0,0,0,0.35);
  padding: 0;
  transition: transform 0.1s, background 0.15s;
}
.stream-img-regen-btn:hover { transform: scale(1.1); background: #0d66d0; }
.stream-img-regen-btn.stream-img-regen-visible { display: flex; }
.stream-img-regen-btn svg { width: 16px; height: 16px; fill: #fff; }

.stream-img-prompt-overlay {
  position: fixed;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 6px 24px rgba(0,0,0,0.22);
  padding: 14px 16px;
  z-index: 2147483600;
  display: none;
  flex-direction: column;
  gap: 10px;
  width: 300px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.stream-img-prompt-overlay.stream-img-prompt-visible { display: flex; }
.stream-img-prompt-overlay label { font-size: 13px; font-weight: 600; color: #222; margin: 0; }
.stream-img-prompt-input {
  border: 1px solid #ccc; border-radius: 6px; padding: 8px 10px;
  font-size: 13px; resize: vertical; min-height: 64px;
  outline: none; font-family: inherit; color: #222;
  line-height: 1.4;
}
.stream-img-prompt-input:focus { border-color: #1473e6; }
.stream-img-prompt-actions { display: flex; gap: 8px; justify-content: flex-end; }
.stream-img-prompt-cancel {
  padding: 6px 14px; border-radius: 6px; border: 1px solid #ccc;
  background: #fff; cursor: pointer; font-size: 13px; color: #555;
}
.stream-img-prompt-cancel:hover { background: #f4f4f4; }
.stream-img-prompt-submit {
  padding: 6px 14px; border-radius: 6px; border: none;
  background: #1473e6; color: #fff; cursor: pointer; font-size: 13px; font-weight: 600;
}
.stream-img-prompt-submit:hover:not(:disabled) { background: #0d66d0; }
.stream-img-prompt-submit:disabled { background: #888; cursor: wait; }
`;

// eslint-disable-next-line no-unused-vars
function restoreRegenImages() {
  document.querySelectorAll('img[data-regen-src]').forEach((img) => {
    img.src = img.dataset.regenSrc;
    delete img.dataset.regenSrc;
    const picture = img.closest('picture');
    if (picture) {
      picture.querySelectorAll('source[data-regen-srcset]').forEach((src) => {
        src.srcset = src.dataset.regenSrcset;
        delete src.dataset.regenSrcset;
      });
    }
  });
}

function getImageRegenEndpoint() {
  return `${window.streamConfig?.streamMapper?.serviceEP || ''}/api/image-generation`;
}

const imgRegenState = {
  btn: null,
  overlay: null,
  target: null,
  hideTimer: null,
};

function hideImgRegenBtn() {
  imgRegenState.hideTimer = null;
  if (imgRegenState.btn) imgRegenState.btn.classList.remove('stream-img-regen-visible');
  if (!imgRegenState.overlay?.classList.contains('stream-img-prompt-visible')) {
    imgRegenState.target = null;
  }
}

function scheduleHideImgRegenBtn() {
  imgRegenState.hideTimer = setTimeout(hideImgRegenBtn, 200);
}

function cancelHideImgRegenBtn() {
  if (imgRegenState.hideTimer) {
    clearTimeout(imgRegenState.hideTimer);
    imgRegenState.hideTimer = null;
  }
}

function hideImgPromptOverlay() {
  if (imgRegenState.overlay) {
    imgRegenState.overlay.classList.remove('stream-img-prompt-visible');
    const input = imgRegenState.overlay.querySelector('.stream-img-prompt-input');
    if (input) input.value = '';
  }
  imgRegenState.target = null;
}

function positionOverlayNearImage(overlay, img) {
  const r = img.getBoundingClientRect();
  const ow = overlay.offsetWidth || 300;
  const oh = overlay.offsetHeight || 160;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = r.left + (r.width - ow) / 2;
  let top = r.top + (r.height - oh) / 2;

  left = Math.max(8, Math.min(left, vw - ow - 8));
  top = Math.max(8, Math.min(top, vh - oh - 8));

  overlay.style.left = `${left}px`;
  overlay.style.top = `${top}px`;
}

function ensureImgRegenElements() {
  if (imgRegenState.btn) return;

  const style = document.createElement('style');
  style.id = 'stream-img-regen-styles';
  style.textContent = IMAGE_REGEN_STYLES;
  document.head.appendChild(style);

  // Floating icon button
  const btn = document.createElement('button');
  btn.className = 'stream-img-regen-btn';
  btn.title = 'Regenerate image';
  btn.setAttribute('aria-label', 'Regenerate image');
  // Sparkle / generate icon
  btn.innerHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">'
    + '<path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74Z"/>'
    + '<path d="M19 15l1.09 2.91L23 19l-2.91 1.09L19 23l-1.09-2.91L15 19l2.91-1.09Z"/>'
    + '</svg>';
  document.body.appendChild(btn);

  btn.addEventListener('mouseenter', cancelHideImgRegenBtn);
  btn.addEventListener('mouseleave', scheduleHideImgRegenBtn);

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const img = imgRegenState.target;
    if (!img) return;
    btn.classList.remove('stream-img-regen-visible');
    // eslint-disable-next-line no-use-before-define
    openImgPromptOverlay(img);
  });

  // Prompt overlay
  const overlay = document.createElement('div');
  overlay.className = 'stream-img-prompt-overlay';
  overlay.innerHTML = '<label>Describe the new image</label>'
    + '<textarea class="stream-img-prompt-input" placeholder="e.g. a vibrant teal forest at dusk…" rows="3"></textarea>'
    + '<div class="stream-img-prompt-actions">'
    + '<button class="stream-img-prompt-cancel" type="button">Cancel</button>'
    + '<button class="stream-img-prompt-submit" type="button">Generate</button>'
    + '</div>';
  document.body.appendChild(overlay);

  overlay.querySelector('.stream-img-prompt-cancel').addEventListener('click', hideImgPromptOverlay);

  overlay.querySelector('.stream-img-prompt-submit').addEventListener('click', async () => {
    const img = imgRegenState.target;
    if (!img) return;
    const input = overlay.querySelector('.stream-img-prompt-input');
    const prompt = input.value.trim();
    if (!prompt) { input.focus(); return; }

    const submitBtn = overlay.querySelector('.stream-img-prompt-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Generating…';

    try {
      const token = (window.streamConfig && window.streamConfig.token) || '';
      const res = await fetch(getImageRegenEndpoint(), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const newUrl = json?.response?.imageUrl || json?.response?.url || json.url || json.image_url || json.imageUrl || '';
      if (newUrl && img.isConnected) {
        await recordImageRegenAsLocalAsset(img, newUrl);
      }
    } catch (err) {
      console.error('[ai-seo-annotation] image-generation failed', err);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Generate';
      hideImgPromptOverlay();
    }
  });

  overlay.querySelector('.stream-img-prompt-input').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideImgPromptOverlay();
  });

  imgRegenState.btn = btn;
  imgRegenState.overlay = overlay;
}

function openImgPromptOverlay(img) {
  ensureImgRegenElements();
  imgRegenState.target = img;
  const overlay = imgRegenState.overlay;
  overlay.classList.add('stream-img-prompt-visible');
  // Position after making visible so offsetWidth/Height are available
  requestAnimationFrame(() => {
    positionOverlayNearImage(overlay, img);
    overlay.querySelector('.stream-img-prompt-input').focus();
  });
}

function showImgRegenBtn(img) {
  const op = window.streamConfig?.operation;
  if (op !== 'aiSeoAnnotation') return;
  if (!document.body.classList.contains('annotation-asset-select-mode')) return;
  ensureImgRegenElements();
  cancelHideImgRegenBtn();
  imgRegenState.target = img;
  const btn = imgRegenState.btn;
  const r = img.getBoundingClientRect();
  btn.style.top = `${Math.max(4, r.top + 6)}px`;
  btn.style.left = `${r.right - 38}px`;
  btn.classList.add('stream-img-regen-visible');
}

function attachImageRegenHandlers() {
  const main = document.querySelector('main');
  if (!main) return;

  main.addEventListener('mouseover', (e) => {
    const img = e.target.closest('img');
    if (!img) return;
    if (imgRegenState.overlay?.classList.contains('stream-img-prompt-visible')) return;
    showImgRegenBtn(img);
  });

  main.addEventListener('mouseout', (e) => {
    const to = e.relatedTarget;
    if (imgRegenState.overlay?.classList.contains('stream-img-prompt-visible')) return;
    if (imgRegenState.btn && (to === imgRegenState.btn || imgRegenState.btn.contains(to))) return;
    scheduleHideImgRegenBtn();
  });

  // Close overlay on outside click
  document.addEventListener('click', (e) => {
    if (!imgRegenState.overlay?.classList.contains('stream-img-prompt-visible')) return;
    if (!imgRegenState.overlay.contains(e.target)) hideImgPromptOverlay();
  }, true);

  window.addEventListener('scroll', () => {
    hideImgRegenBtn();
    hideImgPromptOverlay();
  }, { passive: true });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Attaches both text and image regen handlers to <main>.
 */
export function attachRegenHandlers() {
  attachContentRegenHandlers();
  attachImageRegenHandlers();
}

/**
 * Full aiSeoAnnotation operation: runs annotation then wires regen UI.
 */
export async function aiSeoAnnotationOperation() {
  await annotationOperation();
  attachRegenHandlers();
}
