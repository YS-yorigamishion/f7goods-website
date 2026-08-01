// f7goods API Client
const API_BASE = '';

async function apiGet(path) {
  const res = await fetch(API_BASE + path);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function apiPost(path, data, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    headers,
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `API error: ${res.status}`);
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
  getEvents: () => apiGet('/api/events'),
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
  getCategories: () => apiGet('/api/categories'),
  submitContact: (data) => apiPost('/api/contact', data),
};
