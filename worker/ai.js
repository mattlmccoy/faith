/**
 * ABIDE Worker - AI handlers.
 *
 * Plan generation provider order (if configured):
 *   1) Gemini
 *   2) OpenRouter
 *   3) Groq
 */

const PLAN_CACHE_TTL = 24 * 60 * 60; // 24 hours (seconds, for KV)
const PHRASE_CACHE_TTL = 60 * 60;    // 1 hour
const DEFAULT_MIN_MORNING_WORDS = 170;
const DEFAULT_MIN_EVENING_WORDS = 130;
const DEFAULT_MIN_MORNING_PARAGRAPHS = 3;
const DEFAULT_MIN_EVENING_PARAGRAPHS = 2;
const DEFAULT_GEMINI_MODEL = 'gemini-1.5-flash';
const DEFAULT_OPENROUTER_MODELS = [
  'meta-llama/llama-3.1-8b-instruct:free',
  'google/gemma-2-9b-it:free',
  'mistralai/mistral-7b-instruct:free',
];
const DEFAULT_GROQ_MODELS = [
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile',
];
const MODEL_LIST_CACHE_MS = 15 * 60 * 1000;
let _modelListCache = null;
let _modelListCachedAt = 0;

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

async function runGemini(env, { systemPrompt, userPrompt, temperature = 0.65, maxOutputTokens = 8192, jsonMode = false, preferredModel = '' }) {
  if (!env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const discoveredModels = await listGeminiGenerateModels(env);
  const modelCandidates = buildModelCandidates(env, discoveredModels, preferredModel);

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
        ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
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

      // Try next model for model-related/transient failures.
      if ([400, 404, 429, 500, 503].includes(res.status)) continue;
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

    return { text, model, provider: 'gemini' };
  }

  throw lastError || new Error('Gemini request failed for all candidate models');
}

async function runCloudflareAI(env, { systemPrompt, userPrompt, temperature = 0.2, maxTokens = 900 }) {
  if (!env.AI || typeof env.AI.run !== 'function') {
    throw new Error('Cloudflare AI binding (env.AI) is not configured');
  }

  const candidates = [
    '@cf/meta/llama-3.1-8b-instruct',
    '@cf/meta/llama-3.1-8b-instruct-fast',
    '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  ];

  let lastErr = null;
  for (const model of candidates) {
    try {
      const result = await env.AI.run(model, {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature,
        max_tokens: maxTokens,
      });

      const text = String(
        result?.response
        || result?.text
        || result?.result
        || result?.output_text
        || ''
      ).trim();
      if (!text) throw new Error(`Cloudflare AI(${model}) returned empty text`);
      return { text, model, provider: 'cloudflare-ai' };
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr || new Error('Cloudflare AI failed for all candidate models');
}

function extractTextFromOpenAIChoice(content) {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map(c => {
        if (typeof c === 'string') return c;
        if (c?.type === 'text') return c.text || '';
        return '';
      })
      .join('\n')
      .trim();
  }
  return '';
}

async function runOpenRouter(env, {
  systemPrompt,
  userPrompt,
  temperature = 0.65,
  maxOutputTokens = 4096,
  jsonMode = false,
  preferredModel = '',
}) {
  if (!env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  const candidates = [
    preferredModel,
    env.OPENROUTER_MODEL,
    ...DEFAULT_OPENROUTER_MODELS,
  ].filter(Boolean);

  let lastError = null;
  for (const model of [...new Set(candidates)]) {
    const endpoint = 'https://openrouter.ai/api/v1/chat/completions';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        ...(env.OPENROUTER_HTTP_REFERER ? { 'HTTP-Referer': env.OPENROUTER_HTTP_REFERER } : {}),
        ...(env.OPENROUTER_APP_TITLE ? { 'X-Title': env.OPENROUTER_APP_TITLE } : {}),
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature,
        max_tokens: maxOutputTokens,
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      lastError = new Error(`OpenRouter(${model}) error ${res.status}: ${body.slice(0, 320)}`);
      if ([400, 404, 429, 500, 503].includes(res.status)) continue;
      throw lastError;
    }

    const data = await res.json();
    const text = extractTextFromOpenAIChoice(data?.choices?.[0]?.message?.content);
    if (!text) {
      lastError = new Error(`OpenRouter(${model}) returned empty response`);
      continue;
    }
    return { text, model, provider: 'openrouter' };
  }

  throw lastError || new Error('OpenRouter request failed for all candidate models');
}

async function runGroq(env, {
  systemPrompt,
  userPrompt,
  temperature = 0.65,
  maxOutputTokens = 4096,
  jsonMode = false,
  preferredModel = '',
}) {
  if (!env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not configured');
  }

  const candidates = [
    preferredModel,
    env.GROQ_MODEL,
    ...DEFAULT_GROQ_MODELS,
  ].filter(Boolean);

  let lastError = null;
  for (const model of [...new Set(candidates)]) {
    const endpoint = 'https://api.groq.com/openai/v1/chat/completions';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature,
        max_tokens: maxOutputTokens,
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      lastError = new Error(`Groq(${model}) error ${res.status}: ${body.slice(0, 320)}`);
      if ([400, 404, 429, 500, 503].includes(res.status)) continue;
      throw lastError;
    }

    const data = await res.json();
    const text = extractTextFromOpenAIChoice(data?.choices?.[0]?.message?.content);
    if (!text) {
      lastError = new Error(`Groq(${model}) returned empty response`);
      continue;
    }
    return { text, model, provider: 'groq' };
  }

  throw lastError || new Error('Groq request failed for all candidate models');
}

async function listGeminiGenerateModels(env) {
  const now = Date.now();
  if (_modelListCache && (now - _modelListCachedAt) < MODEL_LIST_CACHE_MS) {
    return _modelListCache;
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;
  const res = await fetch(endpoint);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini models.list error ${res.status}: ${body.slice(0, 260)}`);
  }

  const data = await res.json();
  const models = (data.models || [])
    .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
    .map(m => (m.name || '').replace(/^models\//, ''))
    .filter(Boolean);

  if (!models.length) {
    throw new Error('Gemini models.list returned no generateContent-capable models');
  }

  _modelListCache = models;
  _modelListCachedAt = now;
  return models;
}

function buildModelCandidates(env, discoveredModels = [], preferredOverride = '') {
  const preferred = [
    preferredOverride,
    env.GEMINI_PLAN_MODEL,
    env.GEMINI_MODEL,
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest',
    DEFAULT_GEMINI_MODEL,
  ].filter(Boolean).map(m => String(m).replace(/^models\//, ''));

  const seen = new Set();
  const out = [];

  function pushIfAvailable(model) {
    if (!model || seen.has(model)) return;
    if (discoveredModels.includes(model)) {
      seen.add(model);
      out.push(model);
    }
  }

  preferred.forEach(pushIfAvailable);

  // Then fill with other available flash models
  discoveredModels
    .filter(m => m.includes('flash'))
    .forEach(pushIfAvailable);

  // Finally allow any remaining compatible model
  discoveredModels.forEach(pushIfAvailable);
  return out;
}

// ---------------------------------------------------------------------------
// GET /ai/models
// Returns available Gemini models that support generateContent
// ---------------------------------------------------------------------------
export async function handleAIModels(request, url, env, origin, json) {
  if (request.method !== 'GET') return json({ error: 'GET required' }, 405, origin);
  if (!env.GEMINI_API_KEY) return json({ error: 'GEMINI_API_KEY is not configured' }, 503, origin);

  try {
    const discovered = await listGeminiGenerateModels(env);
    const candidates = buildModelCandidates(env, discovered);
    return json({
      ok: true,
      configuredModel: env.GEMINI_MODEL || null,
      discoveredCount: discovered.length,
      discovered,
      candidates,
      selected: candidates[0] || null,
    }, 200, origin);
  } catch (err) {
    return json({ ok: false, error: err.message }, 500, origin);
  }
}

function extractFirstJsonObject(input) {
  const text = String(input || '');
  let inString = false;
  let escaped = false;
  let depth = 0;
  let start = -1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
      continue;
    }
    if (ch === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return '';
}

function parseJsonBlock(raw) {
  const cleaned = String(raw)
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  const candidates = [
    cleaned,
    extractFirstJsonObject(cleaned),
  ].filter(Boolean);

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    candidates.push(cleaned.slice(start, end + 1));
  }

  let lastErr = null;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (err) {
      lastErr = err;
      const repaired = candidate
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/\u201C|\u201D/g, '"')
        .replace(/\u2018|\u2019/g, "'")
        .replace(/\u0000/g, '');
      try {
        return JSON.parse(repaired);
      } catch (err2) {
        lastErr = err2;
      }
    }
  }

  throw new Error(`Unable to parse model JSON: ${lastErr?.message || 'unknown parse error'}`);
}

function normalizeVerseList(data) {
  const verses = Array.isArray(data?.verses) ? data.verses : [];
  return verses
    .map(v => ({
      ref: String(v?.ref || '').trim(),
      why: String(v?.why || '').trim(),
    }))
    .filter(v => v.ref && v.why)
    .slice(0, 6);
}

function buildPlanProviderOrder(env) {
  const raw = String(env.PLAN_AI_PROVIDER_ORDER || 'gemini,openrouter,groq').trim();
  const allowed = new Set(['gemini', 'openrouter', 'groq']);
  const parsed = raw
    .split(',')
    .map(p => p.trim().toLowerCase())
    .filter(Boolean)
    .filter(p => allowed.has(p));

  const unique = [...new Set(parsed)];
  if (!unique.length) return ['gemini', 'openrouter', 'groq'];
  return unique;
}

async function repairJsonWithGemini(env, malformedJson, schemaHint = '') {
  const systemPrompt = 'You repair malformed JSON. Return valid JSON only. No markdown, no explanation.';
  const userPrompt = `Fix this malformed JSON so it is valid and complete.
${schemaHint ? `Schema hint: ${schemaHint}` : ''}

Malformed JSON:
${String(malformedJson).slice(0, 120000)}
`;

  const repaired = await runGemini(env, {
    systemPrompt,
    userPrompt,
    temperature: 0.0,
    maxOutputTokens: 8192,
    jsonMode: true,
  });

  return parseJsonBlock(repaired.text);
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
  let daysCount = 7;
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
    daysCount = normalizePositiveInt(b.daysCount, 7, 1, 7);

    cfg.minMorningWords = normalizePositiveInt(b.minMorningWords, DEFAULT_MIN_MORNING_WORDS, 80, 1200);
    cfg.minEveningWords = normalizePositiveInt(b.minEveningWords, DEFAULT_MIN_EVENING_WORDS, 60, 900);
    cfg.minMorningParagraphs = normalizePositiveInt(b.minMorningParagraphs, DEFAULT_MIN_MORNING_PARAGRAPHS, 2, 8);
    cfg.minEveningParagraphs = normalizePositiveInt(b.minEveningParagraphs, DEFAULT_MIN_EVENING_PARAGRAPHS, 2, 7);
  } catch {}

  const pastorKey = pastors.map(p => p.toLowerCase().trim()).sort().join('|');
  const lengthKey = `${cfg.minMorningWords}-${cfg.minEveningWords}-${cfg.minMorningParagraphs}-${cfg.minEveningParagraphs}-${daysCount}`;
  const cacheKey = `plan:ai:v5:${topic.toLowerCase().trim()}:${pastorKey}:${lengthKey}`;
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

  const buildDayPrompt = (dayIndex, retryNote = '') => `Write day ${dayIndex + 1} of a ${daysCount}-day personal Bible devotional plan on the theme: "${topic}".${pastorLine}

Return ONLY this exact JSON structure (no markdown fences, no explanation, just raw JSON):
{
  "dayIndex": ${dayIndex},
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

Devotional body content must be substantial. Scripture references do NOT count toward body length.
Morning body: at least ${cfg.minMorningParagraphs} paragraphs and at least ${cfg.minMorningWords} words.
Evening body: at least ${cfg.minEveningParagraphs} paragraphs and at least ${cfg.minEveningWords} words.
Use a unique scripture reference for this day that differs from other days in the same week.
Ensure valid JSON only.
Do not include trailing commas. Escape quotes inside strings. Do not include markdown.${retryNote ? `\n\nRETRY REQUIREMENT: ${retryNote}` : ''}`;

  function normalizeSession(session, fallbackRef, fallbackParagraphs) {
    const normalized = (session && typeof session === 'object') ? { ...session } : {};
    normalized.scripture_ref = String(normalized.scripture_ref || '').trim() || fallbackRef;

    let body = [];
    if (Array.isArray(normalized.body)) {
      body = normalized.body
        .filter(b => b && typeof b === 'object')
        .map(b => ({
          type: 'paragraph',
          content: String(b.content || '').trim(),
        }))
        .filter(b => b.content);
    } else if (typeof normalized.devotion === 'string') {
      body = normalized.devotion
        .split(/\n{2,}/)
        .map(p => p.trim())
        .filter(Boolean)
        .map(content => ({ type: 'paragraph', content }));
    }

    while (body.length < fallbackParagraphs) {
      body.push({ type: 'paragraph', content: 'Pause, pray, and reflect on this scripture in your present circumstances.' });
    }
    normalized.body = body;

    if (!Array.isArray(normalized.reflection_prompts)) normalized.reflection_prompts = [];
    normalized.reflection_prompts = normalized.reflection_prompts
      .map(p => String(p || '').trim())
      .filter(Boolean);
    normalized.prayer = String(normalized.prayer || '').trim();
    return normalized;
  }

  function normalizeDay(dayData, dayIndex, fallbackRefs) {
    const fallbackMorningRef = fallbackRefs[dayIndex % fallbackRefs.length];
    const fallbackEveningRef = fallbackRefs[(dayIndex + 4) % fallbackRefs.length];

    const safe = (dayData && typeof dayData === 'object') ? { ...dayData } : {};
    safe.dayIndex = dayIndex;
    safe.title = String(safe.title || `Day ${dayIndex + 1}`).trim();
    safe.inspired_by = Array.isArray(safe.inspired_by) && safe.inspired_by.length
      ? safe.inspired_by.map(p => String(p || '').trim()).filter(Boolean).slice(0, 4)
      : (pastors.length ? pastors.slice(0, 3) : ['Tim Keller', 'John Mark Comer']);
    safe.morning = normalizeSession(safe.morning, fallbackMorningRef, cfg.minMorningParagraphs);
    safe.evening = normalizeSession(safe.evening, fallbackEveningRef, cfg.minEveningParagraphs);

    if (!safe.faith_stretch || typeof safe.faith_stretch !== 'object') safe.faith_stretch = {};
    safe.faith_stretch.title = String(safe.faith_stretch.title || 'Faith Stretch').trim();
    safe.faith_stretch.description = String(safe.faith_stretch.description || 'Take one concrete, faithful step in response to today\'s scripture.').trim();
    return safe;
  }

  try {
    const FALLBACK_REFS = [
      'Romans 8:28', 'Psalm 23:1', 'John 3:16', 'Philippians 4:6-7',
      'Isaiah 41:10', 'Jeremiah 29:11', 'Matthew 11:28', 'Psalm 46:1',
      'Proverbs 3:5-6', 'Isaiah 40:31', '2 Corinthians 12:9', 'Hebrews 11:1',
    ];
    const days = [];
    const modelUsage = [];
    const providerUsage = [];
    const providerOrder = buildPlanProviderOrder(env);

    for (let dayIndex = 0; dayIndex < daysCount; dayIndex++) {
      const dayCacheKey = `plan-day:ai:v2:${topic.toLowerCase().trim()}:${pastorKey}:${cfg.minMorningWords}-${cfg.minEveningWords}-${cfg.minMorningParagraphs}-${cfg.minEveningParagraphs}:d${dayIndex + 1}`;
      if (env.ABIDE_KV) {
        const cachedDay = await env.ABIDE_KV.get(dayCacheKey, 'json');
        if (cachedDay && typeof cachedDay === 'object') {
          days.push(normalizeDay(cachedDay.day || cachedDay, dayIndex, FALLBACK_REFS));
          if (cachedDay.meta?.model) modelUsage.push(`${cachedDay.meta.provider || 'unknown'}:${cachedDay.meta.model}`);
          if (cachedDay.meta?.provider) providerUsage.push(cachedDay.meta.provider);
          continue;
        }
      }

      let dayData = null;
      let lastDayErr = null;
      let dayRetryReason = retryReason;
      let dayModel = '';

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          let lastProviderErr = null;
          let response = null;
          for (const provider of providerOrder) {
            try {
              if (provider === 'gemini') {
                response = await runGemini(env, {
                  systemPrompt,
                  userPrompt: buildDayPrompt(dayIndex, dayRetryReason),
                  temperature: 0.6,
                  maxOutputTokens: 4096,
                  jsonMode: true,
                  preferredModel: env.GEMINI_PLAN_MODEL || env.GEMINI_MODEL || '',
                });
              } else if (provider === 'openrouter') {
                response = await runOpenRouter(env, {
                  systemPrompt,
                  userPrompt: buildDayPrompt(dayIndex, dayRetryReason),
                  temperature: 0.6,
                  maxOutputTokens: 4096,
                  jsonMode: true,
                  preferredModel: env.OPENROUTER_PLAN_MODEL || env.OPENROUTER_MODEL || '',
                });
              } else if (provider === 'groq') {
                response = await runGroq(env, {
                  systemPrompt,
                  userPrompt: buildDayPrompt(dayIndex, dayRetryReason),
                  temperature: 0.6,
                  maxOutputTokens: 4096,
                  jsonMode: true,
                  preferredModel: env.GROQ_PLAN_MODEL || env.GROQ_MODEL || '',
                });
              }
              if (response?.text) break;
            } catch (providerErr) {
              lastProviderErr = providerErr;
            }
          }

          if (!response?.text) {
            throw lastProviderErr || new Error('No configured AI providers are available for plan generation');
          }

          dayModel = `${response.provider}:${response.model}` || dayModel;
          dayData = parseJsonBlock(response.text);

          dayData = normalizeDay(dayData, dayIndex, FALLBACK_REFS);
          const dayLengthIssues = validatePlanLength({ days: [dayData] }, cfg);
          if (dayLengthIssues.length) {
            throw new Error(dayLengthIssues.join('; '));
          }
          days.push(dayData);
          if (dayModel) modelUsage.push(dayModel);
          providerUsage.push(response.provider);
          if (env.ABIDE_KV) {
            await env.ABIDE_KV.put(dayCacheKey, JSON.stringify({
              day: dayData,
              meta: { provider: response.provider, model: response.model, cachedAt: Date.now() },
            }), { expirationTtl: PLAN_CACHE_TTL });
          }
          break;
        } catch (errDay) {
          lastDayErr = errDay;
          dayRetryReason = `Previous attempt failed with: ${errDay.message}`;
        }
      }

      if (!dayData) {
        throw lastDayErr || new Error(`Day ${dayIndex + 1}: generation failed`);
      }
    }

    days.sort((a, b) => (a.dayIndex || 0) - (b.dayIndex || 0));

    const planData = { theme: topic, days };
    const lengthIssues = validatePlanLength(planData, cfg);
    if (lengthIssues.length) {
      throw new Error(`Plan too short: ${lengthIssues.slice(0, 4).join('; ')}`);
    }

    // Ensure scripture refs are unique enough; if duplicates remain, patch them with fallback refs.
    const seenMorning = new Set();
    const seenEvening = new Set();
    days.forEach((day, idx) => {
      const m = (day.morning?.scripture_ref || '').toLowerCase();
      const e = (day.evening?.scripture_ref || '').toLowerCase();
      if (seenMorning.has(m)) {
        day.morning.scripture_ref = FALLBACK_REFS[idx % FALLBACK_REFS.length];
      } else {
        seenMorning.add(m);
      }
      if (seenEvening.has(e)) {
        day.evening.scripture_ref = FALLBACK_REFS[(idx + 4) % FALLBACK_REFS.length];
      } else {
        seenEvening.add(e);
      }
    });

    const uniqueModels = [...new Set(modelUsage.filter(Boolean))];
    const uniqueProviders = [...new Set(providerUsage.filter(Boolean))];
    const result = {
      theme: topic,
      days: planData.days.slice(0, daysCount),
      ai_meta: {
        provider: uniqueProviders.length === 1 ? uniqueProviders[0] : 'mixed',
        providers: uniqueProviders,
        models: uniqueModels,
        chunked: true,
        daysCount,
      },
    };

    if (env.ABIDE_KV) {
      await env.ABIDE_KV.put(cacheKey, JSON.stringify(result), { expirationTtl: PLAN_CACHE_TTL });
    }

    return json(result, 200, origin);
  } catch (err) {
    console.error('AI plan error:', err.message);
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

  const cacheKey = `phrase:cfai:v2:${phrase.toLowerCase().trim()}`;
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

  // Prefer Cloudflare AI for lightweight/low-cost phrase search.
  try {
    const cf = await runCloudflareAI(env, {
      systemPrompt,
      userPrompt,
      temperature: 0.15,
      maxTokens: 900,
    });
    const parsed = parseJsonBlock(cf.text);
    const verses = normalizeVerseList(parsed);
    if (!verses.length) throw new Error('Empty verses array from Cloudflare AI');
    const result = { verses, fallback: false, provider: cf.provider, model: cf.model };

    if (env.ABIDE_KV) {
      await env.ABIDE_KV.put(cacheKey, JSON.stringify(result), { expirationTtl: PHRASE_CACHE_TTL });
    }

    return json(result, 200, origin);
  } catch (cfErr) {
    console.warn('Cloudflare AI phrase error, falling back to Gemini:', cfErr.message);
  }

  // Fallback to Gemini if Cloudflare AI is unavailable/unhealthy.
  try {
    const gemini = await runGemini(env, {
      systemPrompt,
      userPrompt,
      temperature: 0.2,
      maxOutputTokens: 1400,
      jsonMode: true,
    });
    const parsed = parseJsonBlock(gemini.text);
    const verses = normalizeVerseList(parsed);
    if (!verses.length) throw new Error('Empty verses array from Gemini');
    const result = { verses, fallback: false, provider: gemini.provider, model: gemini.model };

    if (env.ABIDE_KV) {
      await env.ABIDE_KV.put(cacheKey, JSON.stringify(result), { expirationTtl: PHRASE_CACHE_TTL });
    }
    return json(result, 200, origin);
  } catch (err) {
    console.error('Phrase search failed on all providers:', err.message);
    return json({ verses: [], fallback: true }, 200, origin);
  }
}
