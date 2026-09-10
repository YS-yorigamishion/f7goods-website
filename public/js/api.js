// f7goods API Client
const API_BASE = '';
const FETCH_TIMEOUT_MS = 10000;

/**
 * fetch with AbortController timeout (default 10s).
 * Distinguishes network/timeout errors from HTTP status errors.
 */
async function fetchWithTimeout(url, options) {
  let opts = {};
  let timeout = FETCH_TIMEOUT_MS;
  if (typeof options === 'number') {
    timeout = options;
  } else if (options && typeof options === 'object') {
    opts = { ...options };
    if (opts.timeout) {
      timeout = opts.timeout;
      delete opts.timeout;
    }
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      const e = new Error('Request timeout after ' + timeout + 'ms: ' + url);
      e.name = 'TimeoutError';
      e.isNetworkError = true;
      e.isTimeout = true;
      throw e;
    }
    const e = new Error('Network error: ' + ((err && err.message) || url));
    e.name = 'NetworkError';
    e.isNetworkError = true;
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function apiGet(path) {
  const res = await fetchWithTimeout(API_BASE + path);
  if (!res.ok) {
    const e = new Error('API error: ' + res.status);
    e.status = res.status;
    e.isHttpError = true;
    throw e;
  }
  return res.json();
}

async function apiPost(path, data, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetchWithTimeout(API_BASE + path, {
    method: 'POST',
    headers,
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const err = new Error(errData.error || 'API error: ' + res.status);
    err.status = res.status;
    err.isHttpError = true;
    err.data = errData;
    throw err;
  }
  return res.json();
}

// Public API
const F7API = {
  getWorks: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiGet(`/api/works${qs ? '?' + qs : ''}`);
  },
  getWork: (id) => apiGet(`/api/works/${id}`),
  getEvents: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiGet(`/api/events${qs ? '?' + qs : ''}`);
  },
  getEvent: (id) => apiGet(`/api/events/${id}`),
  getCircles: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiGet(`/api/circles${qs ? '?' + qs : ''}`);
  },
  getCircle: (id) => apiGet(`/api/circles/${id}`),
  getProjects: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiGet(`/api/projects${qs ? '?' + qs : ''}`);
  },
  getProject: (id) => apiGet(`/api/projects/${id}`),
  getUpdates: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiGet(`/api/updates${qs ? '?' + qs : ''}`);
  },
  getUpdate: (id) => apiGet(`/api/updates/${id}`),
  getCategories: () => apiGet('/api/categories'),
  submitContact: (data) => apiPost('/api/contact', data),
};
