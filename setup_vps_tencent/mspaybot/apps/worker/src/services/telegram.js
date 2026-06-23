// Custom error untuk Telegram API supaya caller bisa baca error_code & retry_after.
export class TelegramApiError extends Error {
  constructor({ method, errorCode, description, retryAfter }) {
    super(`[Telegram] ${method} failed: ${description || 'unknown error'}`);
    this.name = 'TelegramApiError';
    this.method = method;
    this.errorCode = errorCode || 0;
    this.description = description || '';
    this.retryAfter = Number(retryAfter) || 0;
  }
}

// Public wrapper: auto-animate custom emoji untuk pesan teks HTML (sendMessage/editMessageText).
// Premium lihat animasi; kalau ID ditolak Telegram → fallback kirim plain (gak pernah patah).
export async function telegramApi(env, method, payload, isForm = false) {
  const isText = !isForm && payload && typeof payload.text === 'string'
    && (method === 'sendMessage' || method === 'editMessageText')
    && (payload.parse_mode || 'HTML') === 'HTML';
  if (isText) {
    const animated = animateEmoji(payload.text);
    // Pakai try/catch SELALU kalau hasilnya mengandung custom emoji — termasuk saat
    // renderer udah pre-animate (idempotent → animated === payload.text). Tanpa ini,
    // pesan pre-animated lewat tanpa fallback & bisa 500 (DOCUMENT_INVALID).
    if (animated.includes('<tg-emoji')) {
      try {
        return await rawTelegramApi(env, method, { ...payload, text: animated });
      } catch (e) {
        // Fallback WAJIB: strip semua tag → emoji biasa, pesan gak pernah gagal total.
        return rawTelegramApi(env, method, { ...payload, text: stripCustomEmoji(animated) });
      }
    }
  }
  return rawTelegramApi(env, method, payload, isForm);
}

async function rawTelegramApi(env, method, payload, isForm = false) {
  const endpoint = `https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`;
  const init = isForm
    ? { method: 'POST', body: payload }
    : {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      };

  const res = await fetch(endpoint, init);
  const data = await res.json().catch(() => ({}));
  if (!data?.ok) {
    throw new TelegramApiError({
      method,
      errorCode: data?.error_code,
      description: data?.description,
      retryAfter: data?.parameters?.retry_after,
    });
  }
  return data.result;
}

export async function sendMessage(env, chatId, text, options = {}) {
  return telegramApi(env, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    ...options,
  });
}

// === CUSTOM (ANIMATED) EMOJI ===
// ID diambil dari sticker set publik (terbukti jalan di @freetierbot). Custom emoji
// mereferensi sticker set publik, BUKAN aset milik bot — jadi bot mana pun bisa pakai.
// User Telegram Premium lihat animasi; non-Premium lihat emoji fallback di dalam tag.
export const CUSTOM_EMOJI = {
  '👑': '5217822164362739968',
  '💎': '5427168083074628963',
  '✔️': '5206607081334906820',
  '❗️': '5274099962655816924',
  '🛍': '5406683434124859552',
  '⚡️': '5456140674028019486',
  '☁️': '6082291693980223465',
  '💵': '5409048419211682843',
  '❓': '5452069934089641166',
  '🔴': '5296551350144873375',
  '🟢': '5210931095494733350',
  '🧑‍🎤': '6113837326826218327',
  '✂️': '6233010252539764875',
  '🎵': '6228761176969321399',
  '✅': '5863720988675412635',
  '📥': '5443127283898405358',
  '🏷': '5240228673738527951',
  '🥇': '5440539497383087970',
  '🔋': '5859219059790319302',
};

// Bungkus emoji plain jadi <tg-emoji> tag. IDEMPOTEN: strip tag lama dulu biar
// pemanggilan ganda (renderer + telegramApi) gak bikin tag nested/rusak.
export function animateEmoji(text) {
  if (!text) return text;
  let out = stripCustomEmoji(String(text));
  for (const [plain, id] of Object.entries(CUSTOM_EMOJI)) {
    out = out.split(plain).join(`<tg-emoji emoji-id="${id}">${plain}</tg-emoji>`);
  }
  return out;
}

// Lepas tag tg-emoji, sisakan emoji fallback di dalamnya (buat fallback kirim plain).
export function stripCustomEmoji(html) {
  return String(html || '').replace(/<tg-emoji[^>]*>([\s\S]*?)<\/tg-emoji>/g, '$1');
}

// Kirim pesan dgn custom emoji; kalau Telegram nolak ID-nya, fallback kirim versi plain.
// Catalog/welcome gak akan pernah patah walau ID invalid.
export async function sendMessageRichEmoji(env, chatId, html, options = {}) {
  try {
    return await telegramApi(env, 'sendMessage', { chat_id: chatId, text: html, parse_mode: 'HTML', ...options });
  } catch (e) {
    const plain = stripCustomEmoji(html);
    return telegramApi(env, 'sendMessage', { chat_id: chatId, text: plain, parse_mode: 'HTML', ...options });
  }
}

export async function sendPhotoByUrl(env, chatId, photoUrl, caption, options = {}) {
  return telegramApi(env, 'sendPhoto', {
    chat_id: chatId,
    photo: photoUrl,
    caption,
    parse_mode: 'HTML',
    ...options,
  });
}

// Kirim animasi GIF dari R2 binding (env.ASSETS) via multipart. Balikin file_id
// supaya caller bisa cache & reuse (kirim file_id jauh lebih cepat dari re-upload).
export async function sendAnimationFromR2(env, chatId, objectKey, caption = '', options = {}) {
  const obj = await env.ASSETS.get(objectKey);
  if (!obj) throw new Error(`R2 object not found: ${objectKey}`);
  const buf = await obj.arrayBuffer();
  const form = new FormData();
  form.append('chat_id', String(chatId));
  if (caption) {
    form.append('caption', caption);
    form.append('parse_mode', 'HTML');
  }
  if (options.reply_markup) form.append('reply_markup', JSON.stringify(options.reply_markup));
  form.append('animation', new Blob([buf], { type: 'image/gif' }), 'welcome.gif');
  return telegramApi(env, 'sendAnimation', form, true);
}

// Kirim animasi via file_id (reuse, cepat, gak baca R2 lagi).
export async function sendAnimationByFileId(env, chatId, fileId, caption = '', options = {}) {
  return telegramApi(env, 'sendAnimation', {
    chat_id: chatId,
    animation: fileId,
    caption,
    parse_mode: 'HTML',
    ...options,
  });
}

export async function answerCallback(env, callbackQueryId) {
  return telegramApi(env, 'answerCallbackQuery', { callback_query_id: callbackQueryId });
}

// Set native Menu Button (sebelah input chat) buka mini app dengan initData valid.
// Ini cara paling andal buka mini app — initData ke-pass benar di semua device.
export async function setChatMenuButton(env, miniappUrl, label = 'Store') {
  return telegramApi(env, 'setChatMenuButton', {
    menu_button: {
      type: 'web_app',
      text: label,
      web_app: { url: miniappUrl },
    },
  });
}

export async function setWebhook(env, url, secretToken) {
  return telegramApi(env, 'setWebhook', {
    url,
    secret_token: secretToken,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: false,
  });
}
