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


function loadCssFiles(filePath) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = filePath;
  link.dataset.streamMapperStyles = '';
  document.head.appendChild(link);
}

async function startAnnotation() {
    const params = new URLSearchParams(window.location.search);
    loadCssFiles('https://standaloneAnnotation--stream-mapper--adobecom.aem.live/streamlibs/styles/styles.css');
    const env = getMapperEnv();
    const collabId = params.get('miloCollabId');
    const { host, pathname } = window.location;
    if (!host.includes('.aem.')) return;
    const repo = host.split('--')[1];
    const pageUrl = `adobecom/${repo}${pathname}`;
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
      token: params.get('token') || window.adobeIMS.getAccessToken().token,
      profileId: '3',
      collabId: params.get('miloCollabId'),
      operation: 'aiSeoAnnotation',
      username: params.get('username') || null,
      reviewId: params.get('miloCollabId'),
      collabRole: 'owner',
      draftLocation: pageUrl,
    };

    resetTargetHtmlInStore();
    resetPreviewHtmlInStore();
    resetEditChangesInStore();
    initializeLoader();
    await initializeTokens(window.streamConfig.token);
    await initiatePreviewer();
    setupBlockActionModal();
    await setupMessageListener();
}

(async function initMiloCollab() {
  const params = new URLSearchParams(window.location.search);

  const collabId = params.get('miloCollabId');
  if (collabId) {
    await startAnnotation();
    return;
  }

  const API_ENDPOINT = 'https://adobe-acom-stream-service-deploy-ethos502-prod-or2-1de07c.cloud.adobe.io/api';
  const token = params.get('token') || window.adobeIMS.getAccessToken().token;

  if (!token) {
    console.error('[milo-collab-init] No auth token found.');
    return;
  }

  const collabData = {
    title: document.title || 'Standalone Collab',
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
    await startAnnotation();
  } catch (err) {
    console.error('[milo-collab-init] Failed to create collab:', err);
  }
}());
