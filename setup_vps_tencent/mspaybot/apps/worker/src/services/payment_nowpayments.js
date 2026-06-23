// NowPayments payment gateway integration.
// Docs: https://documenter.getpostman.com/view/7907941/2s9Ykq7txV
// No KYC, supports BTC/LTC/ETH/USDT/BNB and 300+ coins.
//
// How it works:
//   1. Store `nowpayments_api_key` and `nowpayments_ipn_secret` in DB settings
//   2. Create invoice: POST /v1/invoice with API key + price + currency
//   3. User pays; NowPayments sends IPN webhook to /api/payment/webhook/nowpayments
//
// Auth: x-api-key header (optional for basic endpoints required for invoice operations)
// IPN: POST with JSON body, signed via sha256(merchant_order_id|amount|currency)

const NOWPAYMENTS_BASE = 'https://api.nowpayments.io/v1';

function normalizeString(value) {
  return String(value || '').trim();
}

function pickFirst(obj, keys) {
  for (const key of keys) {
    const val = obj?.[key];
    if (val !== undefined && val !== null && val !== '') return val;
  }
  return null;
}

/**
 * Create a NowPayments invoice.
 *
 * @param {Object} opts
 * @param {string} opts.apiKey - NowPayments API key from merchant dashboard
 * @param {number} opts.amount - price in fiat (e.g., 10.00 for $10)
 * @param {string} opts.currency - fiat currency code: 'USD', 'EUR', 'IDR'
 * @param {string} opts.referenceCode - your order reference (becomes order_id)
 * @param {string} opts.ipnSecret - IPN secret for webhook verification
 * @param {string} opts.description
 * @param {string} [opts.buyerEmail]
 * @param {string} [opts.coin] - specific coin e.g. 'btc', 'ltc', 'usdttrc20' (optional, auto-select)
 */
export async function createNowPaymentsInvoice({
  apiKey,
  amount,
  currency = 'USD',
  referenceCode,
  ipnSecret,
  description,
  buyerEmail,
  coin,
}) {
  if (!apiKey) throw new Error('NowPayments: API key belum diatur');
  if (!amount || Number(amount) <= 0) throw new Error('NowPayments: amount tidak valid');

  const payload = {
    price_amount: Number(amount).toFixed(2),
    price_currency: String(currency || 'USD').toUpperCase(),
    order_id: normalizeString(referenceCode) || `ORD${Date.now()}`,
    ipn_callback_url: `${NOWPAYMENTS_BASE.replace('/v1', '')}/api/payment/webhook/nowpayments` || '',
    order_description: normalizeString(description) || 'Digital Product',
    is_fixed_rate: true,
    is_fee_paid_by_user: true,
  };

  if (normalizeString(buyerEmail)) payload.email = normalizeString(buyerEmail);
  if (normalizeString(coin)) payload.pay_currency = String(coin).toLowerCase();

  const url = `${NOWPAYMENTS_BASE}/invoice`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'accept': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(payload),
  });

  const raw = await res.text();
  let json;
  try { json = JSON.parse(raw); } catch { throw new Error(`NowPayments: respons bukan JSON (HTTP ${res.status})`); }

  // NowPayments returns { invoice_id, invoice_url, order_id, ... } on success
  if (!res.ok || json?.status === false) {
    const msg = json?.message || json?.error || json?.detail || `HTTP ${res.status}`;
    throw new Error(`NowPayments invoice gagal: ${msg}`);
  }

  const invoiceId = pickFirst(json, ['invoice_id', 'id']);
  const paymentUrl = pickFirst(json, ['invoice_url', 'url']);
  const payAmount = pickFirst(json, ['pay_amount', 'amount']);
  const payCurrency = pickFirst(json, ['pay_currency', 'currency']);
  const exchangeRate = json?.exchange_rate || null;

  if (!invoiceId) throw new Error('NowPayments: invoice_id tidak ada di respons');
  if (!paymentUrl) throw new Error('NowPayments: invoice_url tidak ada di respons');

  return {
    transactionId: String(invoiceId),
    paymentUrl: String(paymentUrl),
    payAmount: payAmount ? String(payAmount) : null,
    payCurrency: payCurrency || null,
    exchangeRate: exchangeRate ? String(exchangeRate) : null,
    finalAmount: Number(amount),
  };
}

/**
 * Verify NowPayments IPN (webhook) signature.
 * IPN sends: JSON body + header 'x-nowpayments-sig'
 * Signature = sha256(order_id|amount|currency|ipn_secret)
 */
export async function verifyNowPaymentsIpn({ payload, providedSig, ipnSecret }) {
  if (!payload || !providedSig || !ipnSecret) return false;
  const orderId = pickFirst(payload, ['order_id', 'merchant_order_id']) || '';
  const amount = pickFirst(payload, ['actually_paid', 'price_amount', 'pay_amount']) || '';
  const currency = pickFirst(payload, ['pay_currency', 'price_currency']) || '';
  const text = `${orderId}|${amount}|${currency}|${ipnSecret}`;
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  const expected = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  const sig = String(providedSig).toLowerCase();
  return sig === expected;
}

/**
 * Check webhook payload for payment_status = 'finished' or 'confirmed'
 */
export function isNowPaymentsPaid(payload) {
  if (!payload) return false;
  const status = String(pickFirst(payload, ['payment_status', 'status']) || '').toLowerCase();
  return ['finished', 'confirmed', 'success', 'paid'].includes(status);
}

/**
 * Extract our reference (order_id) from IPN payload
 */
export function extractNowPaymentsReference(payload) {
  return pickFirst(payload, ['order_id', 'merchant_order_id', 'invoice_id']);
}
