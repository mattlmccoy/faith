/**
 * ABIDE Worker - Bible API handler
 * Proxies bible-api.com (free translations) + api.esv.org (ESV)
 *           + api.youversion.com (NIV, NLT) via YouVersion Developer API
 * All API keys stay server-side, never exposed to clients.
 *
 * Secrets needed:
 *   ESV_API_TOKEN      - Token from api.esv.org (wrangler secret put ESV_API_TOKEN)
 *   YOUVERSION_API_KEY - App key from platform.YouVersion.com (wrangler secret put YOUVERSION_API_KEY)
 *
 * YouVersion compliance:
 *   - App key must be sent as X-YVP-App-Key header on every request (per api-usage docs)
 *   - NIV © Biblica, NLT © Tyndale — for personal devotional use only
 *   - Attribution shown to user via translation_note field in API responses
 *   - Developer must accept YouVersion license agreements at platform.YouVersion.com
 */

const BIBLE_API_BASE = 'https://bible-api.com';
const ESV_API_BASE = 'https://api.esv.org/v3/passage/text';
const YOUVERSION_API_BASE = 'https://api.youversion.com/v1';
const NLT_API_BASE = 'https://api.nlt.to';
const CACHE_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

// Translations supported by bible-api.com
const BIBLE_API_TRANSLATIONS = ['web', 'kjv', 'asv', 'bbe', 'darby', 'webbe'];

// YouVersion Bible IDs. Only translations covered by an accepted license agreement
// are accessible — others return 403. Verified via /bible/debug endpoint.
// Unlocked: NIV (Biblica Fast-track License v1). CSB/MSG still require publisher licenses.
const YOUVERSION_BIBLES = {
  niv: 111,   // New International Version (2011) — NIV® © Biblica ✓ licensed
  bsb: 3034,  // Berean Standard Bible (2016-2024) — CC BY-SA 4.0
  lsv: 2660,  // Literal Standard Version — CC BY-SA 4.0
};

// Shared translation metadata used by fetchYouVersion + fetchYouVersionRange
const YV_NAMES = {
  niv: 'New International Version',
  bsb: 'Berean Standard Bible',
  lsv: 'Literal Standard Version',
};
const YV_NOTES = {
  niv: 'NIV® © 1973, 2011 Biblica. Personal devotional use only.',
  bsb: 'BSB © 2016–2024 by Bible Hub & Berean.Bible. CC BY-SA 4.0.',
  lsv: 'LSV © 2020 by Covenant Press. CC BY-SA 4.0.',
};

// OSIS/USFM book abbreviation map for passage IDs (used by ESV + YouVersion)
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
    } else if (translation === 'nlt') {
      data = await fetchNLT(ref, env);
    } else if (YOUVERSION_BIBLES[translation]) {
      data = await fetchYouVersion(ref, translation, env);
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

  // GET /bible/versions — diagnostic: lists YouVersion bible IDs for English bibles.
  // Use this to verify/correct the YOUVERSION_BIBLES ID map.
  // Example: curl https://abide-worker.mattlmccoy.workers.dev/bible/versions
  if (url.pathname === '/bible/versions') {
    if (!env.YOUVERSION_API_KEY) {
      return json({ error: 'YOUVERSION_API_KEY not set' }, 500, origin);
    }
    const res = await fetch(`${YOUVERSION_API_BASE}/bibles?language_ranges[]=en`, {
      headers: { 'X-YVP-App-Key': env.YOUVERSION_API_KEY },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return json({ error: `YouVersion API error: ${res.status}`, detail: body.slice(0, 300) }, res.status, origin);
    }
    const bibles = await res.json();
    // Return just the fields useful for ID matching: id, abbreviation, local_title
    const summary = Array.isArray(bibles)
      ? bibles.map(b => ({ id: b.id, abbr: b.abbreviation, title: b.local_title || b.title }))
      : bibles;
    return json({ configured_ids: YOUVERSION_BIBLES, available: summary }, 200, origin);
  }

  // GET /bible/debug?ref=John+3:16&translation=niv[&bibleId=111] — test a single passage fetch
  // and return the raw YouVersion response (before normalisation) alongside any error.
  // Pass bibleId explicitly to test translations not yet in YOUVERSION_BIBLES.
  if (url.pathname === '/bible/debug') {
    const ref = url.searchParams.get('ref') || 'John 3:16';
    const translation = (url.searchParams.get('translation') || 'niv').toLowerCase();
    if (!env.YOUVERSION_API_KEY) {
      return json({ error: 'YOUVERSION_API_KEY not set' }, 500, origin);
    }
    // Allow explicit bibleId override for testing IDs not yet in the map
    const rawId = url.searchParams.get('bibleId');
    const bibleId = rawId ? parseInt(rawId, 10) : YOUVERSION_BIBLES[translation];
    if (!bibleId) return json({ error: `Unknown translation: ${translation}`, known: Object.keys(YOUVERSION_BIBLES), tip: 'Pass &bibleId=111 to test NIV directly' }, 400, origin);
    const passageId = refToOsisId(ref);
    if (!passageId) return json({ error: `Could not parse ref: ${ref}` }, 400, origin);
    const apiUrl = `${YOUVERSION_API_BASE}/bibles/${bibleId}/passages/${encodeURIComponent(passageId)}?format=text&include_headings=false&include_notes=false`;
    const res = await fetch(apiUrl, { headers: { 'X-YVP-App-Key': env.YOUVERSION_API_KEY } });
    const body = await res.text().catch(() => '');
    let parsed;
    try { parsed = JSON.parse(body); } catch { parsed = null; }
    return json({
      status: res.status,
      ref, translation, bibleId, passageId, apiUrl,
      response: parsed || body.slice(0, 500),
    }, 200, origin);
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

async function fetchYouVersion(ref, translationId, env) {
  if (!env.YOUVERSION_API_KEY) {
    return { error: 'YouVersion API key not configured on server. Run: wrangler secret put YOUVERSION_API_KEY' };
  }

  const bibleId = YOUVERSION_BIBLES[translationId];
  if (!bibleId) return { error: `Unsupported translation: ${translationId}` };

  const passageId = refToOsisId(ref);
  if (!passageId) {
    return { error: `Could not parse reference: ${ref}` };
  }

  // YouVersion /passages/ only accepts single verse IDs — ranges return 404.
  // Expand ranges to parallel individual verse fetches.
  if (passageId.includes('-')) {
    return fetchYouVersionRange(passageId, ref, translationId, bibleId, env);
  }

  const params = new URLSearchParams({
    format: 'text',
    include_headings: 'false',
    include_notes: 'false',
  });

  const apiUrl = `${YOUVERSION_API_BASE}/bibles/${bibleId}/passages/${encodeURIComponent(passageId)}?${params}`;
  const res = await fetch(apiUrl, {
    headers: { 'X-YVP-App-Key': env.YOUVERSION_API_KEY },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { error: `YouVersion API error: ${res.status} ${body.slice(0, 120)}` };
  }

  const data = await res.json();
  // YouVersion single-verse response: { id, content, reference }
  // content is plain text with no verse markers — return as single verse.
  const content = (data?.content || '').replace(/\s+/g, ' ').trim();
  const canonicalRef = data?.reference || ref;

  const verses = content ? [{ verse: 1, text: content }] : [];

  return {
    reference: canonicalRef,
    translation_id: translationId,
    translation_name: YV_NAMES[translationId] || translationId.toUpperCase(),
    translation_note: YV_NOTES[translationId] || '',
    verses,
    text: content,
  };
}

// Expand a verse range by fetching each verse individually in parallel.
// Needed because YouVersion /passages/ endpoint only accepts single verse IDs.
async function fetchYouVersionRange(passageId, humanRef, translationId, bibleId, env) {
  const dashIdx = passageId.indexOf('-');
  const startId = passageId.slice(0, dashIdx);   // e.g. JHN.3.16
  const endId   = passageId.slice(dashIdx + 1);  // e.g. JHN.3.21 or 3.21

  const startParts = startId.split('.');
  const endParts   = endId.split('.');
  const book    = startParts[0];
  const startCh = parseInt(startParts[1], 10);
  const startVs = parseInt(startParts[2], 10);

  let endCh, endVs;
  if (endParts.length >= 3) {        // JHN.3.21
    endCh = parseInt(endParts[1], 10);
    endVs = parseInt(endParts[2], 10);
  } else if (endParts.length === 2) { // 3.21
    endCh = parseInt(endParts[0], 10);
    endVs = parseInt(endParts[1], 10);
  } else {                            // 21 (same chapter implied)
    endCh = startCh;
    endVs = parseInt(endParts[0], 10);
  }

  // Build individual verse IDs.
  // Same-chapter: expand exactly. Cross-chapter (up to 3 chapters apart): expand
  // generously — YouVersion returns null for non-existent verses so over-fetching
  // is safe; nulls are filtered out before building the response.
  const verseIds = [];
  if (startCh === endCh) {
    if (endVs >= startVs && (endVs - startVs) <= 40) {
      for (let v = startVs; v <= endVs; v++) {
        verseIds.push(`${book}.${startCh}.${v}`);
      }
    } else {
      verseIds.push(startId); // very long same-chapter range: just first verse
    }
  } else if (endCh <= startCh + 3) {
    // Adjacent chapters (1–3 apart): fetch generously, null-filter trims the rest
    for (let ch = startCh; ch <= endCh && verseIds.length < 60; ch++) {
      const vsStart = ch === startCh ? startVs : 1;
      const vsEnd   = ch === endCh   ? endVs   : startVs + 50; // generous upper bound
      for (let v = vsStart; v <= vsEnd && verseIds.length < 60; v++) {
        verseIds.push(`${book}.${ch}.${v}`);
      }
    }
  } else {
    verseIds.push(startId); // wide multi-chapter range: just the opening verse
  }

  const yvParams = 'format=text&include_headings=false&include_notes=false';
  const fetched = await Promise.all(
    verseIds.map(vid => {
      const u = `${YOUVERSION_API_BASE}/bibles/${bibleId}/passages/${vid}?${yvParams}`;
      return fetch(u, { headers: { 'X-YVP-App-Key': env.YOUVERSION_API_KEY } })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null);
    })
  );

  const verses = fetched
    .map((d, i) => {
      if (!d?.content) return null;
      // Extract verse number from the USFM ID (e.g. JHN.3.16 → 16)
      const idParts = verseIds[i].split('.');
      const verseNum = parseInt(idParts[idParts.length - 1], 10) || (startVs + i);
      return { verse: verseNum, text: d.content.replace(/\s+/g, ' ').trim() };
    })
    .filter(Boolean);

  if (!verses.length) {
    return { error: `Could not load passage range: ${humanRef}` };
  }

  return {
    reference: humanRef,
    translation_id: translationId,
    translation_name: YV_NAMES[translationId] || translationId.toUpperCase(),
    translation_note: YV_NOTES[translationId] || '',
    verses,
    text: verses.map(v => v.text).join(' '),
  };
}

// Convert human ref to Tyndale NLT API format: "John 3:16" → "John.3:16"
function refToNLTFormat(ref) {
  return ref.trim().replace(/\s+(\d+:\d+(?:-\d+(?::\d+)?)?)$/, '.$1');
}

// Strip NLT HTML response to plain text verses.
// Tyndale wraps each verse in <verse_export vn="N">.
// Translator notes live in <span class="tn"><span class="tn-ref">…</span> text <em>…</em></span>
// The non-greedy [\s\S]*?</span> stops at the first </span> inside the tn span (tn-ref),
// leaving the note text behind. Fix: multi-pass — collapse inner tags first, then remove tn.
function stripNLTNotes(html) {
  let s = html;
  // Pass 1: remove leaf elements that nest inside tn spans
  s = s.replace(/<span[^>]*class="tn-ref"[^>]*>[^<]*<\/span>/gi, '');
  s = s.replace(/<em>[^<]*<\/em>/gi, '');
  s = s.replace(/<strong>[^<]*<\/strong>/gi, '');
  s = s.replace(/<i>[^<]*<\/i>/gi, '');
  // Pass 2: tn spans are now flat (no nested tags) — safe to remove with non-greedy match
  s = s.replace(/<span[^>]*class="tn"[^>]*>[^<]*<\/span>/gi, '');
  // Safety pass: catch any remaining tn spans that still have nested content
  s = s.replace(/<span[^>]*class="tn"[^>]*>[\s\S]*?<\/span>/gi, '');
  // Remove footnote anchor links  e.g. <a class="a-tn">*</a>
  s = s.replace(/<a[^>]*class="a-tn"[^>]*>[^<]*<\/a>/gi, '');
  // Remove visible verse-number spans  e.g. <span class="vn">16</span>
  s = s.replace(/<span[^>]*class="vn"[^>]*>\d+<\/span>/gi, '');
  return s;
}

function htmlToPlain(html) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function parseNLTHtml(html) {
  const verses = [];
  const verseExportRe = /<verse_export[^>]*\bvn="(\d+)"[^>]*>([\s\S]*?)<\/verse_export>/gi;
  let m;
  while ((m = verseExportRe.exec(html)) !== null) {
    const text = htmlToPlain(stripNLTNotes(m[2]));
    if (text) verses.push({ verse: parseInt(m[1], 10), text });
  }

  // Fallback: strip all HTML and return as single block
  if (!verses.length) {
    const plain = htmlToPlain(stripNLTNotes(html));
    if (plain) verses.push({ verse: 1, text: plain });
  }

  return verses;
}

async function fetchNLT(ref, env) {
  if (!env.NLT_API_KEY) {
    return { error: 'NLT API key not configured on server. Run: wrangler secret put NLT_API_KEY' };
  }

  const nltRef = refToNLTFormat(ref);
  const params = new URLSearchParams({ ref: nltRef, key: env.NLT_API_KEY, version: 'NLT' });
  const res = await fetch(`${NLT_API_BASE}/api/passages?${params}`);

  if (!res.ok) {
    return { error: `NLT API error: ${res.status}` };
  }

  const html = await res.text();

  if (!html.includes('verse_export')) {
    return { error: 'Passage not found in NLT. Check reference format.' };
  }

  // Extract canonical reference from the HTML header (e.g. "John 3:16-18, NLT")
  const headerMatch = html.match(/<h2 class="bk_ch_vs_header">([^<]+)<\/h2>/);
  const canonicalRef = headerMatch
    ? headerMatch[1].replace(/,\s*NLT\S*$/i, '').trim()
    : ref;

  const verses = parseNLTHtml(html);

  return {
    reference: canonicalRef,
    translation_id: 'nlt',
    translation_name: 'New Living Translation',
    translation_note: 'NLT © 1996, 2004, 2015 Tyndale House Foundation. Personal devotional use only.',
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
