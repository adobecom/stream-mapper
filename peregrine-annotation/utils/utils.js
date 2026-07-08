export const [setLibs, getLibs] = (() => {
  let libs;
  return [
    (prodLibs, location) => {
      libs = (() => {
        const { hostname, search } = location || window.location;
        if (!(hostname.includes('.aem.') || hostname.includes('local'))) return prodLibs;
        const branch = new URLSearchParams(search).get('milolibs') || 'main';
        if (!/^[a-zA-Z0-9_-]+$/.test(branch)) throw new Error('Invalid branch name.');
        if (branch === 'local') return 'http://localhost:6456/libs';
        return branch.includes('--') ? `https://${branch}.aem.live/libs` : `https://${branch}--milo--adobecom.aem.live/libs`;
      })();
      return libs;
    }, () => libs,
  ];
})();

export function getQueryParam(param) {
  const url = new URL(window.location);
  return url.searchParams.get(param);
}

export function fixRelativeLinks(html) {
  return html.replaceAll('./media', 'https://main--milo--adobecom.aem.page/media');
}

export async function getConfig() {
  const { getConfig: miloGetConfig } = await import(`${getLibs()}/utils/utils.js`);
  return miloGetConfig();
}

export function initializeTokens(token) {
  if (token == null || `${token}`.trim() === '') return;
  if (!window.peregrineConfig?.peregrineMapper) return;
  const normalized = `${token}`.trim().startsWith('Bearer ') ? token : `Bearer ${token}`;
  window.peregrineConfig.peregrineMapper.figmaAuthToken = normalized;
  window.peregrineConfig.peregrineMapper.daToken = normalized;
}

export function ensurePeregrineMapperForStandalone(overrides = {}) {
  const peregrineServiceEP = `${overrides.peregrineServiceEP || overrides.serviceEP || ''}`.trim();
  const existing = window.peregrineConfig?.peregrineMapper || {};
  const serviceEP = peregrineServiceEP || existing.serviceEP;
  if (!window.peregrineConfig) window.peregrineConfig = {};
  window.peregrineConfig.peregrineMapper = {
    serviceEP,
    pushToDaUrl: '/api/push-html',
    figmaMappingUrl: '/api/fig-comps',
    figmaBlockContentUrl: '/api/fig-comp-details',
    blockMappingsUrl: 'https://main--peregrine-mapper--adobecom.aem.live/block-mappings',
    figmaAuthToken: '',
    daToken: '',
    ...existing,
  };
}

export function extractByPattern(tag, pattern) {
  if (!tag || !pattern) {
    return {};
  }
  const parts = tag.split('-');
  const match = parts.find((p) => (pattern instanceof RegExp
    ? pattern.test(p) : p.includes(pattern)));
  if (!match) return null;
  const cleaned = match.replace(/\s+/g, '');
  const numMatch = cleaned.match(/^([a-zA-Z]+)?(\d+)?([a-zA-Z]+)?$/);
  if (numMatch) {
    const [, prefix, number, suffix] = numMatch;
    return {
      raw: match,
      prefix: prefix || null,
      number: number ? parseInt(number, 10) : null,
      suffix: suffix || null,
    };
  }
  return { raw: match };
}

export function divSwap(blockContent, divSelector, divSelector2) {
  const div1 = blockContent.querySelector(divSelector);
  const div2 = blockContent.querySelector(divSelector2);

  if (!div1 || !div2) return;

  const placeholder = document.createElement('div');
  div1.replaceWith(placeholder);
  div2.replaceWith(div1);
  placeholder.replaceWith(div2);
}

export const compose = (...fns) => (initialArg) => fns.reduce((acc, fn) => fn(acc), initialArg);

export const ARROW_ICON_SVG = '<svg class="annotation-arrow-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M17.7686 9.48437L14.7632 6.47949C14.4702 6.18652 13.9956 6.18652 13.7026 6.47949C13.4097 6.77246 13.4097 7.24707 13.7026 7.54004L15.413 9.25H2.75C2.33594 9.25 2 9.58594 2 10C2 10.4141 2.33594 10.75 2.75 10.75H15.4425L13.7026 12.4902C13.4097 12.7832 13.4097 13.2578 13.7026 13.5508C13.8491 13.6973 14.041 13.7705 14.2329 13.7705C14.4248 13.7705 14.6167 13.6973 14.7632 13.5508L17.7685 10.5449C17.9092 10.4043 17.9883 10.2139 17.9883 10.0147C17.9883 9.81543 17.9092 9.62499 17.7686 9.48437Z" fill="currentColor"/></svg>';

// Palette used for per-user avatar colors across the annotation UI.
export const ANNOTATION_AVATAR_PALETTE = [
  '#C9603F', // terracotta
  '#2E9E6B', // green
  '#3A6FB0', // blue
  '#7B4FD0', // violet
  '#D98A1F', // amber
  '#B0417A', // magenta
  '#0E8A8A', // teal
  '#5A6BD8', // indigo
];

// Deterministically map an identity key (name / email / profileId) to a palette color.
export function getAvatarColor(key) {
  const source = `${key || ''}`.trim().toLowerCase() || 'anon';
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    // eslint-disable-next-line no-bitwise
    hash = (hash << 5) - hash + source.charCodeAt(i);
    // eslint-disable-next-line no-bitwise
    hash |= 0;
  }
  const index = Math.abs(hash) % ANNOTATION_AVATAR_PALETTE.length;
  return ANNOTATION_AVATAR_PALETTE[index];
}

// Build up-to-two-letter initials from a display name or email.
export function getAvatarInitials(name) {
  const value = `${name || ''}`.trim();
  if (!value) return '?';
  const local = value.includes('@') ? value.split('@')[0] : value;
  const parts = local.split(/[\s._-]+/).filter(Boolean);
  if (!parts.length) return value.slice(0, 1).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function formatCardTimestamp(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => `${n}`.padStart(2, '0');
  const dd = pad(date.getDate());
  const mm = pad(date.getMonth() + 1);
  const yyyy = date.getFullYear();
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

// Compact relative time ("now", "4m", "3h", "2d") for activity lists.
export function formatRelativeTime(value) {
  if (!value) return '';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return formatCardTimestamp(value);
}

export const getFirstType = (text) => {
  if (!text) {
    return 'neither';
  }

  const cleaned = text
    .toLowerCase()
    .replace(/->|-/g, ' ')
    .replace(/_/g, ' ')
    .trim();

  const words = cleaned.split(/\s+/);

  const copyIndex = words.indexOf('copy');
  const imageIndex = words.indexOf('image');

  if (copyIndex === -1 && imageIndex === -1) {
    return 'neither';
  } if (copyIndex === -1) {
    return 'image';
  } if (imageIndex === -1) {
    return 'copy';
  }

  return copyIndex < imageIndex ? 'copy' : 'image';
};

export function getIconSize(value) {
  const sizeValue = value?.toLowerCase();
  let size = 'm';
  if (sizeValue.includes('s')) size = 's';
  if (sizeValue.includes('m')) size = 'm';
  if (sizeValue.includes('l')) size = 'l';
  if (sizeValue.includes('xl')) size = 'xl';
  if (sizeValue.includes('xxl')) size = 'xxl';
  return size;
}

export function ackCodeGeneration() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let ackCode = '';
  for (let i = 0; i < 8; i += 1) {
    ackCode += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return ackCode;
}

export function getMapperEnv() {
  const { origin } = window.location;
  let mapperOrigin = origin;
  const params = new URLSearchParams(window.location.href);
  if (params.get('daRenderingApp') || params.get('darenderingapp')) {
    mapperOrigin = params.get('mapperOrigin') || params.get('mapperorigin');
  }
  if (mapperOrigin.includes('https://dev--peregrine-mapper')) return 'dev';
  if (mapperOrigin.includes('https://dev02--peregrine-mapper')) return 'dev02';
  if (mapperOrigin.includes('https://stage--peregrine-mapper')) return 'stage';
  if (mapperOrigin.includes('https://main--peregrine-mapper')) return 'prod';
  return 'dev';
}
