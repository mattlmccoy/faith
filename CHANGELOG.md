# Changelog

All notable changes to Abide are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions follow the `YYYY.MM.DD[.patch]` scheme matching `APP_VERSION` in `app.js`.

---

## [Unreleased]

---

## [2026.02.20] — 2026-02-20 *(SW: abide-v27)*

### Added
- **Multi-provider AI routing** — Gemini → OpenRouter → Groq fallback chain with per-provider health scoring, latency tracking, and 429 cooldown management stored in KV
- **Day navigation** — tap prev/next controls on the home screen and devotion view to move between days in the active plan; `Store.shiftSelectedDevotionDay()` handles bounds
- **Save devotions** — bookmark any morning or evening session; saved sessions persist in `savedDevotionLibrary` and are displayed in the new Saved Devotionals view
- **Saved Devotionals view** (`js/views/saved.js`) — expandable list of saved sessions with full devotion detail, opening verse, reflection prompts, prayer, and Google Drive sync controls
- **Trusted pastors in Settings** — manage the pastor list (enable/disable, add/remove) under Settings → Trusted Pastors; the plan builder reads this list automatically
- **Pastor attribution** — each devotion shows an `inspired_by` field in the Sources section, naming the teachers whose style shaped the session
- **Longer devotions** — word and paragraph minimums enforced at both client (`plan.js`) and server (`worker/ai.js`): 260+ words / 4+ paragraphs morning, 190+ words / 3+ paragraphs evening; plan regenerates per-day if minimums are not met
- **Scripture splash on home** — the home screen now shows the opening verse text rather than the devotion headline
- **Translation alignment** — `hydrateOpeningVerse()` in `home.js` and `hydrateScripture()` in `devotion.js` fetch all scripture using the currently selected translation via `API.getPassage()`
- **Google Drive sync** (`js/sync.js`) — OAuth 2.0 token management, automatic `abidefaith-docs` folder creation, multi-file sync for devotions, journals, and settings with atomic upsert and backward-compatible snapshot merging
- **Usage tracking** — `Store.trackUsage()` increments per-metric counters (Bible queries, ESV queries, AI plan requests, AI phrase searches, etc.) with monthly reset
- **Advanced Settings view** (`js/views/settings-advanced.js`) — usage statistics with soft limits, Worker URL override, AI provider status and probe, Google Drive client ID override
- **Debug view** (`js/views/debug.js`) — full diagnostics dump (app version, worker health, notifications, sync state, service workers), health endpoint check, push notification testing
- **AI provider diagnostics endpoints** — `/ai/providers`, `/ai/routing`, `/ai/probe`, `/ai/models` on the Cloudflare Worker for surfacing routing state and testing provider health
- **Day-level KV caching** — AI plan generation caches at the individual day level (`plan-day:ai:v2:...`) before assembling the full plan; full-plan cache maintained in parallel
- **Offline fallback page** (`offline.html`) — shown when navigation fails offline; displays Psalm 46:10 and notes that saved devotions and journal remain accessible
- **Privacy policy** (`privacy.html`) and **Terms of Service** (`terms.html`)
- **New routes** — `/saved`, `/settings-advanced`, `/debug` registered in `app.js`

### Changed
- **Home screen redesign** — glass card layout with ambient blob layer, day navigation controls, streak display, and scripture-first splash
- **Settings restructured** — seven numbered sections: Name, Trusted Pastors, Devotion Content, Appearance, Notifications, App Data, Advanced
- **Plan builder** — reads trusted pastors from `Store.getTrustedPastors()` instead of inline state; pastor chips are read-only (manage in Settings)
- **SW bumped** to `abide-v27`

---

## [2026.02.15] — 2026-02-15 *(SW: abide-v4 era)*

### Added
- **Arc-inspired glass redesign** — full CSS token system rewrite: `--glass-fill`, `--glass-border`, `--glass-blur`, `--glass-shadow`, `--text-primary/secondary/tertiary`, `--accent`, `--ambient-1/2/3`
- **8 color palettes** via `data-palette` attribute on `<html>`: Tuscan Sunset, Desert Dusk, Lavender Fields, Cactus Flower, Mountain Mist, Graphite, Ocean Glass, Mono
- **Palette picker UI** in Settings → Appearance — color dot cards, one per palette; selection stored in `Store`
- **Ambient background blobs** — three `backdrop-filter`-blurred color blobs per palette, fixed behind the app layer; colors transition smoothly on palette change
- **Settings notification overflow fix** — added `.settings-row--stacked` CSS class for rows with time pickers; action wraps below label on narrow screens

### Changed
- **Full CSS token rewrite** — `css/app.css` replaced with semantic variable system; legacy bridge aliases (`--color-primary → --accent`, etc.) preserve backward compatibility across all views
- **Dark mode glass variants** — `[data-theme="dark"]` overrides set dark-translucent glass fill, near-white text, dimmer blobs
- **Tab bar iOS standalone fix** — `align-items: flex-start` on `.tab-bar` with `height: var(--tab-bar-height)` on `.tab-item` anchors items above the safe-area inset; `data-standalone` detection added in `app.js`
- **Motion spec updated** — transition easing changed to `cubic-bezier(0.22, 1, 0.36, 1)` across fast/base/slow variants; palette/theme transitions run at 380ms

---

## [2026.02.01] — 2026-02-01 *(SW: abide-v3 era)*

### Added
- **Cloudflare Worker** (`worker/`) — ESV Bible API proxy (keeps token server-side), Serper.dev devotional search, VAPID push notification delivery, 30-minute cron schedule
- **AI plan builder** — initial implementation via Cloudflare AI; generates 7-day devotion plans from a user-supplied topic
- **Scripture view** (`js/views/scripture.js`) — passage lookup with translation selector and intelligent book/chapter/verse autocomplete
- **Prayer view** (`js/views/prayer.js`) — personal prayer list with add/remove/complete
- **Journal view** (`js/views/journal.js`) — date-keyed entries with AI-suggested reflection prompts
- **Plan builder view** (`js/views/plan.js`) — topic input, trusted pastor display, plan generation and display
- **Push notifications** — iOS 16.4+ PWA support via Service Worker push events; VAPID subscription managed through the Worker
- **Service Worker** (`sw.js`) — install/activate/fetch handlers; static asset cache (cache-first) and content/Bible cache (network-first with 7-day TTL for Bible, 1-hour for content JSON)

---

## [2026.01.15] — 2026-01-15 *(initial)*

### Added
- **Initial PWA scaffold** — `index.html` app shell, hash-based SPA router (`js/router.js`), loading screen, bottom tab bar (Today, Scripture, Prayer, Journal, More)
- **Home view** (`js/views/home.js`) — displays today's devotion from the current week plan
- **Devotion view** (`js/views/devotion.js`) — full morning or evening session with opening verse, body paragraphs, reflection prompts, prayer
- **Store module** (`js/store.js`) — all state in `localStorage`: theme, translation, notification times, journal entries, completed devotions, streak, week plan
- **bible-api.com integration** — `API.getPassage()` fetches WEB passages directly (free, CORS-enabled, no API key)
- **Streak tracking** — `Store.updateStreak()` increments daily on app open, resets if a day is missed
- **PWA manifest** (`manifest.json`) — app name, icons, display mode, theme/background colors, categories
- **App icons** — 192×192, 512×512, maskable variants in `/icons/`
- **Service Worker** — initial version with static asset precaching and offline support
- **Seed plan** (`content/seed/week-1.json`) — default first week loaded on first open when no plan exists
