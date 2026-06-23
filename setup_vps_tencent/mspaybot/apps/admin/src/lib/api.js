function resolveApiBaseUrl() {
  const fromEnv = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;

  if (typeof window === 'undefined' || !window.location?.hostname) return '';

  const labels = window.location.hostname.split('.').filter(Boolean);
  if (labels.length < 3) return '';

  const rootDomain = labels.slice(1).join('.');
  return `${window.location.protocol}//worker.${rootDomain}`;
}

const base = resolveApiBaseUrl();

async function request(path, options = {}) {
  if (!base) throw new Error('Konfigurasi API belum ada. Set VITE_API_BASE_URL.');
  const res = await fetch(`${base}${path}`, {
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  const json = await res.json().catch(() => ({
    ok: false,
    error: `Unexpected response from API (${res.status}). Periksa VITE_API_BASE_URL atau koneksi ke Worker.`,
  }));
  if (!res.ok || !json.ok) {
    throw new Error(json.error || `Request failed (${res.status})`);
  }
  return json.data;
}

async function requestForm(path, formData, options = {}) {
  if (!base) throw new Error('Konfigurasi API belum ada. Set VITE_API_BASE_URL.');
  const res = await fetch(`${base}${path}`, {
    credentials: 'include',
    method: 'POST',
    body: formData,
    ...options,
  });

  const json = await res.json().catch(() => ({
    ok: false,
    error: `Unexpected response from API (${res.status}). Periksa VITE_API_BASE_URL atau koneksi ke Worker.`,
  }));
  if (!res.ok || !json.ok) {
    throw new Error(json.error || `Request failed (${res.status})`);
  }
  return json.data;
}

export const api = {
  login: (password) => request('/api/admin/login', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: () => request('/api/admin/logout', { method: 'POST' }),
  bootstrap: () => request('/api/admin/bootstrap'),
  updateGeneralSettings: (payload) => request('/api/admin/settings/general', { method: 'POST', body: JSON.stringify(payload) }),
  updateBranding: (payload) => request('/api/admin/settings/branding', { method: 'POST', body: JSON.stringify(payload) }),
  telegramWebhookStatus: () => request('/api/admin/telegram/webhook/status'),
  telegramWebhookSetup: () => request('/api/admin/telegram/webhook/setup', { method: 'POST' }),
  telegramWebhookDelete: () => request('/api/admin/telegram/webhook/delete', { method: 'POST' }),
  products: () => request('/api/admin/products'),
  createProduct: (payload) => request('/api/admin/products', { method: 'POST', body: JSON.stringify(payload) }),
  updateProduct: (id, payload) => request(`/api/admin/products/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteProduct: (id) => request(`/api/admin/products/${id}`, { method: 'DELETE' }),
  productBuyers: (id) => request(`/api/admin/products/${id}/buyers`),
  notifyProductUpdate: (id, payload) => request(`/api/admin/products/${id}/notify-update`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  stock: (productId) => request(`/api/admin/stock/${productId}`),
  addStock: (productId, items) => request(`/api/admin/stock/${productId}`, { method: 'POST', body: JSON.stringify({ items }) }),
  deleteStock: (stockId) => request(`/api/admin/stock/item/${stockId}`, { method: 'DELETE' }),
  orders: (limit = 100) => request(`/api/admin/orders?limit=${limit}`),
  reports: (period = '30d') => request(`/api/admin/reports?period=${encodeURIComponent(period)}`),
  users: (limit = 500) => request(`/api/admin/users?limit=${limit}`),
  broadcast: (payload) => request('/api/admin/broadcast', { method: 'POST', body: JSON.stringify(payload) }),
  broadcastJobs: (limit = 5) => request(`/api/admin/broadcast/jobs?limit=${limit}`),
  broadcastJob: (id) => request(`/api/admin/broadcast/jobs/${id}`),
  uploadProductImage: (file) => {
    const form = new FormData();
    form.append('file', file);
    return requestForm('/api/admin/uploads/product-image', form);
  },
  uploadDigitalFile: (file) => {
    const form = new FormData();
    form.append('file', file);
    return requestForm('/api/admin/uploads/digital-file', form);
  },
};
