/**
 * ABIDE Worker - Feedback intake endpoint
 * Stores feedback payloads in KV so submissions stay inside the web app flow.
 */

function uid() {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${Date.now()}-${rand}`;
}

function sanitizeText(value, max = 4000) {
  return String(value || '').replace(/\u0000/g, '').trim().slice(0, max);
}

export async function handleFeedback(request, url, env, origin, json) {
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405, origin);

  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, origin);
  }

  const type = sanitizeText(body.type || 'General Feedback', 48);
  const subject = sanitizeText(body.subject || '', 180);
  const details = sanitizeText(body.details || '', 8000);
  const contact = sanitizeText(body.contact || '', 180);
  const appVersion = sanitizeText(body.appVersion || '', 64);
  const page = sanitizeText(body.page || '', 1000);
  const userAgent = sanitizeText(body.userAgent || '', 500);
  const submittedAt = new Date().toISOString();

  if (!subject || !details) {
    return json({ error: 'Subject and details are required' }, 400, origin);
  }

  const id = `feedback:${submittedAt.slice(0, 10)}:${uid()}`;
  const record = {
    id,
    submittedAt,
    type,
    subject,
    details,
    contact,
    appVersion,
    page,
    userAgent,
    origin,
  };

  if (!env.ABIDE_KV) {
    return json({ error: 'Feedback storage is not configured' }, 503, origin);
  }

  await env.ABIDE_KV.put(id, JSON.stringify(record), { expirationTtl: 365 * 24 * 60 * 60 });
  return json({ ok: true, id }, 200, origin);
}
