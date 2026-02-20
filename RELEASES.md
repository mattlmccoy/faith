# Release Notes — Abide

---

## v2026.02.20 — "Living Word"

This release is the biggest update Abide has seen. It brings deeper devotions, a smarter AI backbone, a completely new look, and the ability to save and revisit sessions that speak to you. It also lays the groundwork for keeping your devotional life synced across your devices — quietly, privately, through your own Google Drive.

---

### What's New

#### Richer, Longer Devotions

Morning sessions now run over 260 words across at least four paragraphs. Evening reflections come in at 190+ words. The AI is held to that standard and will regenerate any session that falls short. The result is devotions that actually have room to breathe — more scripture context, more pastoral depth, more space for reflection.

#### Your Trusted Voices, Named

The teachers who shape each devotion are now listed by name in the Sources section: Tim Keller, John Mark Comer, Jon Pokluda, Louie Giglio, John Piper, Ben Stuart. You can manage this list in **Settings → Trusted Pastors** — enable, disable, or add names. The plan builder pulls from whoever you have enabled.

#### Navigate the Week

Use the arrow controls on the home screen to move freely between days in your plan. Missed Monday's morning reading? Go back. Want to see what Friday looks like? Jump ahead. Your place in the plan is remembered automatically.

#### Save Your Favorites

Tap the bookmark icon on any devotion to save it. Saved sessions live in the **Saved Devotionals** view (More tab) — expandable, readable, with the full text preserved. Connect Google Drive to back them up.

#### Scripture First

The home screen now opens with the day's scripture text front and center — the actual verse, not a devotion headline. What you see first when you open the app is the Word itself.

#### Scripture Stays Consistent

Every scripture reference in a devotion — the opening verse, the passage cards, all of it — now uses your selected translation. Change the translation in **Settings → Devotion Content** and it applies everywhere.

#### A New Look

Eight color palettes to choose from, each with frosted-glass cards, a soft ambient background, and a coordinated accent color. Switch themes in **Settings → Appearance**. Dark mode adjusts the glass and text automatically.

- **Tuscan Sunset** — warm terracotta (default)
- **Desert Dusk** — deep contemplative purple
- **Lavender Fields** — soft and serene
- **Cactus Flower** — fresh sage green
- **Mountain Mist** — cool teal
- **Graphite** — focused and minimal
- **Ocean Glass** — open sky blue
- **Mono** — maximum whitespace

#### Google Drive Sync (Optional)

Connect your Google account to back up saved devotions, journal entries, and settings to a private folder in your Drive. Nothing leaves your account — Abide only accesses the folder it creates. Sync when you want to, restore when you need to.

---

### Under the Hood

- **Three AI providers** — Gemini (Google), OpenRouter, and Groq run in a smart failover chain. If one is slow or unavailable, the next picks up automatically. Routing state is tracked so the fastest, most reliable provider gets priority.
- **Service Worker v27** — improved caching strategy, cleaner offline fallback
- **Usage tracking** — see how many Bible queries and AI plan requests you've used this month in **Settings → Advanced**
- **Debug view** — hidden diagnostics page for troubleshooting notifications, worker health, and sync state

---

### Known Limitations

- **Push notifications** require iOS 16.4+ with Abide installed to the home screen via Safari → Share → Add to Home Screen. They will not work in a regular Safari browser tab.
- **ESV translation** requires the Cloudflare Worker to be deployed with an ESV API key. All other translations (WEB, KJV, ASV, etc.) work without the Worker.
- **Google Drive sync** requires a Google account and will prompt you to sign in. Your devotion data never touches Abide's servers — it goes directly from your device to your Drive.

---

### Previous Releases

See [CHANGELOG.md](CHANGELOG.md) for the full version history going back to the initial release.

---

## v2026.02.15 — "Glass"

Abide got a full visual redesign inspired by frosted-glass interfaces. Eight color palettes, smooth theme transitions, and ambient background colors that shift with your chosen palette. The settings overflow on iOS was fixed, and the tab bar now sits correctly in the home screen safe area.

---

## v2026.02.01 — "Foundation"

The Cloudflare Worker launched — enabling ESV Bible support, AI devotion plan generation, Serper.dev devotional search, and VAPID push notifications. The Scripture, Prayer, Journal, and Plan views were added.

---

## v2026.01.15 — Initial Release

Abide launched as a personal PWA: daily devotions from a weekly plan, Bible passage lookup (WEB), streak tracking, and a local-first architecture with no accounts and no servers.
