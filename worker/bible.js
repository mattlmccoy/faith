/**
 * ABIDE Worker - Bible API handler
 * Proxies bible-api.com (free translations) + api.esv.org (ESV)
 *           + api.scripture.api.bible (NIV, NLT)
 * All API keys stay server-side, never exposed to clients.
 *
 * Secrets needed:
 *   ESV_API_TOKEN     - Token from api.esv.org (set via: wrangler secret put ESV_API_TOKEN)
 *   SCRIPTURE_API_KEY - Key from scripture.api.bible (set via: wrangler secret put SCRIPTURE_API_KEY)
 */

const BIBLE_API_BASE = 'https://bible-api.com';
const ESV_API_BASE = 'https://api.esv.org/v3/passage/text';
const SCRIPTURE_API_BASE = 'https://api.scripture.api.bible/v1';
const CACHE_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

// Translations supported by bible-api.com
const BIBLE_API_TRANSLATIONS = ['web', 'kjv', 'asv', 'bbe', 'darby', 'webbe'];

// Scripture API Bible IDs for proprietary translations
const SCRIPTURE_API_BIBLES = {
  niv: 'de4e12af7f28f599-01',
  nlt: '65eec8e0b60e656b-01',
};

// OSIS book abbreviation map for Scripture API passage IDs
const OSIS_BOOKS = {
  genesis: 'GEN', exodus: 'EXO', leviticus: 'LEV', numbers: 'NUM', deuteronomy: 'DEU',
  joshua: 'JOS', judges: 'JDG', ruth: 'RUT',
  '1 samuel': '1SA', '2 samuel': '2SA', '1 kings': '1KI', '2 kings': '2KI',
  '1 chronicles': '1CH', '2 chronicles': '2CH',
  ezra: 'EZR', nehemiah: 'NEH', esther: 'EST', job: 'JOB',
  psalms: 'PSA', psalm: 'PSA', proverbs: 'PRO', ecclesiastes: 'ECC',
  'song of solomon': 'SNG', 'song of songs': 'SNG',
  isaiah: 'ISA', jeremiah: 'JER', lamentations: 'LAM', ezekiel: 'EZK', daniel: 'DAN',
  hosea: 'HOS', joel: 'JOL', amos: 'AMO', obadiah: 'OBA', jonah: 'JON',
  micah: 'MIC', nahum: 'NAH', habakkuk: 'HAB', zephaniah: 'ZEP', haggai: 'HAG',
  zechariah: 'ZEC', malachi: 'MAL',
  matthew: 'MAT', mark: 'MRK', luke: 'LUK', john: 'JHN', acts: 'ACT',
  romans: 'ROM', '1 corinthians': '1CO', '2 corinthians': '2CO',
  galatians: 'GAL', ephesians: 'EPH', philippians: 'PHP', colossians: 'COL',
  '1 thessalonians': '1TH', '2 thessalonians': '2TH',
  '1 timothy': '1TI', '2 timothy': '2TI', titus: 'TIT', philemon: 'PHM',
  hebrews: 'HEB', james: 'JAS', '1 peter': '1PE', '2 peter': '2PE',
  '1 john': '1JN', '2 john': '2JN', '3 john': '3JN', jude: 'JUD',
  revelation: 'REV',
};

// Convert a human reference like "John 3:16" or "John 3:16-21" to an OSIS passage ID.
function refToOsisId(ref) {
  const clean = ref.trim();
  // Match: Book Chapter:Verse[-EndVerse] or Book Chapter:Verse-Chapter:Verse
  const m = clean.match(/^(.+?)\s+(\d+):(\d+)(?:\s*[-–]\s*(\d+)(?::(\d+))?)?$/i);
  if (!m) return null;
  const bookKey = m[1].toLowerCase().replace(/\s+/g, ' ');
  const osis = OSIS_BOOKS[bookKey];
  if (!osis) return null;
  const ch = m[2], vs = m[3];
  if (m[4]) {
    // Range: end chapter or end verse
    const endCh = m[5] ? m[4] : ch;
    const endVs = m[5] || m[4];
    return `${osis}.${ch}.${vs}-${osis}.${endCh}.${endVs}`;
  }
  return `${osis}.${ch}.${vs}`;
}

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
    } else if (SCRIPTURE_API_BIBLES[translation]) {
      data = await fetchScriptureAPI(ref, translation, env);
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

async function fetchScriptureAPI(ref, translationId, env) {
  if (!env.SCRIPTURE_API_KEY) {
    return { error: 'Scripture API key not configured on server. Run: wrangler secret put SCRIPTURE_API_KEY' };
  }

  const bibleId = SCRIPTURE_API_BIBLES[translationId];
  if (!bibleId) return { error: `Unsupported translation: ${translationId}` };

  const passageId = refToOsisId(ref);
  if (!passageId) {
    return { error: `Could not parse reference: ${ref}` };
  }

  const params = new URLSearchParams({
    'content-type': 'text',
    'include-verse-numbers': 'true',
    'include-titles': 'false',
    'include-chapter-numbers': 'false',
    'include-verse-spans': 'false',
  });

  const apiUrl = `${SCRIPTURE_API_BASE}/bibles/${bibleId}/passages/${encodeURIComponent(passageId)}?${params}`;
  const res = await fetch(apiUrl, {
    headers: { 'api-key': env.SCRIPTURE_API_KEY },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { error: `Scripture API error: ${res.status} ${body.slice(0, 120)}` };
  }

  const json = await res.json();
  const content = json?.data?.content || '';
  const canonicalRef = json?.data?.reference || ref;

  // Parse verse numbers from content. Scripture API text format includes
  // verse markers like "[3]" or "¶ [3]" at the start of each verse.
  const verses = [];
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  const verseRegex = /^[¶\s]*\[(\d+)\]\s*(.*)/;
  let currentVerse = null;
  let currentText = [];

  for (const line of lines) {
    const m = line.match(verseRegex);
    if (m) {
      if (currentVerse !== null) {
        verses.push({ verse: currentVerse, text: currentText.join(' ').trim() });
      }
      currentVerse = parseInt(m[1], 10);
      currentText = [m[2]];
    } else if (currentVerse !== null) {
      currentText.push(line);
    }
  }
  if (currentVerse !== null) {
    verses.push({ verse: currentVerse, text: currentText.join(' ').trim() });
  }

  // Fallback: return as single block if no verse markers found
  if (!verses.length && content.trim()) {
    const plain = content.replace(/\[[\d¶]+\]/g, '').replace(/\s+/g, ' ').trim();
    verses.push({ verse: 1, text: plain });
  }

  const TRANSLATION_NAMES = { niv: 'New International Version', nlt: 'New Living Translation' };
  const TRANSLATION_NOTES = {
    niv: 'NIV® © 1973, 2011 Biblica. Personal devotional use only.',
    nlt: 'NLT © 1996, 2015 Tyndale House. Personal devotional use only.',
  };

  return {
    reference: canonicalRef,
    translation_id: translationId,
    translation_name: TRANSLATION_NAMES[translationId] || translationId.toUpperCase(),
    translation_note: TRANSLATION_NOTES[translationId] || '',
    verses,
    text: verses.map(v => v.text).join(' '),
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
