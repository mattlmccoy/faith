/**
 * ABIDE Worker - Push Notification handler
 *
 * Environment variables needed:
 *   VAPID_PUBLIC_KEY  - base64url-encoded uncompressed P-256 public key (65 bytes)
 *   VAPID_PRIVATE_KEY - base64url-encoded raw P-256 private key (32 bytes)
 *   VAPID_SUBJECT     - mailto:you@example.com
 */

export async function handlePush(request, url, env, origin, json) {
  if (url.pathname === '/push/vapid-key' && request.method === 'GET') {
    if (!env.VAPID_PUBLIC_KEY) return json({ error: 'VAPID not configured' }, 503, origin);
    return json({ publicKey: env.VAPID_PUBLIC_KEY }, 200, origin);
  }

  if (url.pathname === '/push/subscribe' && request.method === 'POST') {
    const body = await request.json();
    const {
      subscription,
      morningHour = 6,
      morningMinute = 30,
      eveningHour = 20,
      eveningMinute = 0,
      timezone = 'UTC',
      sundayReminderEnabled = true,
    } = body || {};

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return json({ error: 'Invalid subscription' }, 400, origin);
    }

    if (env.ABIDE_KV) {
      const key = subscriptionKey(subscription.endpoint);
      await env.ABIDE_KV.put(key, JSON.stringify({
        subscription,
        preferences: {
          morningHour: clampHour(morningHour),
          morningMinute: clampMinute(morningMinute),
          eveningHour: clampHour(eveningHour),
          eveningMinute: clampMinute(eveningMinute),
          timezone: String(timezone || 'UTC'),
          sundayReminderEnabled: sundayReminderEnabled !== false,
        },
        updatedAt: new Date().toISOString(),
      }), { expirationTtl: 365 * 24 * 60 * 60 });
    }

    return json({ success: true }, 200, origin);
  }

  if (url.pathname === '/push/test' && request.method === 'POST') {
    if (!env.ABIDE_KV) return json({ success: false, message: 'KV not configured' }, 200, origin);
    const list = await env.ABIDE_KV.list({ prefix: 'push:' });
    if (!list.keys.length) return json({ success: false, message: 'No subscriptions found' }, 200, origin);
    const data = await env.ABIDE_KV.get(list.keys[0].name, 'json');
    if (!data?.subscription) return json({ success: false, message: 'Invalid subscription record' }, 200, origin);

    const ok = await sendPush(env, data.subscription, {
      title: 'Abide',
      body: 'This is a test notification. Your reminders are working.',
      tag: 'test',
      url: '/',
    });
    return json({ success: ok, sent: ok ? 1 : 0 }, 200, origin);
  }

  return json({ error: 'Not found' }, 404, origin);
}

export async function handleScheduledPush(env) {
  if (!env.ABIDE_KV || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) return;
  const now = new Date();
  const list = await env.ABIDE_KV.list({ prefix: 'push:' });
  const sends = [];

  for (const key of list.keys) {
    const data = await env.ABIDE_KV.get(key.name, 'json');
    if (!data?.subscription || !data?.preferences) continue;
    const p = data.preferences;
    const tz = p.timezone || 'UTC';
    const local = getLocalTime(now, tz);
    if (!local) continue;

    const isMorning = withinWindow(local.hour, local.minute, clampHour(p.morningHour), clampMinute(p.morningMinute), 20);
    const isEvening = withinWindow(local.hour, local.minute, clampHour(p.eveningHour), clampMinute(p.eveningMinute), 20);
    const isSunday = local.weekday === 'Sunday';
    const wantsSunday = p.sundayReminderEnabled !== false;

    if (isMorning) {
      sends.push(sendPush(env, data.subscription, {
        title: 'Good morning',
        body: 'Your morning devotion is ready. Start the day with God.',
        tag: 'morning',
        url: '/',
      }));
    } else if (isEvening) {
      sends.push(sendPush(env, data.subscription, {
        title: 'Evening reflection',
        body: 'Take a moment to close the day with God.',
        tag: 'evening',
        url: '/#/devotion',
      }));
    }

    if (wantsSunday && isSunday && isMorning) {
      sends.push(sendPush(env, data.subscription, {
        title: 'New week reminder',
        body: 'Build your next week of devotionals for Sunday and beyond.',
        tag: 'sunday-plan',
        url: '/#/plan',
      }));
    }
  }

  await Promise.allSettled(sends);
}

function clampHour(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 6;
  return Math.max(0, Math.min(23, Math.round(n)));
}

function clampMinute(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(59, Math.round(n)));
}

function withinWindow(h, m, targetH, targetM, windowMinutes = 20) {
  const a = h * 60 + m;
  const b = targetH * 60 + targetM;
  return Math.abs(a - b) <= windowMinutes;
}

function getLocalTime(now, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'long',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(now);
    const map = {};
    parts.forEach((p) => { map[p.type] = p.value; });
    return {
      weekday: map.weekday || '',
      hour: Number(map.hour || 0),
      minute: Number(map.minute || 0),
    };
  } catch {
    return null;
  }
}

function subscriptionKey(endpoint) {
  return `push:${btoa(endpoint).replace(/[^a-zA-Z0-9]/g, '').slice(0, 120)}`;
}

async function sendPush(env, subscription, payload) {
  try {
    const endpoint = new URL(subscription.endpoint);
    const audience = endpoint.origin;
    const jwt = await createVapidJWT(audience, env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    const encrypted = await encryptPushMessage(JSON.stringify(payload), subscription.keys);

    const res = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: '86400',
      },
      body: encrypted,
    });

    if (res.status === 404 || res.status === 410) return false;
    if (!res.ok) {
      console.error('Push send failed:', res.status, await safeText(res));
      return false;
    }
    return true;
  } catch (err) {
    console.error('Push send error:', err?.message || String(err));
    return false;
  }
}

async function createVapidJWT(audience, subject, publicKeyB64, privateKeyB64) {
  const header = { typ: 'JWT', alg: 'ES256' };
  const claims = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + (12 * 60 * 60),
    sub: subject,
  };

  const encodedHeader = toBase64Url(new TextEncoder().encode(JSON.stringify(header)));
  const encodedClaims = toBase64Url(new TextEncoder().encode(JSON.stringify(claims)));
  const signingInput = `${encodedHeader}.${encodedClaims}`;

  const pub = base64urlToUint8Array(publicKeyB64);
  if (pub.length !== 65 || pub[0] !== 0x04) throw new Error('Invalid VAPID public key');
  const d = privateKeyB64;
  const x = toBase64Url(pub.slice(1, 33));
  const y = toBase64Url(pub.slice(33, 65));

  const key = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      d,
      x,
      y,
      ext: true,
      key_ops: ['sign'],
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const rawSig = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput),
  ));
  const joseSig = derToJose(rawSig);
  return `${signingInput}.${toBase64Url(joseSig)}`;
}

async function encryptPushMessage(payload, keys) {
  const userPublic = base64urlToUint8Array(keys.p256dh);
  const userAuth = base64urlToUint8Array(keys.auth);
  const userPublicKey = await crypto.subtle.importKey(
    'raw',
    userPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const serverKeys = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );
  const serverPublic = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeys.publicKey));
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: userPublicKey },
    serverKeys.privateKey,
    256,
  ));

  const authInfo = concatBytes(
    new TextEncoder().encode('WebPush: info'),
    new Uint8Array([0]),
    userPublic,
    serverPublic,
  );
  const prk = await hkdfExtract(userAuth, sharedSecret);
  const ikm = await hkdfExpand(prk, authInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const contentPRK = await hkdfExtract(salt, ikm);
  const cek = await hkdfExpand(contentPRK, new TextEncoder().encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdfExpand(contentPRK, new TextEncoder().encode('Content-Encoding: nonce\0'), 12);

  const plaintext = concatBytes(new TextEncoder().encode(payload), new Uint8Array([0x02]));
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, tagLength: 128 },
    aesKey,
    plaintext,
  ));

  const rs = new Uint8Array([0x00, 0x00, 0x10, 0x00]); // 4096
  const keyIdLen = new Uint8Array([serverPublic.length]);
  return concatBytes(salt, rs, keyIdLen, serverPublic, ciphertext);
}

async function hkdfExtract(salt, ikm) {
  const key = await crypto.subtle.importKey('raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, ikm));
}

async function hkdfExpand(prk, info, length) {
  const hmacKey = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const blocks = Math.ceil(length / 32);
  let t = new Uint8Array(0);
  let okm = new Uint8Array(0);
  for (let i = 1; i <= blocks; i += 1) {
    const input = concatBytes(t, info, new Uint8Array([i]));
    t = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, input));
    okm = concatBytes(okm, t);
  }
  return okm.slice(0, length);
}

function derToJose(sig) {
  if (sig.length === 64) return sig;
  if (sig[0] !== 0x30) throw new Error('Invalid DER signature');
  let offset = 2;
  if (sig[offset] !== 0x02) throw new Error('Invalid DER signature');
  const rLen = sig[offset + 1];
  let r = sig.slice(offset + 2, offset + 2 + rLen);
  offset = offset + 2 + rLen;
  if (sig[offset] !== 0x02) throw new Error('Invalid DER signature');
  const sLen = sig[offset + 1];
  let s = sig.slice(offset + 2, offset + 2 + sLen);
  while (r.length > 32 && r[0] === 0) r = r.slice(1);
  while (s.length > 32 && s[0] === 0) s = s.slice(1);
  const out = new Uint8Array(64);
  out.set(r, 32 - r.length);
  out.set(s, 64 - s.length);
  return out;
}

function concatBytes(...chunks) {
  const len = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  chunks.forEach((c) => {
    out.set(c, off);
    off += c.length;
  });
  return out;
}

function toBase64Url(bytes) {
  const s = String.fromCharCode(...bytes);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64urlToUint8Array(input) {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

async function safeText(res) {
  try { return await res.text(); } catch { return ''; }
}
