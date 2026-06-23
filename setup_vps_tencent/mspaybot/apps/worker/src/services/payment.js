// Payment service: Violet Media Pay only.
// Saweria & MSPay sudah dihapus karena tidak dipakai lagi.

const VIOLET_DEFAULT_BASE = 'https://violetmediapay.com/api/live';

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomName() {
  const base = ['Customer', 'Pembeli', 'StoreBuyer', 'User'];
  return `${base[randomInt(0, base.length - 1)]}${randomInt(100, 9999)}`;
}

function normalizeBaseUrl(url, fallback) {
  const raw = String(url || fallback || '').trim();
  if (!raw) return '';
  return raw.replace(/\/+$/, '');
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

async function hmacSha256Hex(secret, text) {
  const keyData = new TextEncoder().encode(String(secret || ''));
  const msgData = new TextEncoder().encode(String(text || ''));
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, msgData);
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function normalizeString(value) {
  return String(value || '').trim();
}

function buildGatewayTimeHeaders(appTimezone) {
  const tz = normalizeString(appTimezone) || 'Asia/Jakarta';
  return {
    'x-app-timezone': tz,
    'x-app-timestamp': new Date().toISOString(),
    'x-app-timestamp-ms': String(Date.now()),
  };
}

function pickEmailDomain(seedEmail) {
  const fallbackDomains = ['gmail.com', 'outlook.com', 'yahoo.com', 'mail.com'];
  const raw = String(seedEmail || '').trim().toLowerCase();
  if (raw.includes('@')) {
    const domain = raw.split('@').pop();
    if (domain && domain.includes('.')) return domain;
  }
  return fallbackDomains[randomInt(0, fallbackDomains.length - 1)];
}

function randomBuyerEmail(seedEmail) {
  const localPrefixes = ['andi', 'budi', 'customer', 'buyer', 'storeuser', 'rizky', 'dewi', 'rahma'];
  const prefix = localPrefixes[randomInt(0, localPrefixes.length - 1)];
  const suffix = `${Date.now().toString().slice(-6)}${randomInt(100, 999)}`;
  return `${prefix}${suffix}@${pickEmailDomain(seedEmail)}`;
}

function randomBuyerPhone() {
  const prefixes = ['0812', '0813', '0821', '0822', '0823', '0851', '0852', '0853', '0857', '0858'];
  const prefix = prefixes[randomInt(0, prefixes.length - 1)];
  const suffix = `${randomInt(1000000, 9999999)}`;
  return `${prefix}${suffix}`;
}

export async function createVioletPayment({
  amount,
  apiKey,
  secretKey,
  baseUrl,
  appTimezone,
  webhookUrl,
  referenceCode,
  expirySeconds,
  customerName,
  customerEmail,
  customerPhone,
  productName,
}) {
  if (!apiKey) throw new Error('Violet API key belum diatur');
  if (!secretKey) throw new Error('Violet secret key belum diatur');
  if (amount < 1000) throw new Error('Minimum checkout Rp 1.000');

  const gatewayBase = normalizeBaseUrl(baseUrl, VIOLET_DEFAULT_BASE);
  if (!gatewayBase) throw new Error('Violet API base URL tidak valid');

  const nominal = Math.floor(amount);
  const refCode = normalizeString(referenceCode) || `REF${Date.now()}`;
  const expiredAtUnix = Math.floor(Date.now() / 1000) + Math.max(60, Number(expirySeconds || 300));
  const signature = await hmacSha256Hex(secretKey, `${refCode}${apiKey}${nominal}`);
  const generatedEmail = randomBuyerEmail(customerEmail);
  const generatedPhone = randomBuyerPhone();

  const params = new URLSearchParams({
    api_key: apiKey,
    secret_key: secretKey,
    channel_payment: 'QRIS',
    ref_kode: refCode,
    nominal: String(nominal),
    cus_nama: normalizeString(customerName) || randomName(),
    cus_email: generatedEmail,
    cus_phone: customerPhone || generatedPhone,
    produk: normalizeString(productName) || 'Digital Product',
    expired_time: String(expiredAtUnix),
    signature,
  });

  if (normalizeString(webhookUrl)) {
    params.set('url_callback', normalizeString(webhookUrl));
    params.set('url_redirect', normalizeString(webhookUrl));
  }

  const res = await fetch(`${gatewayBase}/create`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...buildGatewayTimeHeaders(appTimezone),
    },
    body: params.toString(),
  });

  const raw = await res.text();
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`Violet create payment gagal: respons bukan JSON (HTTP ${res.status})`);
  }

  if (!res.ok || json?.status === false) {
    const msg = json?.message || json?.data?.status || json?.error || `HTTP ${res.status}`;
    throw new Error(`Violet create payment gagal: ${msg}`);
  }

  const data = extractData(json);
  const transactionId = pickFirst(data, ['id_reference', 'id_trx', 'transaction_id', 'ref_kode', 'ref', 'id']);
  const qrString = pickFirst(data, ['qris_string', 'qr_string', 'qris']);
  const qrImageUrl = pickFirst(data, ['target', 'qr_image', 'qris_url']);

  if (!transactionId) {
    throw new Error('Respons Violet tidak lengkap (id_reference)');
  }
  if (!qrString && !qrImageUrl) {
    throw new Error('Respons Violet tidak memiliki data QR (qris_string/target)');
  }

  return {
    transactionId: String(transactionId),
    qrString: qrString ? String(qrString) : null,
    qrImageUrl: qrImageUrl ? String(qrImageUrl) : null,
    finalAmount: Number(pickFirst(data, ['nominal', 'amount_merchant', 'total_amount', 'amount'])) || nominal,
  };
}

// Violet payment status sepenuhnya bergantung pada callback/webhook.
// Polling tidak didukung gateway; return false agar order tetap pending sampai webhook masuk.
export async function isVioletPaymentPaid() {
  return false;
}

export async function verifyVioletCallbackSignature({ payload, callbackSignature, apiKey, secretKey }) {
  const signatureRaw = normalizeString(callbackSignature).toLowerCase();
  if (!signatureRaw || !apiKey || !secretKey) return false;

  const refCode = pickFirst(payload, ['ref', 'ref_kode']) || '';
  const nominal = pickFirst(payload, ['amount_received', 'amount_merchant', 'nominal', 'total_amount']) || '';
  if (!refCode || nominal === '') return false;

  const expected = await hmacSha256Hex(secretKey, `${refCode}${apiKey}${nominal}`);
  return signatureRaw === expected.toLowerCase();
}

export function qrImageUrlFromString(qrString) {
  const encoded = encodeURIComponent(qrString);
  return `https://api.qrserver.com/v1/create-qr-code/?size=700x700&format=png&data=${encoded}`;
}
