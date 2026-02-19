/**
 * ABIDE - Cloudflare Worker
 * Routes: /bible, /search, /push/*
 *
 * Environment variables (set in Cloudflare dashboard or wrangler.toml secrets):
 *   SERPER_API_KEY  - Serper.dev API key for web search
 *   VAPID_PUBLIC_KEY  - VAPID public key for push
 *   VAPID_PRIVATE_KEY - VAPID private key for push
 *   VAPID_SUBJECT    - mailto:your@email.com
 */

import { handleBible } from './bible.js';
import { handleSearch } from './search.js';
import { handlePush } from './push.js';

// CORS headers - only allow your GitHub Pages origin
const ALLOWED_ORIGINS = [
  'https://mattlmccoy.github.io',
  'http://localhost:8080',
  'http://localhost:3000',
  'http://127.0.0.1:5500',
  'null', // file:// protocol during development
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

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    try {
      if (url.pathname === '/health') {
        return json({ status: 'ok', version: '1.0.0' }, 200, origin);
      }

      if (url.pathname.startsWith('/bible')) {
        return handleBible(request, url, env, origin, json);
      }

      if (url.pathname.startsWith('/search')) {
        return handleSearch(request, url, env, origin, json);
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

  // Scheduled cron: send morning/evening push notifications
  async scheduled(event, env, ctx) {
    const { handleScheduledPush } = await import('./push.js');
    ctx.waitUntil(handleScheduledPush(env));
  },
};
