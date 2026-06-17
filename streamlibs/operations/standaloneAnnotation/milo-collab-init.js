/* eslint-disable no-console */
import { CONFIG } from '../../utils/config.js';
import { getMapperEnv, initializeTokens } from '../../utils/utils.js';
import {
  resetTargetHtmlInStore,
  resetPreviewHtmlInStore,
  resetEditChangesInStore,
} from '../../store/store.js';
import { initializeLoader } from '../../utils/loader.js';
import { initiatePreviewer, setupMessageListener } from '../../previewer.js';
import { setupBlockActionModal } from '../../utils/block-action-modal.js';

(async function initMiloCollab() {
  const params = new URLSearchParams(window.location.search);

  const collabId = params.get('miloCollabId');
  if (collabId) {
    const env = getMapperEnv();
    const { host, pathname } = window.location;
    if (host.includes('.aem.')) return;
    const repo = host.split('--')[1];
    const pageUrl = `adobecom/${repo}/${pathname}`;
    let filename = pathname.split('/');
    filename = filename[filename.length - 1];
    const draftLocation = `adobecom/${repo}/drafts/collab/${collabId}/${filename}`;
    window.streamConfig = {
      streamMapper: { ...CONFIG[env].streamMapper },
      figmaServiceRetry: CONFIG.figmaServiceRetry,
      source: 'da',
      contentUrl: draftLocation,
      target: 'da',
      targetUrl: pageUrl,
      pageUrl,
      token: window.adobeIMS.getAccessToken().token,
      profileId: '3',
      collabId: params.get('miloCollabId'),
      operation: 'standaloneAnnotation',
      username: params.get('username') || null,
      reviewId: params.get('miloCollabId'),
      collabRole: 'owner',
      draftLocation,
    };

    resetTargetHtmlInStore();
    resetPreviewHtmlInStore();
    resetEditChangesInStore();
    initializeLoader();
    await initializeTokens(window.streamConfig.token);
    await initiatePreviewer();
    setupBlockActionModal();
    await setupMessageListener();
    return;
  }

  const API_ENDPOINT = 'https://adobe-acom-stream-service-deploy-ethos502-prod-or2-1de07c.cloud.adobe.io/api';
  const token =
    params.get('token') || localStorage.getItem('stream_token');

  if (!token) {
    console.error('[milo-collab-init] No auth token found.');
    return;
  }

  const collabData = {
    title: document.title || 'Untitled Collab',
    pageUrl: window.location.href,
  };

  try {
    const res = await fetch(`${API_ENDPOINT}/collabs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(collabData),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error || `HTTP ${res.status}`);
    }

    const { id } = await res.json();
    if (!id) throw new Error('No collab id in response');

    params.set('miloCollabId', id);
    window.location.search = params.toString();
  } catch (err) {
    console.error('[milo-collab-init] Failed to create collab:', err);
  }
}());
