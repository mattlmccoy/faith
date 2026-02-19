# Abide — Cloudflare Worker Setup

This worker provides three things:
- **Bible passage proxy** + KV caching (7-day TTL)
- **Devotional web search** via Serper.dev (API key stays server-side)
- **Push notification delivery** (VAPID, for morning/evening alerts)

All free-tier Cloudflare resources. No credit card required for personal use.

---

## Step 1 — Create a Cloudflare Account

Go to [cloudflare.com](https://cloudflare.com) and create a free account if you don't have one.

---

## Step 2 — Install Wrangler CLI

```bash
npm install -g wrangler
wrangler login
```

`wrangler login` will open a browser window to authorize your Cloudflare account.

---

## Step 3 — Create the KV Namespace

KV is used to cache Bible passages (7 days) and search results (1 hour).

```bash
cd worker/
wrangler kv:namespace create ABIDE_KV
```

You'll see output like:
```
🌀 Creating namespace with title "abide-worker-ABIDE_KV"
✅ Success!
Add the following to your configuration file in your kv_namespaces array:
{ binding = "ABIDE_KV", id = "abc123def456..." }
```

Copy the `id` value and paste it into `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "ABIDE_KV"
id = "abc123def456..."   # ← paste your real ID here
```

---

## Step 4 — Get a Serper.dev API Key

Serper powers the devotional web search (searching approved pastor sites).

1. Go to [serper.dev](https://serper.dev) and sign up for free
2. The free tier gives you **2,500 searches/month** — more than enough
3. Copy your API key from the dashboard

---

## Step 5 — Generate VAPID Keys (for push notifications)

```bash
npx web-push generate-vapid-keys
```

Output looks like:
```
Public Key:  BN4r5K...long key...
Private Key: abcdef...long key...
```

Save these — you'll need them in the next step.

---

## Step 6 — Add Secrets to the Worker

Secrets are stored encrypted in Cloudflare — never in your code or repo.

```bash
# Serper.dev API key
wrangler secret put SERPER_API_KEY
# Paste your key when prompted

# Gemini API key (for /ai/plan and /ai/phrase)
wrangler secret put GEMINI_API_KEY
# Paste your Gemini key when prompted

# Optional: choose Gemini model (defaults to gemini-1.5-flash)
wrangler secret put GEMINI_MODEL
# Example value: gemini-1.5-flash

# VAPID public key (from step 5)
wrangler secret put VAPID_PUBLIC_KEY

# VAPID private key (from step 5)
wrangler secret put VAPID_PRIVATE_KEY

# VAPID subject (your email address)
wrangler secret put VAPID_SUBJECT
# Type: mailto:your@email.com
```

---

## Step 7 — Update the CORS Origin

Open `worker/index.js` and update line 3 with your GitHub Pages URL:

```javascript
const ALLOWED_ORIGINS = [
  'https://mattlmccoy.github.io',  // ← already set correctly
  'http://localhost:8080',
];
```

This is already set to your username. No change needed unless you move the app.

---

## Step 8 — Deploy

```bash
cd worker/
wrangler deploy
```

Output will show your worker URL:
```
✅ Deployed abide-worker to https://abide-worker.mattlmccoy.workers.dev
```

---

## Step 9 — Add the Worker URL to the App

1. Open **Abide** in your browser
2. Go to the **More** tab → Settings
3. Scroll to **Advanced**
4. Paste your worker URL: `https://abide-worker.mattlmccoy.workers.dev`
5. Tap **Save Settings**

The weekly plan builder and push notifications will now work.

---

## Testing the Worker

Check it's alive:
```
https://abide-worker.mattlmccoy.workers.dev/health
```

Should return: `{"status":"ok","service":"abide-worker"}`

Test Bible lookup:
```
https://abide-worker.mattlmccoy.workers.dev/bible?ref=John+3:16
```

---

## Push Notifications

Push notifications require the app to be **installed to your iPhone home screen**
(Share → Add to Home Screen), then opened at least once from the home screen icon.
This is an iOS requirement (iOS 16.4+).

The worker's cron trigger (`*/30 * * * *`) checks every 30 minutes and sends
pushes at your configured morning/evening times (set in app Settings).

---

## Updating the Worker

After any changes to worker code:

```bash
cd worker/
wrangler deploy
```

To view logs:
```bash
wrangler tail
```
