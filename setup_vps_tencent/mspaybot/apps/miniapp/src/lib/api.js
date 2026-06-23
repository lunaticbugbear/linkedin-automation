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
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  const json = await res.json().catch(() => ({
    ok: false,
    error: `Unexpected response from API (${res.status}). Periksa VITE_API_BASE_URL atau koneksi Worker.`,
  }));
  if (!res.ok || !json.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json.data;
}

export const shopApi = {
  branding: () => request('/api/shop/branding'),
  auth: (initData) => request('/api/shop/auth', { method: 'POST', body: JSON.stringify({ initData }) }),
  products: () => request('/api/shop/products'),
  checkout: (token, payload) => request('/api/shop/checkout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  }),
  orderStatus: (token, orderId) => request(`/api/shop/orders/${orderId}/status`, {
    headers: { Authorization: `Bearer ${token}` },
  }),
  orderHistory: (token, limit = 30) => request(`/api/shop/orders?limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` },
  }),
  orderDelivery: (token, orderId) => request(`/api/shop/orders/${orderId}/delivery`, {
    headers: { Authorization: `Bearer ${token}` },
  }),
  cancelOrder: (token, orderId) => request(`/api/shop/orders/${orderId}/cancel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  }),
};
