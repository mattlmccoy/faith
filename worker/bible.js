/**
 * ABIDE Worker - Bible API handler
 * Proxies bible-api.com with KV caching
 */

const BIBLE_BASE = 'https://bible-api.com';
const TRANSLATION = 'web';
const CACHE_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

export async function handleBible(request, url, env, origin, json) {
  // GET /bible?ref=John+3:16
  if (url.pathname === '/bible') {
    const ref = url.searchParams.get('ref');
    if (!ref) return json({ error: 'Missing ref parameter' }, 400, origin);

    const cacheKey = `bible:${ref.toLowerCase()}`;

    // Check KV cache
    if (env.ABIDE_KV) {
      const cached = await env.ABIDE_KV.get(cacheKey, 'json');
      if (cached) return json(cached, 200, origin);
    }

    // Fetch from bible-api.com
    const apiUrl = `${BIBLE_BASE}/${encodeURIComponent(ref)}?translation=${TRANSLATION}`;
    const res = await fetch(apiUrl);
    if (!res.ok) {
      return json({ error: `Bible API error: ${res.status}` }, res.status, origin);
    }

    const data = await res.json();

    // Cache the result
    if (env.ABIDE_KV) {
      await env.ABIDE_KV.put(cacheKey, JSON.stringify(data), { expirationTtl: CACHE_TTL });
    }

    return json(data, 200, origin);
  }

  // GET /bible/suggest?q=John+3
  if (url.pathname === '/bible/suggest') {
    const q = url.searchParams.get('q') || '';
    // Return suggestions (pure JS, no external call needed)
    const suggestions = getBibleSuggestions(q);
    return json({ suggestions }, 200, origin);
  }

  return json({ error: 'Not found' }, 404, origin);
}

function getBibleSuggestions(query) {
  if (!query || query.length < 2) return [];
  // Simplified suggestion logic (full version is in api.js on the client)
  const books = ['Genesis', 'Exodus', 'Psalms', 'Proverbs', 'Isaiah', 'Matthew', 'Mark',
    'Luke', 'John', 'Acts', 'Romans', 'Galatians', 'Ephesians', 'Philippians',
    'Colossians', 'Hebrews', 'James', 'Revelation'];
  const q = query.toLowerCase().trim();
  return books
    .filter(b => b.toLowerCase().startsWith(q))
    .slice(0, 5)
    .map(b => ({ label: b, ref: b }));
}
