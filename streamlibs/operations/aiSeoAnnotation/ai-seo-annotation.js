/* eslint-disable no-console */
import {
  recordTextRegenAsEdit,
  recordImageRegenAsLocalAsset,
} from '../annotation.js';

// eslint-disable-next-line max-len
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
  regenState.hideTimer = setTimeout(hideRegenBtn, 350);
}

function cancelHideRegenBtn() {
  if (regenState.hideTimer) {
    clearTimeout(regenState.hideTimer);
    regenState.hideTimer = null;
  }
}

function ensureRegenButton() {
  if (regenState.btn) return regenState.btn;

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
    const threadId = window.streamConfig?.threadId || '';
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
  const btn = ensureRegenButton();
  if (regenState.target !== el) {
    regenState.target = el;
    const r = el.getBoundingClientRect();
    btn.style.top = `${Math.max(0, r.top - 14)}px`;
    btn.style.left = `${r.right + 4}px`;
  }
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
    if (regenState.target && regenState.target.contains(to)) return;
    scheduleHideRegenBtn();
  });

  window.addEventListener('scroll', hideRegenBtn, { passive: true });
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
  const oh = overlay.offsetHeight || 200;
  const panelEl = document.querySelector('.annotation-panel');
  const panelRect = panelEl?.getBoundingClientRect();
  const maxRight = panelRect ? Math.max(24, panelRect.left - 12) : window.innerWidth - 12;

  let left = r.right + 12;
  if (left + ow > maxRight) left = r.left - ow - 12;
  left = Math.max(12, Math.min(left, maxRight - ow));

  let { top } = r;
  top = Math.max(12, Math.min(top, window.innerHeight - oh - 12));

  overlay.style.left = `${left}px`;
  overlay.style.top = `${top}px`;
}

function ensureImgRegenElements() {
  if (imgRegenState.btn) return;

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
  overlay.innerHTML = '<button class="stream-img-prompt-close" type="button" aria-label="Close">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">'
    + '<path d="M18 6 6 18M6 6l12 12"/>'
    + '</svg></button>'
    + '<label>Describe the new image</label>'
    + '<textarea class="stream-img-prompt-input" placeholder="e.g. a vibrant teal forest at dusk…" rows="3"></textarea>'
    + '<div class="stream-img-prompt-actions">'
    + '<button class="stream-img-prompt-submit" type="button">'
    + '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
    + '<path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74Z"/>'
    + '<path d="M19 15l1.09 2.91L23 19l-2.91 1.09L19 23l-1.09-2.91L15 19l2.91-1.09Z"/>'
    + '</svg>Generate</button>'
    + '</div>';
  document.body.appendChild(overlay);

  overlay.querySelector('.stream-img-prompt-close').addEventListener('click', hideImgPromptOverlay);

  overlay.querySelector('.stream-img-prompt-submit').addEventListener('click', async () => {
    const img = imgRegenState.target;
    if (!img) return;
    const input = overlay.querySelector('.stream-img-prompt-input');
    const prompt = input.value.trim();
    if (!prompt) { input.focus(); return; }

    const submitBtn = overlay.querySelector('.stream-img-prompt-submit');
    submitBtn.disabled = true;
    submitBtn.lastChild.textContent = 'Generating…';

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
      submitBtn.lastChild.textContent = 'Generate';
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
  const { overlay } = imgRegenState;
  overlay.classList.add('stream-img-prompt-visible');
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
  const { btn } = imgRegenState;
  const r = img.getBoundingClientRect();
  btn.style.top = `${Math.max(0, r.top - 14)}px`;
  btn.style.left = `${r.right + 4}px`;
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

  window.addEventListener('scroll', () => {
    hideImgRegenBtn();
    hideImgPromptOverlay();
  }, { passive: true });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export default function attachRegenHandlers() {
  attachContentRegenHandlers();
  attachImageRegenHandlers();
}
