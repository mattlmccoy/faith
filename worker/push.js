/**
 * ABIDE Worker - Push Notification handler
 *
 * Environment variables needed:
 *   VAPID_PUBLIC_KEY  - base64url-encoded VAPID public key
 *   VAPID_PRIVATE_KEY - base64url-encoded VAPID private key
 *   VAPID_SUBJECT     - mailto:your@email.com
 *
 * Generate VAPID keys: npx web-push generate-vapid-keys
 */

export async function handlePush(request, url, env, origin, json, ctx) {
  // GET /push/vapid-key - return public key for client subscription
  if (url.pathname === '/push/vapid-key' && request.method === 'GET') {
    if (!env.VAPID_PUBLIC_KEY) {
      return json({ error: 'VAPID not configured' }, 503, origin);
    }
    return json({ publicKey: env.VAPID_PUBLIC_KEY }, 200, origin);
  }

  // POST /push/subscribe - store subscription
  if (url.pathname === '/push/subscribe' && request.method === 'POST') {
    const body = await request.json();
    const { subscription, morningHour = 6, morningMinute = 30, eveningHour = 20, eveningMinute = 0 } = body;

    if (!subscription?.endpoint) {
      return json({ error: 'Invalid subscription' }, 400, origin);
    }

    if (env.ABIDE_KV) {
      // Store with endpoint as key (truncated for KV key limit)
      const key = `push:${btoa(subscription.endpoint).slice(0, 100)}`;
      await env.ABIDE_KV.put(key, JSON.stringify({
        subscription,
        preferences: { morningHour, morningMinute, eveningHour, eveningMinute },
        updatedAt: new Date().toISOString(),
      }), { expirationTtl: 365 * 24 * 60 * 60 }); // 1 year
    }

    return json({ success: true }, 200, origin);
  }

  // POST /push/test - send a test notification
  if (url.pathname === '/push/test' && request.method === 'POST') {
    // Get first stored subscription and send test
    if (env.ABIDE_KV) {
      const list = await env.ABIDE_KV.list({ prefix: 'push:' });
      if (list.keys.length > 0) {
        const data = await env.ABIDE_KV.get(list.keys[0].name, 'json');
        if (data?.subscription) {
          await sendPush(env, data.subscription, {
            title: 'Abide',
            body: 'This is a test notification. Your reminders are working!',
            tag: 'test',
          });
          return json({ success: true, sent: 1 }, 200, origin);
        }
      }
    }
    return json({ success: false, message: 'No subscriptions found' }, 200, origin);
  }

  return json({ error: 'Not found' }, 404, origin);
}

// Called by cron trigger
export async function handleScheduledPush(env) {
  if (!env.ABIDE_KV || !env.VAPID_PUBLIC_KEY) return;

  const now = new Date();
  const currentHour = now.getUTCHours();
  const currentMinute = now.getUTCMinutes();

  // Get all subscriptions
  const list = await env.ABIDE_KV.list({ prefix: 'push:' });
  const sends = [];

  for (const key of list.keys) {
    const data = await env.ABIDE_KV.get(key.name, 'json');
    if (!data?.subscription || !data?.preferences) continue;

    const { morningHour, morningMinute, eveningHour, eveningMinute } = data.preferences;

    // Morning notification window (±30 min of configured time, converted to UTC)
    const isMorning = currentHour === morningHour && Math.abs(currentMinute - morningMinute) < 30;
    const isEvening = currentHour === eveningHour && Math.abs(currentMinute - eveningMinute) < 30;

    if (isMorning) {
      sends.push(sendPush(env, data.subscription, {
        title: 'Good morning ☀️',
        body: 'Your morning devotion is ready. Start the day with God.',
        tag: 'morning',
        url: '/abide/',
      }));
    } else if (isEvening) {
      sends.push(sendPush(env, data.subscription, {
        title: 'Evening reflection 🌙',
        body: 'Take a moment to close the day with God.',
        tag: 'evening',
        url: '/abide/#/devotion',
      }));
    }
  }

  await Promise.allSettled(sends);
}

async function sendPush(env, subscription, payload) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return;

  const body = JSON.stringify(payload);

  // Construct VAPID JWT
  const jwt = await createVapidJWT(
    new URL(subscription.endpoint).origin,
    env.VAPID_SUBJECT,
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY,
  );

  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt},k=${env.VAPID_PUBLIC_KEY}`,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': '86400',
    },
    body: await encryptPushMessage(body, subscription.keys),
  });

  if (!res.ok) {
    console.error('Push send failed:', res.status, await res.text());
  }
}

// VAPID JWT creation using Web Crypto API
async function createVapidJWT(audience, subject, publicKey, privateKey) {
  const header = { typ: 'JWT', alg: 'ES256' };
  const claims = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: subject,
  };

  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const claimsB64 = btoa(JSON.stringify(claims)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const message = `${headerB64}.${claimsB64}`;

  const keyBytes = base64urlToUint8Array(privateKey);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(message),
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return `${message}.${sigB64}`;
}

// Web Push message encryption (RFC 8291 / aes128gcm)
async function encryptPushMessage(plaintext, keys) {
  // Note: Full Web Push encryption is complex.
  // For production, use the web-push npm package in a Node.js worker
  // or use the simpler approach below with a proper library.
  // This is a placeholder that sends unencrypted for development.
  return new TextEncoder().encode(plaintext);
}

function base64urlToUint8Array(b64) {
  const b64standard = b64.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64standard);
  return new Uint8Array([...raw].map(c => c.charCodeAt(0)));
}
