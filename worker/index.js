/**
 * ABIDE - Cloudflare Worker
 * Routes: /bible, /search, /ai/plan, /ai/phrase, /push/*
 *
 * Secrets (set with: wrangler secret put SECRET_NAME):
 *   ESV_API_TOKEN     - api.esv.org token
 *   SERPER_API_KEY    - Serper.dev search API key
 *   GEMINI_API_KEY    - Gemini API key for AI plan + phrase search
 *   GEMINI_MODEL      - Optional Gemini model name
 *   VAPID_PUBLIC_KEY  - VAPID public key for push
 *   VAPID_PRIVATE_KEY - VAPID private key for push
 *   VAPID_SUBJECT     - mailto:your@email.com
 */

import { handleBible } from './bible.js';
import { handleSearch } from './search.js';
import { handlePush } from './push.js';
import { handleAIPlan, handleAIPhrase, handleAIModels, handleAIProviders } from './ai.js';

// CORS — allow GitHub Pages origin + local dev
const ALLOWED_ORIGINS = [
  'https://mattlmccoy.github.io',
  'http://localhost:8080',
  'http://localhost:3000',
  'http://127.0.0.1:5500',
  'null',
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function json(data, status = 200, origin = '*') {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    try {
      if (url.pathname === '/health') {
        return json({ status: 'ok', version: '2.2.0', service: 'abide-worker' }, 200, origin);
      }

      if (url.pathname.startsWith('/bible')) {
        return handleBible(request, url, env, origin, json);
      }

      if (url.pathname.startsWith('/search')) {
        return handleSearch(request, url, env, origin, json);
      }

      // AI-powered devotional plan builder
      if (url.pathname === '/ai/plan') {
        return handleAIPlan(request, url, env, origin, json);
      }

      // AI-powered verse phrase search
      if (url.pathname === '/ai/phrase') {
        return handleAIPhrase(request, url, env, origin, json);
      }

      // AI model diagnostics
      if (url.pathname === '/ai/models') {
        return handleAIModels(request, url, env, origin, json);
      }

      // AI provider diagnostics
      if (url.pathname === '/ai/providers') {
        return handleAIProviders(request, url, env, origin, json);
      }

      if (url.pathname.startsWith('/push')) {
        return handlePush(request, url, env, origin, json, ctx);
      }

      return json({ error: 'Not found' }, 404, origin);
    } catch (err) {
      console.error('Worker error:', err);
      return json({ error: err.message }, 500, origin);
    }
  },

  async scheduled(event, env, ctx) {
    const { handleScheduledPush } = await import('./push.js');
    ctx.waitUntil(handleScheduledPush(env));
  },
};
