/**
 * ABIDE Worker - AI handlers using Cloudflare AI (free)
 * Model: @cf/meta/llama-3.1-8b-instruct
 *
 * No API key needed — uses env.AI binding (Cloudflare Workers AI, free tier).
 * Configured in wrangler.toml:
 *   [ai]
 *   binding = "AI"
 */

const PLAN_CACHE_TTL = 24 * 60 * 60; // 24 hours (seconds, for KV)
const PHRASE_CACHE_TTL = 60 * 60;    // 1 hour

// Fast, free, structured-output-capable model on Cloudflare
const MODEL = '@cf/meta/llama-3.1-8b-instruct';

// ---------------------------------------------------------------------------
// POST /ai/plan  { topic: string }
// Returns a full 7-day devotional plan as JSON
// ---------------------------------------------------------------------------
export async function handleAIPlan(request, url, env, origin, json) {
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405, origin);
  if (!env.AI) return json({ error: 'AI binding not configured' }, 503, origin);

  let topic = 'Grace';
  let customPastor = '';
  try { const b = await request.json(); topic = b.topic || 'Grace'; customPastor = b.customPastor || ''; } catch {}

  const cacheKey = `plan:cf:${topic.toLowerCase().trim()}`;
  if (env.ABIDE_KV) {
    const cached = await env.ABIDE_KV.get(cacheKey, 'json');
    if (cached) return json(cached, 200, origin);
  }

  const systemPrompt = `You are a thoughtful non-denominational Protestant pastor writing personal daily Bible devotions.
You draw inspiration from pastors like Tim Keller, John Mark Comer, Jon Pokluda, Louie Giglio, John Piper, and Ben Stuart.
You write in a warm, direct, gospel-centered style. Scripture references use the World English Bible (WEB).
CRITICAL REQUIREMENT: Every single morning AND evening block MUST have a non-empty scripture_ref field with a real Bible reference (e.g. "Romans 8:28", "Psalm 23:1"). A day with no scripture_ref is invalid and will be rejected. Use a different passage for each day.
You MUST respond with valid JSON only — no markdown, no code blocks, no extra text before or after the JSON.`;

  const customPastorLine = customPastor
    ? `\nAlso draw from the theological style of ${customPastor}.`
    : '';

  const userPrompt = `Write a 7-day personal Bible devotional plan on the theme: "${topic}".${customPastorLine}

Return ONLY this exact JSON structure (no markdown fences, no explanation, just raw JSON):
{
  "theme": "${topic}",
  "days": [
    {
      "dayIndex": 0,
      "title": "Day title",
      "morning": {
        "scripture_ref": "Book Chapter:Verse",
        "devotion": "2-3 paragraph devotional (150-200 words). Gospel-centered, personal, warm.",
        "reflection_prompts": ["Question 1?", "Question 2?", "Question 3?"],
        "prayer": "A 2-3 sentence personal prayer."
      },
      "evening": {
        "scripture_ref": "Book Chapter:Verse",
        "devotion": "2-3 paragraph evening reflection (100-150 words). Quieter, reflective tone.",
        "reflection_prompts": ["Question 1?", "Question 2?"],
        "prayer": "A 1-2 sentence evening prayer."
      },
      "faith_stretch": {
        "title": "Practical action title",
        "description": "A concrete 1-2 sentence action to live out this theme today."
      }
    }
  ]
}

Write all 7 days (dayIndex 0 through 6). Use a different Bible passage for each day. Ensure valid JSON.`;

  try {
    const response = await env.AI.run(MODEL, {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 4000,
      temperature: 0.7,
    });

    const raw = (response.response || '').trim();

    // Extract JSON — Llama sometimes wraps with commentary or markdown
    let planData;
    try {
      planData = JSON.parse(raw);
    } catch {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start === -1 || end === -1) throw new Error('No JSON block found in model response');
      planData = JSON.parse(raw.slice(start, end + 1));
    }

    if (!planData.days || !Array.isArray(planData.days) || planData.days.length < 7) {
      throw new Error(`Invalid plan: expected 7 days, got ${planData.days?.length ?? 0}`);
    }

    // Fallback scripture refs if model omits them
    const FALLBACK_REFS = [
      'Romans 8:28', 'Psalm 23:1', 'John 3:16', 'Philippians 4:6-7',
      'Isaiah 41:10', 'Jeremiah 29:11', 'Matthew 11:28', 'Psalm 46:1',
      'Proverbs 3:5-6', 'Isaiah 40:31', '2 Corinthians 12:9', 'Hebrews 11:1',
    ];

    let missingCount = 0;
    planData.days.forEach((day, i) => {
      if (!day.morning) day.morning = {};
      if (!day.evening) day.evening = {};
      if (!day.morning.scripture_ref) {
        day.morning.scripture_ref = FALLBACK_REFS[i % FALLBACK_REFS.length];
        missingCount++;
      }
      if (!day.evening.scripture_ref) {
        day.evening.scripture_ref = FALLBACK_REFS[(i + 4) % FALLBACK_REFS.length];
        missingCount++;
      }
    });

    // If more than half the days are missing scripture, regenerate
    if (missingCount >= 7) {
      throw new Error(`Plan missing too many scripture refs (${missingCount}), rejecting for retry`);
    }

    const result = { theme: planData.theme || topic, days: planData.days };

    if (env.ABIDE_KV) {
      await env.ABIDE_KV.put(cacheKey, JSON.stringify(result), { expirationTtl: PLAN_CACHE_TTL });
    }

    return json(result, 200, origin);
  } catch (err) {
    console.error('CF AI plan error:', err.message);
    return json({ error: `AI plan failed: ${err.message}` }, 502, origin);
  }
}

// ---------------------------------------------------------------------------
// POST /ai/phrase  { phrase: string }
// Returns 6 best Bible verse refs + one-line explanations
// ---------------------------------------------------------------------------
export async function handleAIPhrase(request, url, env, origin, json) {
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405, origin);
  if (!env.AI) return json({ verses: [], fallback: true }, 200, origin);

  let phrase = '';
  try { const b = await request.json(); phrase = b.phrase || ''; } catch {}
  if (!phrase.trim()) return json({ verses: [], fallback: true }, 200, origin);

  const cacheKey = `phrase:cf:${phrase.toLowerCase().trim()}`;
  if (env.ABIDE_KV) {
    const cached = await env.ABIDE_KV.get(cacheKey, 'json');
    if (cached) return json(cached, 200, origin);
  }

  const userPrompt = `A person searching their Bible app typed: "${phrase}"

List the 6 most relevant Bible verses for this search. Consider emotional context, theological meaning, and practical application.

Respond ONLY with this JSON (no markdown, no extra text, just raw JSON):
{
  "verses": [
    { "ref": "Book Chapter:Verse", "why": "One sentence explaining relevance." },
    { "ref": "Book Chapter:Verse", "why": "One sentence explaining relevance." },
    { "ref": "Book Chapter:Verse", "why": "One sentence explaining relevance." },
    { "ref": "Book Chapter:Verse", "why": "One sentence explaining relevance." },
    { "ref": "Book Chapter:Verse", "why": "One sentence explaining relevance." },
    { "ref": "Book Chapter:Verse", "why": "One sentence explaining relevance." }
  ]
}

Use standard Bible references like "John 3:16", "Psalm 23:1", "Romans 8:28". Rank by relevance.`;

  try {
    const response = await env.AI.run(MODEL, {
      messages: [
        { role: 'system', content: 'You are a Bible scholar. Respond only with valid JSON, no markdown.' },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 800,
      temperature: 0.3,
    });

    const raw = (response.response || '').trim();

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start === -1 || end === -1) throw new Error('No JSON in response');
      data = JSON.parse(raw.slice(start, end + 1));
    }

    if (!data.verses?.length) throw new Error('Empty verses array');

    const result = { verses: data.verses, fallback: false };

    if (env.ABIDE_KV) {
      await env.ABIDE_KV.put(cacheKey, JSON.stringify(result), { expirationTtl: PHRASE_CACHE_TTL });
    }

    return json(result, 200, origin);
  } catch (err) {
    console.error('CF AI phrase error:', err.message);
    return json({ verses: [], fallback: true }, 200, origin);
  }
}
