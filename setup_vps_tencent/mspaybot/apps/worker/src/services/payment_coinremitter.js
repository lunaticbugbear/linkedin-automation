// CoinRemitter payment gateway integration.
// Docs: https://api.coinremitter.com/docs
// No KYC, supports BTC/LTC/ETH/USDT/BNB/etc. Price in fiat (USD/IDR), CoinRemitter
// auto-converts to crypto rate at invoice creation time.
//
// Base URL: https://api.coinremitter.com/v1
// Endpoints:
//   POST /v1/invoice/create   — create invoice
//   POST /v1/invoice/get      — fetch invoice status
//   POST /v1/wallet/balance   — get wallet balance (diagnostic)
// Auth: api_key + password + coin in form body (per-wallet)
// Webhook: notify_url in create-invoice; CoinRemitter POSTs JSON when paid.

const COINREMITTER_BASE = 'https://api.coinremitter.com/v1';

function normalizeString(value) {
  return String(value || '').trim();
}

function pickFirst(obj, keys) {
  for (const key of keys) {
    const val = obj?.[key];
    if (val !== undefined && val !== null && val !== '') {
      return val;
    }
  }
  return null;
}

function extractData(json) {
  if (!json || typeof json !== 'object') return {};
  if (json.data && typeof json.data === 'object') return json.data;
  return json;
}

// CoinRemitter rejects descriptions with non-ASCII / special chars ("Invalid format of
// description field"). Product names may carry brand Unicode (e.g. Việt), hyphens, or emoji,
// so reduce to plain ASCII alphanumeric + spaces, cap length, and fall back to a safe default.
function sanitizeDescription(text, fallback) {
  const cleaned = String(text || '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);
  return cleaned || String(fallback || 'Digital Product');
}

/**
 * Create a CoinRemitter invoice.
 *
 * @param {Object} opts
 * @param {string} opts.coin - 'BTC' | 'LTC' | 'ETH' | 'USDT' | 'TLTC' (testnet)
 * @param {string} opts.apiKey - per-wallet API key from CoinRemitter dashboard
 * @param {string} opts.password - per-wallet password
 * @param {number} opts.amount - amount in fiat (default USD). Use opts.currency to switch.
 * @param {string} [opts.currency='USD'] - 'USD'|'INR'|'IDR' etc; CoinRemitter supports many fiat
 * @param {string} opts.referenceCode - your unique invoice ID
 * @param {string} opts.webhookUrl - where CoinRemitter POSTs callback
 * @param {string} [opts.successUrl] - redirect after pay
 * @param {string} [opts.failUrl] - redirect on fail
 * @param {number} [opts.expirySeconds=1800] - invoice expiry (default 30 min)
 * @param {string} [opts.description] - shown to buyer
 * @param {string} [opts.buyerName]
 * @param {string} [opts.buyerEmail]
 */
export async function createCoinRemitterInvoice({
  coin,
  apiKey,
  password,
  amount,
  currency = 'USD',
  referenceCode,
  webhookUrl,
  successUrl,
  failUrl,
  expirySeconds = 1800,
  description,
  buyerName,
  buyerEmail,
}) {
  if (!coin) throw new Error('CoinRemitter: coin (BTC/LTC) belum dipilih');
  if (!apiKey) throw new Error('CoinRemitter: API key belum diatur');
  if (!password) throw new Error('CoinRemitter: password belum diatur');
  if (!amount || Number(amount) <= 0) throw new Error('CoinRemitter: amount tidak valid');

  const coinUpper = String(coin).toUpperCase();
  // v1 API: endpoint is /invoice/create (wallet implied by API key).
  // Auth via headers x-api-key + x-api-password. Body is RAW JSON.
  const url = `${COINREMITTER_BASE}/invoice/create`;

  const payload = {
    amount: Number(amount),
    fiat_currency: String(currency || 'USD').toUpperCase(),
    notify_url: normalizeString(webhookUrl),
    expiry_time_in_minutes: Math.max(1, Math.round(Number(expirySeconds || 1800) / 60)),
    name: normalizeString(buyerName) || 'Customer',
    email: normalizeString(buyerEmail) || 'buyer@example.com',
    description: sanitizeDescription(description, `Order ${referenceCode || ''}`),
    custom_data1: normalizeString(referenceCode) || '',
  };

  if (normalizeString(successUrl)) payload.success_url = normalizeString(successUrl);
  if (normalizeString(failUrl)) payload.fail_url = normalizeString(failUrl);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'accept': 'application/json',
      'x-api-key': apiKey,
      'x-api-password': password,
    },
    body: JSON.stringify(payload),
  });

  const raw = await res.text();
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`CoinRemitter: respons bukan JSON (HTTP ${res.status})`);
  }

  // CoinRemitter v1 returns { success: true, data: {...} } on success
  if (!res.ok || json?.success !== true) {
    const msg = json?.msg || json?.message || json?.error || `HTTP ${res.status}`;
    throw new Error(`CoinRemitter create-invoice gagal: ${msg}`);
  }

  const data = extractData(json);
  // v1 response: { id, invoice_id, url, total_amount: {COIN, USD}, coin_symbol, ... }
  const invoiceId = pickFirst(data, ['invoice_id', 'id']);
  const paymentUrl = pickFirst(data, ['url', 'invoice_url', 'payment_url']);
  const address = pickFirst(data, ['address', 'payment_address']);
  const coinSymbol = pickFirst(data, ['coin_symbol', 'coin']);
  // total_amount is an object {BNB: "0.016", USD: "10.00"} — extract crypto amount
  let cryptoAmount = null;
  const ta = data?.total_amount;
  if (ta && typeof ta === 'object' && coinSymbol) {
    cryptoAmount = ta[coinSymbol] || ta[String(coinSymbol).toUpperCase()] || null;
  } else if (typeof ta === 'string') {
    cryptoAmount = ta;
  }

  if (!invoiceId) throw new Error('CoinRemitter: invoice_id tidak ada di respons');
  if (!paymentUrl && !address) throw new Error('CoinRemitter: url/address payment tidak ada');

  return {
    transactionId: String(invoiceId),
    paymentUrl: paymentUrl ? String(paymentUrl) : null,
    address: address ? String(address) : null,
    cryptoAmount: cryptoAmount ? String(cryptoAmount) : null,
    coin: coinUpper,
    finalAmount: Number(amount),
  };
}

/**
 * Verify a CoinRemitter webhook callback.
 * CoinRemitter signs callbacks: sha512(api_key + password + data_json)
 * Header: 'X-Coin-Sign' or in body field 'sign'
 */
export async function verifyCoinRemitterWebhook({ rawBody, providedSign, apiKey, password }) {
  if (!rawBody || !providedSign || !apiKey || !password) return false;
  const text = String(rawBody || '');
  // Some implementations use sha512(text + apiKey + password); spec varies. Try both.
  const enc = new TextEncoder();
  const tryDigest = async (input) => {
    const buf = await crypto.subtle.digest('SHA-512', enc.encode(input));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  };
  const cand1 = await tryDigest(`${apiKey}${password}${text}`);
  const cand2 = await tryDigest(`${text}${apiKey}${password}`);
  const sig = String(providedSign).toLowerCase();
  return sig === cand1 || sig === cand2;
}

/**
 * CoinRemitter sends webhook with field 'status' or 'invoice_status'.
 * 'paid' / 'completed' / 'success' / 1 means paid.
 */
export function isCoinRemitterPaid(payload) {
  if (!payload || typeof payload !== 'object') return false;
  const status = String(
    pickFirst(payload, ['status', 'invoice_status', 'payment_status']) || ''
  ).toLowerCase();
  if (['paid', 'completed', 'success', 'confirmed', '1'].includes(status)) return true;
  // Some versions: { flag: 1, type: 'invoice', data: { status: 'Paid' } }
  if (payload.flag === 1 && payload.data) {
    const inner = String(payload.data?.status || '').toLowerCase();
    if (['paid', 'completed', 'success', 'confirmed'].includes(inner)) return true;
  }
  return false;
}

/**
 * Extract our reference (custom_data1 / order ref) from webhook payload.
 */
export function extractCoinRemitterReference(payload) {
  if (!payload) return null;
  // Try invoice_id FIRST (matches orders.transaction_id), fall back to our custom_data1
  // only if invoice_id is absent. Previous ordering had custom_data1 first which is our
  // internal ref code, not the CoinRemitter invoice ID — so webhook auto-delivery never fired.
  return pickFirst(payload, ['invoice_id', 'id', 'custom_data1', 'reference'])
    || pickFirst(payload?.data || {}, ['invoice_id', 'id', 'custom_data1', 'reference']);
}

/**
 * Re-query invoice status directly from CoinRemitter (authoritative).
 * More reliable than trusting the webhook payload + signature.
 * Returns { paid: bool, status: string, raw: object }
 */
export async function getCoinRemitterInvoiceStatus({ apiKey, password, invoiceId }) {
  if (!apiKey || !password) throw new Error('CoinRemitter: credentials belum diatur');
  if (!invoiceId) throw new Error('CoinRemitter: invoice_id wajib diisi');

  const url = `${COINREMITTER_BASE}/invoice/get`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'accept': 'application/json',
      'x-api-key': apiKey,
      'x-api-password': password,
    },
    body: JSON.stringify({ invoice_id: String(invoiceId) }),
  });

  const raw = await res.text();
  let json;
  try { json = JSON.parse(raw); } catch { throw new Error(`CoinRemitter get-invoice: respons bukan JSON (HTTP ${res.status})`); }

  if (!res.ok || json?.success !== true) {
    const msg = json?.msg || json?.message || json?.error || `HTTP ${res.status}`;
    throw new Error(`CoinRemitter get-invoice gagal: ${msg}`);
  }

  const data = extractData(json);
  // Invoice status values: 'Pending', 'Paid', 'Over Paid', 'Under Paid', 'Expired', 'Cancelled'
  const status = String(pickFirst(data, ['status', 'invoice_status']) || '').toLowerCase();
  const paid = ['paid', 'over paid', 'overpaid', 'completed', 'confirmed', 'success'].includes(status);
  return { paid, status, raw: data };
}
