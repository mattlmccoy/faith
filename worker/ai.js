/**
 * ABIDE Worker - AI handlers using Gemini API.
 *
 * Required secret:
 *   GEMINI_API_KEY
 * Optional:
 *   GEMINI_MODEL (default: gemini-1.5-flash)
 */

const PLAN_CACHE_TTL = 24 * 60 * 60; // 24 hours (seconds, for KV)
const PHRASE_CACHE_TTL = 60 * 60;    // 1 hour
const DEFAULT_MIN_MORNING_WORDS = 170;
const DEFAULT_MIN_EVENING_WORDS = 130;
const DEFAULT_MIN_MORNING_PARAGRAPHS = 3;
const DEFAULT_MIN_EVENING_PARAGRAPHS = 2;
const DEFAULT_GEMINI_MODEL = 'gemini-1.5-flash';

function wordCount(text = '') {
  return String(text)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

function normalizePositiveInt(value, fallback, min = 1, max = 4000) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function devotionalText(session = {}) {
  if (Array.isArray(session.body)) {
    return session.body
      .filter(b => b?.type === 'paragraph' && b?.content)
      .map(b => b.content.trim())
      .join('\n\n');
  }
  return String(session.devotion || '').trim();
}

function devotionalParagraphs(session = {}) {
  if (Array.isArray(session.body)) {
    return session.body.filter(b => b?.type === 'paragraph' && b?.content).length;
  }
  const txt = String(session.devotion || '').trim();
  if (!txt) return 0;
  return txt.split(/\n{2,}/).map(p => p.trim()).filter(Boolean).length;
}

function validatePlanLength(planData, cfg) {
  const issues = [];

  planData.days.forEach((day, i) => {
    const morningText = devotionalText(day.morning);
    const eveningText = devotionalText(day.evening);
    const morningWords = wordCount(morningText);
    const eveningWords = wordCount(eveningText);
    const morningParas = devotionalParagraphs(day.morning);
    const eveningParas = devotionalParagraphs(day.evening);
    const dayNum = i + 1;

    if (morningWords < cfg.minMorningWords || morningParas < cfg.minMorningParagraphs) {
      issues.push(`Day ${dayNum} morning too short (${morningWords} words, ${morningParas} paragraphs)`);
    }
    if (eveningWords < cfg.minEveningWords || eveningParas < cfg.minEveningParagraphs) {
      issues.push(`Day ${dayNum} evening too short (${eveningWords} words, ${eveningParas} paragraphs)`);
    }
  });

  return issues;
}

async function runGemini(env, { systemPrompt, userPrompt, temperature = 0.65, maxOutputTokens = 8192 }) {
  if (!env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const modelCandidates = [
    env.GEMINI_MODEL,
    DEFAULT_GEMINI_MODEL,
    'gemini-1.5-flash-latest',
    'gemini-2.0-flash',
  ].filter(Boolean);

  let lastError = null;

  for (const model of modelCandidates) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;

    const payload = {
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        temperature,
        maxOutputTokens,
      },
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text();
      const message = `Gemini(${model}) error ${res.status}: ${body.slice(0, 300)}`;
      lastError = new Error(message);

      // Try next model for model-related failures
      if (res.status === 404 || res.status === 400) continue;
      throw lastError;
    }

    const data = await res.json();
    const blocked = data?.promptFeedback?.blockReason;
    if (blocked) {
      throw new Error(`Gemini blocked prompt: ${blocked}`);
    }

    const text = (data?.candidates || [])
      .flatMap(c => c?.content?.parts || [])
      .map(p => p?.text || '')
      .join('\n')
      .trim();

    if (!text) {
      lastError = new Error(`Gemini(${model}) returned empty response`);
      continue;
    }

    return text;
  }

  throw lastError || new Error('Gemini request failed for all candidate models');
}

function parseJsonBlock(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No JSON block found in model response');
    return JSON.parse(raw.slice(start, end + 1));
  }
}

// ---------------------------------------------------------------------------
// POST /ai/plan  { topic: string, pastors?: string[] }
// Returns a full 7-day devotional plan as JSON
// ---------------------------------------------------------------------------
export async function handleAIPlan(request, url, env, origin, json) {
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405, origin);

  let topic = 'Grace';
  let pastors = [];
  let retryReason = '';
  const cfg = {
    minMorningWords: DEFAULT_MIN_MORNING_WORDS,
    minEveningWords: DEFAULT_MIN_EVENING_WORDS,
    minMorningParagraphs: DEFAULT_MIN_MORNING_PARAGRAPHS,
    minEveningParagraphs: DEFAULT_MIN_EVENING_PARAGRAPHS,
  };

  try {
    const b = await request.json();
    topic = b.topic || 'Grace';
    pastors = Array.isArray(b.pastors) ? b.pastors.filter(Boolean) : [];
    retryReason = String(b.retryReason || '').trim();

    cfg.minMorningWords = normalizePositiveInt(b.minMorningWords, DEFAULT_MIN_MORNING_WORDS, 80, 1200);
    cfg.minEveningWords = normalizePositiveInt(b.minEveningWords, DEFAULT_MIN_EVENING_WORDS, 60, 900);
    cfg.minMorningParagraphs = normalizePositiveInt(b.minMorningParagraphs, DEFAULT_MIN_MORNING_PARAGRAPHS, 2, 8);
    cfg.minEveningParagraphs = normalizePositiveInt(b.minEveningParagraphs, DEFAULT_MIN_EVENING_PARAGRAPHS, 2, 7);
  } catch {}

  const pastorKey = pastors.map(p => p.toLowerCase().trim()).sort().join('|');
  const lengthKey = `${cfg.minMorningWords}-${cfg.minEveningWords}-${cfg.minMorningParagraphs}-${cfg.minEveningParagraphs}`;
  const cacheKey = `plan:gemini:v1:${topic.toLowerCase().trim()}:${pastorKey}:${lengthKey}`;
  if (env.ABIDE_KV) {
    const cached = await env.ABIDE_KV.get(cacheKey, 'json');
    if (cached) return json(cached, 200, origin);
  }

  const systemPrompt = `You are a thoughtful non-denominational Protestant pastor writing personal daily Bible devotions.
You draw inspiration from trusted Protestant pastors provided by the user.
You write in a warm, direct, gospel-centered style.
CRITICAL REQUIREMENT: Every single morning AND evening block MUST have a non-empty scripture_ref field with a real Bible reference (e.g. "Romans 8:28", "Psalm 23:1").
You MUST respond with valid JSON only — no markdown, no code blocks, no extra text before or after the JSON.`;

  const pastorLine = pastors.length
    ? `\nTrusted pastors to draw from: ${pastors.join(', ')}.`
    : '\nTrusted pastors to draw from: Tim Keller, John Mark Comer, Jon Pokluda, Louie Giglio, John Piper, Ben Stuart.';

  const buildUserPrompt = (retryNote = '') => `Write a 7-day personal Bible devotional plan on the theme: "${topic}".${pastorLine}

Return ONLY this exact JSON structure (no markdown fences, no explanation, just raw JSON):
{
  "theme": "${topic}",
  "days": [
    {
      "dayIndex": 0,
      "title": "Day title",
      "inspired_by": ["Pastor Name 1", "Pastor Name 2"],
      "morning": {
        "scripture_ref": "Book Chapter:Verse",
        "body": [
          { "type": "paragraph", "content": "Paragraph 1..." },
          { "type": "paragraph", "content": "Paragraph 2..." },
          { "type": "paragraph", "content": "Paragraph 3..." }
        ],
        "reflection_prompts": ["Question 1?", "Question 2?", "Question 3?"],
        "prayer": "A 2-3 sentence personal prayer."
      },
      "evening": {
        "scripture_ref": "Book Chapter:Verse",
        "body": [
          { "type": "paragraph", "content": "Paragraph 1..." },
          { "type": "paragraph", "content": "Paragraph 2..." }
        ],
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

Write all 7 days (dayIndex 0 through 6). Use a different Bible passage for each day.
Devotional body content must be substantial. Scripture references do NOT count toward body length.
For each day:
- Morning body: at least ${cfg.minMorningParagraphs} paragraphs and at least ${cfg.minMorningWords} words.
- Evening body: at least ${cfg.minEveningParagraphs} paragraphs and at least ${cfg.minEveningWords} words.
Ensure valid JSON only.${retryNote ? `\n\nRETRY REQUIREMENT: ${retryNote}` : ''}`;

  try {
    let lastErr = null;
    let modelRetryNote = retryReason;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const raw = await runGemini(env, {
          systemPrompt,
          userPrompt: buildUserPrompt(modelRetryNote),
          temperature: 0.65,
          maxOutputTokens: 8192,
        });

        const planData = parseJsonBlock(raw);

        if (!planData.days || !Array.isArray(planData.days) || planData.days.length < 7) {
          throw new Error(`Invalid plan: expected 7 days, got ${planData.days?.length ?? 0}`);
        }

        const FALLBACK_REFS = [
          'Romans 8:28', 'Psalm 23:1', 'John 3:16', 'Philippians 4:6-7',
          'Isaiah 41:10', 'Jeremiah 29:11', 'Matthew 11:28', 'Psalm 46:1',
          'Proverbs 3:5-6', 'Isaiah 40:31', '2 Corinthians 12:9', 'Hebrews 11:1',
        ];

        let missingCount = 0;
        planData.days.forEach((day, i) => {
          if (!day.morning) day.morning = {};
          if (!day.evening) day.evening = {};
          if (!Array.isArray(day.inspired_by) || !day.inspired_by.length) {
            day.inspired_by = pastors.length ? pastors.slice(0, 3) : ['Tim Keller', 'John Mark Comer'];
          }
          if (!day.morning.scripture_ref) {
            day.morning.scripture_ref = FALLBACK_REFS[i % FALLBACK_REFS.length];
            missingCount++;
          }
          if (!day.evening.scripture_ref) {
            day.evening.scripture_ref = FALLBACK_REFS[(i + 4) % FALLBACK_REFS.length];
            missingCount++;
          }
        });

        if (missingCount >= 7) {
          throw new Error(`Plan missing too many scripture refs (${missingCount})`);
        }

        const lengthIssues = validatePlanLength(planData, cfg);
        if (lengthIssues.length) {
          throw new Error(`Plan too short: ${lengthIssues.slice(0, 4).join('; ')}`);
        }

        const result = { theme: planData.theme || topic, days: planData.days.slice(0, 7) };

        if (env.ABIDE_KV) {
          await env.ABIDE_KV.put(cacheKey, JSON.stringify(result), { expirationTtl: PLAN_CACHE_TTL });
        }

        return json(result, 200, origin);
      } catch (attemptErr) {
        lastErr = attemptErr;
        modelRetryNote = attemptErr.message;
      }
    }

    throw lastErr || new Error('Unknown AI generation failure');
  } catch (err) {
    console.error('Gemini plan error:', err.message);
    return json({ error: `AI plan failed: ${err.message}` }, 502, origin);
  }
}

// ---------------------------------------------------------------------------
// POST /ai/phrase  { phrase: string }
// Returns 6 best Bible verse refs + one-line explanations
// ---------------------------------------------------------------------------
export async function handleAIPhrase(request, url, env, origin, json) {
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405, origin);

  let phrase = '';
  try { const b = await request.json(); phrase = b.phrase || ''; } catch {}
  if (!phrase.trim()) return json({ verses: [], fallback: true }, 200, origin);

  const cacheKey = `phrase:gemini:v1:${phrase.toLowerCase().trim()}`;
  if (env.ABIDE_KV) {
    const cached = await env.ABIDE_KV.get(cacheKey, 'json');
    if (cached) return json(cached, 200, origin);
  }

  const systemPrompt = 'You are a Bible scholar. Respond with valid JSON only.';
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
    const raw = await runGemini(env, {
      systemPrompt,
      userPrompt,
      temperature: 0.2,
      maxOutputTokens: 1400,
    });

    const data = parseJsonBlock(raw);
    if (!data.verses?.length) throw new Error('Empty verses array');

    const result = { verses: data.verses, fallback: false };

    if (env.ABIDE_KV) {
      await env.ABIDE_KV.put(cacheKey, JSON.stringify(result), { expirationTtl: PHRASE_CACHE_TTL });
    }

    return json(result, 200, origin);
  } catch (err) {
    console.error('Gemini phrase error:', err.message);
    return json({ verses: [], fallback: true }, 200, origin);
  }
}
