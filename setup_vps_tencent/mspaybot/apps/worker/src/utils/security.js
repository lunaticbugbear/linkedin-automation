const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(input) {
  const bytes = typeof input === 'string' ? encoder.encode(input) : input;
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(base64url) {
  const normalized = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

async function sign(payload, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return toBase64Url(new Uint8Array(sig));
}

function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacRaw(keyBytes, messageBytes) {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, messageBytes);
  return new Uint8Array(signature);
}

export async function verifyTelegramInitData(initData, botToken, maxAgeSeconds = 300) {
  if (!initData || !botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;

  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate) return null;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - authDate) > maxAgeSeconds) return null;

  const entries = [];
  for (const [k, v] of params.entries()) {
    if (k === 'hash') continue;
    entries.push([k, v]);
  }

  entries.sort((a, b) => a[0].localeCompare(b[0]));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n');

  const secretKey = await hmacRaw(encoder.encode('WebAppData'), encoder.encode(botToken));
  const computed = await hmacRaw(secretKey, encoder.encode(dataCheckString));
  const computedHex = bytesToHex(computed);
  if (computedHex !== hash) return null;

  const userRaw = params.get('user');
  if (!userRaw) return null;

  let user;
  try {
    user = JSON.parse(userRaw);
  } catch {
    return null;
  }

  return {
    id: Number(user.id),
    username: user.username || '',
    first_name: user.first_name || '',
    auth_date: authDate,
  };
}

export async function createSessionToken(data, secret) {
  const payload = toBase64Url(JSON.stringify(data));
  const signature = await sign(payload, secret);
  return `${payload}.${signature}`;
}

export async function verifySessionToken(token, secret) {
  if (!token || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  const expected = await sign(payload, secret);
  if (signature !== expected) return null;

  const parsed = JSON.parse(fromBase64Url(payload));
  if (!parsed.exp || Date.now() > parsed.exp) return null;
  return parsed;
}

export function parseCookie(header = '') {
  const out = {};
  const parts = header.split(';');
  for (const part of parts) {
    const [k, ...rest] = part.trim().split('=');
    if (!k) continue;
    out[k] = rest.join('=');
  }
  return out;
}
