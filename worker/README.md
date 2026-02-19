# Abide — Cloudflare Worker Setup

This worker provides:
- Bible passage proxy + KV caching
- Devotional web search (via Serper.dev)
- Push notification delivery (VAPID)

## Prerequisites

```bash
npm install -g wrangler
wrangler login
```

## 1. Create KV Namespace

```bash
cd worker/
wrangler kv:namespace create ABIDE_KV
```

Copy the `id` from the output into `wrangler.toml`.

## 2. Add API Keys as Secrets

```bash
# Serper.dev key (sign up free at serper.dev - 2,500 searches/month free)
wrangler secret put SERPER_API_KEY

# Generate VAPID keys for push notifications
npx web-push generate-vapid-keys

# Add VAPID keys
wrangler secret put VAPID_PUBLIC_KEY
wrangler secret put VAPID_PRIVATE_KEY
wrangler secret put VAPID_SUBJECT   # e.g. mailto:your@email.com
```

## 3. Deploy

```bash
wrangler deploy
```

The worker URL will be: `https://abide-worker.YOUR_USERNAME.workers.dev`

## 4. Add Worker URL to App

Open **Abide → More (Settings)** and paste the worker URL.

## 5. Update CORS Origin

In `index.js`, update `ALLOWED_ORIGINS` to include your GitHub Pages URL:

```javascript
const ALLOWED_ORIGINS = [
  'https://YOUR_USERNAME.github.io',
  ...
];
```

Then redeploy: `wrangler deploy`
