/**
 * ABIDE Worker - Bible API handler
 * Proxies bible-api.com (free translations) + api.esv.org (ESV)
 * All API keys stay server-side, never exposed to clients.
 *
 * Secrets needed:
 *   ESV_API_TOKEN  - Token from api.esv.org (set via: wrangler secret put ESV_API_TOKEN)
 */

const BIBLE_API_BASE = 'https://bible-api.com';
const ESV_API_BASE = 'https://api.esv.org/v3/passage/text';
const CACHE_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

// Translations supported by bible-api.com
const BIBLE_API_TRANSLATIONS = ['web', 'kjv', 'asv', 'bbe', 'darby', 'webbe'];

export async function handleBible(request, url, env, origin, json) {

  // GET /bible?ref=John+3:16&translation=web
  if (url.pathname === '/bible') {
    const ref = url.searchParams.get('ref');
    const translation = (url.searchParams.get('translation') || 'web').toLowerCase();
    if (!ref) return json({ error: 'Missing ref parameter' }, 400, origin);

    const cacheKey = `bible:${ref.toLowerCase()}:${translation}`;

    // Check KV cache first
    if (env.ABIDE_KV) {
      const cached = await env.ABIDE_KV.get(cacheKey, 'json');
      if (cached) return json(cached, 200, origin);
    }

    let data;

    if (translation === 'esv') {
      data = await fetchESV(ref, env);
    } else {
      // Use bible-api.com for all other translations
      const t = BIBLE_API_TRANSLATIONS.includes(translation) ? translation : 'web';
      const apiUrl = `${BIBLE_API_BASE}/${encodeURIComponent(ref)}?translation=${t}`;
      const res = await fetch(apiUrl);
      if (!res.ok) {
        return json({ error: `Bible API error: ${res.status}` }, res.status, origin);
      }
      data = await res.json();
    }

    if (!data || data.error) {
      return json({ error: data?.error || 'Failed to fetch passage' }, 502, origin);
    }

    // Cache the result
    if (env.ABIDE_KV) {
      await env.ABIDE_KV.put(cacheKey, JSON.stringify(data), { expirationTtl: CACHE_TTL });
    }

    return json(data, 200, origin);
  }

  // GET /bible/suggest?q=John+3
  if (url.pathname === '/bible/suggest') {
    const q = url.searchParams.get('q') || '';
    const suggestions = getBibleSuggestions(q);
    return json({ suggestions }, 200, origin);
  }

  return json({ error: 'Not found' }, 404, origin);
}

async function fetchESV(ref, env) {
  if (!env.ESV_API_TOKEN) {
    return { error: 'ESV API token not configured on server.' };
  }

  const params = new URLSearchParams({
    q: ref,
    'include-verse-numbers': 'true',
    'include-headings': 'false',
    'include-footnotes': 'false',
    'include-passage-references': 'false',
    'include-short-copyright': 'false',
    'include-copyright': 'false',
  });

  const res = await fetch(`${ESV_API_BASE}/?${params}`, {
    headers: { 'Authorization': `Token ${env.ESV_API_TOKEN}` },
  });

  if (!res.ok) {
    return { error: `ESV API error: ${res.status}` };
  }

  const esv = await res.json();
  const passageText = esv.passages?.[0] || '';

  // Normalise to match the shape that the app expects from bible-api.com
  // Parse verse numbers out of ESV format: [1] text [2] text...
  const verses = [];
  const verseRegex = /\[(\d+)\]\s*([\s\S]*?)(?=\[(\d+)\]|$)/g;
  let match;
  while ((match = verseRegex.exec(passageText)) !== null) {
    const verseNum = parseInt(match[1], 10);
    const text = match[2].replace(/\s+/g, ' ').trim();
    if (text) {
      verses.push({ verse: verseNum, text });
    }
  }

  // Fallback: if regex got nothing, return as a single block
  if (!verses.length && passageText.trim()) {
    verses.push({ verse: 1, text: passageText.replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim() });
  }

  return {
    reference: esv.canonical || ref,
    translation_id: 'esv',
    translation_name: 'English Standard Version',
    translation_note: 'ESV® Bible © 2001 Crossway. Personal devotional use only.',
    verses,
    text: passageText.replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim(),
  };
}

function getBibleSuggestions(query) {
  if (!query || query.length < 2) return [];
  const books = ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy',
    'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel', '1 Kings', '2 Kings',
    'Psalms', 'Proverbs', 'Isaiah', 'Jeremiah', 'Ezekiel', 'Daniel',
    'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans',
    '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians',
    'Colossians', 'Hebrews', 'James', '1 Peter', '2 Peter', 'Revelation'];
  const q = query.toLowerCase().trim();
  return books
    .filter(b => b.toLowerCase().startsWith(q))
    .slice(0, 5)
    .map(b => ({ label: b, ref: b }));
}
