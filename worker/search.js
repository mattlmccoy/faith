/**
 * ABIDE Worker - Devotional Search handler
 * Proxies Serper.dev with approved-domain filtering
 */

// Only return results from these trusted ministry/pastor sites
const APPROVED_DOMAINS = [
  'gospelinlife.com',          // Tim Keller / Redeemer
  'redeemercitytocity.com',   // Tim Keller
  'timkeller.com',             // Tim Keller
  'johnmarkcomer.com',         // John Mark Comer
  'bridgechurch.com',          // Jonathan Pokluda
  'hischurch.com',             // JP
  'louiegiglio.com',           // Louie Giglio
  'passionmovement.com',       // Louie Giglio
  'desiringgod.org',           // John Piper
  'thegospelcoalition.org',   // Various approved
  'ligonier.org',              // R.C. Sproul
  'monergism.com',             // Reformed resources
  'biblicaltheology.com',      // Scholarly
  'acts29.com',                // Acts 29 network
  'soulshaperbook.com',        // John Mark Comer
  'practicingtheway.org',      // John Mark Comer
];

const SEARCH_CACHE_TTL = 60 * 60; // 1 hour

export async function handleSearch(request, url, env, origin, json) {
  if (!env.SERPER_API_KEY) {
    return json({ error: 'Search not configured. Add SERPER_API_KEY to worker environment.' }, 503, origin);
  }

  const topic = url.searchParams.get('topic');
  const week = url.searchParams.get('week') || '';

  if (!topic) return json({ error: 'Missing topic parameter' }, 400, origin);

  const cacheKey = `search:${topic.toLowerCase()}:${week}`;

  // Check cache
  if (env.ABIDE_KV) {
    const cached = await env.ABIDE_KV.get(cacheKey, 'json');
    if (cached) return json(cached, 200, origin);
  }

  // Build Serper query - site-restricted to approved domains
  const siteFilters = APPROVED_DOMAINS.slice(0, 6).map(d => `site:${d}`).join(' OR ');
  const query = `"${topic}" devotional OR sermon OR teaching (${siteFilters})`;

  const serperResponse = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'X-API-KEY': env.SERPER_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      q: query,
      num: 10,
      gl: 'us',
      hl: 'en',
    }),
  });

  if (!serperResponse.ok) {
    return json({ error: `Search API error: ${serperResponse.status}` }, 502, origin);
  }

  const serperData = await serperResponse.json();
  const organic = serperData.organic || [];

  // Filter and normalize results
  const results = organic
    .filter(item => {
      const link = item.link || '';
      return APPROVED_DOMAINS.some(domain => link.includes(domain));
    })
    .map(item => ({
      title: item.title,
      url: item.link,
      snippet: item.snippet,
      pastor: getPastorFromUrl(item.link),
    }))
    .slice(0, 8);

  const responseData = { topic, results, cached: false };

  // Cache results
  if (env.ABIDE_KV && results.length > 0) {
    await env.ABIDE_KV.put(cacheKey, JSON.stringify(responseData), { expirationTtl: SEARCH_CACHE_TTL });
  }

  return json(responseData, 200, origin);
}

function getPastorFromUrl(url) {
  if (!url) return null;
  const map = {
    'gospelinlife.com': 'Tim Keller',
    'redeemercitytocity.com': 'Tim Keller',
    'timkeller.com': 'Tim Keller',
    'johnmarkcomer.com': 'John Mark Comer',
    'practicingtheway.org': 'John Mark Comer',
    'bridgechurch.com': 'Jonathan Pokluda',
    'louiegiglio.com': 'Louie Giglio',
    'passionmovement.com': 'Louie Giglio',
    'desiringgod.org': 'John Piper',
    'thegospelcoalition.org': 'The Gospel Coalition',
    'ligonier.org': 'R.C. Sproul / Ligonier',
    'monergism.com': 'Monergism',
    'acts29.com': 'Acts 29',
  };
  for (const [domain, pastor] of Object.entries(map)) {
    if (url.includes(domain)) return pastor;
  }
  return null;
}
