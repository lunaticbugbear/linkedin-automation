import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createDb } from './db';
import { createSessionToken, verifySessionToken, parseCookie, verifyTelegramInitData } from './utils/security';
import { answerCallback, sendMessage, sendPhotoByUrl, setWebhook, telegramApi, TelegramApiError, sendAnimationFromR2, sendAnimationByFileId, setChatMenuButton, animateEmoji, sendMessageRichEmoji } from './services/telegram';
import { t, ORDER as LANGS, normalizeLang } from './i18n';
import { translateText, cleanProductTitle, polishProductTitle, polishProductDesc } from './translate';
import {
  createVioletPayment,
  isVioletPaymentPaid,
  verifyVioletCallbackSignature,
  qrImageUrlFromString,
} from './services/payment';
import {
  createCoinRemitterInvoice,
  verifyCoinRemitterWebhook,
  isCoinRemitterPaid,
  extractCoinRemitterReference,
  getCoinRemitterInvoiceStatus,
} from './services/payment_coinremitter';

const app = new Hono();

app.use('*', cors({
  origin: (origin, c) => {
    const allowed = [c.env.ADMIN_APP_ORIGIN, c.env.MINIAPP_ORIGIN, c.env.API_BASE_URL].filter(Boolean);
    if (!origin) return allowed[0] || '';
    return allowed.includes(origin) ? origin : allowed[0] || '';
  },
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: (origin, c) => {
    const allowed = [c.env.ADMIN_APP_ORIGIN, c.env.MINIAPP_ORIGIN, c.env.API_BASE_URL].filter(Boolean);
    return origin ? allowed.includes(origin) : false;
  },
}));

app.use('*', async (c, next) => {
  c.set('db', createDb(c.env));
  await next();
});

function jsonOk(c, data = {}) {
  return c.json({ ok: true, data });
}

function jsonErr(c, message, status = 400) {
  return c.json({ ok: false, error: message }, status);
}

function formatIdr(value) {
  return Number(value || 0).toLocaleString('id-ID');
}

// Markup harga per-bahasa untuk buyer internasional.
// EN/ZH dinaikkan (default 1.5x = +50%) karena daya beli & ekspektasi harga beda.
// Bisa di-override via setting 'intl_price_multiplier'.
function localizedPrice(basePrice, lang, multiplier) {
  const base = Number(basePrice || 0);
  if (lang === 'en' || lang === 'zh') {
    const m = Number(multiplier) > 0 ? Number(multiplier) : 1.5;
    // Bulatkan ke ribuan terdekat biar harga rapi (mis. 375.000, bukan 374.999).
    return Math.round((base * m) / 1000) * 1000;
  }
  return base;
}

async function getIntlMultiplier(db, cache) {
  if (cache?.intlMult !== undefined) return cache.intlMult;
  try {
    const v = await db.getSetting('intl_price_multiplier', '1.5');
    const n = Number(v);
    const result = Number.isFinite(n) && n > 0 ? n : 1.5;
    if (cache) cache.intlMult = result;
    return result;
  } catch {
    if (cache) cache.intlMult = 1.5;
    return 1.5;
  }
}

// Kurs IDR→USD untuk display & charge buyer internasional (EN/ZH).
// Default 16000 (konservatif). Bisa override via setting 'usd_idr_rate'.
async function getUsdRate(db, cache) {
  if (cache?.usdRate !== undefined) return cache.usdRate;
  try {
    const v = await db.getSetting('usd_idr_rate', '16000');
    const n = Number(v);
    const result = Number.isFinite(n) && n > 0 ? n : 16000;
    if (cache) cache.usdRate = result;
    return result;
  } catch {
    if (cache) cache.usdRate = 16000;
    return 16000;
  }
}

// Apakah bahasa ini pakai display USD?
function usesUsd(lang) {
  return lang === 'en' || lang === 'zh';
}

// Konversi harga IDR (yang sudah dimarkup) ke USD, bulatkan ke 2 desimal.
function idrToUsd(idrAmount, usdRate) {
  const usd = Number(idrAmount || 0) / (Number(usdRate) || 16000);
  return Math.max(0, Math.round(usd * 100) / 100);
}

// Format harga sesuai bahasa: EN/ZH → "$12.50", else → "Rp 200.000".
function formatMoney(idrAmount, lang, usdRate) {
  if (usesUsd(lang)) {
    return `$${idrToUsd(idrAmount, usdRate).toFixed(2)}`;
  }
  return `Rp ${formatIdr(idrAmount)}`;
}

// Rate limiter sederhana per user-id (in-memory, per-isolate).
// Cukup buat anti-flood dasar: tolak kalau > maxHits dalam windowMs.
const _rlMap = new Map();
function rateLimited(userId, maxHits = 8, windowMs = 5000) {
  const now = Date.now();
  const key = String(userId);
  const rec = _rlMap.get(key);
  if (!rec || now - rec.start > windowMs) {
    _rlMap.set(key, { start: now, hits: 1 });
    // Bersihin entri lama biar Map gak numpuk (housekeeping ringan).
    if (_rlMap.size > 5000) {
      for (const [k, v] of _rlMap) { if (now - v.start > windowMs) _rlMap.delete(k); }
    }
    return false;
  }
  rec.hits += 1;
  if (rec.hits > maxHits) return true;
  return false;
}

// Rate limiter khusus admin login per IP.
const _loginRl = new Map();
function loginRateLimited(ip, maxHits = 5, windowMs = 300000) {
  const now = Date.now();
  const rec = _loginRl.get(ip);
  if (!rec || now - rec.start > windowMs) {
    _loginRl.set(ip, { start: now, hits: 1 });
    if (_loginRl.size > 1000) {
      for (const [k, v] of _loginRl) { if (now - v.start > windowMs) _loginRl.delete(k); }
    }
    return false;
  }
  rec.hits += 1;
  if (rec.hits > maxHits) return true;
  return false;
}

function maskSecret(val) {
  if (!val || val.length <= 4) return val || '';
  return '****' + val.slice(-4);
}

function escapeHtml(input) {
  return (input || '')
    .toString()
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function isUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function isLikely2faToken(value) {
  const source = String(value || '').trim();
  if (!source) return false;
  if (/\b2fa\b/i.test(source)) return true;
  return /^[A-Z0-9-]{6,}$/i.test(source);
}

function formatWibDateTime(isoDate, timeZone = 'Asia/Jakarta') {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(isoDate));
  } catch {
    return '-';
  }
}

function isR2FilePointer(value) {
  return String(value || '').trim().toLowerCase().startsWith('file:');
}

function toR2ObjectKey(pointer) {
  const raw = String(pointer || '').trim();
  return raw.replace(/^file:/i, '').replace(/^\/+/, '');
}

function basenameFromKey(key) {
  const parts = String(key || '').split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : 'download.bin';
}

function parseStockItem(raw, lang = 'id') {
  const source = String(raw || '').trim();
  const parts = source.split('|').map((x) => x.trim()).filter(Boolean);

  if (parts.length === 1 && isUrl(parts[0])) {
    return {
      type: 'download',
      lines: [`${t(lang, 'download_link')}: <code>${escapeHtml(parts[0])}</code>`],
      copy: [{ label: t(lang, 'copy_link'), value: parts[0] }],
    };
  }

  if (parts.length >= 2) {
    const [email, password, ...rest] = parts;
    const lines = [
      `${t(lang, 'email_label')}: <code>${escapeHtml(email)}</code>`,
      `${t(lang, 'password_label')}: <code>${escapeHtml(password)}</code>`,
    ];

    const copy = [
      { label: t(lang, 'copy_email'), value: email },
      { label: t(lang, 'copy_password'), value: password },
    ];

    rest.forEach((extraRaw, idx) => {
      const extra = String(extraRaw || '').trim();
      if (!extra) return;

      let label = t(lang, 'additional_info');
      let copyLabel = t(lang, 'copy_info');

      if (isUrl(extra)) {
        label = idx === 0 ? t(lang, 'mail_access_link') : t(lang, 'access_link');
        copyLabel = t(lang, 'copy_link');
      } else if (isLikely2faToken(extra)) {
        label = t(lang, 'code_2fa');
        copyLabel = t(lang, 'copy_2fa');
      }

      lines.push(`${label}: <code>${escapeHtml(extra)}</code>`);
      copy.push({ label: copyLabel, value: extra });
    });

    const has2fa = rest.some((extraRaw) => isLikely2faToken(String(extraRaw || '').trim()));
    return { type: 'credential', lines, copy, has2fa };
  }

  return {
    type: 'raw',
    lines: [`${t(lang, 'data_label')}: <code>${escapeHtml(source)}</code>`],
    copy: source ? [{ label: t(lang, 'copy_data'), value: source }] : [],
  };
}

function buildDeliveryMessage(orderId, stockItems, quantity, brand, product = null, lang = 'id') {
  const sections = [];
  const copyButtons = [];
  let has2faItem = false;
  const orderCode = formatOrderCodeWithBrand(orderId, brand?.shortName);

  stockItems.forEach((item, idx) => {
    const parsed = parseStockItem(item.data, lang);
    if (parsed.has2fa) has2faItem = true;
    const titlePrefix = quantity > 1 ? `${t(lang, 'delivery_item')} ${idx + 1}` : t(lang, 'delivery_item');
    sections.push(`<b>${titlePrefix}</b>\n${parsed.lines.join('\n')}`);

    if (idx === 0) {
      parsed.copy.slice(0, 3).forEach((entry) => {
        copyButtons.push([{ text: entry.label, copy_text: { text: entry.value } }]);
      });
    }
  });

  // Emoji produk (admin-set) atau auto dari nama/kategori biar deliver menu gak polos.
  const em = (product && product.emoji && String(product.emoji).trim())
    || (product ? productThemeEmoji(product.name, product.category) : '💎');

  const text = [
    t(lang, 'delivery_success_title'),
    '━━━━━━━━━━━━━━━━━━━━',
    `${em} ${t(lang, 'delivery_order_processed', { code: orderCode })}`,
    '',
    ...sections,
    '',
    ...(has2faItem
      ? [
          t(lang, 'delivery_2fa_title'),
          t(lang, 'delivery_2fa_step1'),
          t(lang, 'delivery_2fa_step2'),
          t(lang, 'delivery_2fa_step3'),
          t(lang, 'delivery_2fa_step4'),
          '',
        ]
      : []),
    ...(product?.delivery_note
      ? [
          t(lang, 'delivery_note_label'),
          String(product.delivery_note).trim(),
          '',
        ]
      : []),
    t(lang, 'delivery_save_reminder'),
  ].join('\n');

  return { text, copyButtons, termsUrl: product?.terms_url || null };
}

function buildDeliveryKeyboard(env, copyButtons = [], brand = null, termsUrl = null, lang = 'id') {
  const rows = [];
  if (Array.isArray(copyButtons) && copyButtons.length) {
    rows.push(...copyButtons);
  }

  // Terms / panduan custom per produk (opsional dari admin).
  if (termsUrl && /^https?:\/\//i.test(termsUrl)) {
    rows.push([{ text: t(lang, 'btn_terms'), url: termsUrl }]);
  }

  // Keep global navigation visible at the bottom after account credentials are sent.
  rows.push(...getStartMenuKeyboard(env, { preserveMessage: true, brand, lang }));
  return rows;
}

async function getAdminChatId(db, env) {
  const raw = await db.getSetting('admin_telegram_id', String(env.ADMIN_ID || ''));
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

// Petakan teks tombol dock (bahasa apapun) ke aksi kanonik.
function resolveMenuAction(text) {
  const x = String(text || '').trim();
  const match = (key) => LANGS.some((l) => t(l, key) === x);
  if (match('btn_products')) return 'products';
  if (match('btn_popular')) return 'popular';
  if (match('btn_orders')) return 'orders';
  if (match('btn_help')) return 'help';
  if (match('btn_store')) return 'store';
  if (match('btn_lang')) return 'lang';
  if (match('btn_search')) return 'search';
  if (match('btn_wallet')) return 'wallet';
  if (match('btn_refund')) return 'refund';
  return null;
}

// Ambil bahasa user dari DB. Balikin '' kalau belum pilih (trigger picker).
async function getUserLang(db, userId) {
  try {
    const u = await db.getUserById(userId);
    const code = normalizeLang(u?.language_code || '');
    return code || '';
  } catch {
    return '';
  }
}

// Tampilkan language picker dengan bendera.
async function sendLanguagePicker(env, chatId) {
  const msg = '🌐 <b>Pilih Bahasa / Choose Language / 选择语言</b>';
  const kb = [
    [{ text: '🇮🇩 Indonesia', callback_data: 'setlang:id' }],
    [{ text: '🇬🇧 English', callback_data: 'setlang:en' }],
    [{ text: '🇨🇳 中文', callback_data: 'setlang:zh' }],
  ];
  return sendMessage(env, chatId, msg, { reply_markup: { inline_keyboard: kb } });
}

async function getCheckoutExpiryMinutes(db, env) {
  const fallback = String(env.CHECKOUT_EXPIRY_MINUTES || '60');
  const raw = await db.getSetting('checkout_expiry_minutes', fallback);
  const minutes = Number(raw);
  if (!Number.isFinite(minutes)) return 60;
  return Math.max(5, Math.min(180, Math.floor(minutes)));
}

async function getBrandSettings(db, cache) {
  if (cache?.brand) return cache.brand;
  const [name, shortName, tagline, broadcastTitle, supportTg, supportWa] = await Promise.all([
    db.getSetting('brand_name', 'My Store'),
    db.getSetting('brand_short_name', 'INV'),
    db.getSetting('brand_tagline', 'Belanja produk digital dengan pembayaran otomatis dan pengiriman instan.'),
    db.getSetting('broadcast_title', 'Pengumuman Resmi'),
    db.getSetting('support_telegram_url', ''),
    db.getSetting('support_whatsapp_url', ''),
  ]);

  // Sanitize short_name: huruf/angka, max 8 char, default INV.
  const safeShortName = String(shortName || 'INV').replace(/[^A-Za-z0-9]/g, '').slice(0, 8) || 'INV';

  const result = {
    name: String(name || 'My Store').trim() || 'My Store',
    shortName: safeShortName.toUpperCase(),
    tagline: String(tagline || '').trim(),
    broadcastTitle: String(broadcastTitle || 'Pengumuman Resmi').trim() || 'Pengumuman Resmi',
    supportTelegramUrl: String(supportTg || '').trim(),
    supportWhatsappUrl: String(supportWa || '').trim(),
  };
  if (cache) cache.brand = result;
  return result;
}

function formatOrderCodeWithBrand(orderId, shortName) {
  const safe = String(shortName || 'INV').toUpperCase();
  return `${safe}${String(Number(orderId) || 0).padStart(3, '0')}`;
}

async function getVioletConfig(db, env) {
  return {
    baseUrl: await db.getSetting('violet_api_base_url', env.VIOLET_API_BASE_URL || 'https://violetmediapay.com/api/live'),
    apiKey: await db.getSetting('violet_api_key', env.VIOLET_API_KEY || ''),
    secretKey: await db.getSetting('violet_secret_key', env.VIOLET_SECRET_KEY || ''),
    webhookSecret: await db.getSetting('violet_webhook_secret', env.VIOLET_WEBHOOK_SECRET || ''),
  };
}

function getVioletWebhookUrl(env) {
  return `${env.API_BASE_URL}/api/payment/webhook/violet`;
}

// Violet hanya dianggap "enabled" kalau creds lengkap DAN base URL pakai /api/live.
// Sandbox dianggap belum siap untuk user (akun masih nunggu approve aktivasi merchant).
async function isVioletEnabled(db, env) {
  const cfg = await getVioletConfig(db, env);
  if (!cfg.apiKey || !cfg.secretKey) return false;
  return /\/api\/live\/?$/.test(String(cfg.baseUrl || ''));
}

async function getCoinRemitterConfig(db, env) {
  return {
    coin: await db.getSetting('coinremitter_coin', env.COINREMITTER_COIN || 'BTC'),
    apiKey: await db.getSetting('coinremitter_api_key', env.COINREMITTER_API_KEY || ''),
    password: await db.getSetting('coinremitter_password', env.COINREMITTER_PASSWORD || ''),
    fiatCurrency: await db.getSetting('coinremitter_fiat_currency', env.COINREMITTER_FIAT_CURRENCY || 'USD'),
  };
}

function getCoinRemitterWebhookUrl(env) {
  return `${env.API_BASE_URL}/api/payment/webhook/coinremitter`;
}

async function createPaymentInvoice(env, db, { amount, email, customerName, customerPhone, productName, brand, provider }) {
  const appTimezone = env.APP_TIMEZONE || 'Asia/Jakarta';
  const brandInfo = brand || (await getBrandSettings(db));
  const refPrefix = `${brandInfo.shortName || 'INV'}REF`;
  const referenceCode = `${refPrefix}${Date.now()}`;

  // Resolve which provider to use:
  //   - explicit `provider` arg wins
  //   - fallback to default_payment_provider setting
  //   - else 'violet'
  const defaultProvider = await db.getSetting('default_payment_provider', 'violet');
  const chosen = String(provider || defaultProvider || 'violet').toLowerCase();

  if (chosen === 'coinremitter') {
    const cr = await getCoinRemitterConfig(db, env);
    const invoice = await createCoinRemitterInvoice({
      coin: cr.coin,
      apiKey: cr.apiKey,
      password: cr.password,
      amount,
      currency: cr.fiatCurrency || 'USD',
      referenceCode,
      webhookUrl: getCoinRemitterWebhookUrl(env),
      description: productName,
      buyerName: customerName,
      buyerEmail: email,
    });
    return {
      provider: 'coinremitter',
      transactionId: invoice.transactionId,
      paymentUrl: invoice.paymentUrl,
      address: invoice.address,
      cryptoAmount: invoice.cryptoAmount,
      coin: invoice.coin,
      finalAmount: invoice.finalAmount,
      // Compatibility with Violet flow (qrString/qrImageUrl):
      qrString: null,
      qrImageUrl: null,
    };
  }

  // Default: Violet (QRIS)
  const violet = await getVioletConfig(db, env);
  const invoice = await createVioletPayment({
    amount,
    apiKey: violet.apiKey,
    secretKey: violet.secretKey,
    baseUrl: violet.baseUrl,
    appTimezone,
    webhookUrl: getVioletWebhookUrl(env),
    referenceCode,
    customerName,
    customerEmail: email,
    customerPhone,
    productName,
  });

  return {
    provider: 'violet',
    ...invoice,
  };
}

async function isOrderPaid(env, db, order) {
  const provider = String(order.payment_provider || '').toLowerCase();
  if (provider === 'coinremitter') {
    try {
      const cr = await getCoinRemitterConfig(db, env);
      const invId = order.transaction_id || '';
      if (!invId) return false;
      const status = await getCoinRemitterInvoiceStatus({
        apiKey: cr.apiKey, password: cr.password, invoiceId: invId,
      });
      return !!status.paid;
    } catch (e) {
      console.warn('[isOrderPaid] CoinRemitter status check failed:', e.message);
      return false;
    }
  }
  // Wallet-covered orders are paid the moment they're created (balance already debited).
  // Returning true lets cron self-heal via the idempotent claim if inline delivery missed,
  // instead of the expiry sweep stranding a paid order.
  if (provider === 'wallet_internal') return true;
  return isVioletPaymentPaid(env, db, order);
}

async function createUniqueDownloadUrl(env, db, order, objectKey) {
  const token = crypto.randomUUID().replaceAll('-', '');
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
  await db.createDownloadToken({
    token,
    orderId: order.id,
    userId: order.user_id,
    objectKey,
    expiresAt,
    maxDownloads: 5,
  });
  return `${env.API_BASE_URL}/api/shop/download/${token}`;
}

async function normalizeDeliveryStock(env, db, order, stockItems) {
  const normalized = [];
  for (const item of stockItems) {
    if (!isR2FilePointer(item.data)) {
      normalized.push(item);
      continue;
    }

    const key = toR2ObjectKey(item.data);
    if (!key) {
      normalized.push(item);
      continue;
    }

    const uniqueUrl = await createUniqueDownloadUrl(env, db, order, key);
    normalized.push({ ...item, data: uniqueUrl });
  }
  return normalized;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requireAdmin(c, next) {
  const token = parseCookie(c.req.header('cookie'))['tb_session'];
  const secret = c.env.ADMIN_SESSION_SECRET;
  if (!token || !secret) return jsonErr(c, 'Unauthorized', 401);

  const payload = await verifySessionToken(token, secret);
  if (!payload || payload.role !== 'admin') return jsonErr(c, 'Unauthorized', 401);

  c.set('admin', payload);
  await next();
}

async function requireShop(c, next) {
  const auth = c.req.header('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const secret = c.env.SHOP_SESSION_SECRET || c.env.ADMIN_SESSION_SECRET;
  if (!token || !secret) return jsonErr(c, 'Unauthorized', 401);

  const payload = await verifySessionToken(token, secret);
  if (!payload || payload.role !== 'shop' || !payload.uid) return jsonErr(c, 'Unauthorized', 401);

  c.set('shopUser', payload);
  await next();
}

// Pilih emoji tema per produk. Word-boundary (\b) WAJIB biar "credits" != "edit".
// Animated (proven @freetierbot): ⚡️☁️🎵✂️💎. 🎬 statis (gak ada di set proven, gak crash).
function productThemeEmoji(name = '', category = '') {
  const s = ` ${String(name)} ${String(category)} `.toLowerCase();
  const has = (re) => re.test(s);
  // Urutan penting: brand/kategori spesifik dulu.
  if (has(/\b(chatgpt|gpt|openai|claude|gemini|grok|perplexity|cursor|copilot|kiro|api|ai)\b/)) return '⚡️';
  if (has(/\b(vps|server|cloud|hosting|tencent|aws|heroku|akash|dyno|console|rdp)\b/)) return '☁️';
  if (has(/\b(spotify|musik|music|joox|audio|lagu)\b/)) return '🎵';
  if (has(/\b(capcut|editing|editor|video|canva|design)\b/)) return '✂️';
  if (has(/\b(netflix|disney|hbo|vidio|film|movie|nonton|streaming|iptv)\b/)) return '🎬';
  return '💎'; // default (proven animated)
}

// Shared product-card renderer (heavenprem/freetier-style). Dipakai DUA path katalog
// (sendProductCatalog + handler /produk) biar gak drift (pitfall #3).
// Balikin { text, buyable } — buyable = daftar produk in-stock buat bikin keyboard.
async function buildCatalogCards(env, db, products, lang, intlMult, usdRate) {
  const maxSales = products.reduce((mx, p) => Math.max(mx, Number(p.sales_count) || 0), 0);
  const now7 = Date.now() - 7 * 24 * 3600 * 1000;
  const newCount = products.filter((p) => p.created_at && new Date(p.created_at).getTime() > now7).length;
  const showNew = newCount > 0 && newCount < products.length;
  const cleanSoldOut = String(t(lang, 'sold_out')).replace(/^❌\s*/, '');
  let text = '';
  const buyable = [];
  let idx = 0;
  for (const p of products) {
    idx += 1;
    const isUnlim = Number(p.is_unlimited_stock) === 1;
    const stockOk = isUnlim || Number(p.stock_count) > 0;
    const stockStr = isUnlim
      ? `🟢 ${t(lang, 'unlimited')}`
      : (stockOk ? `🟢 ${p.stock_count} ${t(lang, 'stock')}` : `🔴 ${cleanSoldOut}`);
    let badge = '';
    const sc = Number(p.sales_count) || 0;
    if (sc >= 3 && sc === maxSales) badge = ' 🥇';
    else if (showNew && p.created_at && new Date(p.created_at).getTime() > now7) badge = ' 🆕';
    // Nama produk TIDAK di-machine-translate (brand universal).
    const themeEmoji = (p.emoji && String(p.emoji).trim()) || productThemeEmoji(p.name, p.category);
    text += '═════════════════════\n';
    text += `${themeEmoji} <b>【${idx}】 ${escapeHtml(p.name)}</b>${badge}\n`;
    text += '━━━━━━━━━━━━━━━━━━━━━\n';
    text += `💵 <b>${formatMoney(localizedPrice(p.price, lang, intlMult), lang, usdRate)}</b>  ·  📦 ${stockStr}\n`;
    if (p.description) {
      const pDesc = await polishProductDesc(env, db, p.description, lang, p.name);
      if (pDesc) text += `📝 <i>${escapeHtml(pDesc)}</i>\n`;
    }
    if (stockOk) buyable.push({ idx, id: p.id, name: p.name });
  }
  text += '═════════════════════\n';
  return { text, buyable };
}

async function sendProductCatalog(env, db, chatId, messageId = null, popular = false, lang = 'id', presetProducts = null, customTitle = null, cache = null) {
  const allProducts = presetProducts || (popular ? await db.getProductsByPopular() : await db.getProducts());
  const totalCount = (!presetProducts && allProducts.length > 0) ? Number(allProducts[0].total_count || allProducts.length) : allProducts.length;
  const products = (!presetProducts && allProducts.length > 20) ? allProducts.slice(0, 20) : allProducts;
  const brand = await getBrandSettings(db, cache);
  const intlMult = await getIntlMultiplier(db, cache);
  const usdRate = await getUsdRate(db, cache);

  if (!products.length) {
    const emptyText = t(lang, 'empty_products');
    if (messageId) {
      return telegramApi(env, 'editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: emptyText,
        reply_markup: { inline_keyboard: getStartMenuKeyboard(env, { brand, lang }) },
      });
    }

    return sendMessage(env, chatId, emptyText, {
      reply_markup: { inline_keyboard: getStartMenuKeyboard(env, { brand, lang }) },
    });
  }

  let text = (customTitle || t(lang, 'catalog_title', { store: escapeHtml((brand.name || 'STORE').toUpperCase()) })) + '\n';
  text += t(lang, 'catalog_sub') + '\n\n';
  const rows = [];

  const cards = await buildCatalogCards(env, db, products, lang, intlMult, usdRate);
  text += cards.text + '\n';
  for (const b of cards.buyable) {
    rows.push([{ text: `🛒 [${b.idx}] ${b.name}`.slice(0, 60), callback_data: `buy:${b.id}` }]);
  }

  const nowWib = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(11, 19);
  if (!presetProducts && totalCount > 20) {
    text += t(lang, 'more_products', { n: totalCount - 20 }) + '\n';
  }
  text += t(lang, 'catalog_footer') + '\n';
  text += t(lang, 'updated_at', { time: nowWib });
  text = animateEmoji(text); // custom animated emoji (Premium lihat animasi, lainnya fallback)

  // Kategori disembunyiin dari buyer — gak perlu ditampilkan.
  // Category field tetap ada di DB buat admin internal aja.

  rows.push([{ text: t(lang, 'btn_refresh'), callback_data: 'view_products' }, { text: t(lang, 'btn_orders'), callback_data: 'my_orders' }]);
  rows.push([{ text: t(lang, 'btn_home'), callback_data: 'home' }]);
  if (env.MINIAPP_ORIGIN) {
    rows.push([{ text: t(lang, 'btn_store'), web_app: { url: env.MINIAPP_ORIGIN } }]);
  }
  const supportUrl = String(brand.supportTelegramUrl || brand.supportWhatsappUrl || '').trim();
  if (supportUrl) {
    rows.push([{ text: t(lang, 'btn_cs'), url: supportUrl }]);
  }

  if (messageId) {
    try {
      return await telegramApi(env, 'editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: rows },
      });
    } catch (e) {
      // Fallback: kirim pesan baru kalau edit gagal.
      return sendWithLoading(env, chatId, text, { inline_keyboard: rows }, null, lang);
    }
  }

  return sendWithLoading(env, chatId, text, { inline_keyboard: rows }, null, lang);
}

// Bangun pesan konfirmasi beli + stepper qty + tombol bayar (reusable).
function buildBuyConfirmation(env, product, qty, qrisOn, lang = 'id', intlMult = 1.5, usdRate = 16000) {
  const maxStock = Number(product.is_unlimited_stock) === 1 ? 999999 : Number(product.stock_count);
  const q = Math.max(1, Math.min(qty, maxStock));
  const stockStr = Number(product.is_unlimited_stock) === 1 ? t(lang, 'unlimited') : `${product.stock_count}`;
  const unit = localizedPrice(product.price, lang, intlMult);
  const total = unit * q;
  const pid = product.id;

  let msg = t(lang, 'confirm_title') + '\n';
  msg += t(lang, 'confirm_product', { name: escapeHtml(product.name) }) + '\n';
  msg += t(lang, 'confirm_price', { price: formatMoney(unit, lang, usdRate) }) + '\n';
  msg += t(lang, 'confirm_stock', { stock: stockStr }) + '\n';
  msg += t(lang, 'confirm_qty', { qty: q }) + '\n';
  msg += '┊ \n' + t(lang, 'confirm_total', { total: formatMoney(total, lang, usdRate) }) + '\n';
  msg += `╰━━━━━━━━━━━━━━━━━\n\n`;
  msg += t(lang, 'confirm_choose');

  const dec = q > 1 ? `qty:${pid}:${q - 1}` : `qty:${pid}:${q}`;
  const inc = q < maxStock ? `qty:${pid}:${q + 1}` : `qty:${pid}:${q}`;
  const kb = [
    [
      { text: '➖', callback_data: dec },
      { text: t(lang, 'btn_item', { n: q }), callback_data: `qty:${pid}:${q}` },
      { text: '➕', callback_data: inc },
    ],
    [{ text: t(lang, 'btn_pay_crypto'), callback_data: `pay:coinremitter:${pid}:${q}` }],
  ];
  if (qrisOn) {
    kb.push([{ text: t(lang, 'btn_pay_qris'), callback_data: `pay:violet:${pid}:${q}` }]);
  }
  kb.push([{ text: t(lang, 'btn_back_catalog'), callback_data: 'view_products' }]);
  return { text: msg, keyboard: kb };
}

async function deliverOrder(env, db, order) {
  // Idempotency: atomically claim pending→paid. Only the caller that flips the row
  // proceeds; a concurrent webhook+cron pair for the same order bails here. Without
  // this, both could read 'pending' and double-deliver (double stock, points, message).
  const claimed = await db.claimOrderForDelivery(order.id);
  if (!claimed) return;

  const adminChatId = await getAdminChatId(db, env);
  const brand = await getBrandSettings(db);
  const orderCode = formatOrderCodeWithBrand(order.id, brand.shortName);

  // Cek apakah produk dari order ini unlimited (digital file shareable).
  // Kalau iya: skip reserveStock/markStockSold, langsung generate download link unik per pembelian.
  const product = await db.getProductById(order.product_id);
  const isUnlimitedDigital =
    product && Number(product.is_unlimited_stock) === 1 && product.digital_file_pointer;

  let stock;
  if (isUnlimitedDigital) {
    // Bangun "virtual" stock items dari pointer produk sejumlah quantity yang dipesan.
    // Tidak menyentuh tabel stock_items sama sekali untuk produk unlimited.
    stock = Array.from({ length: order.quantity }, () => ({
      id: null,
      data: product.digital_file_pointer,
    }));
  } else {
    stock = await db.reserveStock(order.product_id, order.quantity, order.id);
    if (stock.length < order.quantity) {
      await db.updateOrderStatus(order.id, 'failed');
      const refunded = await db.refundOrderWallet(order.id).catch(() => 0);
      if (refunded > 0) {
        const flang = await getUserLang(db, order.user_id) || 'id';
        await sendMessage(env, order.user_id, t(flang, 'refund_done', { code: orderCode, amount: formatIdr(refunded) }), { parse_mode: 'HTML' }).catch(() => {});
      }
      if (adminChatId) {
        await sendMessage(env, adminChatId, `🚨 Stok tidak cukup untuk order ${orderCode}`);
      }
      return;
    }
    const stockIds = stock.map((s) => s.id);
    await db.markStockSold(stockIds, order.user_id, order.id);
  }

  await db.updateOrderStatus(order.id, 'paid');
  await db.updateOrderStatus(order.id, 'delivered');

  const normalizedStock = await normalizeDeliveryStock(env, db, order, stock);

  await db.setOrderDeliveryPayload(order.id, {
    orderId: order.id,
    productName: order.product_name,
    quantity: order.quantity,
    items: normalizedStock.map((item, idx) => ({
      itemNo: idx + 1,
      data: item.data,
    })),
    deliveryNote: product?.delivery_note || null,
    termsUrl: product?.terms_url || null,
  });

  const dlang = await getUserLang(db, order.user_id) || 'id';
  const payload = buildDeliveryMessage(order.id, normalizedStock, order.quantity, brand, product, dlang);
  // Tambah poin wallet (1% dari harga order, minimal 100 poin).
  const earnedPoints = Math.max(100, Math.floor(Number(order.price || 0) * 0.01));
  await db.addWalletPoints(order.user_id, earnedPoints).catch(() => {});
  const inlineKeyboard = buildDeliveryKeyboard(env, payload.copyButtons, brand, payload.termsUrl, dlang);
  // After-pay confirmation kuat — momen paling penting, kasih sinyal jelas dulu.
  try {
    await sendMessage(env, order.user_id, t(dlang, 'pay_success', { code: orderCode }));
  } catch { /* non-fatal */ }
  try {
    await sendMessage(env, order.user_id, payload.text, {
      reply_markup: { inline_keyboard: inlineKeyboard },
    });
  } catch (err) {
    // Fallback without copy buttons for Telegram clients/API versions that do not support copy_text.
    await sendMessage(env, order.user_id, payload.text, {
      reply_markup: { inline_keyboard: getStartMenuKeyboard(env, { preserveMessage: true, brand, lang: dlang }) },
    });
  }

}

// Fetch kurs IDR→USD dari API gratis, simpan ke setting. Dipanggil cron.
async function updateUsdRate(env) {
  const db = createDb(env);
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    const data = await res.json();
    const rate = Number(data?.rates?.IDR);
    if (Number.isFinite(rate) && rate > 5000 && rate < 50000) {
      await db.setSetting('usd_idr_rate', String(Math.round(rate)));
      console.log('[usd rate] updated:', Math.round(rate));
    }
  } catch (e) {
    console.warn('[usd rate] fetch gagal:', e.message);
  }
}

// Lepas reservasi stok basi (is_sold=2 yatim/order gagal) → balik ke is_sold=0. Dipanggil cron.
async function releaseStaleReservations(env) {
  const db = createDb(env);
  try {
    const freed = await db.releaseStaleReservations();
    if (freed > 0) console.log('[stock sweeper] released stale reservations:', freed);
  } catch (e) {
    console.warn('[stock sweeper] gagal:', e.message);
  }
}

async function processPendingOrders(env) {
  const db = createDb(env);
  const pending = await db.getPendingOrdersForSync();

  for (const order of pending) {
    if (!order.transaction_id) {
      await db.updateOrderStatus(order.id, 'failed');
      continue;
    }

    let paid = false;
    try {
      paid = await isOrderPaid(env, db, order);
    } catch (err) {
      console.error('[Scheduler] payment check failed', order.id, err.message);
      continue;
    }

    if (paid) {
      try {
        await deliverOrder(env, db, order);
      } catch (err) {
        console.error('[Scheduler] deliver failed', order.id, err.message);
      }
      continue;
    }

    // Violet has no status re-query API, so ONLY the webhook can confirm payment.
    // Do NOT auto-expire a Violet/gateway order whose webhook may still arrive — a race
    // with the 1-min cron would strand the buyer's paid money with no delivery and no
    // automatic recovery. Only call refundOrderWallet when wallet_applied > 0 (wallet portion).
    // Wallet_internal and CoinRemitter orders self-heal via isOrderPaid above.
    const isGatewayOnly = !(await refundOrderWalletSafe(order));
    if (order.expires_at && Date.now() > new Date(order.expires_at).getTime()) {
      if (!isGatewayOnly) {
        await db.updateOrderStatus(order.id, 'expired');
        await db.refundOrderWallet(order.id).catch(() => {});
        const brand = await getBrandSettings(db);
        const lang = await getUserLang(db, order.user_id) || 'id';
        await sendMessage(env, order.user_id, t(lang, 'order_expired_msg', { code: formatOrderCodeWithBrand(order.id, brand.shortName) }));
      } else {
        // Gateway-only (Violet/QRIS with zero wallet_applied): don't silently expire.
        // Leave pending so admin can manually confirm via 🟢 QRIS Pending. Webhook
        // may still arrive. If truly unpaid, the admin can manually expire later.
        console.log('[Scheduler] skipping expiry for gateway-only order', order.id, '(Violet webhook may still arrive)');
      }
    }
  }
}

// Returns true if refundOrderWallet would actually credit money (>0 wallet_applied && !already_refunded).
// A pure-gateway (Violet) order with wallet_applied=0 returns false — the refund is a no-op.
async function refundOrderWalletSafe(order) {
  const applied = Math.round(Number(order.wallet_applied) || 0);
  return applied > 0 && !order.wallet_refunded;
}

async function syncSingleOrderIfPaid(env, db, order) {
  if (!order || order.status !== 'pending') return;

  if (!order.transaction_id) {
    await db.updateOrderStatus(order.id, 'failed');
    return;
  }

  let paid = false;
  try {
    paid = await isOrderPaid(env, db, order);
  } catch (err) {
    console.error('[RealtimeSync] payment check failed', order.id, err.message);
    return;
  }

  if (!paid) {
    if (order.expires_at && Date.now() > new Date(order.expires_at).getTime()) {
      // Violet has no re-query API — only webhook can confirm. Don't expire gateway-only
      // orders whose webhook may still arrive (mirroring processPendingOrders' guard).
      const isGatewayOnly = !(await refundOrderWalletSafe(order));
      if (!isGatewayOnly) {
        await db.updateOrderStatus(order.id, 'expired');
        await db.refundOrderWallet(order.id).catch(() => {});
        const brand = await getBrandSettings(db);
        const lang = await getUserLang(db, order.user_id) || 'id';
        await sendMessage(env, order.user_id, t(lang, 'order_expired_msg', { code: formatOrderCodeWithBrand(order.id, brand.shortName) }));
      } else {
        console.log('[RealtimeSync] skipping expiry for gateway-only order', order.id, '(Violet webhook may still arrive)');
      }
    }
    return;
  }

  try {
    await deliverOrder(env, db, order);
  } catch (err) {
    console.error('[RealtimeSync] deliver failed', order.id, err.message);
  }
}

function getWebhookUrl(env) {
  return `${env.API_BASE_URL}/telegram/webhook`;
}

function getWebhookPrereq(env) {
  return {
    hasBotToken: Boolean(env.BOT_TOKEN),
    hasApiBaseUrl: Boolean(env.API_BASE_URL),
    hasWebhookSecret: Boolean(env.TELEGRAM_WEBHOOK_SECRET),
  };
}

function getSystemStatus(
  env,
  adminTelegramId,
  defaultBuyerEmail,
  violetApiBaseUrl,
  violetApiKey,
  violetSecretKey,
  violetWebhookSecret,
) {
  return {
    secrets: {
      BOT_TOKEN: Boolean(env.BOT_TOKEN),
      TELEGRAM_WEBHOOK_SECRET: Boolean(env.TELEGRAM_WEBHOOK_SECRET),
      ADMIN_PANEL_PASSWORD: Boolean(env.ADMIN_PANEL_PASSWORD),
      ADMIN_SESSION_SECRET: Boolean(env.ADMIN_SESSION_SECRET),
      SHOP_SESSION_SECRET: Boolean(env.SHOP_SESSION_SECRET),
      SETUP_TOKEN: Boolean(env.SETUP_TOKEN),
      VIOLET_API_KEY: Boolean(env.VIOLET_API_KEY || violetApiKey),
      VIOLET_SECRET_KEY: Boolean(env.VIOLET_SECRET_KEY || violetSecretKey),
      VIOLET_WEBHOOK_SECRET: Boolean(env.VIOLET_WEBHOOK_SECRET || violetWebhookSecret || env.VIOLET_SECRET_KEY || violetSecretKey),
      DEFAULT_BUYER_EMAIL: Boolean(env.DEFAULT_BUYER_EMAIL || defaultBuyerEmail),
      ADMIN_ID: Boolean(env.ADMIN_ID || adminTelegramId),
    },
    vars: {
      API_BASE_URL: Boolean(env.API_BASE_URL),
      ADMIN_APP_ORIGIN: Boolean(env.ADMIN_APP_ORIGIN),
      MINIAPP_ORIGIN: Boolean(env.MINIAPP_ORIGIN),
      R2_PUBLIC_BASE_URL: Boolean(env.R2_PUBLIC_BASE_URL),
      VIOLET_API_BASE_URL: Boolean(env.VIOLET_API_BASE_URL || violetApiBaseUrl),
    },
  };
}

function extractVioletTransactionId(payload) {
  const candidates = [
    payload?.id_reference,
    payload?.id_trx,
    payload?.transaction_id,
    payload?.ref_kode,
    payload?.ref,
    payload?.merchant_ref,
    payload?.data?.id_reference,
    payload?.data?.id_trx,
    payload?.data?.transaction_id,
    payload?.data?.ref_kode,
    payload?.data?.ref,
    payload?.data?.merchant_ref,
  ];

  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null && String(candidate).trim()) {
      return String(candidate).trim();
    }
  }

  return '';
}

function isVioletWebhookPaid(payload) {
  const statusRaw = String(
    payload?.status
    || payload?.payment_status
    || payload?.transaction_status
    || payload?.status_trx
    || payload?.data?.status
    || payload?.data?.payment_status
    || payload?.data?.transaction_status
    || payload?.data?.status_trx
    || ''
  ).toLowerCase();
  const paidStatuses = new Set(['success', 'paid', 'settlement', 'completed']);
  return paidStatuses.has(statusRaw);
}

async function parseWebhookPayload(req) {
  const contentType = String(req.header('content-type') || '').toLowerCase();

  if (contentType.includes('application/json')) {
    return await req.json().catch(() => ({}));
  }

  if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    const body = await req.parseBody().catch(() => ({}));
    return body && typeof body === 'object' ? body : {};
  }

  const rawText = await req.text().catch(() => '');
  if (!rawText) return {};

  try {
    return JSON.parse(rawText);
  } catch {
    const params = new URLSearchParams(rawText);
    const out = {};
    for (const [key, value] of params.entries()) {
      out[key] = value;
    }
    return out;
  }
}

function getStartMenuKeyboard(env, { preserveMessage = false, brand = null, lang = 'id' } = {}) {
  const viewProductsAction = preserveMessage ? 'view_products_keep' : 'view_products';
  const myOrdersAction = preserveMessage ? 'my_orders_keep' : 'my_orders';

  const rows = [
    [{ text: t(lang, 'btn_products'), callback_data: viewProductsAction }],
    [{ text: t(lang, 'btn_orders'), callback_data: myOrdersAction }],
  ];

  if (env.MINIAPP_ORIGIN) {
    rows.push([{ text: t(lang, 'btn_store'), web_app: { url: env.MINIAPP_ORIGIN } }]);
  }

  const supportUrl = String(brand?.supportTelegramUrl || brand?.supportWhatsappUrl || '').trim();
  if (supportUrl) {
    rows.push([{ text: t(lang, 'btn_cs'), url: supportUrl }]);
  }
  return rows;
}

// Persistent bottom-dock menu (ala heavenprem). Tombol nempel terus, user tinggal tap.
async function getReplyKeyboard(env, lang = 'id', db = null, userId = null) {
  const rows = [
    [{ text: t(lang, 'btn_products') }, { text: t(lang, 'btn_orders') }],
  ];
  if (env.MINIAPP_ORIGIN) {
    // Tombol Open Store: tombol biasa (text handler kirim inline web_app button)
    // karena ReplyKeyboardMarkup web_app gak selalu jalan di semua device.
    rows.push([{ text: t(lang, 'btn_store') }]);
  }
  rows.push([{ text: t(lang, 'btn_popular') }, { text: t(lang, 'btn_search') }]);
  // Tombol Saldo cuma muncul kalau user udah >= 3x belanja (order paid/delivered).
  if (db && userId) {
    try {
      const paidCount = await db.countPaidOrders(userId);
      if (paidCount >= 3) {
        rows.push([{ text: t(lang, 'btn_wallet') }]);
      }
    } catch { /* non-fatal */ }
  }
  rows.push([{ text: t(lang, 'btn_help') }, { text: t(lang, 'btn_lang') }]);
  return {
    keyboard: rows,
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: t(lang, 'kb_placeholder'),
  };
}

// Animasi loading ala freetierbot: kirim pesan, edit beberapa frame spinner.
async function sendWithLoading(env, chatId, finalText, finalMarkup = null, frames = null, lang = 'id') {
  const spin = frames || (lang === 'en'
    ? ['⏳ Loading products.', '⏳ Loading products..', '⏳ Loading products...', '⚡ Almost ready...']
    : lang === 'zh'
    ? ['⏳ 正在加载产品。', '⏳ 正在加载产品。。', '⏳ 正在加载产品。。。', '⚡ 即将就绪...']
    : ['⏳ Memuat produk.', '⏳ Memuat produk..', '⏳ Memuat produk...', '⚡ Hampir siap...']);
  const sent = await sendMessage(env, chatId, spin[0]);
  const messageId = sent?.result?.message_id;
  if (!messageId) {
    // Fallback: gak dapet message_id, langsung kirim hasil final.
    return sendMessage(env, chatId, finalText, finalMarkup ? { reply_markup: finalMarkup } : {});
  }
  for (let i = 1; i < spin.length; i++) {
    await new Promise((r) => setTimeout(r, 450));
    await telegramApi(env, 'editMessageText', {
      chat_id: chatId, message_id: messageId, text: spin[i], parse_mode: 'HTML',
    }).catch(() => {});
  }
  await new Promise((r) => setTimeout(r, 350));
  await telegramApi(env, 'editMessageText', {
    chat_id: chatId, message_id: messageId, text: finalText, parse_mode: 'HTML',
    ...(finalMarkup ? { reply_markup: finalMarkup } : {}),
  }).catch(() => {});
  return messageId;
}

// Admin-only menu. Cuma kebuka buat ADMIN_ID. Tombol callback admin:*
async function sendAdminMenu(env, db, chatId, options = {}) {
  const brand = await getBrandSettings(db);
  let stats = { totalProducts: 0, totalUsers: 0, pendingOrders: 0, paidOrders: 0, totalRevenue: 0, revenueToday: 0 };
  try { stats = await db.getDashboardStats(); } catch { /* non-fatal */ }

  let msg = `╭━━━━ 🛠️ <b>ADMIN PANEL</b> ━━━━\n`;
  msg += `┊ 🏪 ${escapeHtml(brand.name || 'Store')}\n`;
  msg += `┊ 💎 Produk aktif: <b>${stats.totalProducts}</b>\n`;
  msg += `┊ 👥 Total user: <b>${(stats.totalUsers || 0).toLocaleString('id-ID')}</b>\n`;
  msg += `┊ ✅ Order sukses: <b>${(stats.paidOrders || 0).toLocaleString('id-ID')}</b>\n`;
  msg += `┊ ⏳ Order pending: <b>${stats.pendingOrders || 0}</b>\n`;
  msg += `┊ 💰 Revenue total: <b>Rp ${formatIdr(stats.totalRevenue || 0)}</b>\n`;
  msg += `┊ 📈 Revenue hari ini: <b>Rp ${formatIdr(stats.revenueToday || 0)}</b>\n`;
  msg += `╰━━━━━━━━━━━━━━━━━\n\n`;
  msg += `🔻 Pilih aksi admin:`;

  const kb = [
    [{ text: '📊 Statistik', callback_data: 'admin:stats' }, { text: '📦 Order Terbaru', callback_data: 'admin:orders' }],
    [{ text: '🛍️ Kelola Produk', callback_data: 'admin:products' }],
    [{ text: '👥 User Terbaru', callback_data: 'admin:users' }, { text: '🟢 QRIS Pending', callback_data: 'admin:violetpending' }],
  ];
  if (env.ADMIN_APP_ORIGIN) {
    kb.push([{ text: '🛍️ Kelola Produk (Web)', url: env.ADMIN_APP_ORIGIN }]);
  }
  kb.push([{ text: '🏠 Beranda', callback_data: 'home' }]);

  if (options.messageId) {
    return telegramApi(env, 'editMessageText', {
      chat_id: chatId, message_id: options.messageId, text: msg, parse_mode: 'HTML',
      reply_markup: { inline_keyboard: kb },
    }).catch(() => {});
  }
  return sendMessage(env, chatId, msg, { reply_markup: { inline_keyboard: kb } });
}

async function sendStartMenu(env, chatId, firstName = 'Kak', options = {}) {
  const prefix = String(options?.prefix || '').trim();
  const db = options?.db || createDb(env);
  const brand = options?.brand || (await getBrandSettings(db));
  const user = options?.user || null;
  const lang = options?.lang || 'id';

  let stats = { totalProducts: 0, totalUsers: 0, totalSales: 0 };
  try { stats = await db.getPublicStats(); } catch { /* non-fatal */ }

  const lines = [];
  if (prefix) lines.push(prefix);
  lines.push(t(lang, 'welcome_title', { store: escapeHtml(brand.name || 'Store'), name: escapeHtml(firstName || 'Kak') }));
  // Stats cuma ditampilkan kalau toko udah "hidup" (transaksi >= 10),
  // biar angka kosong gak jadi social-proof terbalik buat toko baru.
  if (Number(stats.totalSales) >= 10) {
    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push(t(lang, 'info_toko'));
    lines.push(t(lang, 'total_produk', { n: stats.totalProducts }));
    lines.push(t(lang, 'total_jual', { n: stats.totalSales.toLocaleString('en-US') }));
    lines.push(t(lang, 'total_user', { n: stats.totalUsers.toLocaleString('en-US') }));
  }
  if (user) {
    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push(t(lang, 'profil_anda'));
    lines.push(t(lang, 'username_lbl', { u: user.username ? '@' + escapeHtml(user.username) : '-' }));
    lines.push(t(lang, 'userid_lbl', { id: user.id }));
  }
  lines.push('');
  lines.push(t(lang, 'pilih_menu'));

  await sendMessage(env, chatId, animateEmoji(lines.join('\n')), {
    reply_markup: {
      inline_keyboard: getStartMenuKeyboard(env, { brand, lang }),
    },
  });
}

app.get('/health', (c) => jsonOk(c, { service: 'telebotsb-worker', env: c.env.APP_ENV || 'unknown' }));

app.get('/', (c) => {
  if (c.env.ADMIN_APP_ORIGIN) return c.redirect(c.env.ADMIN_APP_ORIGIN, 302);
  return jsonOk(c, { service: 'telebotsb-worker', env: c.env.APP_ENV || 'unknown' });
});

app.post('/internal/setup-webhook', async (c) => {
  const auth = c.req.header('authorization');
  if (!auth || auth !== `Bearer ${c.env.SETUP_TOKEN}`) {
    return jsonErr(c, 'Unauthorized', 401);
  }

  const prereq = getWebhookPrereq(c.env);
  if (!prereq.hasBotToken || !prereq.hasApiBaseUrl || !prereq.hasWebhookSecret) {
    return jsonErr(c, 'BOT_TOKEN/API_BASE_URL/TELEGRAM_WEBHOOK_SECRET harus diset dulu', 400);
  }

  const webhookUrl = getWebhookUrl(c.env);
  const result = await setWebhook(c.env, webhookUrl, c.env.TELEGRAM_WEBHOOK_SECRET);
  return jsonOk(c, result);
});

// TEMP: verifikasi 15 ID themed animated emoji. Hapus setelah verifikasi.
app.post('/internal/verify-theme', async (c) => {
  const auth = c.req.header('authorization');
  if (!auth || auth !== `Bearer ${c.env.SETUP_TOKEN}`) return jsonErr(c, 'Unauthorized', 401);
  const body = await c.req.json().catch(() => ({}));
  const chatId = body.chatId;
  if (!chatId) return jsonErr(c, 'chatId wajib', 400);
  const MAP = {
    '🎬': '5105210939360150072', '🍿': '4909467581506650817', '🤖': '5127528233675260465',
    '💬': '4909425692690612897', '💻': '4906902450943820893', '🎵': '4909009428755251810',
    '🚀': '4906908665761497930', '🔥': '4906965037207257780', '💎': '4907219728767910669',
    '🛒': '4913872237972423556', '🎮': '4909364218823705430', '📺': '5105066512494887500',
    '🎨': '4908971929395791571', '🪄': '4909068205382698096', '✅': '4924931972033151903',
  };
  const results = {};
  for (const [plain, id] of Object.entries(MAP)) {
    const html = `<tg-emoji emoji-id="${id}">${plain}</tg-emoji> ${plain}=${id}`;
    try {
      await telegramApi(c.env, 'sendMessage', { chat_id: chatId, text: html, parse_mode: 'HTML' });
      results[plain] = 'ok';
    } catch (e) {
      results[plain] = `FAIL: ${e.description || e.message}`;
    }
  }
  return jsonOk(c, results);
});

app.post('/telegram/webhook', async (c) => {
  const secret = c.req.header('x-telegram-bot-api-secret-token');
  if (c.env.TELEGRAM_WEBHOOK_SECRET && secret !== c.env.TELEGRAM_WEBHOOK_SECRET) {
    return jsonErr(c, 'Forbidden', 403);
  }

  const db = c.get('db');

  // Wrapping the entire update handling in try/catch so any unexpected throw
  // (malformed callback, DB error, whatever) returns 'ok' instead of 500.
  // Telegram retries HTTP 500 updates repeatedly — idempotency (claim locks) means
  // no double-deliver, but a thrown handler still stranding the response is avoidable.
  try {
  const update = await c.req.json();
  const reqCache = {};
  if (update.message?.from) {
    const msg = update.message;
    const user = msg.from;
    if (rateLimited(user.id)) return c.text('ok');
    await db.upsertUser(user);

    const text = (msg.text || '').trim();
    // Dock keyboard: numbered product [N] → resolve dari catalog yang disimpan.
    const dockMatch = text.match(/^\[(\d+)\]$/);
    if (dockMatch) {
      const n = Number(dockMatch[1]);
      const raw = await db.getSetting(`catalog_${user.id}`, '');
      await db.setSetting(`catalog_${user.id}`, ''); // clear biar gak numpuk
      if (raw) {
        try {
          const ids = JSON.parse(raw);
          if (n > 0 && n <= ids.length) {
            const buyId = ids[n - 1];
            // Cari product dan trigger buy langsung dari sini (tanpa redirect callback).
            const product = await db.getProductById(buyId);
            if (product) {
              const lang = await getUserLang(db, user.id) || 'id';
              const qrisOn = await isVioletEnabled(db, c.env);
              const intlMult = await getIntlMultiplier(db);
              const usdRate = await getUsdRate(db);
              const tProduct = { ...product, name: await translateText(c.env, db, product.name, lang) };
              const conf = buildBuyConfirmation(c.env, tProduct, 1, qrisOn, lang, intlMult, usdRate);
              await sendMessage(c.env, msg.chat.id, conf.text, { reply_markup: { inline_keyboard: conf.keyboard } });
              return c.text('ok');
            }
          }
        } catch { /* ignore */ }
      }
    }
    // /menu toggle — hide/show dock keyboard.
    if (text === '/menu' || text === t('id', 'btn_hide_kb') || text === t('en', 'btn_hide_kb') || text === t('zh', 'btn_hide_kb')) {
      const lang = await getUserLang(db, user.id) || 'id';
      const hidden = await db.getSetting(`menu_hidden_${user.id}`, '');
      if (hidden) {
        // Show menu
        await db.setSetting(`menu_hidden_${user.id}`, '');
        const kb = await getReplyKeyboard(c.env, lang, db, user.id);
        await sendMessage(c.env, msg.chat.id, t(lang, 'menu_aktif'), { reply_markup: kb });
      } else {
        // Hide menu
        await db.setSetting(`menu_hidden_${user.id}`, '1');
        await sendMessage(c.env, msg.chat.id, t(lang, 'menu_aktif'), {
          reply_markup: { remove_keyboard: true },
        });
      }
      return c.text('ok');
    }
    // Dock keyboard: Back button → restore dock menu.
    if (text === '⬅️ Back' || text === '⬅️ Kembali' || text === '⬅️ 返回') {
      const lang = await getUserLang(db, user.id) || 'id';
      await sendStartMenu(c.env, msg.chat.id, user.first_name, { user, lang });
      await sendMessage(c.env, msg.chat.id, t(lang, 'menu_aktif'), {
        reply_markup: await getReplyKeyboard(c.env, lang, db, user.id),
      });
      return c.text('ok');
    }
    // Mode tambah-produk aktif? Pesan ini = data produk baru (admin only).
    {
      const v = await db.getSetting(`await_addprod_${user.id}`, '');
      const ts = Number(await db.getSetting(`await_addprod_ts_${user.id}`, '0'));
      if (v && Date.now() - ts > 300000) {
        await db.setSetting(`await_addprod_${user.id}`, '');
        await db.setSetting(`await_addprod_ts_${user.id}`, '');
      } else if (v && text && !text.startsWith('/') && !resolveMenuAction(text) && text.includes('|')) {
        const adminId = await getAdminChatId(db, c.env);
        if (adminId && Number(user.id) === adminId) {
          await db.setSetting(`await_addprod_${user.id}`, '');
          await db.setSetting(`await_addprod_ts_${user.id}`, '');
          const [name, priceStr, cat, emoji] = text.split('|').map((x) => (x || '').trim());
          const price = Math.round(Number(priceStr) || 0);
          if (!name || price <= 0) {
            await sendMessage(c.env, msg.chat.id, '❌ Format salah. Butuh minimal: <code>nama | harga</code>', { parse_mode: 'HTML' });
            return c.text('ok');
          }
          const newId = await db.addProduct({ name: name.slice(0, 200), price, category: cat || 'Umum', emoji: emoji || null, description: '' });
          await sendMessage(c.env, msg.chat.id,
            `✅ Produk dibuat!\n🛍️ <b>${escapeHtml(name)}</b>\n💰 Rp ${formatIdr(price)}\n\nTap /admin → 🛍️ Kelola Produk → produk ini untuk atur stok & gambar.`,
            { parse_mode: 'HTML' });
          return c.text('ok');
        }
      }
    }
    // Mode edit field produk aktif? Pesan ini = nilai baru (name|price|desc). Format: <field>:<prodId>
    {
      const v = await db.getSetting(`await_pfield_${user.id}`, '');
      const ts = Number(await db.getSetting(`await_pfield_ts_${user.id}`, '0'));
      if (v && Date.now() - ts > 300000) {
        await db.setSetting(`await_pfield_${user.id}`, '');
        await db.setSetting(`await_pfield_ts_${user.id}`, '');
      } else if (v && text && !text.startsWith('/') && !resolveMenuAction(text)) {
        const adminId = await getAdminChatId(db, c.env);
        if (adminId && Number(user.id) === adminId) {
          const [field, prodIdStr] = v.split(':');
          const prodId = Number(prodIdStr);
          await db.setSetting(`await_pfield_${user.id}`, '');
          await db.setSetting(`await_pfield_ts_${user.id}`, '');
          const product = await db.getProductById(prodId);
          if (!product) { await sendMessage(c.env, msg.chat.id, '❌ Produk tidak ditemukan.'); return c.text('ok'); }
          if (field === 'name') {
            const newName = text.slice(0, 200).trim();
            await db.updateProductName(prodId, newName);
            await sendMessage(c.env, msg.chat.id, `✅ Nama → <b>${escapeHtml(newName)}</b>`, { parse_mode: 'HTML' });
          } else if (field === 'price') {
            const price = Math.round(Number(text.replace(/[^\d]/g, '')) || 0);
            if (price <= 0) { await sendMessage(c.env, msg.chat.id, '❌ Harga tidak valid.'); return c.text('ok'); }
            await db.updateProductPrice(prodId, price);
            await sendMessage(c.env, msg.chat.id, `✅ Harga → Rp ${formatIdr(price)}`);
          } else if (field === 'desc') {
            await db.updateProductDescription(prodId, text.slice(0, 1000).trim());
            await sendMessage(c.env, msg.chat.id, `✅ Deskripsi diperbarui.`);
          }
          return c.text('ok');
        }
      }
    }
    // Mode atur-emoji aktif? Pesan ini = emoji baru atau "auto".
    {
      const v = await db.getSetting(`await_emoji_${user.id}`, '');
      const ts = Number(await db.getSetting(`await_emoji_ts_${user.id}`, '0'));
      if (v && Date.now() - ts > 300000) {
        await db.setSetting(`await_emoji_${user.id}`, '');
        await db.setSetting(`await_emoji_ts_${user.id}`, '');
      } else if (v && text && !text.startsWith('/') && !resolveMenuAction(text)) {
        const adminId = await getAdminChatId(db, c.env);
        if (adminId && Number(user.id) === adminId) {
          const prodId = Number(v);
          await db.setSetting(`await_emoji_${user.id}`, '');
          await db.setSetting(`await_emoji_ts_${user.id}`, '');
          const trimmed = text.trim();
          const emoji = trimmed.toLowerCase() === 'auto' ? null : trimmed.slice(0, 8);
          await db.updateProductEmoji(prodId, emoji);
          const p = await db.getProductById(prodId);
          const shown = (p.emoji && String(p.emoji).trim()) || productThemeEmoji(p.name, p.category) + ' (auto)';
          await sendMessage(c.env, msg.chat.id, `✅ Emoji ${escapeHtml(p.name)} → ${escapeHtml(emoji || '(auto)')}\nSekarang: ${shown}`);
          return c.text('ok');
        }
      }
    }
    // Mode tambah-stok aktif? Pesan ini = 1+ baris kredensial (admin only).
    {
      const v = await db.getSetting(`await_addstock_${user.id}`, '');
      const ts = Number(await db.getSetting(`await_addstock_ts_${user.id}`, '0'));
      if (v && Date.now() - ts > 300000) {
        await db.setSetting(`await_addstock_${user.id}`, '');
        await db.setSetting(`await_addstock_ts_${user.id}`, '');
      } else if (v && text && !text.startsWith('/') && !resolveMenuAction(text)) {
        const adminId = await getAdminChatId(db, c.env);
        if (adminId && Number(user.id) === adminId) {
          const prodId = Number(v);
          await db.setSetting(`await_addstock_${user.id}`, '');
          await db.setSetting(`await_addstock_ts_${user.id}`, '');
          const product = await db.getProductById(prodId);
          if (!product) { await sendMessage(c.env, msg.chat.id, '❌ Produk tidak ditemukan.'); return c.text('ok'); }
          if (Number(product.is_unlimited_stock) === 1) {
            await sendMessage(c.env, msg.chat.id, `♾️ <b>${escapeHtml(product.name)}</b> adalah produk Unlimited (digital file).\nStok lokal gak dipakai — stok yang lo tambah ke sini gak bakal dikirim ke buyer.\nUpload file via web panel biar Unlimited-nya jalan bener.`, { parse_mode: 'HTML' });
            return c.text('ok');
          }
          const items = text.split('\n').map((x) => x.trim()).filter(Boolean);
          if (!items.length) { await sendMessage(c.env, msg.chat.id, '❌ Tidak ada baris terdeteksi.'); return c.text('ok'); }
          await db.addStockItems(prodId, items.slice(0, 50));
          const fresh = await db.getProductById(prodId);
          await sendMessage(c.env, msg.chat.id,
            `✅ ${items.length} stok ditambah ke <b>${escapeHtml(product.name)}</b>\n📦 Sisa stok sekarang: ${fresh.stock_count}`,
            { parse_mode: 'HTML' });
          return c.text('ok');
        }
      }
    }
    // Mode search aktif? Pesan ini = keyword pencarian (kecuali command/menu).
    const awaitSearch = await db.getSetting(`await_search_${user.id}`, '');
    const _searchTs = Number(await db.getSetting(`await_search_ts_${user.id}`, '0'));
    if (awaitSearch === '1' && Date.now() - _searchTs > 300000) {
      await db.setSetting(`await_search_${user.id}`, '');
      await db.setSetting(`await_search_ts_${user.id}`, '');
    } else if (awaitSearch === '1' && text && !text.startsWith('/') && !resolveMenuAction(text)) {
      await db.setSetting(`await_search_${user.id}`, '');
      await db.setSetting(`await_search_ts_${user.id}`, '');
      const lang = await getUserLang(db, user.id) || 'id';
      const results = await db.searchProducts(text);
      if (!results.length) {
        await sendMessage(c.env, msg.chat.id, t(lang, 'search_empty'));
      } else {
        await sendProductCatalog(c.env, db, msg.chat.id, null, false, lang, results, t(lang, 'search_result', { q: escapeHtml(text) }), reqCache);
      }
      return c.text('ok');
    }
    if (text.startsWith('/start')) {
      // Selalu tampilkan language picker tiap /start. Setelah pilih,
      // handler setlang: otomatis lanjut welcome + animasi + dock menu.
      await sendLanguagePicker(c.env, msg.chat.id);
      return c.text('ok');
    } else if (resolveMenuAction(text) === 'store' || text.startsWith('/miniapp')) {
      const lang = await getUserLang(db, user.id) || 'id';
      if (!c.env.MINIAPP_ORIGIN) {
        await sendMessage(c.env, msg.chat.id, t(lang, 'err_miniapp_not_set'));
      } else {
        await sendMessage(c.env, msg.chat.id, t(lang, 'btn_store') + ':', {
          reply_markup: {
            inline_keyboard: [
              [{ text: t(lang, 'btn_store'), web_app: { url: c.env.MINIAPP_ORIGIN } }],
            ],
          },
        });
      }
    } else if (resolveMenuAction(text) === 'lang') {
      await sendLanguagePicker(c.env, msg.chat.id);
    } else if (resolveMenuAction(text) === 'search') {
      const lang = await getUserLang(db, user.id) || 'id';
      await db.setSetting(`await_search_${user.id}`, '1');
      await db.setSetting(`await_search_ts_${user.id}`, String(Date.now()));
      await sendMessage(c.env, msg.chat.id, t(lang, 'search_prompt'));
    } else if (text.startsWith('/produk') || resolveMenuAction(text) === 'products') {
      const lang = await getUserLang(db, user.id) || 'id';
      const prods = await db.getProducts();
      // Simpan catalog di temp setting biar bisa di-resolve pas user tap [N] dari keyboard.
      await db.setSetting(`catalog_${user.id}`, JSON.stringify(prods.map((p) => p.id)));
      // Kirim katalog lightweight (tanpa inline keyboard — navigasi via dock).
      const intlMultDk = await getIntlMultiplier(db);
      const usdRateDk = await getUsdRate(db);
      let catMsg = t(lang, 'catalog_title', { store: escapeHtml((await getBrandSettings(db)).name.toUpperCase()) }) + '\n';
      catMsg += t(lang, 'catalog_sub') + '\n\n';
      const cardsDk = await buildCatalogCards(c.env, db, prods, lang, intlMultDk, usdRateDk);
      catMsg += cardsDk.text;
      catMsg += '\n' + t(lang, 'catalog_dock_hint');
      await sendMessage(c.env, msg.chat.id, animateEmoji(catMsg));
      // Ganti dock keyboard ke numbered product + Back.
      const dock = [];
      let btns = [];
      for (let i = 0; i < prods.length; i++) {
        btns.push({ text: `[${i + 1}]` });
        if (btns.length === 4 || i === prods.length - 1) {
          dock.push(btns);
          btns = [];
        }
      }
      dock.push([{ text: t(lang, 'btn_back') }]);
      await sendMessage(c.env, msg.chat.id, '👇', {
        reply_markup: { keyboard: dock, resize_keyboard: true, one_time_keyboard: false },
      });
    } else if (resolveMenuAction(text) === 'popular') {
      const lang = await getUserLang(db, user.id) || 'id';
      await sendProductCatalog(c.env, db, msg.chat.id, null, true, lang, null, null, reqCache);
    } else if (text.startsWith('/pesanan') || resolveMenuAction(text) === 'orders') {
      const lang = await getUserLang(db, user.id) || 'id';
      const orders = await db.getOrdersByUser(user.id, 10);
      if (!orders.length) {
        await sendMessage(c.env, msg.chat.id, t(lang, 'no_orders'));
      } else {
        const brand = await getBrandSettings(db);
        const usdRate = await getUsdRate(db);
        const lines = orders.map((o) => `${formatOrderCodeWithBrand(o.id, brand.shortName)} | ${escapeHtml(o.product_name)} | ${formatMoney(o.price, lang, usdRate)} | ${o.status.toUpperCase()}`);
        const oRows = orders.slice(0, 8).map((o) => [{
          text: `${formatOrderCodeWithBrand(o.id, brand.shortName)} · ${o.status.toUpperCase()}`.slice(0, 40),
          callback_data: `order_view:${o.id}`,
        }]);
        await sendMessage(c.env, msg.chat.id, `${t(lang, 'your_orders')}\n\n${lines.join('\n')}`, {
          reply_markup: { inline_keyboard: oRows },
        });
      }
    } else if (resolveMenuAction(text) === 'wallet') {
      const lang = await getUserLang(db, user.id) || 'id';
      const points = await db.getWalletPoints(user.id);
      const balance = await db.getWalletBalance(user.id);
      let wMsg = t(lang, 'wallet_title') + '\n';
      wMsg += '━━━━━━━━━━━━━━━━━━━━\n';
      if (balance > 0) {
        wMsg += t(lang, 'wallet_refund_balance', { amount: formatIdr(balance) }) + '\n';
        wMsg += t(lang, 'wallet_refund_note') + '\n';
      }
      if (points > 0) {
        wMsg += t(lang, 'wallet_balance', { points: points.toLocaleString('en-US') }) + '\n';
        wMsg += t(lang, 'wallet_earned');
      }
      if (balance === 0 && points === 0) {
        wMsg += t(lang, 'wallet_no_orders');
      }
      await sendMessage(c.env, msg.chat.id, wMsg);
    } else if (resolveMenuAction(text) === 'refund') {
      const lang = await getUserLang(db, user.id) || 'id';
      const orders = await db.getOrdersByUser(user.id, 20);
      const paid = orders.filter((o) => o.status === 'paid' || o.status === 'delivered');
      if (!paid.length) {
        await sendMessage(c.env, msg.chat.id, t(lang, 'refund_no_orders'));
      } else {
        const brand = await getBrandSettings(db);
        let rMsg = t(lang, 'refund_title') + '\n';
        rMsg += '━━━━━━━━━━━━━━━━━━━━\n\n';
        rMsg += t(lang, 'refund_prompt');
        const kb = paid.slice(0, 5).map((o) => [{
          text: `${formatOrderCodeWithBrand(o.id, brand.shortName)} · ${escapeHtml(o.product_name || '').slice(0, 20)}`,
          callback_data: `refund_req:${o.id}`,
        }]);
        await sendMessage(c.env, msg.chat.id, rMsg, { reply_markup: { inline_keyboard: kb } });
      }
    } else if (text.startsWith('/admin')) {
      const adminId = await getAdminChatId(db, c.env);
      if (adminId && Number(user.id) === adminId) {
        await sendAdminMenu(c.env, db, msg.chat.id);
      } else {
        await sendMessage(c.env, msg.chat.id, '⛔ Menu admin khusus pemilik toko.');
      }
    } else if (resolveMenuAction(text) === 'help' || text.startsWith('/help')) {
      const lang = await getUserLang(db, user.id) || 'id';
      const brand = await getBrandSettings(db);
      const supportUrl = String(brand.supportTelegramUrl || brand.supportWhatsappUrl || '').trim();
      let help = t(lang, 'help_title', { store: escapeHtml(brand.name || 'Store') }) + '\n\n';
      help += t(lang, 'help_body');
      if (supportUrl) help += '\n\n' + t(lang, 'help_cs', { url: supportUrl });
      await sendMessage(c.env, msg.chat.id, help);
    } else if (text) {
      const lang = await getUserLang(db, user.id) || 'id';
      await sendStartMenu(c.env, msg.chat.id, user.first_name, {
        user,
        lang,
      });
    }
  }

  if (update.callback_query) {
    const cq = update.callback_query;
    const data = cq.data || '';
    const user = cq.from;
    const chatId = cq.message?.chat?.id;
    const messageId = cq.message?.message_id;

    if (rateLimited(user.id, 12, 5000)) return c.text('ok');
    await answerCallback(c.env, cq.id);
    await db.upsertUser(user);

    if (data.startsWith('setlang:')) {
      const lang = normalizeLang(data.split(':')[1]) || 'en';
      await db.setUserLanguage(user.id, lang).catch(() => {});
      await sendMessage(c.env, chatId, t(lang, 'lang_set'));
      if (c.env.MINIAPP_ORIGIN) {
        await setChatMenuButton(c.env, c.env.MINIAPP_ORIGIN, t(lang, 'btn_store')).catch(() => {});
      }
      try {
        const cap = `👑 <b>${escapeHtml((await getBrandSettings(db)).name || 'Store')}</b>`;
        const cachedFid = await db.getSetting('welcome_anim_file_id', '');
        if (cachedFid) {
          await sendAnimationByFileId(c.env, chatId, cachedFid, cap);
        } else {
          const res = await sendAnimationFromR2(c.env, chatId, 'welcome.gif', cap);
          const fid = res?.animation?.file_id || res?.document?.file_id;
          if (fid) await db.setSetting('welcome_anim_file_id', fid);
        }
      } catch (e) { console.warn('[setlang anim] skip:', e.message); }
      await sendStartMenu(c.env, chatId, user.first_name, { user, lang });
      const kb = await getReplyKeyboard(c.env, lang, db, user.id);
      await sendMessage(c.env, chatId, t(lang, 'menu_aktif'), { reply_markup: kb });
    } else if (data.startsWith('refund_req:')) {
      const orderId = Number(data.split(':')[1]);
      const lang = await getUserLang(db, user.id) || 'id';
      const brand = await getBrandSettings(db);
      const order = await db.getOrderById(orderId);
      const code = formatOrderCodeWithBrand(orderId, brand.shortName);
      if (!order || Number(order.user_id) !== Number(user.id)) {
        await sendMessage(c.env, chatId, t(lang, 'err_order_not_found'));
      } else if (order.status === 'refunded') {
        await sendMessage(c.env, chatId, t(lang, 'refund_already', { code }));
      } else if (order.status === 'refund_requested') {
        await sendMessage(c.env, chatId, t(lang, 'refund_pending_admin', { code }));
      } else if (order.status !== 'paid' && order.status !== 'delivered') {
        await sendMessage(c.env, chatId, t(lang, 'refund_not_eligible', { code }));
      } else {
        // Total yang buyer benar-benar bayar: wallet_internal => price (== wallet_applied, uang sama);
        // selain itu => price (gateway) + wallet_applied (porsi saldo) biar partial-pay ke-refund penuh.
        const amount = String(order.payment_provider || '').toLowerCase() === 'wallet_internal'
          ? (Number(order.price) || 0)
          : (Number(order.price) || 0) + (Number(order.wallet_applied) || 0);
        await db.updateOrderStatus(orderId, 'refund_requested');
        await db.createRefundRequest(orderId, user.id, 'Refund requested — awaiting admin approval').catch(() => {});
        await sendMessage(c.env, chatId, t(lang, 'refund_requested', { code }), { parse_mode: 'HTML' });
        const adminId = await getAdminChatId(db, c.env);
        if (adminId) {
          const adminMsg = `↩️ <b>Refund Request</b>\n━━━━━━━━━━━━━━━━━━\nOrder <b>${code}</b>\n💰 Rp ${formatIdr(amount)}\n👤 ${order.username ? '@' + escapeHtml(order.username) : escapeHtml(order.first_name || '')}`;
          await sendMessage(c.env, adminId, adminMsg, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[
              { text: '✅ Approve', callback_data: `refund_approve:${orderId}` },
              { text: '❌ Reject', callback_data: `refund_reject:${orderId}` },
            ]] },
          }).catch(() => {});
        }
      }
    } else if (data.startsWith('refund_approve:')) {
      const orderId = Number(data.split(':')[1]);
      const lang = await getUserLang(db, user.id) || 'id';
      const adminId = await getAdminChatId(db, c.env);
      if (!adminId || Number(user.id) !== adminId) {
        await sendMessage(c.env, chatId, t(lang, 'err_access_denied'));
      } else {
        const order = await db.getOrderById(orderId);
        const brand = await getBrandSettings(db);
        const code = formatOrderCodeWithBrand(orderId, brand.shortName);
        if (!order || order.status !== 'refund_requested') {
          await sendMessage(c.env, chatId, t(lang, 'refund_not_eligible', { code }));
        } else if (!(await db.claimRefundApproval(orderId))) {
          // Atomic claim gagal → sudah diproses (double-tap / race). Jangan kredit lagi.
          await sendMessage(c.env, chatId, t(lang, 'refund_not_eligible', { code }));
        } else {
          // Refund total yang buyer bayar: porsi gateway (order.price) + porsi saldo (wallet_applied).
          // wallet_internal: price == wallet_applied (uang yang sama), jadi pakai price aja biar gak dobel.
          const isWallet = String(order.payment_provider || '').toLowerCase() === 'wallet_internal';
          const amount = isWallet
            ? (Number(order.price) || 0)
            : (Number(order.price) || 0) + (Number(order.wallet_applied) || 0);
          await db.addWalletBalance(order.user_id, amount);
          await db.updateRefundStatus(orderId, 'approved').catch(() => {});
          await sendMessage(c.env, chatId, `✅ Refund approved: ${code} → Rp ${formatIdr(amount)}`);
          await sendMessage(c.env, order.user_id, t(lang, 'refund_approved', { code, amount: formatIdr(amount) }), { parse_mode: 'HTML' }).catch(() => {});
        }
      }
    } else if (data.startsWith('refund_reject:')) {
      const orderId = Number(data.split(':')[1]);
      const lang = await getUserLang(db, user.id) || 'id';
      const adminId = await getAdminChatId(db, c.env);
      if (!adminId || Number(user.id) !== adminId) {
        await sendMessage(c.env, chatId, t(lang, 'err_access_denied'));
      } else {
        const order = await db.getOrderById(orderId);
        const brand = await getBrandSettings(db);
        const code = formatOrderCodeWithBrand(orderId, brand.shortName);
        if (!order || order.status !== 'refund_requested') {
          await sendMessage(c.env, chatId, t(lang, 'refund_not_eligible', { code }));
        } else if (!(await db.claimRefundRejection(orderId))) {
          // Atomic claim gagal → status sudah berubah (mis. approve menang duluan). Jangan clobber.
          await sendMessage(c.env, chatId, t(lang, 'refund_not_eligible', { code }));
        } else {
          await db.updateRefundStatus(orderId, 'rejected').catch(() => {});
          await sendMessage(c.env, chatId, `❌ Refund rejected: ${code}`);
          const userLang = await getUserLang(db, order.user_id) || 'id';
          await sendMessage(c.env, order.user_id, t(userLang, 'refund_rejected', { code }), { parse_mode: 'HTML' }).catch(() => {});
        }
      }
    } else if (data === 'view_products') {
      const lang = await getUserLang(db, user.id) || 'id';
      await sendProductCatalog(c.env, db, chatId, null, false, lang, null, null, reqCache);
    } else if (data === 'view_products_keep') {
      const lang = await getUserLang(db, user.id) || 'id';
      await sendProductCatalog(c.env, db, chatId, null, false, lang, null, null, reqCache);
    } else if (data === 'show_menu') {
      const lang = await getUserLang(db, user.id) || 'id';
      const kb = await getReplyKeyboard(c.env, lang, db, user.id);
      await sendMessage(c.env, chatId, t(lang, 'menu_aktif'), { reply_markup: kb });
    } else if (data === 'home') {
      const lang = await getUserLang(db, user.id) || 'id';
      await sendStartMenu(c.env, chatId, user.first_name, { user, lang });
    } else if (data.startsWith('admin:')) {
      const lang = await getUserLang(db, user.id) || 'id';
      const adminId = await getAdminChatId(db, c.env);
      if (!adminId || Number(user.id) !== adminId) {
        await sendMessage(c.env, chatId, t(lang, 'err_access_denied'));
      } else if (data === 'admin:stats') {
        await sendAdminMenu(c.env, db, chatId, { messageId });
      } else if (data === 'admin:orders') {
        const orders = await db.getAllOrders(10);
        const brand = await getBrandSettings(db);
        let txt = `📦 <b>10 Order Terbaru</b>\n━━━━━━━━━━━━━━━━━━\n`;
        if (!orders.length) {
          txt += '\nBelum ada order.';
        } else {
          for (const o of orders) {
            const code = formatOrderCodeWithBrand(o.id, brand.shortName);
            txt += `\n${code} · ${escapeHtml((o.product_name || '').slice(0, 24))}\n  Rp ${formatIdr(o.price)} · <b>${o.status.toUpperCase()}</b>\n`;
          }
        }
        await telegramApi(c.env, 'editMessageText', {
          chat_id: chatId, message_id: messageId, text: txt, parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali', callback_data: 'admin:stats' }]] },
        }).catch(() => {});
      } else if (data === 'admin:users') {
        const users = await db.getAllUsers(10);
        let txt = `👥 <b>10 User Terbaru</b>\n━━━━━━━━━━━━━━━━━━\n`;
        if (!users.length) {
          txt += '\nBelum ada user.';
        } else {
          for (const u of users) {
            const uname = u.username ? '@' + escapeHtml(u.username) : (escapeHtml(u.first_name || '-'));
            txt += `\n• ${uname} · <code>${u.user_id}</code>\n`;
          }
        }
        await telegramApi(c.env, 'editMessageText', {
          chat_id: chatId, message_id: messageId, text: txt, parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali', callback_data: 'admin:stats' }]] },
        }).catch(() => {});
      } else if (data === 'admin:products') {
        // Product manager: daftar semua produk (aktif+nonaktif) dgn stok & aksi cepat.
        const prods = await db.getAllProductsAdmin(30);
        let txt = '🛍️ <b>Kelola Produk</b>\n━━━━━━━━━━━━━━━━━━\n';
        const kb = [];
        if (!prods.length) {
          txt += '\nBelum ada produk. Tap ➕ Tambah Produk di bawah.';
        } else {
          txt += 'Tap produk untuk edit / atur stok / emoji.\n';
          for (const p of prods) {
            const st = Number(p.is_unlimited_stock) === 1 ? '♾️' : (Number(p.stock_count) > 0 ? `📦${p.stock_count}` : '🔴');
            const act = Number(p.is_active) === 1 ? '✅' : '⏸️';
            const em = (p.emoji && String(p.emoji).trim()) || productThemeEmoji(p.name, p.category);
            kb.push([{ text: `${act}${em} ${p.name} · ${st} · Rp${formatIdr(p.price)}`.slice(0, 60), callback_data: `prod:${p.id}` }]);
          }
        }
        kb.push([{ text: '➕ Tambah Produk', callback_data: 'prod:add' }]);
        kb.push([{ text: '⬅️ Kembali', callback_data: 'admin:stats' }]);
        await telegramApi(c.env, 'editMessageText', {
          chat_id: chatId, message_id: messageId, text: txt, parse_mode: 'HTML',
          reply_markup: { inline_keyboard: kb },
        }).catch(() => {});
      } else if (data === 'admin:violetpending') {
        // Violet/QRIS punya no status re-query API → webhook yang meleset bikin order
        // nyangkut pending walau buyer udah bayar. Ini recovery manual buat owner.
        const orders = await db.getPendingVioletOrders(20);
        const brand = await getBrandSettings(db);
        let txt = '🟢 <b>QRIS Pending (belum ke-konfirmasi)</b>\n━━━━━━━━━━━━━━━━━━\n';
        const kb = [];
        if (!orders.length) {
          txt += '\nGak ada order QRIS yang nyangkut. ✅';
        } else {
          txt += '\nKonfirmasi hanya kalau dana QRIS BENAR sudah masuk di dashboard Violet.\n';
          for (const o of orders) {
            const code = formatOrderCodeWithBrand(o.id, brand.shortName);
            txt += `\n${code} · ${escapeHtml((o.product_name || '').slice(0, 24))}\n  Rp ${formatIdr(o.price)} · qty ${o.quantity}\n`;
            kb.push([{ text: `✅ Konfirmasi ${code}`.slice(0, 40), callback_data: `vconfirm:${o.id}` }]);
          }
        }
        kb.push([{ text: '⬅️ Kembali', callback_data: 'admin:stats' }]);
        await telegramApi(c.env, 'editMessageText', {
          chat_id: chatId, message_id: messageId, text: txt, parse_mode: 'HTML',
          reply_markup: { inline_keyboard: kb },
        }).catch(() => {});
      }
    } else if (data.startsWith('vconfirm:')) {
      const lang = await getUserLang(db, user.id) || 'id';
      const adminId = await getAdminChatId(db, c.env);
      if (!adminId || Number(user.id) !== adminId) {
        await sendMessage(c.env, chatId, t(lang, 'err_access_denied'));
      } else {
        const orderId = Number(data.split(':')[1]);
        const order = await db.getOrderById(orderId);
        if (!order) {
          await sendMessage(c.env, chatId, '❌ Order gak ketemu.');
        } else if (String(order.payment_provider || '').toLowerCase() !== 'violet') {
          await sendMessage(c.env, chatId, '❌ Order ini bukan QRIS/Violet.');
        } else if (order.status !== 'pending') {
          await sendMessage(c.env, chatId, `ℹ️ Order udah berstatus <b>${escapeHtml(order.status)}</b>, gak perlu konfirmasi lagi.`, { parse_mode: 'HTML' });
        } else {
          // deliverOrder mengklaim pending→paid secara atomik (idempoten).
          await deliverOrder(c.env, db, order);
          const fresh = await db.getOrderById(orderId);
          const brand = await getBrandSettings(db);
          const code = formatOrderCodeWithBrand(orderId, brand.shortName);
          if (fresh && (fresh.status === 'paid' || fresh.status === 'delivered')) {
            await sendMessage(c.env, chatId, `✅ Order ${code} dikonfirmasi & dikirim ke buyer.`);
          } else {
            await sendMessage(c.env, chatId, `⚠️ Order ${code} gagal dikirim (status: ${escapeHtml(fresh?.status || '?')}). Cek stok.`);
          }
        }
      }
    } else if (data === 'prod:add') {
      const lang = await getUserLang(db, user.id) || 'id';
      const adminId = await getAdminChatId(db, c.env);
      if (!adminId || Number(user.id) !== adminId) {
        await sendMessage(c.env, chatId, t(lang, 'err_access_denied'));
      } else {
        await db.setSetting(`await_addprod_${user.id}`, '1');
        await db.setSetting(`await_addprod_ts_${user.id}`, String(Date.now()));
        await sendMessage(c.env, chatId,
          '➕ <b>Tambah Produk</b>\n━━━━━━━━━━━━━━━━━━\nKirim data produk dengan format:\n\n<code>nama | harga | kategori | emoji</code>\n\nContoh:\n<code>Netflix Premium 1 Bulan | 250000 | Streaming | 🎬</code>\n\n• Harga dalam Rupiah (angka).\n• Emoji opsional (kosongin → auto dari nama).\n• Stok & gambar diatur setelah produk dibuat.',
          { parse_mode: 'HTML' });
      }
    } else if (data.startsWith('prod:')) {
      const lang = await getUserLang(db, user.id) || 'id';
      const adminId = await getAdminChatId(db, c.env);
      if (!adminId || Number(user.id) !== adminId) {
        await sendMessage(c.env, chatId, t(lang, 'err_access_denied'));
      } else {
        const prodId = Number(data.split(':')[1]);
        const product = await db.getProductById(prodId);
        if (!product) {
          await sendMessage(c.env, chatId, t(lang, 'err_product_not_found'));
        } else {
          const isUnlim = Number(product.is_unlimited_stock) === 1;
          const stockLabel = isUnlim ? '♾️ Unlimited' : `📦 ${product.stock_count} stok`;
          const actLabel = Number(product.is_active) === 1 ? '⏸️ Nonaktifkan' : '▶️ Aktifkan';
          const em = (product.emoji && String(product.emoji).trim()) || productThemeEmoji(product.name, product.category);
          let txt = `🛍️ <b>${em} ${escapeHtml(product.name)}</b>\n━━━━━━━━━━━━━━━━━━\n`;
          txt += `💰 Rp ${formatIdr(product.price)}\n`;
          txt += `🏷️ ${escapeHtml(product.category || 'Umum')}\n`;
          txt += `${stockLabel}\n`;
          if (product.description) txt += `📝 ${escapeHtml(String(product.description).slice(0, 120))}\n`;
          const kb = [
            [{ text: '✏️ Nama', callback_data: `pf:name:${prodId}` }, { text: '💵 Harga', callback_data: `pf:price:${prodId}` }],
            [{ text: '📝 Deskripsi', callback_data: `pf:desc:${prodId}` }, { text: '😀 Emoji', callback_data: `pf:emoji:${prodId}` }],
            [{ text: '📦 Kelola Stok', callback_data: `pf:stock:${prodId}` }],
            [{ text: actLabel, callback_data: `pf:toggle:${prodId}` }],
            [{ text: '🗑️ Hapus Produk', callback_data: `pf:del:${prodId}` }],
            [{ text: '⬅️ Kembali', callback_data: 'admin:products' }],
          ];
          await telegramApi(c.env, 'editMessageText', {
            chat_id: chatId, message_id: messageId, text: txt, parse_mode: 'HTML',
            reply_markup: { inline_keyboard: kb },
          }).catch(() => {});
        }
      }
    } else if (data.startsWith('pf:')) {
      // Per-field edit + stock + toggle + delete. pf:<field>:<prodId>
      const lang = await getUserLang(db, user.id) || 'id';
      const adminId = await getAdminChatId(db, c.env);
      if (!adminId || Number(user.id) !== adminId) {
        await sendMessage(c.env, chatId, t(lang, 'err_access_denied'));
      } else {
        const [, field, prodIdStr] = data.split(':');
        const prodId = Number(prodIdStr);
        const product = await db.getProductById(prodId);
        if (!product) {
          await sendMessage(c.env, chatId, t(lang, 'err_product_not_found'));
        } else if (field === 'toggle') {
          await db.setProductActive(prodId, Number(product.is_active) !== 1);
          const next = await db.getProductById(prodId);
          await sendMessage(c.env, chatId, `${Number(next.is_active) === 1 ? '▶️ Aktif' : '⏸️ Nonaktif'}: ${escapeHtml(next.name)}`);
        } else if (field === 'del') {
          await db.deleteProduct(prodId);
          await sendMessage(c.env, chatId, `✅ <b>${escapeHtml(product.name)}</b> disembunyikan dari katalog. Ketik /admin → 🛍️ Kelola Produk untuk lihat & aktifkan lagi.`, { parse_mode: 'HTML' });
        } else if (field === 'stock') {
          // Stok manager: tampilkan stok saat ini + aksi tambah/hapus.
          let txt = `📦 <b>Kelola Stok: ${escapeHtml(product.name)}</b>\n━━━━━━━━━━━━━━━━━━\n`;
          if (Number(product.is_unlimited_stock) === 1) {
            txt += '\nProduk ini <b>Unlimited</b> (digital file). Stok lokal gak dipakai.\n';
          } else {
            const items = await db.listStock(prodId);
            txt += `Sisa stok: <b>${product.stock_count}</b> (total ${items.length} item, ${items.filter((s) => Number(s.is_sold) === 0).length} available)\n`;
          }
          txt += '\nKirim 1 akun/kredensial per baris untuk nambah stok (atau beberapa baris sekaligus).';
          await db.setSetting(`await_addstock_${user.id}`, String(prodId));
          await db.setSetting(`await_addstock_ts_${user.id}`, String(Date.now()));
          const kb = [
            [{ text: '🔄 Toggle Unlimited/Finite', callback_data: `pf:toggleunlim:${prodId}` }],
            [{ text: '⬅️ Kembali', callback_data: `prod:${prodId}` }],
          ];
          await telegramApi(c.env, 'editMessageText', {
            chat_id: chatId, message_id: messageId, text: txt, parse_mode: 'HTML',
            reply_markup: { inline_keyboard: kb },
          }).catch(() => {});
        } else if (field === 'toggleunlim') {
          const newUnlim = Number(product.is_unlimited_stock) !== 1;
          if (newUnlim && !product.digital_file_pointer) {
            await sendMessage(c.env, chatId, `❌ Gak bisa di-set Unlimited: produk ini belum punya digital_file_pointer.\nUpload file via web panel dulu (${c.env.ADMIN_APP_ORIGIN || 'admin panel'}), baru toggle Unlimited.`);
          } else {
            await db.updateProduct(prodId, { ...product, is_unlimited_stock: newUnlim });
            await sendMessage(c.env, chatId, `${newUnlim ? '♾️ Unlimited' : '📦 Finite'}: ${escapeHtml(product.name)}${newUnlim ? '\nFile digital siap dikirim otomatis.' : '\nSekarang pakai stok lokal.'}`);
          }
        } else if (field === 'emoji') {
          await db.setSetting(`await_emoji_${user.id}`, String(prodId));
          await db.setSetting(`await_emoji_ts_${user.id}`, String(Date.now()));
          await sendMessage(c.env, chatId,
            `😀 <b>Atur Emoji: ${escapeHtml(product.name)}</b>\n━━━━━━━━━━━━━━━━━━\nEmoji sekarang: ${product.emoji || '(auto)'}\n\nKirim emoji baru (1 karakter) atau ketik <code>auto</code> untuk reset ke otomatis.`,
            { parse_mode: 'HTML' });
        } else {
          // name | price | desc → set await, prompt for new value.
          const labels = { name: 'Nama', price: 'Harga (Rupiah, angka)', desc: 'Deskripsi' };
          if (!labels[field]) {
            await sendMessage(c.env, chatId, '❌ Field tidak dikenal. Pilih dari menu produk.');
          } else {
            await db.setSetting(`await_pfield_${user.id}`, `${field}:${prodId}`);
            await db.setSetting(`await_pfield_ts_${user.id}`, String(Date.now()));
            const cur = field === 'name' ? product.name : (field === 'price' ? formatIdr(product.price) : (product.description || '(kosong)'));
            await sendMessage(c.env, chatId,
              `✏️ <b>${labels[field]} Produk</b>\n━━━━━━━━━━━━━━━━━━\nSekarang: <b>${escapeHtml(String(cur))}</b>\n\nKirim ${labels[field].toLowerCase()} baru sebagai teks:`,
              { parse_mode: 'HTML' });
          }
        }
      }
    } else if (data === 'my_orders') {
      const lang = await getUserLang(db, user.id) || 'id';
      const orders = await db.getOrdersByUser(user.id, 10);
      const brand = await getBrandSettings(db);
      const usdRate = await getUsdRate(db);
      const text = orders.length
        ? `${t(lang, 'your_orders')}\n\n${orders.map((o) => `${formatOrderCodeWithBrand(o.id, brand.shortName)} | ${escapeHtml(o.product_name)} | ${formatMoney(o.price, lang, usdRate)} | ${o.status.toUpperCase()}`).join('\n')}`
        : t(lang, 'no_orders');
      const oRows = orders.slice(0, 8).map((o) => [{
        text: `${formatOrderCodeWithBrand(o.id, brand.shortName)} · ${o.status.toUpperCase()}`.slice(0, 40),
        callback_data: `order_view:${o.id}`,
      }]);
      oRows.push([{ text: t(lang, 'btn_home'), callback_data: 'home' }]);
      await telegramApi(c.env, 'editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: oRows },
      });
    } else if (data.startsWith('order_view:')) {
      const orderId = Number(data.split(':')[1]);
      const lang = await getUserLang(db, user.id) || 'id';
      const brand = await getBrandSettings(db);
      const order = await db.getOrderById(orderId);
      if (!order || Number(order.user_id) !== Number(user.id)) {
        await sendMessage(c.env, chatId, t(lang, 'err_order_not_found'));
      } else {
        const code = formatOrderCodeWithBrand(orderId, brand.shortName);
        let txt = `🧾 <b>${code}</b>\n━━━━━━━━━━━━━━━━━━\n`;
        txt += `📦 ${escapeHtml(order.product_name)}\n`;
        txt += `🔢 ${t(lang, 'lbl_qty')}: ${order.quantity}\n`;
        txt += `💰 ${formatMoney(order.price, lang, await getUsdRate(db))}\n`;
        txt += `📊 ${t(lang, 'lbl_status')}: <b>${order.status.toUpperCase()}</b>`;
        if (order.created_at) {
          const wib = new Date(new Date(order.created_at).getTime() + 7 * 3600 * 1000)
            .toISOString().slice(0, 16).replace('T', ' ');
          txt += `\n🕐 ${wib} WIB`;
        }
        const kb = [];
        // Tombol refund cuma muncul kalau status 'paid' (udah bayar, belum delivered).
        if (order.status === 'paid') {
          kb.push([{ text: t(lang, 'btn_refund_order'), callback_data: `refund_req:${orderId}` }]);
        }
        kb.push([{ text: t(lang, 'btn_back'), callback_data: 'my_orders' }]);
        await telegramApi(c.env, 'editMessageText', {
          chat_id: chatId, message_id: messageId, text: txt, parse_mode: 'HTML',
          reply_markup: { inline_keyboard: kb },
        }).catch(() => {});
      }
    } else if (data === 'my_orders_keep') {
      const orders = await db.getOrdersByUser(user.id, 10);
      const lang = await getUserLang(db, user.id) || 'id';
      const brand = await getBrandSettings(db);
      const usdRate = await getUsdRate(db);
      const text = orders.length
        ? `${t(lang, 'your_orders')}\n\n${orders.map((o) => `${formatOrderCodeWithBrand(o.id, brand.shortName)} | ${escapeHtml(o.product_name)} | ${formatMoney(o.price, lang, usdRate)} | ${o.status.toUpperCase()}`).join('\n')}`
        : t(lang, 'no_orders');
      const oRows = orders.slice(0, 8).map((o) => [{
        text: `${formatOrderCodeWithBrand(o.id, brand.shortName)} · ${o.status.toUpperCase()}`.slice(0, 40),
        callback_data: `order_view:${o.id}`,
      }]);
      await sendMessage(c.env, chatId, text, {
        reply_markup: { inline_keyboard: oRows },
      });
    } else if (data.startsWith('buy:')) {
      const productId = Number(data.split(':')[1]);
      const lang = await getUserLang(db, user.id) || 'id';
      const product = await db.getProductById(productId);
      if (!product) {
        await sendMessage(c.env, chatId, t(lang, 'err_product_not_found'));
      } else if (Number(product.is_unlimited_stock) !== 1 && Number(product.stock_count) < 1) {
        await sendMessage(c.env, chatId, t(lang, 'sold_out_msg'));
      } else {
        const qrisOn = await isVioletEnabled(db, c.env);
        const lang = await getUserLang(db, user.id) || 'id';
        const intlMult = await getIntlMultiplier(db);
        const usdRate = await getUsdRate(db);
        const tProduct = { ...product, name: await translateText(c.env, db, product.name, lang) };
        const conf = buildBuyConfirmation(c.env, tProduct, 1, qrisOn, lang, intlMult, usdRate);
        await sendMessage(c.env, chatId, conf.text, { reply_markup: { inline_keyboard: conf.keyboard } });
      }
    } else if (data.startsWith('qty:')) {
      const parts = data.split(':');
      const productId = Number(parts[1]);
      const newQty = Number(parts[2]);
      const product = await db.getProductById(productId);
      if (product) {
        const qrisOn = await isVioletEnabled(db, c.env);
        const lang = await getUserLang(db, user.id) || 'id';
        const intlMult = await getIntlMultiplier(db);
        const usdRate = await getUsdRate(db);
        const tProduct = { ...product, name: await translateText(c.env, db, product.name, lang) };
        const conf = buildBuyConfirmation(c.env, tProduct, newQty, qrisOn, lang, intlMult, usdRate);
        await telegramApi(c.env, 'editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text: conf.text,
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: conf.keyboard },
        }).catch(() => {});
      }
    } else if (data.startsWith('pay:')) {
      const parts = data.split(':');
      const provider = parts[1];
      const productId = Number(parts[2]);
      const buyQty = Math.max(1, Number(parts[3]) || 1);
      const lang = await getUserLang(db, user.id) || 'id';
      const product = await db.getProductById(productId);
      if (!product) {
        await sendMessage(c.env, chatId, t(lang, 'err_product_not_found'));
      } else if (Number(product.is_unlimited_stock) !== 1 && Number(product.stock_count) < 1) {
        await sendMessage(c.env, chatId, t(lang, 'sold_out_msg'));
      } else {
        const existing = await db.getOrdersByUser(user.id, 20);
        const stalePending = existing.filter((o) => o.status === 'pending');
        for (const sp of stalePending) {
          // Atomic claim: hanya refund kalau order BENAR masih pending pas di-cancel.
          // Kalau cron/webhook keburu deliver di window ini, claim gagal → gak refund order yang udah terkirim.
          const cancelled = await db.cancelOrderIfPending(sp.id).catch(() => false);
          if (cancelled) await db.refundOrderWallet(sp.id).catch(() => {});
        }
        {
          let loadingMsgId = null;
          let walletDebited = 0; // saldo terdebit yang BELUM dibacking order; di-refund di outer catch kalau gagal
          try {
            const loadingRes = await sendMessage(c.env, chatId, t(await getUserLang(db, user.id) || 'id', 'processing'));
            loadingMsgId = loadingRes?.result?.message_id || null;
            const defaultBuyerEmail = await db.getSetting('default_buyer_email', c.env.DEFAULT_BUYER_EMAIL || 'buyer@example.com');
            const payLang = await getUserLang(db, user.id) || 'id';
            const payMult = await getIntlMultiplier(db);
            const unitCharge = localizedPrice(product.price, payLang, payMult);
            const rawTotal = unitCharge * buyQty;
            // Deduct saldo internal buyer (kalau ada).
            const walletBal = await db.getWalletBalance(user.id);
            const walletDeduct = walletBal > 0 ? Math.min(walletBal, rawTotal) : 0;
            const effectiveAmount = rawTotal - walletDeduct;
            // Kalau saldo nutupin total, langsung auto-paid (skip invoice crypto).
            if (effectiveAmount <= 0) {
              const debited = await db.debitWalletIfSufficient(user.id, rawTotal);
              if (!debited) {
                await sendMessage(c.env, chatId, t(lang, 'err_wallet_insufficient')).catch(() => {});
                if (loadingMsgId) {
                  await telegramApi(c.env, 'deleteMessage', { chat_id: chatId, message_id: loadingMsgId }).catch(() => {});
                }
                return c.text('ok');
              }
              walletDebited = rawTotal;
              const orderId = await db.createOrderIfStockAvailable({
                user_id: user.id, username: user.username || '', first_name: user.first_name || '',
                product_id: product.id, product_name: product.name, quantity: buyQty,
                unit_price: product.price, price: rawTotal,
                payment_provider: 'wallet_internal', transaction_id: `WALLET_${Date.now()}`,
                qr_string: null, expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
                wallet_applied: rawTotal,
              });
              if (!orderId) {
                walletDebited = 0; // reset SEBELUM refund: kalau write landing tapi response reject, outer catch gak double-credit
                await db.addWalletBalance(user.id, rawTotal); // rollback
                await sendMessage(c.env, chatId, t(lang, 'err_stock_not_enough')).catch(() => {});
              } else {
                walletDebited = 0; // order sekarang nge-back saldo yang dipotong
                const brand = await getBrandSettings(db);
                const code = formatOrderCodeWithBrand(orderId, brand.shortName);
                await sendMessage(c.env, chatId, t(payLang, 'wallet_pay_success', { code, amount: formatIdr(rawTotal) }), { parse_mode: 'HTML' });
                // Trigger delivery — deliverOrder claims pending→paid atomically (idempotent).
                // expires_at future + isOrderPaid('wallet_internal')=true → cron self-heal kalau inline gagal.
                await deliverOrder(c.env, db, await db.getOrderById(orderId)).catch(() => {});
              }
              if (loadingMsgId) {
                await telegramApi(c.env, 'deleteMessage', { chat_id: chatId, message_id: loadingMsgId }).catch(() => {});
              }
              return c.text('ok');
            }
            // Saldo gak cukup — deduct sebagian, bayar sisa via crypto.
            if (walletDeduct > 0) {
              const debited = await db.debitWalletIfSufficient(user.id, walletDeduct);
              if (!debited) {
                await sendMessage(c.env, chatId, t(lang, 'err_wallet_insufficient')).catch(() => {});
                if (loadingMsgId) {
                  await telegramApi(c.env, 'deleteMessage', { chat_id: chatId, message_id: loadingMsgId }).catch(() => {});
                }
                return c.text('ok');
              }
              walletDebited = walletDeduct; // outstanding sampai order kebuat / di-refund
              await sendMessage(c.env, chatId,
                t(payLang, 'wallet_deduct', { amount: formatIdr(walletDeduct), remaining: formatIdr(effectiveAmount) }),
                { parse_mode: 'HTML' }).catch(() => {});
            }
            // createPaymentInvoice / getCheckoutExpiryMinutes / createOrder bisa throw —
            // outer catch nge-refund walletDebited, jadi gak perlu rollback per-site di sini.
            const payment = await createPaymentInvoice(c.env, db, {
              amount: effectiveAmount,
              email: defaultBuyerEmail,
              customerName: user.first_name || user.username || 'Customer',
              customerPhone: '081234567890',
              productName: buyQty > 1 ? `${product.name} x${buyQty}` : product.name,
              provider: provider || undefined,
            });
            const expiryMinutes = await getCheckoutExpiryMinutes(db, c.env);
            const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString();
            const orderId = await db.createOrderIfStockAvailable({
              user_id: user.id,
              username: user.username || '',
              first_name: user.first_name || '',
              product_id: product.id,
              product_name: product.name,
              quantity: buyQty,
              unit_price: product.price,
              price: payment.finalAmount,
              payment_provider: payment.provider,
              transaction_id: payment.transactionId,
              qr_string: payment.qrString || null,
              expires_at: expiresAt,
              wallet_applied: walletDeduct,
            });
            if (!orderId) {
              if (walletDebited > 0) {
                const refundAmt = walletDebited;
                walletDebited = 0; // reset SEBELUM refund: write-landing-but-reject gak boleh double-credit di outer catch
                await db.addWalletBalance(user.id, refundAmt); // rollback: stok keburu habis setelah saldo dipotong
              }
              await sendMessage(c.env, chatId, t(lang, 'err_stock_just_gone'));
            } else {
              walletDebited = 0; // order sekarang nge-back saldo yang dipotong
              if (loadingMsgId) {
                await telegramApi(c.env, 'deleteMessage', { chat_id: chatId, message_id: loadingMsgId }).catch(() => {});
              }
              const brand = await getBrandSettings(db);
              const orderCode = formatOrderCodeWithBrand(orderId, brand.shortName);
              const lang = await getUserLang(db, user.id) || 'id';
              if (payment.provider === 'coinremitter') {
                let msg = t(lang, 'invoice_title') + '\n';
                msg += t(lang, 'inv_code', { code: orderCode }) + '\n';
                msg += t(lang, 'inv_product', { name: escapeHtml(product.name) }) + '\n';
                msg += t(lang, 'inv_price', { price: formatMoney(unitCharge * buyQty, lang, await getUsdRate(db)) }) + '\n';
                msg += t(lang, 'inv_method', { method: `Crypto (${payment.coin || 'CR'})` }) + '\n';
                if (payment.cryptoAmount && payment.coin) {
                  msg += '┊ \n' + t(lang, 'inv_pay_crypto', { amount: payment.cryptoAmount, coin: payment.coin }) + '\n';
                }
                msg += `╰━━━━━━━━━━━━━━━━━\n`;
                if (payment.address) {
                  msg += '\n' + t(lang, 'inv_address', { coin: payment.coin || 'Crypto' }) + `\n<code>${escapeHtml(payment.address)}</code>\n`;
                }
                msg += '\n' + t(lang, 'inv_expiry', { min: expiryMinutes });
                const kb = [];
                if (payment.paymentUrl) kb.push([{ text: t(lang, 'btn_open_payment'), url: payment.paymentUrl }]);
                kb.push([{ text: t(lang, 'btn_check_status'), callback_data: `status:${orderId}` }]);
                kb.push([{ text: t(lang, 'btn_cancel_order'), callback_data: `cancel:${orderId}` }]);
                await sendMessage(c.env, chatId, msg, { reply_markup: { inline_keyboard: kb } });
              } else {
                let msg = t(lang, 'invoice_title') + '\n';
                msg += t(lang, 'inv_code', { code: orderCode }) + '\n';
                msg += t(lang, 'inv_product', { name: escapeHtml(product.name) }) + '\n';
                msg += t(lang, 'inv_method', { method: 'QRIS' }) + '\n';
                msg += '┊ \n' + t(lang, 'inv_total', { total: formatMoney(payment.finalAmount, lang, await getUsdRate(db)) }) + '\n';
                msg += `╰━━━━━━━━━━━━━━━━━\n`;
                msg += '\n' + t(lang, 'inv_qris_scan') + '\n' + t(lang, 'inv_expiry', { min: expiryMinutes });
                const qrUrl = payment.qrImageUrl || (payment.qrString ? qrImageUrlFromString(payment.qrString) : null);
                const kbQris = [
                  [{ text: t(lang, 'btn_check_status'), callback_data: `status:${orderId}` }],
                  [{ text: t(lang, 'btn_cancel_order'), callback_data: `cancel:${orderId}` }],
                ];
                if (qrUrl) {
                  await sendPhotoByUrl(c.env, chatId, qrUrl, msg, {
                    reply_markup: { inline_keyboard: kbQris },
                  });
                } else {
                  await sendMessage(c.env, chatId, msg, {
                    reply_markup: { inline_keyboard: kbQris },
                  });
                }
              }
            }
          } catch (err) {
            // Refund saldo yang sempat dipotong tapi belum di-back order (throw di mana pun
            // antara debit dan order kebuat: createPaymentInvoice / getCheckoutExpiryMinutes /
            // createOrder .run reject). Tanpa ini saldo buyer hilang diam-diam.
            if (walletDebited > 0) {
              await db.addWalletBalance(user.id, walletDebited).catch(() => {});
              walletDebited = 0;
            }
            if (loadingMsgId) {
              await telegramApi(c.env, 'deleteMessage', { chat_id: chatId, message_id: loadingMsgId }).catch(() => {});
            }
            await sendMessage(c.env, chatId, t(lang, 'err_checkout_failed', { error: escapeHtml(err.message) }));
          }
        }
      }
    } else if (data.startsWith('status:')) {
      const orderId = Number(data.split(':')[1]);
      const order = await db.getOrderById(orderId);
      const brand = await getBrandSettings(db);
      if (!order || Number(order.user_id) !== Number(user.id)) {
        const lang99 = await getUserLang(db, user.id) || 'id';
        await sendMessage(c.env, chatId, t(lang99, 'err_order_not_found'));
      } else {
        const code = formatOrderCodeWithBrand(order.id, brand.shortName);
        const langST = await getUserLang(db, user.id) || 'id';
        const pendingHint = order.status === 'pending' ? '\n\n' + t(langST, 'status_pending_hint') : '';
        await sendMessage(c.env, chatId, `🧾 ${code}\nStatus: <b>${order.status.toUpperCase()}</b>${pendingHint}`);
      }
    } else if (data.startsWith('cancel:')) {
      const orderId = Number(data.split(':')[1]);
      const order = await db.getOrderById(orderId);
      if (!order || Number(order.user_id) !== Number(user.id)) {
        const lang99 = await getUserLang(db, user.id) || 'id';
        await sendMessage(c.env, chatId, t(lang99, 'err_order_not_found'));
      } else if (order.status !== 'pending') {
        const langCC = await getUserLang(db, user.id) || 'id';
        await sendMessage(c.env, chatId, t(langCC, 'order_cannot_cancel', { status: order.status.toUpperCase() }));
      } else {
        // Atomic claim: kalau cron/webhook keburu deliver di window setelah snapshot read,
        // cancel gagal → gak nge-clobber order delivered jadi cancelled + gak double-refund.
        const cancelled = await db.cancelOrderIfPending(orderId);
        const brand = await getBrandSettings(db);
        const code = formatOrderCodeWithBrand(orderId, brand.shortName);
        const langOC = await getUserLang(db, user.id) || 'id';
        if (!cancelled) {
          const fresh = await db.getOrderById(orderId);
          await sendMessage(c.env, chatId, t(langOC, 'order_cannot_cancel', { status: (fresh?.status || 'paid').toUpperCase() }));
        } else {
          await db.refundOrderWallet(orderId).catch(() => {}); // balikin saldo yang dipotong pas order di-cancel
          await sendMessage(c.env, chatId, t(langOC, 'order_cancelled', { code }));
        }
      }
    }
  }

  return c.text('ok');
  } catch (err) {
    console.error('[TelegramWebhook] uncaught:', err.message);
    return c.text('ok');
  }
});

app.post('/api/payment/webhook/violet', async (c) => {
  const db = c.get('db');
  const payload = await parseWebhookPayload(c.req);

  const violet = await getVioletConfig(db, c.env);
  const expectedWebhookSecret = String(violet.webhookSecret || '').trim();
  const callbackSignature = c.req.header('x-callback-signature') || '';
  const providedSecret = c.req.header('x-webhook-secret')
    || c.req.header('x-api-secret')
    || c.req.header('x-secret-key')
    || (c.req.header('authorization') || '').replace(/^Bearer\s+/i, '').trim();

  // Fail-closed: minimal SATU jalur verifikasi harus tersedia & lolos. Violet tidak punya
  // authoritative re-query (isVioletPaymentPaid selalu false), jadi kalau signature dan
  // webhook-secret dua-duanya gak ada, payload "paid" palsu bisa trigger deliverOrder = barang gratis.
  const canVerifySignature = Boolean(callbackSignature && violet.apiKey && violet.secretKey);
  if (!canVerifySignature && !expectedWebhookSecret) {
    console.error('[VioletWebhook] ditolak: tidak ada jalur verifikasi (signature/webhook-secret kosong)');
    return jsonErr(c, 'Forbidden', 403);
  }

  if (canVerifySignature) {
    const signatureValid = await verifyVioletCallbackSignature({
      payload,
      callbackSignature,
      apiKey: violet.apiKey,
      secretKey: violet.secretKey,
    });
    if (!signatureValid) {
      return jsonErr(c, 'Forbidden', 403);
    }
  }

  if (expectedWebhookSecret) {
    const secretValid = providedSecret && providedSecret === expectedWebhookSecret;
    if (!secretValid) {
      return jsonErr(c, 'Forbidden', 403);
    }
  }

  const transactionId = extractVioletTransactionId(payload);
  if (!transactionId) {
    return jsonErr(c, 'id_reference tidak ditemukan', 400);
  }

  const order = await db.getOrderByTransactionId(transactionId);
  if (!order) {
    return jsonOk(c, { received: true, matched: false });
  }

  if (String(order.payment_provider || '').toLowerCase() !== 'violet') {
    return jsonOk(c, { received: true, matched: true, ignored: true, reason: 'provider_mismatch' });
  }

  if (order.status !== 'pending') {
    return jsonOk(c, { received: true, matched: true, status: order.status, processed: false });
  }

  if (!isVioletWebhookPaid(payload)) {
    return jsonOk(c, { received: true, matched: true, paid: false, processed: false });
  }

  try {
    await deliverOrder(c.env, db, order);
    return jsonOk(c, { received: true, matched: true, paid: true, processed: true, orderId: order.id });
  } catch (err) {
    console.error('[VioletWebhook] deliver failed', order.id, err.message);
    return jsonErr(c, `Delivery gagal: ${err.message}`, 500);
  }
});

app.post('/api/payment/webhook/coinremitter', async (c) => {
  // ALWAYS return 200 first — CoinRemitter verifies URL before creating invoice.
  // Actual payment processing happens after the 200 response.
  const rawBody = await c.req.text();
  const db = c.get('db');
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    payload = {};
  }

  // CoinRemitter sends a URL verification request (no invoice data) — just ACK.
  if (!payload.invoice_id && !payload.custom_data1) {
    return c.text('OK', 200);
  }

  // Actual payment webhook — process asynchronously
  c.executionCtx.waitUntil((async () => {
    try {
      const cr = await getCoinRemitterConfig(db, c.env);
      const providedSign = c.req.header('x-coin-sign')
        || c.req.header('x-coinremitter-sign')
        || (payload && payload.sign) || '';

      // Fail-closed: if credentials are configured but no signature is present,
      // and the payload itself has no internal sign field, refuse.
      const hasSigCheck = Boolean(cr.apiKey && cr.password && providedSign);
      const hasNoVerification = !hasSigCheck && !(payload && payload.sign);
      if (hasNoVerification) {
        console.warn('[CoinRemitterWebhook] rejected: no signature and no internal sign');
        return;
      }
      if (hasSigCheck) {
        const valid = await verifyCoinRemitterWebhook({
          rawBody, providedSign, apiKey: cr.apiKey, password: cr.password,
        });
        if (!valid) { console.warn('[CoinRemitterWebhook] invalid sign'); return; }
      }

      const transactionId = extractCoinRemitterReference(payload);
      if (!transactionId) return;

      const order = await db.getOrderByTransactionId(String(transactionId));
      if (!order || String(order.payment_provider || '').toLowerCase() !== 'coinremitter') return;
      if (order.status !== 'pending') return;

      // Authoritative: re-query invoice status. On failure, refuse delivery rather
      // than falling back to an unsigned/untrusted webhook payload. Cron self-heals.
      let paid = false;
      try {
        const invId = payload.invoice_id || payload?.data?.invoice_id || String(transactionId);
        const status = await getCoinRemitterInvoiceStatus({
          apiKey: cr.apiKey, password: cr.password, invoiceId: invId,
        });
        paid = status.paid;
      } catch (e) {
        console.warn('[CoinRemitterWebhook] status re-query failed, refusing payload:', e.message);
        return;
      }
      if (!paid) return;

      await deliverOrder(c.env, db, order);
    } catch (err) {
      console.error('[CoinRemitterWebhook] bg error:', err.message);
    }
  })());
  return c.text('OK', 200);
});

app.post('/api/admin/login', async (c) => {
  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
  if (loginRateLimited(ip)) {
    return jsonErr(c, 'Terlalu banyak percobaan. Coba lagi nanti.', 429);
  }
  const body = await c.req.json();
  if (!body.password || body.password !== c.env.ADMIN_PANEL_PASSWORD) {
    return jsonErr(c, 'Password salah', 401);
  }

  const token = await createSessionToken(
    {
      role: 'admin',
      iat: Date.now(),
      exp: Date.now() + 24 * 60 * 60 * 1000,
    },
    c.env.ADMIN_SESSION_SECRET
  );

  c.header('Set-Cookie', `tb_session=${token}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=86400`);
  return jsonOk(c, { message: 'Login sukses' });
});

app.post('/api/admin/logout', requireAdmin, async (c) => {
  c.header('Set-Cookie', 'tb_session=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0');
  return jsonOk(c, { message: 'Logout sukses' });
});

app.get('/api/admin/telegram/webhook/status', requireAdmin, async (c) => {
  const prereq = getWebhookPrereq(c.env);
  if (!prereq.hasBotToken) {
    return jsonOk(c, {
      prereq,
      expectedUrl: getWebhookUrl(c.env),
      configured: false,
      reason: 'BOT_TOKEN belum diset di Worker secret',
    });
  }

  try {
    const info = await telegramApi(c.env, 'getWebhookInfo', {});
    const expectedUrl = getWebhookUrl(c.env);
    return jsonOk(c, {
      prereq,
      expectedUrl,
      configured: info?.url === expectedUrl,
      info,
    });
  } catch (err) {
    return jsonErr(c, `Gagal membaca status webhook: ${err.message}`, 500);
  }
});

app.post('/api/admin/telegram/webhook/setup', requireAdmin, async (c) => {
  const prereq = getWebhookPrereq(c.env);
  if (!prereq.hasBotToken || !prereq.hasApiBaseUrl || !prereq.hasWebhookSecret) {
    return jsonErr(c, 'BOT_TOKEN/API_BASE_URL/TELEGRAM_WEBHOOK_SECRET harus diset dulu', 400);
  }

  const webhookUrl = getWebhookUrl(c.env);
  const result = await setWebhook(c.env, webhookUrl, c.env.TELEGRAM_WEBHOOK_SECRET);
  return jsonOk(c, {
    configured: true,
    webhookUrl,
    result,
  });
});

app.post('/api/admin/telegram/webhook/delete', requireAdmin, async (c) => {
  if (!c.env.BOT_TOKEN) return jsonErr(c, 'BOT_TOKEN belum diset', 400);
  const result = await telegramApi(c.env, 'deleteWebhook', { drop_pending_updates: false });
  return jsonOk(c, { deleted: true, result });
});

app.post('/api/admin/payment/test-coinremitter', requireAdmin, async (c) => {
  const db = c.get('db');
  const cr = await getCoinRemitterConfig(db, c.env);
  if (!cr.apiKey || !cr.password) {
    return jsonErr(c, 'CoinRemitter credentials belum diisi', 400);
  }

  // Allow override via body for quick coin-switch test
  let bodyOverride = {};
  try { bodyOverride = await c.req.json(); } catch {}
  const coin = String(bodyOverride.coin || cr.coin || 'BTC').toUpperCase();

  const url = `https://api.coinremitter.com/v1/invoice/create`;
  const formBody = JSON.stringify({
    amount: 10,
    fiat_currency: "USD",
    notify_url: "https://telebotsb-worker.telebotsb.workers.dev/api/payment/webhook/coinremitter",
    expiry_time_in_minutes: 30,
    name: "Test Customer",
    email: "test@example.com",
  });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json',
        'x-api-key': cr.apiKey,
        'x-api-password': cr.password,
      },
      body: formBody,
    });
    const raw = await res.text();
    let parsed;
    try { parsed = JSON.parse(raw); } catch { parsed = { raw: raw.slice(0, 300) }; }
    const respHeaders = {};
    res.headers.forEach((v, k) => { respHeaders[k] = v; });
    return jsonOk(c, {
      coin,
      url,
      sentApiKeyPrefix: cr.apiKey.slice(0, 8) + '…',
      sentApiKeyLength: cr.apiKey.length,
      sentPasswordLength: cr.password.length,
      sentApiKeyHasSpace: /\s/.test(cr.apiKey),
      sentPasswordHasSpace: /\s/.test(cr.password),
      httpStatus: res.status,
      rateLimit: respHeaders['x-ratelimit-remaining'] || null,
      cfRay: respHeaders['cf-ray'] || null,
      response: parsed,
      success: res.ok && (parsed?.flag === 1 || parsed?.success === true),
    });
  } catch (err) {
    return jsonErr(c, `Test failed: ${err.message}`, 500);
  }
});

app.post('/api/admin/payment/test-violet', requireAdmin, async (c) => {
  const db = c.get('db');
  const violet = await getVioletConfig(db, c.env);
  if (!violet.apiKey || !violet.secretKey) {
    return jsonErr(c, 'Violet credentials belum diisi', 400);
  }
  const base = String(violet.baseUrl || '').replace(/\/+$/, '');
  const nominal = 1000;
  const refCode = `TESTREF${Date.now()}`;
  // expired_time must be datetime string "YYYY-MM-DD HH:MM:SS" (WIB), not Unix epoch
  const exp = new Date(Date.now() + 10 * 60 * 1000 + 7 * 3600 * 1000); // +10min, WIB(+7)
  const expiredTime = exp.toISOString().slice(0, 19).replace('T', ' ');
  // signature = hmacSha256Hex(secretKey, refCode + apiKey + nominal)
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(violet.secretKey),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(`${refCode}${violet.apiKey}${nominal}`));
  const signature = Array.from(new Uint8Array(sigBuf)).map((b) => b.toString(16).padStart(2, '0')).join('');

  const params = new URLSearchParams({
    api_key: violet.apiKey,
    secret_key: violet.secretKey,
    channel_payment: 'QRIS',
    ref_kode: refCode,
    nominal: String(nominal),
    cus_nama: 'Test Customer',
    cus_email: 'test@example.com',
    cus_phone: '081234567890',
    produk: 'Test Product',
    expired_time: String(Math.floor(Date.now() / 1000) + 600),
    signature,
  });

  try {
    const res = await fetch(`${base}/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const raw = await res.text();
    let parsed;
    try { parsed = JSON.parse(raw); } catch { parsed = { raw: raw.slice(0, 500) }; }
    return jsonOk(c, {
      url: `${base}/create`,
      httpStatus: res.status,
      sentParams: Array.from(params.keys()),
      response: parsed,
    });
  } catch (err) {
    return jsonErr(c, `Test failed: ${err.message}`, 500);
  }
});

app.get('/api/admin/bootstrap', requireAdmin, async (c) => {
  const db = c.get('db');
  const [
    stats,
    recentOrders,
    adminTelegramId,
    defaultBuyerEmail,
    checkoutExpiryMinutes,
    violetApiBaseUrl,
    violetApiKey,
    violetSecretKey,
    violetWebhookSecret,
    defaultPaymentProvider,
    coinremitterCoin,
    coinremitterApiKey,
    coinremitterPassword,
    coinremitterFiatCurrency,
    brand,
  ] = await Promise.all([
    db.getDashboardStats(),
    db.getAllOrders(12),
    db.getSetting('admin_telegram_id', String(c.env.ADMIN_ID || '')),
    db.getSetting('default_buyer_email', c.env.DEFAULT_BUYER_EMAIL || 'buyer@example.com'),
    db.getSetting('checkout_expiry_minutes', String(c.env.CHECKOUT_EXPIRY_MINUTES || '60')),
    db.getSetting('violet_api_base_url', c.env.VIOLET_API_BASE_URL || 'https://violetmediapay.com/api/live'),
    db.getSetting('violet_api_key', c.env.VIOLET_API_KEY || ''),
    db.getSetting('violet_secret_key', c.env.VIOLET_SECRET_KEY || ''),
    db.getSetting('violet_webhook_secret', c.env.VIOLET_WEBHOOK_SECRET || ''),
    db.getSetting('default_payment_provider', 'violet'),
    db.getSetting('coinremitter_coin', c.env.COINREMITTER_COIN || 'BTC'),
    db.getSetting('coinremitter_api_key', c.env.COINREMITTER_API_KEY || ''),
    db.getSetting('coinremitter_password', c.env.COINREMITTER_PASSWORD || ''),
    db.getSetting('coinremitter_fiat_currency', c.env.COINREMITTER_FIAT_CURRENCY || 'USD'),
    getBrandSettings(db),
  ]);

  return jsonOk(c, {
    stats,
    recentOrders,
    adminTelegramId,
    defaultBuyerEmail,
    paymentGateway: defaultPaymentProvider || 'violet',
    defaultPaymentProvider: defaultPaymentProvider || 'violet',
    violetApiBaseUrl,
    violetApiKey: maskSecret(violetApiKey),
    violetSecretKey: maskSecret(violetSecretKey),
    violetWebhookSecret: maskSecret(violetWebhookSecret),
    violetWebhookUrl: getVioletWebhookUrl(c.env),
    coinremitterCoin,
    coinremitterApiKey: maskSecret(coinremitterApiKey),
    coinremitterPassword: maskSecret(coinremitterPassword),
    coinremitterFiatCurrency,
    coinremitterWebhookUrl: getCoinRemitterWebhookUrl(c.env),
    checkoutExpiryMinutes: Number(checkoutExpiryMinutes) || 60,
    brand,
    systemStatus: getSystemStatus(
      c.env,
      adminTelegramId,
      defaultBuyerEmail,
      violetApiBaseUrl,
      violetApiKey,
      violetSecretKey,
      violetWebhookSecret,
    ),
  });
});

app.post('/api/admin/settings/branding', requireAdmin, async (c) => {
  const db = c.get('db');
  const body = await c.req.json();

  const name = String(body?.name || '').trim();
  const shortName = String(body?.shortName || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase();
  const tagline = String(body?.tagline || '').trim();
  const broadcastTitle = String(body?.broadcastTitle || '').trim();
  const supportTelegramUrl = String(body?.supportTelegramUrl || '').trim();
  const supportWhatsappUrl = String(body?.supportWhatsappUrl || '').trim();

  if (!name || name.length < 2) return jsonErr(c, 'Brand name minimal 2 karakter');
  if (!shortName || shortName.length < 2) {
    return jsonErr(c, 'Short name minimal 2 karakter, hanya huruf/angka, max 8.');
  }
  if (supportTelegramUrl && !/^https?:\/\//i.test(supportTelegramUrl)) {
    return jsonErr(c, 'Support Telegram URL harus diawali http:// atau https://');
  }
  if (supportWhatsappUrl && !/^https?:\/\//i.test(supportWhatsappUrl)) {
    return jsonErr(c, 'Support WhatsApp URL harus diawali http:// atau https://');
  }

  await db.setSetting('brand_name', name);
  await db.setSetting('brand_short_name', shortName);
  await db.setSetting('brand_tagline', tagline);
  await db.setSetting('broadcast_title', broadcastTitle || 'Pengumuman Resmi');
  await db.setSetting('support_telegram_url', supportTelegramUrl);
  await db.setSetting('support_whatsapp_url', supportWhatsappUrl);

  await db.insertAudit('settings.branding.update', 'admin', {
    name,
    shortName,
    hasTagline: Boolean(tagline),
    hasSupportTg: Boolean(supportTelegramUrl),
    hasSupportWa: Boolean(supportWhatsappUrl),
  });

  return jsonOk(c, {
    name,
    shortName,
    tagline,
    broadcastTitle: broadcastTitle || 'Pengumuman Resmi',
    supportTelegramUrl,
    supportWhatsappUrl,
  });
});

app.post('/api/admin/settings/general', requireAdmin, async (c) => {
  const db = c.get('db');
  const body = await c.req.json();

  const adminTelegramId = String(body?.adminTelegramId || '').trim();
  const defaultBuyerEmail = String(body?.defaultBuyerEmail || '').trim();
  const violetApiBaseUrl = String(body?.violetApiBaseUrl || '').trim() || 'https://violetmediapay.com/api/live';
  const violetApiKey = String(body?.violetApiKey || '').trim();
  const violetSecretKey = String(body?.violetSecretKey || '').trim();
  const violetWebhookSecret = String(body?.violetWebhookSecret || '').trim();
  const defaultPaymentProvider = String(body?.defaultPaymentProvider || 'violet').trim().toLowerCase();
  const coinremitterCoin = String(body?.coinremitterCoin || 'BTC').trim().toUpperCase();
  const coinremitterApiKey = String(body?.coinremitterApiKey || '').trim();
  const coinremitterPassword = String(body?.coinremitterPassword || '').trim();
  const coinremitterFiatCurrency = String(body?.coinremitterFiatCurrency || 'USD').trim().toUpperCase();
  const checkoutExpiryMinutes = Number(body?.checkoutExpiryMinutes || 60);

  // Validation: at least one provider must be fully configured
  const hasViolet = Boolean(violetApiKey && violetSecretKey);
  const hasCoinRemitter = Boolean(coinremitterApiKey && coinremitterPassword);
  if (!hasViolet && !hasCoinRemitter) {
    return jsonErr(c, 'Minimal salah satu gateway (Violet atau CoinRemitter) harus terisi lengkap');
  }
  if (defaultPaymentProvider === 'violet' && !hasViolet) {
    return jsonErr(c, 'Default = Violet, tapi Violet API/Secret key belum diisi');
  }
  if (defaultPaymentProvider === 'coinremitter' && !hasCoinRemitter) {
    return jsonErr(c, 'Default = CoinRemitter, tapi API key/password belum diisi');
  }
  if (!['violet', 'coinremitter'].includes(defaultPaymentProvider)) {
    return jsonErr(c, 'default_payment_provider tidak valid (harus violet atau coinremitter)');
  }
  if (!['BTC', 'LTC', 'ETH', 'USDT', 'BNB', 'TLTC', 'TBTC', 'DOGE', 'BCH', 'TRX'].includes(coinremitterCoin)) {
    return jsonErr(c, 'CoinRemitter coin tidak valid');
  }
  if (!adminTelegramId || !/^\d+$/.test(adminTelegramId)) return jsonErr(c, 'Telegram Admin ID harus angka');
  if (!defaultBuyerEmail || !defaultBuyerEmail.includes('@')) return jsonErr(c, 'Default buyer email tidak valid');
  if (hasViolet && !/^https?:\/\//i.test(violetApiBaseUrl)) {
    return jsonErr(c, 'Violet API base URL harus diawali http:// atau https://');
  }
  if (!Number.isFinite(checkoutExpiryMinutes) || checkoutExpiryMinutes < 5 || checkoutExpiryMinutes > 180) {
    return jsonErr(c, 'Checkout expiry harus antara 5 sampai 180 menit');
  }

  await db.setSetting('payment_gateway', defaultPaymentProvider);
  await db.setSetting('default_payment_provider', defaultPaymentProvider);
  await db.setSetting('admin_telegram_id', adminTelegramId);
  await db.setSetting('default_buyer_email', defaultBuyerEmail);
  await db.setSetting('violet_api_base_url', violetApiBaseUrl);
  await db.setSetting('violet_api_key', violetApiKey);
  await db.setSetting('violet_secret_key', violetSecretKey);
  await db.setSetting('violet_webhook_secret', violetWebhookSecret);
  await db.setSetting('coinremitter_coin', coinremitterCoin);
  await db.setSetting('coinremitter_api_key', coinremitterApiKey);
  await db.setSetting('coinremitter_password', coinremitterPassword);
  await db.setSetting('coinremitter_fiat_currency', coinremitterFiatCurrency);
  await db.setSetting('checkout_expiry_minutes', String(Math.floor(checkoutExpiryMinutes)));

  await db.insertAudit('settings.general.update', 'admin', {
    adminTelegramId,
    defaultBuyerEmail,
    defaultPaymentProvider,
    violetApiBaseUrl,
    hasVioletApiKey: hasViolet,
    hasVioletSecretKey: hasViolet,
    hasVioletWebhookSecret: Boolean(violetWebhookSecret),
    coinremitterCoin,
    hasCoinRemitterApiKey: Boolean(coinremitterApiKey),
    hasCoinRemitterPassword: Boolean(coinremitterPassword),
    coinremitterFiatCurrency,
    checkoutExpiryMinutes: Math.floor(checkoutExpiryMinutes),
  });

  return jsonOk(c, {
    paymentGateway: defaultPaymentProvider,
    defaultPaymentProvider,
    adminTelegramId,
    defaultBuyerEmail,
    violetApiBaseUrl,
    hasVioletApiKey: hasViolet,
    hasVioletSecretKey: hasViolet,
    hasVioletWebhookSecret: Boolean(violetWebhookSecret),
    coinremitterCoin,
    hasCoinRemitterApiKey: Boolean(coinremitterApiKey),
    hasCoinRemitterPassword: Boolean(coinremitterPassword),
    coinremitterFiatCurrency,
    checkoutExpiryMinutes: Math.floor(checkoutExpiryMinutes),
  });
});

// Broadcast runner: berjalan di background lewat ctx.waitUntil.
// Strategi:
// - Stream user aktif per page (keyset pagination via user_id) supaya tidak load semuanya ke memori.
// - Per chunk ~30 user paralel, lalu sleep 1.1 detik (≤ 30 msg/detik global limit Telegram bot).
// - Honour 429 retry_after (max 1 retry per user).
// - Kalau error 403/400 dengan keyword block, tandai user is_blocked agar broadcast berikutnya skip.
// Push update produk: kirim notifikasi update + (opsional) link download baru
// ke semua buyer paid produk tertentu. Pakai chunked + retry seperti broadcast.
async function runProductUpdateNotify(env, db, { productId, productName, message, buyers, includeNewDownload, digitalFilePointer, lang = 'id' }) {
  const brand = await getBrandSettings(db);
  const adminChatId = await getAdminChatId(db, env);

  const headerLines = [
    t(lang, 'update_product_title', { name: escapeHtml(productName) }),
    '━━━━━━━━━━━━━━━━━━━━',
    '',
    escapeHtml(message),
  ];

  const CHUNK_SIZE = 25;
  const CHUNK_GAP_MS = 1100;

  let sent = 0;
  let failed = 0;
  let blocked = 0;
  const blockedUserIds = [];

  for (let i = 0; i < buyers.length; i += CHUNK_SIZE) {
    const chunk = buyers.slice(i, i + CHUNK_SIZE);

    const results = await Promise.allSettled(
      chunk.map(async (buyer) => {
        const userId = Number(buyer.user_id);
        const lines = [...headerLines];

        // Generate fresh download token kalau produk unlimited & admin centang opsi.
        if (includeNewDownload && digitalFilePointer && isR2FilePointer(digitalFilePointer)) {
          const key = toR2ObjectKey(digitalFilePointer);
          if (key) {
            try {
              const fakeOrder = { id: buyer.latest_order_id || 0, user_id: userId };
              const url = await createUniqueDownloadUrl(env, db, fakeOrder, key);
              lines.push('');
              lines.push(t(lang, 'download_link_title'));
              lines.push(url);
              lines.push('');
              lines.push(t(lang, 'download_link_expiry'));
            } catch (err) {
              console.error('[NotifyUpdate] gen download url failed', userId, err.message);
            }
          }
        }

        const supportUrl = String(brand.supportTelegramUrl || brand.supportWhatsappUrl || '').trim();
        const inlineKeyboard = [];
        if (env.MINIAPP_ORIGIN) {
          inlineKeyboard.push([{ text: t(lang, 'btn_open_store'), web_app: { url: env.MINIAPP_ORIGIN } }]);
        }
        if (supportUrl) {
          inlineKeyboard.push([{ text: t(lang, 'btn_cs'), url: supportUrl }]);
        }

        try {
          await sendMessage(env, userId, lines.join('\n'), {
            reply_markup: inlineKeyboard.length ? { inline_keyboard: inlineKeyboard } : undefined,
          });
          return 'sent';
        } catch (err) {
          if (err instanceof TelegramApiError) {
            if (err.errorCode === 429 && err.retryAfter > 0 && err.retryAfter <= 60) {
              await wait((err.retryAfter + 1) * 1000);
              await sendMessage(env, userId, lines.join('\n'), {
                reply_markup: inlineKeyboard.length ? { inline_keyboard: inlineKeyboard } : undefined,
              });
              return 'sent';
            }
            if (err.errorCode === 403 || err.errorCode === 400) {
              const desc = String(err.description || '').toLowerCase();
              if (
                desc.includes('blocked')
                || desc.includes('forbidden')
                || desc.includes('user is deactivated')
                || desc.includes('chat not found')
                || desc.includes("can't initiate conversation")
              ) {
                return 'blocked';
              }
            }
          }
          throw err;
        }
      }),
    );

    for (let j = 0; j < results.length; j += 1) {
      const r = results[j];
      const buyer = chunk[j];
      if (r.status === 'fulfilled') {
        if (r.value === 'blocked') {
          blocked += 1;
          blockedUserIds.push(buyer.user_id);
        } else {
          sent += 1;
        }
      } else {
        failed += 1;
      }
    }

    if (blockedUserIds.length) {
      await Promise.all(
        blockedUserIds.splice(0, blockedUserIds.length).map((uid) => db.markUserBlocked(uid).catch(() => {})),
      );
    }

    await wait(CHUNK_GAP_MS);
  }

  await db.insertAudit('product.notify_update.done', 'admin', {
    productId,
    sent,
    failed,
    blocked,
  });

  if (adminChatId) {
    try {
      await sendMessage(
        env,
        adminChatId,
        `✅ Notifikasi update untuk <b>${escapeHtml(productName)}</b> selesai.\n\n` +
          `Sent: ${sent} | Failed: ${failed} | Blocked: ${blocked}`,
      );
    } catch {
      // Optional, ignore.
    }
  }
}

async function runBroadcastJob(env, jobId, { message, buttonText, buttonUrl }) {
  const db = createDb(env);
  const brand = await getBrandSettings(db);
  const text = `📢 <b>${escapeHtml(brand.broadcastTitle)}</b>\n━━━━━━━━━━━━━━━━━━━━\n\n${escapeHtml(message)}`;
  const options = buttonText && buttonUrl
    ? { reply_markup: { inline_keyboard: [[{ text: buttonText, url: buttonUrl }]] } }
    : {};

  const PAGE_SIZE = 500;
  const CHUNK_SIZE = 25;
  const CHUNK_GAP_MS = 1100;

  await db.markBroadcastJobRunning(jobId);

  let cursor = 0;
  let lastError = null;

  try {
    for (;;) {
      const page = await db.getActiveUsersPage({ afterUserId: cursor, pageSize: PAGE_SIZE });
      if (!page.length) break;

      for (let i = 0; i < page.length; i += CHUNK_SIZE) {
        const chunk = page.slice(i, i + CHUNK_SIZE);

        const results = await Promise.allSettled(
          chunk.map((user) => deliverBroadcastToUser(env, user, text, options)),
        );

        let sent = 0;
        let failed = 0;
        let blocked = 0;
        const blockedUserIds = [];

        for (let j = 0; j < results.length; j += 1) {
          const result = results[j];
          const user = chunk[j];
          if (result.status === 'fulfilled') {
            if (result.value === 'blocked') {
              blocked += 1;
              blockedUserIds.push(user.user_id);
            } else {
              sent += 1;
            }
          } else {
            failed += 1;
            lastError = result.reason?.message || 'unknown error';
          }
        }

        if (blockedUserIds.length) {
          await Promise.all(blockedUserIds.map((uid) => db.markUserBlocked(uid).catch(() => {})));
        }

        await db.incrementBroadcastJobCounters(jobId, { sent, failed, blocked });

        await wait(CHUNK_GAP_MS);
      }

      cursor = Number(page[page.length - 1].user_id);
      if (page.length < PAGE_SIZE) break;
    }

    await db.finishBroadcastJob(jobId, { status: 'done', lastError });
    await db.insertAudit('broadcast.done', 'admin', { jobId, lastError });
  } catch (err) {
    await db.finishBroadcastJob(jobId, { status: 'failed', lastError: err?.message || 'unknown error' });
    await db.insertAudit('broadcast.failed', 'admin', { jobId, error: err?.message });
  }
}

// Kirim 1 pesan broadcast ke 1 user dengan handling 429 retry & 403 (blocked).
// Return: 'sent' | 'blocked' (akan di-flag di DB) | throw error untuk retry/failure lain.
async function deliverBroadcastToUser(env, user, text, options) {
  try {
    await sendMessage(env, Number(user.user_id), text, options);
    return 'sent';
  } catch (err) {
    if (err instanceof TelegramApiError) {
      // Rate limited - tunggu retry_after lalu coba sekali lagi.
      if (err.errorCode === 429 && err.retryAfter > 0 && err.retryAfter <= 60) {
        await wait((err.retryAfter + 1) * 1000);
        await sendMessage(env, Number(user.user_id), text, options);
        return 'sent';
      }

      // User block bot atau chat hilang -> tandai non-aktif.
      if (err.errorCode === 403 || err.errorCode === 400) {
        const desc = String(err.description || '').toLowerCase();
        if (
          desc.includes('blocked')
          || desc.includes('forbidden')
          || desc.includes('user is deactivated')
          || desc.includes('chat not found')
          || desc.includes("can't initiate conversation")
        ) {
          return 'blocked';
        }
      }
    }
    throw err;
  }
}

app.post('/api/admin/broadcast', requireAdmin, async (c) => {
  const db = c.get('db');
  const body = await c.req.json();

  const message = String(body?.message || '').trim();
  const buttonText = String(body?.buttonText || '').trim();
  const buttonUrl = String(body?.buttonUrl || '').trim();

  if (!message || message.length < 3) {
    return jsonErr(c, 'Pesan broadcast minimal 3 karakter');
  }

  if ((buttonText && !buttonUrl) || (!buttonText && buttonUrl)) {
    return jsonErr(c, 'Button text dan URL harus diisi bersamaan');
  }

  if (buttonUrl && !/^https?:\/\//i.test(buttonUrl)) {
    return jsonErr(c, 'URL button harus diawali http:// atau https://');
  }

  const totalRecipients = await db.countActiveUsers();
  if (!totalRecipients) {
    return jsonErr(c, 'Belum ada user aktif untuk menerima broadcast');
  }

  const jobId = await db.createBroadcastJob({
    message,
    buttonText,
    buttonUrl,
    recipients: totalRecipients,
  });

  // Dispatch ke background lewat ctx.waitUntil agar response cepat balik ke admin,
  // dan worker tidak time-out walaupun user banyak.
  c.executionCtx.waitUntil(runBroadcastJob(c.env, jobId, { message, buttonText, buttonUrl }));

  await db.insertAudit('broadcast.queue', 'admin', {
    jobId,
    recipients: totalRecipients,
    hasButton: Boolean(buttonText && buttonUrl),
  });

  return jsonOk(c, {
    jobId,
    recipients: totalRecipients,
    queued: true,
    message: 'Broadcast diproses di background. Pantau progress di card hasil broadcast.',
  });
});

app.get('/api/admin/broadcast/jobs', requireAdmin, async (c) => {
  const db = c.get('db');
  const limit = Math.min(50, Math.max(1, Number(c.req.query('limit') || 5)));
  const jobs = await db.getRecentBroadcastJobs(limit);
  return jsonOk(c, jobs);
});

app.get('/api/admin/broadcast/jobs/:id', requireAdmin, async (c) => {
  const db = c.get('db');
  const id = Number(c.req.param('id'));
  if (!id) return jsonErr(c, 'Job ID tidak valid');
  const job = await db.getBroadcastJob(id);
  if (!job) return jsonErr(c, 'Broadcast job tidak ditemukan', 404);
  return jsonOk(c, job);
});

app.post('/api/admin/uploads/product-image', requireAdmin, async (c) => {
  if (!c.env.ASSETS) return jsonErr(c, 'R2 binding belum dikonfigurasi', 500);
  if (!c.env.R2_PUBLIC_BASE_URL) return jsonErr(c, 'R2_PUBLIC_BASE_URL belum diatur', 500);

  const cl = Number(c.req.header('content-length') || 0);
  if (cl > 10 * 1024 * 1024) return jsonErr(c, 'Ukuran file melebihi 10MB', 413);

  const form = await c.req.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') {
    return jsonErr(c, 'File gambar wajib diisi');
  }

  const contentType = file.type || '';
  if (!contentType.startsWith('image/')) {
    return jsonErr(c, 'File harus berupa gambar');
  }

  const ext = (file.name?.split('.').pop() || 'png').toLowerCase();
  const key = `products/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const bytes = await file.arrayBuffer();

  if (bytes.byteLength > 10 * 1024 * 1024) return jsonErr(c, 'Ukuran file melebihi 10MB', 413);

  await c.env.ASSETS.put(key, bytes, {
    httpMetadata: {
      contentType,
      cacheControl: 'public, max-age=31536000, immutable',
    },
  });

  const base = c.env.R2_PUBLIC_BASE_URL.replace(/\/$/, '');
  const url = `${base}/${key}`;
  return jsonOk(c, { key, url });
});

app.post('/api/admin/uploads/digital-file', requireAdmin, async (c) => {
  if (!c.env.ASSETS) return jsonErr(c, 'R2 binding belum dikonfigurasi', 500);

  const cl = Number(c.req.header('content-length') || 0);
  if (cl > 50 * 1024 * 1024) return jsonErr(c, 'Ukuran file melebihi 50MB', 413);

  const form = await c.req.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') {
    return jsonErr(c, 'File digital wajib diisi');
  }

  const originalName = String(file.name || 'download.bin').trim();
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]+/g, '_');
  const key = `downloads/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
  const bytes = await file.arrayBuffer();

  if (bytes.byteLength > 50 * 1024 * 1024) return jsonErr(c, 'Ukuran file melebihi 50MB', 413);

  await c.env.ASSETS.put(key, bytes, {
    httpMetadata: {
      contentType: file.type || 'application/octet-stream',
      contentDisposition: `attachment; filename="${safeName}"`,
      cacheControl: 'private, max-age=0, no-cache',
    },
  });

  return jsonOk(c, {
    key,
    stockValue: `file:${key}`,
    note: 'Gunakan stockValue ini pada stock item agar buyer mendapat link download unik saat order delivered.',
  });
});

app.get('/api/admin/products', requireAdmin, async (c) => {
  const db = c.get('db');
  const products = await db.getProducts();
  return jsonOk(c, products);
});

app.post('/api/admin/products', requireAdmin, async (c) => {
  const db = c.get('db');
  const body = await c.req.json();
  const price = Number(body.price);
  if (!body.name || !Number.isFinite(price) || price < 1000) {
    return jsonErr(c, 'Data produk tidak valid');
  }

  const isUnlimited = Boolean(body.is_unlimited_stock);
  const digitalPointer = (body.digital_file_pointer || '').trim() || null;
  if (isUnlimited && !digitalPointer) {
    return jsonErr(c, 'Produk unlimited wajib punya digital_file_pointer (upload file dulu).');
  }

  const termsUrl = String(body.terms_url || '').trim() || null;
  if (termsUrl && !/^https?:\/\//i.test(termsUrl)) {
    return jsonErr(c, 'Terms URL harus diawali http:// atau https://');
  }

  const id = await db.addProduct({
    name: body.name,
    description: body.description || '',
    price,
    category: body.category || 'Umum',
    product_image_url: body.product_image_url || null,
    is_unlimited_stock: isUnlimited ? 1 : 0,
    digital_file_pointer: digitalPointer,
    delivery_note: String(body.delivery_note || '').trim() || null,
    terms_url: termsUrl,
  });

  await db.insertAudit('product.create', 'admin', { id, name: body.name, unlimited: isUnlimited });
  return jsonOk(c, { id });
});

app.put('/api/admin/products/:id', requireAdmin, async (c) => {
  const db = c.get('db');
  const id = Number(c.req.param('id'));
  const body = await c.req.json();
  const price = Number(body.price);
  if (!id || !body.name || !Number.isFinite(price) || price < 1000) {
    return jsonErr(c, 'Data produk tidak valid');
  }

  const isUnlimited = Boolean(body.is_unlimited_stock);
  const digitalPointer = (body.digital_file_pointer || '').trim() || null;
  if (isUnlimited && !digitalPointer) {
    return jsonErr(c, 'Produk unlimited wajib punya digital_file_pointer (upload file dulu).');
  }

  const termsUrl = String(body.terms_url || '').trim() || null;
  if (termsUrl && !/^https?:\/\//i.test(termsUrl)) {
    return jsonErr(c, 'Terms URL harus diawali http:// atau https://');
  }

  await db.updateProduct(id, {
    name: body.name,
    description: body.description || '',
    price,
    category: body.category || 'Umum',
    product_image_url: body.product_image_url || null,
    is_unlimited_stock: isUnlimited ? 1 : 0,
    digital_file_pointer: digitalPointer,
    delivery_note: String(body.delivery_note || '').trim() || null,
    terms_url: termsUrl,
  });

  await db.insertAudit('product.update', 'admin', { id, unlimited: isUnlimited });
  return jsonOk(c, { id });
});

app.delete('/api/admin/products/:id', requireAdmin, async (c) => {
  const db = c.get('db');
  const id = Number(c.req.param('id'));
  if (!id) return jsonErr(c, 'ID tidak valid');

  await db.deleteProduct(id);
  await db.insertAudit('product.delete', 'admin', { id });
  return jsonOk(c, { id });
});

// Preview siapa saja yang akan kena notifikasi kalau admin trigger update push.
app.get('/api/admin/products/:id/buyers', requireAdmin, async (c) => {
  const db = c.get('db');
  const id = Number(c.req.param('id'));
  if (!id) return jsonErr(c, 'ID tidak valid');

  const product = await db.getProductById(id);
  if (!product) return jsonErr(c, 'Produk tidak ditemukan', 404);

  const buyers = await db.getProductBuyers(id);
  return jsonOk(c, {
    productId: id,
    productName: product.name,
    isUnlimited: Number(product.is_unlimited_stock) === 1,
    digitalFilePointer: product.digital_file_pointer || null,
    totalBuyers: buyers.length,
    buyers,
  });
});

// Push update produk: kirim notifikasi ke semua buyer paid produk ini,
// generate download link unik baru kalau produk unlimited (file digital).
// Hanya berlaku untuk produk dengan is_unlimited_stock = 1 (source code / file digital).
app.post('/api/admin/products/:id/notify-update', requireAdmin, async (c) => {
  const db = c.get('db');
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));

  if (!id) return jsonErr(c, 'ID tidak valid');
  const message = String(body?.message || '').trim();
  if (!message || message.length < 5) {
    return jsonErr(c, 'Pesan update minimal 5 karakter.');
  }

  const product = await db.getProductById(id);
  if (!product) return jsonErr(c, 'Produk tidak ditemukan', 404);

  const isUnlimitedDigital =
    Number(product.is_unlimited_stock) === 1 && product.digital_file_pointer;

  if (!isUnlimitedDigital) {
    return jsonErr(c, 'Push update hanya untuk produk file digital / source code (stok tak terbatas). Aktifkan toggle stok ∞ + upload file dulu.', 400);
  }

  const buyers = await db.getProductBuyers(id);
  if (!buyers.length) {
    return jsonErr(c, 'Belum ada buyer paid untuk produk ini.');
  }

  const includeNewDownload = body?.includeNewDownload !== false; // default true

  // Fire-and-forget background push agar admin dapat response cepat.
  c.executionCtx.waitUntil(
    runProductUpdateNotify(c.env, db, {
      productId: id,
      productName: product.name,
      message,
      buyers,
      includeNewDownload,
      digitalFilePointer: product.digital_file_pointer,
    }),
  );

  await db.insertAudit('product.notify_update', 'admin', {
    productId: id,
    totalBuyers: buyers.length,
    includeNewDownload,
  });

  return jsonOk(c, {
    productId: id,
    totalBuyers: buyers.length,
    queued: true,
    message: `Notifikasi update dikirim ke ${buyers.length} buyer di background.`,
  });
});

app.get('/api/admin/stock/:productId', requireAdmin, async (c) => {
  const db = c.get('db');
  const productId = Number(c.req.param('productId'));
  if (!productId) return jsonErr(c, 'ID produk tidak valid');

  const product = await db.getProductById(productId);
  if (!product) return jsonErr(c, 'Produk tidak ditemukan', 404);

  const stock = await db.listStock(productId);
  return jsonOk(c, { product, stock });
});

app.post('/api/admin/stock/:productId', requireAdmin, async (c) => {
  const db = c.get('db');
  const productId = Number(c.req.param('productId'));
  const body = await c.req.json();

  if (!productId || !Array.isArray(body.items)) {
    return jsonErr(c, 'Payload tidak valid');
  }

  // Produk unlimited (digital file shareable) tidak butuh stock_items.
  // Tolak agar admin tidak bingung paste pointer berkali-kali.
  const product = await db.getProductById(productId);
  if (!product) return jsonErr(c, 'Produk tidak ditemukan', 404);
  if (Number(product.is_unlimited_stock) === 1) {
    return jsonErr(c, 'Produk ini diset stok tak terbatas (digital file). Edit produk untuk ganti file, jangan tambah stock items.');
  }

  const cleanItems = body.items.map((i) => (i || '').trim()).filter(Boolean);
  if (!cleanItems.length) return jsonErr(c, 'Tidak ada item stok');

  const added = await db.addStockItems(productId, cleanItems);
  await db.insertAudit('stock.add', 'admin', { productId, count: added });
  return jsonOk(c, { added });
});

app.delete('/api/admin/stock/item/:stockId', requireAdmin, async (c) => {
  const db = c.get('db');
  const stockId = Number(c.req.param('stockId'));
  if (!stockId) return jsonErr(c, 'ID stok tidak valid');

  await db.deleteUnsoldStockById(stockId);
  await db.insertAudit('stock.delete', 'admin', { stockId });
  return jsonOk(c, { stockId });
});

app.get('/api/admin/orders', requireAdmin, async (c) => {
  const db = c.get('db');
  const limit = Math.min(500, Math.max(1, Number(c.req.query('limit') || 100)));
  const orders = await db.getAllOrders(limit);
  return jsonOk(c, orders);
});

app.get('/api/admin/reports', requireAdmin, async (c) => {
  const db = c.get('db');
  const period = String(c.req.query('period') || '30d');
  const report = await db.getReportAggregates(period);
  return jsonOk(c, report);
});

app.get('/api/admin/users', requireAdmin, async (c) => {
  const db = c.get('db');
  const limit = Math.min(2000, Math.max(1, Number(c.req.query('limit') || 500)));
  const users = await db.getUsersOverview(limit);
  return jsonOk(c, users);
});

app.get('/api/shop/products', async (c) => {
  const db = c.get('db');
  const products = await db.getProducts();
  return jsonOk(c, products);
});

// Endpoint publik untuk fetch branding di miniapp (tanpa auth) — supaya
// miniapp bisa render brand name, tagline, dan support URL dari awal.
app.get('/api/shop/branding', async (c) => {
  const db = c.get('db');
  const brand = await getBrandSettings(db);
  const cr = await getCoinRemitterConfig(db, c.env);
  const cryptoEnabled = Boolean(cr.apiKey && cr.password);
  const qrisEnabled = await isVioletEnabled(db, c.env);
  let stats = { totalProducts: 0, totalUsers: 0, totalSales: 0 };
  try { stats = await db.getPublicStats(); } catch (e) { /* non-fatal */ }
  // Buat miniapp render harga lokal: en/zh => USD (markup × multiplier), id => Rp.
  const usdRate = await getUsdRate(db);
  const intlMultiplier = await getIntlMultiplier(db);
  return jsonOk(c, {
    name: brand.name,
    shortName: brand.shortName,
    tagline: brand.tagline,
    supportTelegramUrl: brand.supportTelegramUrl,
    supportWhatsappUrl: brand.supportWhatsappUrl,
    payments: {
      crypto: cryptoEnabled,
      qris: qrisEnabled,
    },
    usdRate,
    intlMultiplier,
    stats,
  });
});

app.post('/api/shop/auth', async (c) => {
  const db = c.get('db');
  const body = await c.req.json();
  const initData = body?.initData || '';

  // Telegram Mini App sessions are often reopened from cached clients,
  // so allow a longer signed initData lifetime to reduce false 401 errors.
  const user = await verifyTelegramInitData(initData, c.env.BOT_TOKEN, 86400);
  if (!user || !user.id) return jsonErr(c, 'Unauthorized Telegram Mini App session', 401);

  await db.upsertUser(user);

  const secret = c.env.SHOP_SESSION_SECRET || c.env.ADMIN_SESSION_SECRET;
  if (!secret) return jsonErr(c, 'Server auth secret not configured', 500);

  const token = await createSessionToken(
    {
      role: 'shop',
      uid: Number(user.id),
      username: user.username || '',
      first_name: user.first_name || '',
      iat: Date.now(),
      exp: Date.now() + 60 * 60 * 1000,
    },
    secret
  );

  // Lang yang buyer udah pilih di bot (setlang) → biar storefront match bahasa bot.
  const lang = (await getUserLang(db, user.id)) || normalizeLang(user.language_code || '') || 'en';

  return jsonOk(c, {
    token,
    user: {
      id: user.id,
      username: user.username,
      first_name: user.first_name,
      lang,
    },
  });
});

app.post('/api/shop/checkout', requireShop, async (c) => {
  const db = c.get('db');
  const shopUser = c.get('shopUser');
  const body = await c.req.json();

  const productId = Number(body.productId);
  const quantity = Math.max(1, Math.min(Number(body.quantity || 1), 10));
  if (!productId || !Number.isFinite(quantity)) {
    return jsonErr(c, 'Payload checkout tidak valid');
  }

  const product = await db.getProductById(productId);
  if (!product) return jsonErr(c, 'Produk tidak ditemukan', 404);
  if (Number(product.stock_count) < quantity) return jsonErr(c, `Stok tidak cukup. Sisa ${product.stock_count}`);

  const existing = await db.getOrdersByUser(shopUser.uid, 20);
  if (existing.some((o) => o.status === 'pending')) {
    return jsonErr(c, 'Masih ada order pending. Selesaikan dulu sebelum checkout baru.');
  }

  // Charge localized price: en/zh buyers pay the intl-markup price (same as the Telegram bot),
  // bukan raw IDR. Tanpa ini buyer en/zh di miniapp bayar lebih murah dari bot = bocor revenue.
  const buyerLang = (await getUserLang(db, shopUser.uid)) || 'id';
  const intlMult = await getIntlMultiplier(db);
  const unitCharge = localizedPrice(Number(product.price), buyerLang, intlMult);
  const nominal = unitCharge * quantity;
  const chosenProvider = String(body.provider || '').toLowerCase();
  const defaultBuyerEmail = await db.getSetting('default_buyer_email', c.env.DEFAULT_BUYER_EMAIL || 'buyer@example.com');
  const payment = await createPaymentInvoice(c.env, db, {
    amount: nominal,
    email: defaultBuyerEmail,
    customerName: shopUser.first_name || shopUser.username || 'Customer',
    customerPhone: '081234567890',
    productName: product.name,
    provider: chosenProvider || undefined,
  });

  const expiryMinutes = await getCheckoutExpiryMinutes(db, c.env);
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString();
  const orderId = await db.createOrderIfStockAvailable({
    user_id: shopUser.uid,
    username: shopUser.username || '',
    first_name: shopUser.first_name || '',
    product_id: product.id,
    product_name: product.name,
    quantity,
    unit_price: product.price,
    price: payment.finalAmount,
    payment_provider: payment.provider,
    transaction_id: payment.transactionId,
    qr_string: payment.qrString,
    expires_at: expiresAt,
  });

  if (!orderId) {
    return jsonErr(c, 'Stok baru saja habis karena checkout bersamaan. Refresh lalu coba lagi.', 409);
  }

  return jsonOk(c, {
    orderId,
    paymentProvider: payment.provider,
    amount: payment.finalAmount,
    qrString: payment.qrString || null,
    qrImageUrl: payment.qrImageUrl || (payment.qrString ? qrImageUrlFromString(payment.qrString) : null),
    paymentUrl: payment.paymentUrl || null,
    address: payment.address || null,
    cryptoAmount: payment.cryptoAmount || null,
    coin: payment.coin || null,
    expiresAt,
    expiryMinutes,
    transactionId: payment.transactionId,
  });
});

app.get('/api/shop/orders/:id/status', requireShop, async (c) => {
  const db = c.get('db');
  const shopUser = c.get('shopUser');
  const id = Number(c.req.param('id'));
  if (!id) return jsonErr(c, 'Order ID tidak valid');

  const order = await db.getOrderById(id);
  if (!order || Number(order.user_id) !== Number(shopUser.uid)) {
    return jsonErr(c, 'Order tidak ditemukan', 404);
  }

  if (order.status === 'pending') {
    await syncSingleOrderIfPaid(c.env, db, order);
  }

  const latest = await db.getOrderById(id);
  if (!latest || Number(latest.user_id) !== Number(shopUser.uid)) {
    return jsonErr(c, 'Order tidak ditemukan', 404);
  }

  return jsonOk(c, {
    id: latest.id,
    status: latest.status,
    expiresAt: latest.expires_at,
    paidAt: latest.paid_at,
    deliveredAt: latest.delivered_at,
  });
});

app.post('/api/shop/orders/:id/cancel', requireShop, async (c) => {
  const db = c.get('db');
  const shopUser = c.get('shopUser');
  const id = Number(c.req.param('id'));
  if (!id) return jsonErr(c, 'Order ID tidak valid');

  const order = await db.getOrderById(id);
  if (!order) return jsonErr(c, 'Order tidak ditemukan', 404);
  if (Number(order.user_id) !== Number(shopUser.uid)) return jsonErr(c, 'Forbidden', 403);
  if (order.status !== 'pending') {
    return jsonErr(c, `Order sudah ${order.status}, tidak bisa dibatalkan.`, 400);
  }

  // Atomic cancel: hanya bisa cancel kalau masih pending. Concurrent delivery gak bisa
  // ter-clobber jadi cancelled (cancelled != delivered), gak kayak updateOrderStatus unconditional.
  const cancelled = await db.cancelOrderIfPending(id);
  if (!cancelled) {
    const fresh = await db.getOrderById(id);
    return jsonErr(c, `Order sudah ${fresh?.status || 'diproses'}, tidak bisa dibatalkan.`, 409);
  }
  await db.refundOrderWallet(id).catch(() => {}); // balikin saldo pas cancel (idempoten)
  return jsonOk(c, { id, status: 'cancelled' });
});

app.get('/api/shop/orders', requireShop, async (c) => {
  const db = c.get('db');
  const shopUser = c.get('shopUser');
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') || 30)));
  const orders = await db.getOrdersByUser(shopUser.uid, limit);
  return jsonOk(c, orders);
});

app.get('/api/shop/orders/:id/delivery', requireShop, async (c) => {
  const db = c.get('db');
  const shopUser = c.get('shopUser');
  const id = Number(c.req.param('id'));
  if (!id) return jsonErr(c, 'Order ID tidak valid');

  const order = await db.getOrderDeliveryByUser(id, shopUser.uid);
  if (!order) return jsonErr(c, 'Order tidak ditemukan', 404);
  if (!order.delivery_payload) return jsonErr(c, 'Data akun belum tersedia. Tunggu proses delivery selesai.', 404);

  let delivery;
  try {
    delivery = JSON.parse(order.delivery_payload);
  } catch {
    return jsonErr(c, 'Data delivery rusak', 500);
  }

  return jsonOk(c, {
    id: order.id,
    status: order.status,
    deliveredAt: order.delivered_at,
    delivery,
  });
});

app.get('/api/shop/download/:token', async (c) => {
  const db = c.get('db');
  const token = String(c.req.param('token') || '').trim();
  if (!token) return jsonErr(c, 'Token download tidak valid', 400);

  const grant = await db.getDownloadToken(token);
  if (!grant) return jsonErr(c, 'Link download tidak valid', 404);

  if (Date.now() > new Date(grant.expires_at).getTime()) {
    return jsonErr(c, 'Link download sudah expired', 410);
  }

  if (Number(grant.download_count) >= Number(grant.max_downloads)) {
    return jsonErr(c, 'Batas download link ini sudah habis', 410);
  }

  const object = await c.env.ASSETS.get(grant.object_key);
  if (!object) return jsonErr(c, 'File tidak ditemukan', 404);

  await db.incrementDownloadCount(token);

  const fileName = basenameFromKey(grant.object_key);
  const headers = new Headers();
  headers.set('content-type', object.httpMetadata?.contentType || 'application/octet-stream');
  headers.set('content-disposition', object.httpMetadata?.contentDisposition || `attachment; filename="${fileName}"`);
  headers.set('cache-control', 'private, no-cache, no-store');

  return new Response(object.body, {
    status: 200,
    headers,
  });
});

app.onError((err, c) => {
  console.error('[API ERROR]', err);
  return jsonErr(c, err.message || 'Internal server error', 500);
});

export default {
  fetch: app.fetch,
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(processPendingOrders(env));
    ctx.waitUntil(updateUsdRate(env));
    ctx.waitUntil(releaseStaleReservations(env));
  },
};
