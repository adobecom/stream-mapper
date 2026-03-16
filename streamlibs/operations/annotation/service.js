import { getConfig } from '../../utils/utils.js';
import { DEFAULT_USERNAME, normalizeCommentStatus } from './store.js';

const SERVICE_STATUS_BY_COMMENT_STATUS = {
  Open: 'open',
  Resolved: 'resolved',
  Closed: 'closed',
  Complete: 'resolved',
};

const COMMENT_STATUS_BY_SERVICE_STATUS = {
  open: 'Open',
  resolved: 'Resolved',
  closed: 'Closed',
};

function normalizeToken(token) {
  const value = `${token || ''}`.trim();
  if (!value) return '';
  return value.startsWith('Bearer ') ? value : `Bearer ${value}`;
}

function normalizeAnchorElementPath(elementPath) {
  if (!elementPath) return null;
  if (typeof elementPath === 'object') {
    return elementPath;
  }
  try {
    const parsed = JSON.parse(elementPath);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (error) {
    // Ignore legacy plain-string paths.
  }
  return {
    selector: `${elementPath || ''}`,
  };
}

function getAnnotationCollabId() {
  const collabId = window.streamConfig?.collabId;
  return `${collabId || ''}`.trim();
}

function sortComments(comments = []) {
  return [...comments].sort((left, right) => {
    const leftValue = new Date(left?.createdAt || 0).getTime();
    const rightValue = new Date(right?.createdAt || 0).getTime();
    return leftValue - rightValue;
  });
}

function normalizeThreadPayload(thread) {
  const comments = sortComments(thread?.comments || []);
  const rootComment = comments.find((comment) => !comment?.parentCommentId) || comments[0] || null;
  const rootCommentId = rootComment?.id || '';
  const isEditThread = Boolean(thread?.anchor?.isEdit);

  return {
    id: thread?.id || '',
    threadType: isEditThread ? 'edit' : 'comment',
    elementPath: thread?.anchor?.elementPath || '',
    elementRef: '',
    status: normalizeCommentStatus(COMMENT_STATUS_BY_SERVICE_STATUS[thread?.state] || ''),
    username: rootComment?.authorName || DEFAULT_USERNAME,
    messages: comments.map((comment) => ({
      id: comment.id || '',
      username: comment.authorName || DEFAULT_USERNAME,
      text: comment.body || '',
      kind: comment.id === rootCommentId ? 'comment' : 'reply',
      replyToCommentId: comment.id === rootCommentId ? '' : (comment.parentCommentId || rootCommentId),
      createdAt: comment.createdAt || null,
      editedAt: comment.editedAt || null,
    })),
  };
}

async function annotationServiceFetch(path, options = {}) {
  const config = await getConfig();
  const serviceEndpoint = `${config?.streamMapper?.serviceEP || ''}`.trim();
  const collabId = getAnnotationCollabId();
  if (!serviceEndpoint || !collabId) return null;

  const headers = {
    ...(options.headers || {}),
  };
  const token = normalizeToken(window.streamConfig?.token);
  if (token) headers.Authorization = token;
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${serviceEndpoint}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new Error(`Annotation service request failed: ${response.status}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

export default function createAnnotationServiceClient() {
  async function getThread(threadId) {
    if (!threadId) return null;
    const data = await annotationServiceFetch(`/api/threads/${encodeURIComponent(threadId)}`);
    return data ? normalizeThreadPayload(data) : null;
  }

  async function listThreads() {
    const collabId = getAnnotationCollabId();
    if (!collabId) return null;
    const data = await annotationServiceFetch(`/api/collabs/${encodeURIComponent(collabId)}/threads`);
    if (!Array.isArray(data)) return [];
    return data.map(normalizeThreadPayload).filter((thread) => thread.id);
  }

  async function createThread({
    elementPath,
    body,
    quotedText = null,
    threadType = 'comment',
  }) {
    const collabId = getAnnotationCollabId();
    if (!collabId) return null;
    const data = await annotationServiceFetch(`/api/collabs/${encodeURIComponent(collabId)}/threads`, {
      method: 'POST',
      body: JSON.stringify({
        anchor: {
          elementPath: normalizeAnchorElementPath(elementPath),
          isEdit: threadType === 'edit',
        },
        quotedText,
        body,
      }),
    });
    return data ? normalizeThreadPayload(data) : null;
  }

  async function createReply(threadId, body) {
    const collabId = getAnnotationCollabId();
    if (!collabId || !threadId) return null;
    await annotationServiceFetch(
      `/api/collabs/${encodeURIComponent(collabId)}/threads/${encodeURIComponent(threadId)}/comments`,
      {
        method: 'POST',
        body: JSON.stringify({
          body,
        }),
      },
    );
    return getThread(threadId);
  }

  async function updateThreadStatus(threadId, status) {
    if (!threadId) return null;
    const nextState = SERVICE_STATUS_BY_COMMENT_STATUS[normalizeCommentStatus(status)] || 'open';
    const data = await annotationServiceFetch(`/api/threads/${encodeURIComponent(threadId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: nextState }),
    });
    return data ? normalizeThreadPayload(data) : null;
  }

  return {
    createReply,
    createThread,
    listThreads,
    updateThreadStatus,
  };
}
