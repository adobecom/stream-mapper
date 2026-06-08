/* eslint-disable no-restricted-syntax */

function resolvePersistableImgSrc(img) {
  const daSrc = img.getAttribute('data-stream-original-src')
    || img.getAttribute('data-original-src')
    || img.dataset?.originalSrc
    || '';
  const currentSrc = img.getAttribute('src') || '';

  if (daSrc && !daSrc.startsWith('data:')) return daSrc;
  if (currentSrc && !currentSrc.startsWith('data:')) return currentSrc;
  if (daSrc) return daSrc;
  return '';
}

export function sanitizeMetadataHtmlRoot(root) {
  if (!(root instanceof HTMLElement)) return root;

  root.querySelectorAll('.stream-annotation-metadata-row-delete').forEach((b) => b.remove());

  root.querySelectorAll('p').forEach((p) => {
    [...p.attributes].forEach((attr) => p.removeAttribute(attr.name));
  });

  root.querySelectorAll('picture').forEach((picture) => {
    const img = picture.querySelector('img');
    if (img) {
      const sourceOriginal = picture.querySelector('source')?.getAttribute('data-stream-original-srcset')
        || picture.querySelector('source')?.getAttribute('data-stream-original-src')
        || '';
      const fallbackSrc = `${sourceOriginal}`.split(/[\s,]/).find((part) => part && !part.startsWith('data:'));
      if (fallbackSrc && !img.getAttribute('data-stream-original-src')) {
        img.setAttribute('data-stream-original-src', fallbackSrc);
      }
      picture.replaceWith(img);
    } else {
      picture.remove();
    }
  });

  root.querySelectorAll('img').forEach((img) => {
    const persistSrc = resolvePersistableImgSrc(img);
    if (persistSrc) {
      img.setAttribute('src', persistSrc);
      img.src = persistSrc;
    } else {
      img.removeAttribute('src');
      img.removeAttribute('srcset');
      img.src = '';
    }

    const srcset = img.getAttribute('srcset') || '';
    if (!srcset || srcset.startsWith('data:') || srcset.includes('base64')) {
      img.removeAttribute('srcset');
    }

    [...img.attributes]
      .filter((attr) => attr.name.startsWith('data-'))
      .forEach((attr) => img.removeAttribute(attr.name));
  });

  root.querySelectorAll('source').forEach((s) => s.remove());

  return root;
}

export function sanitizeMetadataBlockHtml(blockEl) {
  if (!(blockEl instanceof HTMLElement)) return '';
  const clone = blockEl.cloneNode(true);
  return sanitizeMetadataHtmlRoot(clone).innerHTML;
}

export function sanitizeMetadataInnerHtml(htmlString) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = htmlString || '';
  return sanitizeMetadataHtmlRoot(wrapper).innerHTML;
}


export async function resolveMetadataImagesForPreview(metadataRoot, resolvePreviewUrl) {
  if (!(metadataRoot instanceof HTMLElement) || typeof resolvePreviewUrl !== 'function') return;
  await Promise.all([...metadataRoot.querySelectorAll('img')].map(async (img) => {
    const originalSrc = img.getAttribute('data-stream-original-src') || img.getAttribute('src') || '';
    if (!originalSrc || originalSrc.startsWith('data:')) return;
    const resolved = await resolvePreviewUrl(originalSrc);
    if (!resolved || resolved === originalSrc) return;
    img.setAttribute('data-stream-original-src', originalSrc);
    img.setAttribute('src', resolved);
    img.removeAttribute('srcset');
    const picture = img.closest('picture');
    if (picture) {
      picture.querySelectorAll('source').forEach((source) => source.remove());
    }
  }));
}

export function restoreMetadataImageUrlsOnLiveDom(metadataRoot) {
  if (!(metadataRoot instanceof HTMLElement)) return;
  metadataRoot.querySelectorAll('img').forEach((img) => {
    const persistSrc = resolvePersistableImgSrc(img);
    if (!persistSrc) return;
    img.setAttribute('src', persistSrc);
    img.src = persistSrc;
    img.removeAttribute('srcset');
    const picture = img.closest('picture');
    if (picture) {
      picture.querySelectorAll('source').forEach((source) => source.remove());
    }
  });
}
