/**
 * ABIDE Worker - AI-powered handlers
 *
 * /ai/plan  - Generate a full 7-day devotional plan for a given theme
 *             Uses Serper to find real content from approved ministries,
 *             then OpenAI to synthesize it into structured devotions.
 *
 * /ai/phrase - Find the best matching Bible verses for a phrase/keyword
 *              Returns ranked passage references with brief explanations.
 *
 * Secrets required:
 *   OPENAI_API_KEY  - OpenAI API key
 *   SERPER_API_KEY  - Serper.dev key (for plan builder web search)
 */

const OPENAI_BASE = 'https://api.openai.com/v1';

const APPROVED_DOMAINS = [
  'gospelinlife.com', 'timkeller.com', 'johnmarkcomer.com',
  'practicingtheway.org', 'bridgechurch.com', 'louiegiglio.com',
  'passionmovement.com', 'desiringgod.org', 'thegospelcoalition.org',
  'ligonier.org', 'acts29.com',
];

// ---------------------------------------------------------------------------
// AI Plan Builder — POST /ai/plan  { topic: "Grace" }
// ---------------------------------------------------------------------------

export async function handleAIPlan(request, url, env, origin, json) {
  if (request.method !== 'POST') {
    return json({ error: 'POST required' }, 405, origin);
  }

  if (!env.OPENAI_API_KEY) {
    return json({ error: 'AI not configured (missing OPENAI_API_KEY)' }, 503, origin);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400, origin); }

  const topic = (body.topic || '').trim();
  if (!topic) return json({ error: 'Missing topic' }, 400, origin);

  // Cache key
  const cacheKey = `ai:plan:${topic.toLowerCase().replace(/\s+/g, '-')}`;
  if (env.ABIDE_KV) {
    const cached = await env.ABIDE_KV.get(cacheKey, 'json');
    if (cached) return json({ ...cached, cached: true }, 200, origin);
  }

  // Step 1: Search Serper for real devotional content on this topic
  let searchSnippets = '';
  if (env.SERPER_API_KEY) {
    try {
      const siteFilters = APPROVED_DOMAINS.slice(0, 8).map(d => `site:${d}`).join(' OR ');
      const query = `"${topic}" devotional OR sermon OR teaching (${siteFilters})`;
      const serperRes = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'X-API-KEY': env.SERPER_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: query, num: 8, gl: 'us' }),
      });
      if (serperRes.ok) {
        const serperData = await serperRes.json();
        const results = (serperData.organic || [])
          .filter(r => APPROVED_DOMAINS.some(d => (r.link || '').includes(d)))
          .slice(0, 5);
        searchSnippets = results.map(r => `- ${r.title}: ${r.snippet}`).join('\n');
      }
    } catch (e) {
      console.error('Serper search failed:', e);
    }
  }

  // Step 2: Generate the plan with OpenAI
  const systemPrompt = `You are a thoughtful Protestant devotional writer inspired by teachers like Tim Keller, John Mark Comer, Jonathan Pokluda, Louie Giglio, and John Piper. You write for a non-denominational, evangelical audience. Your writing is warm, honest, literary, and rooted in Scripture. You never moralize or use clichés. You always cite Scripture references (World English Bible preferred).`;

  const userPrompt = `Create a 7-day devotional plan on the theme: "${topic}".

${searchSnippets ? `Here is real content from trusted ministries to draw inspiration from (do not copy directly, but let these inform the tone and ideas):\n${searchSnippets}\n` : ''}

Return a JSON object with this exact structure:
{
  "theme": "${topic}",
  "days": [
    {
      "dayIndex": 0,
      "title": "Day subtitle (e.g. 'The Weight of Grace')",
      "morning": {
        "title": "Morning reading title",
        "opening_verse": { "reference": "Book Ch:V", "text": "verse text", "translation": "WEB" },
        "body": [
          { "type": "paragraph", "content": "2-3 sentences of devotional reflection" },
          { "type": "scripture_block", "reference": "Book Ch:V", "text": "supporting verse text" },
          { "type": "paragraph", "content": "2-3 more sentences of reflection" }
        ],
        "reflection_prompts": ["question 1", "question 2", "question 3"],
        "prayer": "2-3 sentence prayer",
        "midday_prompt": "A single sentence check-in question for midday"
      },
      "evening": {
        "title": "Evening reading title",
        "opening_verse": { "reference": "Book Ch:V", "text": "verse text", "translation": "WEB" },
        "body": [{ "type": "paragraph", "content": "2-3 sentences" }],
        "reflection_prompts": ["question 1", "question 2"],
        "prayer": "2-3 sentence prayer",
        "lectio_divina": {
          "passage": "Book Chapter",
          "steps": [
            { "name": "Lectio (Read)", "instruction": "..." },
            { "name": "Meditatio (Meditate)", "instruction": "..." },
            { "name": "Oratio (Pray)", "instruction": "..." },
            { "name": "Contemplatio (Rest)", "instruction": "..." }
          ]
        }
      },
      "faith_stretch": {
        "title": "Action title",
        "description": "A practical challenge for the day",
        "journal_prompt": "A journaling question"
      }
    }
    // ... 6 more days (dayIndex 1-6)
  ]
}

Make each day feel distinct. Progress through the theme: define it, explore scripture, confront the hard parts, find community, move to action, find rest, and land on living it. Use real Scripture references throughout. Be specific and pastoral, not generic.`;

  try {
    const aiRes = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 6000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error('OpenAI error:', errText);
      return json({ error: `AI error: ${aiRes.status}` }, 502, origin);
    }

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content;
    if (!content) return json({ error: 'Empty AI response' }, 502, origin);

    const plan = JSON.parse(content);

    // Cache for 24 hours
    if (env.ABIDE_KV) {
      await env.ABIDE_KV.put(cacheKey, JSON.stringify(plan), { expirationTtl: 86400 });
    }

    return json(plan, 200, origin);

  } catch (err) {
    console.error('AI plan generation failed:', err);
    return json({ error: err.message }, 500, origin);
  }
}

// ---------------------------------------------------------------------------
// AI Phrase Search — POST /ai/phrase  { phrase: "feeling alone", translation: "web" }
// ---------------------------------------------------------------------------

export async function handleAIPhrase(request, url, env, origin, json) {
  if (request.method !== 'POST') {
    return json({ error: 'POST required' }, 405, origin);
  }

  if (!env.OPENAI_API_KEY) {
    // Graceful fallback — return empty so the client uses its local keyword map
    return json({ verses: [], fallback: true }, 200, origin);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400, origin); }

  const phrase = (body.phrase || '').trim();
  if (!phrase) return json({ error: 'Missing phrase' }, 400, origin);

  const cacheKey = `ai:phrase:${phrase.toLowerCase().replace(/\s+/g, '-').slice(0, 60)}`;
  if (env.ABIDE_KV) {
    const cached = await env.ABIDE_KV.get(cacheKey, 'json');
    if (cached) return json({ ...cached, cached: true }, 200, origin);
  }

  const prompt = `A person searching for Bible guidance typed: "${phrase}"

Return the 6 most relevant Bible passages that speak to this feeling, situation, or topic. For each one include:
- The exact reference (book, chapter, verse)
- A one-sentence explanation of why this passage applies

Return as JSON: { "verses": [ { "ref": "John 3:16", "why": "Because..." }, ... ] }

Use only real, accurate Bible references from the Protestant canon. Prefer the World English Bible (WEB) translation style. Order from most to least directly relevant.`;

  try {
    const aiRes = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 600,
        response_format: { type: 'json_object' },
      }),
    });

    if (!aiRes.ok) {
      return json({ verses: [], fallback: true }, 200, origin);
    }

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content;
    const result = content ? JSON.parse(content) : { verses: [] };

    // Cache for 1 hour
    if (env.ABIDE_KV) {
      await env.ABIDE_KV.put(cacheKey, JSON.stringify(result), { expirationTtl: 3600 });
    }

    return json(result, 200, origin);

  } catch (err) {
    console.error('AI phrase search failed:', err);
    return json({ verses: [], fallback: true }, 200, origin);
  }
}
