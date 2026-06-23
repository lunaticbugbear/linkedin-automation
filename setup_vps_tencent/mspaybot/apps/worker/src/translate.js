// Auto-translate konten produk (nama/deskripsi) via Workers AI + cache DB.
// Model m2m100 support id<->en<->zh. Hasil di-cache biar gak re-translate.

// In-memory LRU cache for translations. Avoids re-translating same text per isolate.
const _transCache = new Map();
const _transCacheMax = 500;
function _transCacheGet(key) {
  const val = _transCache.get(key);
  if (val !== undefined) {
    // Move to end (most-recently-used).
    _transCache.delete(key);
    _transCache.set(key, val);
  }
  return val ?? null;
}
function _transCacheSet(key, val) {
  if (_transCache.size >= _transCacheMax) {
    // Delete oldest entry (first key in iteration order).
    const oldest = _transCache.keys().next().value;
    if (oldest !== undefined) _transCache.delete(oldest);
  }
  _transCache.set(key, val);
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Unified LLM chat completion. Routing:
//   1. Kalau setting 'llm_api_key' + 'llm_base_url' diisi → pakai API eksternal (OpenAI-compatible).
//   2. Else → fallback Cloudflare Workers AI (env.AI).
// Provider eksternal yang didukung: apapun yang OpenAI chat/completions-compatible
//   (OpenAI, DeepSeek, Groq, OpenRouter, Together, dll).
// Return: string hasil, atau null kalau semua gagal.
async function llmComplete(env, db, prompt, { maxTokens = 60, temperature = 0.3, cfModel = '@cf/meta/llama-3.3-70b-instruct-fp8-fast' } = {}) {
  // Coba baca config eksternal dari settings.
  let apiKey = '', baseUrl = '', model = '';
  try {
    apiKey = await db.getSetting('llm_api_key', '');
    baseUrl = await db.getSetting('llm_base_url', '');
    model = await db.getSetting('llm_model', '');
  } catch { /* pakai default cloudflare */ }

  if (apiKey && baseUrl && model) {
    try {
      const url = baseUrl.replace(/\/+$/, '') + '/chat/completions';
      // Reasoning model (deepseek/kimi/dll) ngabisin token di reasoning_content dulu.
      // Kasih budget gede biar content beneran keluar. Hasil di-cache permanen jadi cuma sekali.
      const extTokens = Math.max(maxTokens, 3000);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: extTokens,
          temperature,
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (res.ok) {
        const data = await res.json();
        const msg = data?.choices?.[0]?.message || {};
        // Sebagian reasoning model naro jawaban final di content; sebagian
        // (kalau kepotong) cuma punya reasoning_content. Ambil content dulu,
        // fallback ekstrak kalimat terakhir dari reasoning kalau content kosong.
        let out = String(msg.content || '').trim();
        if (!out && msg.reasoning_content) {
          const rc = String(msg.reasoning_content).trim();
          // Ambil baris non-kosong terakhir dari reasoning (biasanya jawaban final).
          const lines = rc.split('\n').map((l) => l.trim()).filter(Boolean);
          out = lines.length ? lines[lines.length - 1].replace(/^["'`]+|["'`]+$/g, '').trim() : '';
        }
        if (out) return out;
        console.warn('[llm] external empty content, finish:', data?.choices?.[0]?.finish_reason);
      } else {
        console.warn('[llm] external HTTP', res.status);
      }
    } catch (e) {
      console.warn('[llm] external gagal:', e.message);
    }
    // Kalau eksternal gagal, jatuh ke Cloudflare di bawah.
  }

  // Fallback Cloudflare Workers AI.
  if (!env.AI) return null;
  try {
    const res = await env.AI.run(cfModel, {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature,
    });
    return String(res?.response || '').trim() || null;
  } catch (e) {
    console.warn('[llm] cloudflare gagal:', e.message);
    return null;
  }
}

// Terjemahkan satu teks ke targetLang ('en'|'zh'). Sumber diasumsikan 'id'.
// Pakai cache DB dulu; kalau miss, panggil Workers AI lalu simpan.
async function translateText(env, db, text, targetLang) {
  const src = String(text || '').trim();
  if (!src) return '';
  // id = bahasa asli konten, gak perlu translate.
  if (targetLang === 'id' || (targetLang !== 'en' && targetLang !== 'zh')) return src;

  // Check in-memory cache first (fast path).
  const memKey = `${src}:${targetLang}`;
  const memHit = _transCacheGet(memKey);
  if (memHit) return memHit;

  const key = await sha256Hex(`${targetLang}:${src}`);
  try {
    const cached = await db.getTranslation(key);
    if (cached) return cached;
  } catch { /* lanjut translate */ }

  if (!env.AI) return src; // AI binding gak ada → fallback teks asli.

  try {
    const res = await env.AI.run('@cf/meta/m2m100-1.2b', {
      text: src,
      source_lang: 'id',
      target_lang: targetLang,
    });
    const out = String(res?.translated_text || '').trim() || src;
    try { await db.setTranslation(key, targetLang, src, out); } catch { /* non-fatal */ }
    _transCacheSet(memKey, out);
    return out;
  } catch (e) {
    console.warn('[translate] gagal:', e.message);
    return src; // fallback ke teks asli kalau AI error.
  }
}

export { translateText, cleanProductTitle, polishProductTitle, polishProductDesc };

// Rewrite deskripsi produk jadi 1 kalimat bersih & profesional di bahasa target.
// Bangun deskripsi marketing singkat dari data terstruktur (nama + raw desc).
// SELALU balikin teks bersih di bahasa target — gak pernah kosong/garbage.
// Dipakai sebagai fallback kalau LLM gagal. "Ngakalin pakai data yang ada."
function buildMarketingDesc(name, rawDesc, lang = 'id') {
  const raw = String(rawDesc || '').toLowerCase();
  const nm = String(name || '').trim();

  const noWarranty = /(no\s*warr|không\s*bảo\s*hành|tanpa\s*garansi|无保修|不保修|\bkbh\b|\bnw\b)/i.test(raw);
  // Cari durasi garansi/masa pakai: angka + unit waktu lintas bahasa.
  const m = raw.match(/(\d+)\s*(days?|hari|ngày|天|months?|bulan|tháng|个月|個月|years?|tahun|năm|年)/i);
  let durNum = '', durUnit = '';
  if (m) {
    durNum = m[1];
    const u = m[2].toLowerCase();
    if (/day|hari|ngày|天/.test(u)) durUnit = 'day';
    else if (/month|bulan|tháng|个月|個月/.test(u)) durUnit = 'month';
    else if (/year|tahun|năm|年/.test(u)) durUnit = 'year';
  }

  const unitTx = {
    day: { id: 'hari', en: durNum > 1 ? 'days' : 'day', zh: '天' },
    month: { id: 'bulan', en: durNum > 1 ? 'months' : 'month', zh: '个月' },
    year: { id: 'tahun', en: durNum > 1 ? 'years' : 'year', zh: '年' },
  };

  // Frasa garansi.
  let warr = '';
  if (noWarranty) {
    warr = lang === 'zh' ? '无保修' : lang === 'en' ? 'no warranty' : 'tanpa garansi';
  } else if (durUnit) {
    const u = unitTx[durUnit][lang];
    warr = lang === 'zh' ? `${durNum}${u}保修`
      : lang === 'en' ? `${durNum}-${u} warranty`
      : `garansi ${durNum} ${u}`;
  }

  // Rakit kalimat marketing.
  if (lang === 'zh') {
    return warr ? `${nm} — 即时发货，${warr}。库存有限！` : `${nm} — 即时发货，库存有限！`;
  }
  if (lang === 'en') {
    return warr ? `${nm} — instant delivery, ${warr}. Limited stock!` : `${nm} — instant delivery, limited stock!`;
  }
  return warr ? `${nm} — kirim instan, ${warr}. Stok terbatas!` : `${nm} — kirim instan, stok terbatas!`;
}

// Pakai LLM (llama-3.3-70b). Strip URL, jejak supplier, karakter nyasar, slang campur.
// Hasil di-cache permanen per (rawDesc, lang). Fallback: potong + strip URL manual.
async function polishProductDesc(env, db, rawDesc, lang = 'id', name = '') {
  const raw = String(rawDesc || '').trim();
  const marketing = buildMarketingDesc(name, raw, lang);
  if (!raw) return marketing;

  // Baseline fallback: strip URL + potong jadi 1 kalimat pendek.
  const stripUrl = (s) => s.replace(/https?:\/\/\S+/gi, '').replace(/\s{2,}/g, ' ').trim();
  const baseline = stripUrl(raw).split(/[.\n•|]/)[0].trim().slice(0, 120) || stripUrl(raw).slice(0, 120);

  const key = await sha256Hex(`desc_v1:${lang}:${raw}`);
  try {
    const cached = await db.getTranslation(key);
    if (cached) return cached;
  } catch { /* lanjut */ }

  if (!env.AI) return baseline;

  const langName = lang === 'zh' ? 'Chinese (Simplified)' : lang === 'en' ? 'English' : 'Indonesian';
  const prompt = `Rewrite the product description below into ONE short sentence (max 16 words) in ${langName}.

Output rules:
- Write ONLY the final sentence in ${langName}. Nothing else.
- NO reasoning, NO explanation, NO meta-comments, NO English notes, NO word-count remarks.
- NO URLs, links, redeem sites, login steps, format codes, or supplier traces.
- State what the product is + key benefit (e.g. warranty length). Do not invent features.
- Never repeat the sentence. Output it exactly once.

Examples:
Raw: claude api 20M token full warranty redeem at https://x.com → ${lang === 'zh' ? 'Claude API 20M 令牌，含完整保修。' : lang === 'en' ? 'Claude API with 20M tokens and full warranty.' : 'Claude API 20M token dengan garansi penuh.'}

Raw: ${raw}
Final sentence:`;

  try {
    let out = await llmComplete(env, db, prompt, { maxTokens: 60, temperature: 0.3 });
    if (!out) return marketing;
    // Ambil baris bersih pertama; buang quote/label/prefix.
    out = out.split('\n').map((l) => l.trim()).filter(Boolean)[0] || '';
    out = out.replace(/^["'`]+|["'`]+$/g, '').replace(/^(Final sentence|Clean description|Output|Result|Sentence)\s*:\s*/i, '').trim();
    // Buang teks berulang (model kadang ulang kalimat: "X：X：X").
    const rep = out.split(/[:：]/).map((s) => s.trim()).filter(Boolean);
    if (rep.length >= 2 && rep[0] === rep[1]) out = rep[0];
    // Reject reasoning leak / meta-commentary / gagal.
    const bad = !out
      || out.length > 160
      || /https?:\/\//i.test(out)
      || /\b(rewrite|raw|rule|output|description|sentence|word count|compliant|for example|maybe|i can|i could|let me|so the|original is)\b/i.test(out)
      || /(为了确保|也许|我可以|我直接|所以|字数|这是一个|这句|准确)/.test(out)
      || /[à-ỹ]/i.test(out); // sisa Vietnam (diakritik)
    if (bad) {
      // Gagal/garbage → marketing template dari data (bersih, gak pernah kosong, ada hook jualan).
      out = marketing;
    }
    if (out) { try { await db.setTranslation(key, `desc_${lang}`, raw, out); } catch { /* non-fatal */ } }
    return out;
  } catch (e) {
    console.warn('[polishDesc] gagal:', e.message);
    return marketing;
  }
}

// Rewrite nama produk jadi marketing copy bersih pakai Workers AI (LLM).
// Beda dari cleanProductTitle (regex) — ini nulis ulang jadi rapi & menarik.
// Hasil di-cache permanen. Fallback ke cleanProductTitle kalau AI gagal.
async function polishProductTitle(env, db, rawTitle) {
  const raw = String(rawTitle || '').trim();
  if (!raw) return raw;
  const baseline = cleanProductTitle(raw);

  // Cache key khusus polish (beda dari translate).
  const key = await sha256Hex(`polish_v2:${raw}`);
  try {
    const cached = await db.getTranslation(key);
    if (cached) return cached;
  } catch { /* lanjut */ }

  if (!env.AI) return baseline;

  const prompt = `You are a product catalog editor. Clean up this raw product name into a tidy, professional title.

STRICT Rules:
- ONLY clean what's already there. NEVER invent or add features, benefits, or words that aren't in the raw text.
- Remove supplier codes & warranty abbreviations (FW, KBH, NW, BH24H, BH25D).
- Translate non-English words to clean English. Keep brand/product names AS-IS (e.g. "Kiro Power", "ChatGPT", "Capcut").
- Keep technical terms literal: "credit" stays "Credits", "token" stays "Token". Do NOT reinterpret what a product is.
- Use Title Case. Keep it short (max 7 words).
- Output ONLY the final title. No quotes, no explanation.

Examples:
Raw: kiro power 10000 credit siêu trâu | KBH → Kiro Power 10K Credits
Raw: chatgpt plus 1 tháng bảo hành full → ChatGPT Plus 1 Month Warranty
Raw: capcut pro team [BH25D] → Capcut Pro Team

Raw: ${raw}
Title:`;

  try {
    let out = await llmComplete(env, db, prompt, { maxTokens: 40, temperature: 0.3 });
    if (!out) return baseline;
    // Sanitize: ambil baris pertama, buang quote/prefix.
    out = out.split('\n')[0].replace(/^["'`]+|["'`]+$/g, '').replace(/^(Title|Output|Result)\s*:\s*/i, '').trim();
    // Validasi: gak boleh kosong, gak boleh kepanjangan, gak boleh ngandung kalimat instruksi.
    if (!out || out.length > 80 || /\b(rewrite|raw|rule|output)\b/i.test(out)) {
      out = baseline;
    }
    try { await db.setTranslation(key, 'polish', raw, out); } catch { /* non-fatal */ }
    return out;
  } catch (e) {
    console.warn('[polish] gagal:', e.message);
    return baseline;
  }
}

// Bersihin nama produk dari kode supplier + slang yang gak profesional.
// Strip: |FW |KBH |NW [BH25D] suffix kode, slang VN ("siêu trâu", "chính chủ"),
// normalisasi spasi & kapitalisasi ringan. Aman buat semua bahasa.
function cleanProductTitle(raw) {
  let s = String(raw || '').trim();
  if (!s) return s;
  // Buang segmen pendek setelah | atau [ ] yang isinya kode garansi/status.
  // Contoh: "| KBH", "|FW", "| BH24H", "[BH25D]", "| NW".
  s = s.replace(/[|\[]\s*(FW|NW|KBH|BH\s*\d*\w*|FULL\s*WARRANTY|NO\s*WARRANTY|GARANSI[^|\]]*)\s*\]?/gi, ' ');
  // Buang slang/embel VN yang umum.
  const slang = [
    /\bsiêu\s+trâu\b/gi, /\bchính\s+chủ\b/gi, /\bpay\s+trial\b/gi,
    /\bbảo\s+hành\s+full\b/gi, /\btự\s+kích\s+hoạt\b/gi, /\bgiá\s+rẻ\b/gi,
    /\bfull\s+hàng\b/gi, /\bmua\s+về\b/gi,
  ];
  for (const re of slang) s = s.replace(re, ' ');
  // Sisa pipe/bracket kosong + multi-spasi.
  s = s.replace(/[|\[\]]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  // Buang trailing separator.
  s = s.replace(/[\s\-–—|]+$/, '').trim();
  return s || String(raw || '').trim();
}
