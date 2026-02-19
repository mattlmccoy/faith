/* ============================================================
   ABIDE - API Client
   All external calls: Bible, search, push
   ============================================================ */

const API = (() => {
  // Direct Bible API (CORS-enabled, no key needed)
  const BIBLE_BASE = 'https://bible-api.com';

  // Default Worker URL — baked in after you deploy once.
  // Users don't need to configure this. Override in Settings → Advanced only if self-hosting.
  const DEFAULT_WORKER_URL = 'https://abide-worker.mattlmccoy.workers.dev';

  function bibleTranslation() {
    return Store.get('bibleTranslation') || 'web';
  }

  // Worker URL: use stored override if set, else fall back to default
  function workerUrl() {
    return Store.get('workerUrl') || DEFAULT_WORKER_URL;
  }

  function hasWorker() {
    // Always true once the default URL is baked in; false only if explicitly cleared
    const url = workerUrl();
    return !!url && url !== '';
  }

  // --- Bible API ---

  async function getPassage(ref) {
    // Normalize reference for URL
    const encoded = encodeURIComponent(ref);
    const translation = bibleTranslation();
    const url = `${BIBLE_BASE}/${encoded}?translation=${translation}`;

    const cacheKey = `bible:${ref}:${translation}`;
    const cached = Cache.get(cacheKey);
    if (cached) return cached;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Bible API error: ${res.status}`);
      const data = await res.json();
      Cache.set(cacheKey, data, 7 * 24 * 60 * 60 * 1000); // 7 days
      return data;
    } catch (err) {
      console.error('getPassage error:', err);
      throw err;
    }
  }

  async function getVerses(ref) {
    const data = await getPassage(ref);
    return data.verses || [{ book_name: '', chapter: 1, verse: 1, text: data.text || '' }];
  }

  // --- Autocomplete Suggestions ---

  const BIBLE_BOOKS = [
    'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy',
    'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel',
    '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles',
    'Ezra', 'Nehemiah', 'Esther', 'Job', 'Psalms', 'Proverbs',
    'Ecclesiastes', 'Song of Solomon', 'Isaiah', 'Jeremiah',
    'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos',
    'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah',
    'Haggai', 'Zechariah', 'Malachi',
    'Matthew', 'Mark', 'Luke', 'John', 'Acts',
    'Romans', '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians',
    'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians',
    '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews',
    'James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John',
    'Jude', 'Revelation'
  ];

  // Abbreviation map
  const ABBREVS = {
    'gen': 'Genesis', 'ex': 'Exodus', 'lev': 'Leviticus', 'num': 'Numbers',
    'deut': 'Deuteronomy', 'dt': 'Deuteronomy', 'josh': 'Joshua', 'judg': 'Judges',
    'ruth': 'Ruth', '1sam': '1 Samuel', '2sam': '2 Samuel',
    '1kgs': '1 Kings', '2kgs': '2 Kings', '1chr': '1 Chronicles', '2chr': '2 Chronicles',
    'ezra': 'Ezra', 'neh': 'Nehemiah', 'esth': 'Esther', 'job': 'Job',
    'ps': 'Psalms', 'psa': 'Psalms', 'psalm': 'Psalms', 'prov': 'Proverbs',
    'eccl': 'Ecclesiastes', 'ecc': 'Ecclesiastes', 'sos': 'Song of Solomon',
    'isa': 'Isaiah', 'jer': 'Jeremiah', 'lam': 'Lamentations', 'ezek': 'Ezekiel',
    'dan': 'Daniel', 'hos': 'Hosea', 'joel': 'Joel', 'amos': 'Amos',
    'jon': 'Jonah', 'mic': 'Micah', 'nah': 'Nahum', 'hab': 'Habakkuk',
    'zeph': 'Zephaniah', 'hag': 'Haggai', 'zech': 'Zechariah', 'mal': 'Malachi',
    'matt': 'Matthew', 'mt': 'Matthew', 'mk': 'Mark', 'lk': 'Luke', 'jn': 'John',
    'acts': 'Acts', 'rom': 'Romans', '1cor': '1 Corinthians', '2cor': '2 Corinthians',
    'gal': 'Galatians', 'eph': 'Ephesians', 'phil': 'Philippians', 'col': 'Colossians',
    '1thess': '1 Thessalonians', '2thess': '2 Thessalonians',
    '1tim': '1 Timothy', '2tim': '2 Timothy', 'tit': 'Titus', 'phlm': 'Philemon',
    'heb': 'Hebrews', 'jas': 'James', '1pet': '1 Peter', '2pet': '2 Peter',
    '1jn': '1 John', '2jn': '2 John', '3jn': '3 John', 'jude': 'Jude',
    'rev': 'Revelation',
  };

  function getSuggestions(query) {
    if (!query || query.length < 2) return [];

    const q = query.trim().toLowerCase();

    // Try to parse abbreviation + chapter:verse
    const match = q.match(/^(\d?\s?[a-z]+)\s*(\d*)(:?)(\d*)$/);
    if (!match) return [];

    const bookPart = match[1].replace(/\s/g, '').toLowerCase();
    const chapterPart = match[2];
    const hasColon = match[3] === ':';
    const versePart = match[4];

    // Resolve book name
    let resolvedBook = ABBREVS[bookPart] || null;
    if (!resolvedBook) {
      // Fuzzy: find books starting with query
      resolvedBook = BIBLE_BOOKS.find(b => b.toLowerCase().startsWith(bookPart)) || null;
    }

    const suggestions = [];

    if (!resolvedBook) {
      // Show books that match
      BIBLE_BOOKS.filter(b => b.toLowerCase().startsWith(bookPart))
        .slice(0, 5)
        .forEach(b => suggestions.push({ label: b, ref: b }));
      return suggestions;
    }

    if (!chapterPart) {
      // Suggest book:1-5
      for (let c = 1; c <= 5; c++) {
        suggestions.push({ label: `${resolvedBook} ${c}`, ref: `${resolvedBook} ${c}` });
      }
      return suggestions.slice(0, 5);
    }

    const ch = parseInt(chapterPart, 10);
    if (!hasColon) {
      // Suggest full chapter
      suggestions.push({ label: `${resolvedBook} ${ch}`, ref: `${resolvedBook} ${ch}` });
      // Also next chapters
      for (let c = ch + 1; c <= ch + 3; c++) {
        suggestions.push({ label: `${resolvedBook} ${c}`, ref: `${resolvedBook} ${c}` });
      }
      return suggestions.slice(0, 5);
    }

    // Has colon - suggest verses
    const v = parseInt(versePart, 10) || 1;
    for (let i = 0; i < 5; i++) {
      const vs = v + i;
      suggestions.push({
        label: `${resolvedBook} ${ch}:${vs}`,
        ref: `${resolvedBook} ${ch}:${vs}`
      });
    }
    return suggestions;
  }

  // --- Devotional Search (via Cloudflare Worker) ---

  async function searchDevotional(topic, weekKey) {
    if (!hasWorker()) {
      throw new Error('NO_WORKER');
    }
    const url = `${workerUrl()}/search?topic=${encodeURIComponent(topic)}&week=${weekKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Search error: ${res.status}`);
    return res.json();
  }

  // --- Push Notification Subscription (via Worker) ---

  async function subscribePush(subscription) {
    if (!hasWorker()) throw new Error('NO_WORKER');
    const res = await fetch(`${workerUrl()}/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription),
    });
    if (!res.ok) throw new Error(`Push subscribe error: ${res.status}`);
    return res.json();
  }

  async function sendTestPush() {
    if (!hasWorker()) throw new Error('NO_WORKER');
    const res = await fetch(`${workerUrl()}/push/test`, { method: 'POST' });
    if (!res.ok) throw new Error(`Test push error: ${res.status}`);
    return res.json();
  }

  return {
    getPassage,
    getVerses,
    getSuggestions,
    BIBLE_BOOKS,
    searchDevotional,
    subscribePush,
    sendTestPush,
    hasWorker,
    workerUrl,
    bibleTranslation,
  };
})();

// --- Simple in-memory + sessionStorage cache ---
const Cache = (() => {
  const mem = new Map();

  function get(key) {
    const item = mem.get(key);
    if (!item) return null;
    if (Date.now() > item.exp) { mem.delete(key); return null; }
    return item.value;
  }

  function set(key, value, ttlMs = 60 * 60 * 1000) {
    mem.set(key, { value, exp: Date.now() + ttlMs });
  }

  return { get, set };
})();

window.API = API;
window.Cache = Cache;
