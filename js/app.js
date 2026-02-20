/* ============================================================
   ABIDE - Main Entry Point
   ============================================================ */

(function () {
  'use strict';
  const APP_VERSION = '2026.02.20.16';
  window.__ABIDE_VERSION__ = APP_VERSION;
  window.__ABIDE_SW_VERSION__ = 'abide-v38';

  function getBasePath() {
    const path = window.location.pathname || '/';
    if (path.endsWith('.html')) {
      return path.slice(0, path.lastIndexOf('/') + 1);
    }
    return path.endsWith('/') ? path : `${path}/`;
  }

  // --- Theme init (before render, to prevent flash) ---
  function initTheme() {
    const theme = Store.get('theme') || 'auto';
    SettingsView.applyTheme(theme);
  }

  // --- Palette init (before render, prevent flash) ---
  function initPalette() {
    const palette = Store.get('palette') || 'tuscan-sunset';
    document.documentElement.dataset.palette = palette;
  }

  // --- Standalone detection (iOS PWA home-screen mode) ---
  function initStandalone() {
    const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    if (isStandalone) {
      document.documentElement.dataset.standalone = 'true';
    }
  }

  // --- Register service worker ---
  function registerSW() {
    if ('serviceWorker' in navigator) {
      const basePath = getBasePath();
      navigator.serviceWorker.register(`${basePath}sw.js?v=${encodeURIComponent(APP_VERSION)}`, {
        scope: basePath,
        updateViaCache: 'none',
      })
        .then(reg => {
          console.log('[Abide] SW registered:', reg.scope);
          reg.update().catch(() => {});
        })
        .catch(err => {
          console.warn('[Abide] SW registration failed:', err);
        });
    }
  }

  // --- Register routes ---
  function registerRoutes() {
    Router.register('/', (container) => {
      Router.setTitle('Abide');
      HomeView.render(container);
    });

    Router.register('/devotion', (container) => {
      Router.setTitle('Devotion');
      DevotionView.render(container);
    });

    Router.register('/saved', (container) => {
      Router.setTitle('Saved Devotionals');
      SavedView.render(container);
    });

    Router.register('/scripture', (container) => {
      Router.setTitle('Scripture');
      ScriptureView.render(container);
    });

    Router.register('/prayer', (container) => {
      Router.setTitle('Prayer');
      PrayerView.render(container);
    });

    Router.register('/journal', (container) => {
      Router.setTitle('Journal');
      JournalView.render(container);
    });

    Router.register('/plan', (container) => {
      Router.setTitle('Build This Week');
      PlanView.render(container);
    });

    Router.register('/settings', (container) => {
      Router.setTitle('Settings');
      SettingsView.render(container);
    });

    Router.register('/settings-advanced', (container) => {
      Router.setTitle('Advanced');
      SettingsAdvancedView.render(container);
    });

    Router.register('/debug', (container) => {
      Router.setTitle('Debug');
      DebugView.render(container);
    });
  }

  // --- Auto theme based on time ---
  function startThemeWatcher() {
    // Check every 30 minutes
    setInterval(() => {
      const theme = Store.get('theme');
      if (theme === 'auto') {
        SettingsView.applyTheme('auto');
      }
    }, 30 * 60 * 1000);
  }

  // --- Streak update on open ---
  function checkStreak() {
    Store.updateStreak();
  }

  // --- Auto-load seed plan on first open ---
  async function autoLoadSeedIfNeeded() {
    if (!Store.getPlan()) {
      try {
        const res = await fetch(`${getBasePath()}content/seed/week-1.json`);
        if (res.ok) {
          const data = await res.json();
          Store.savePlan(data);
        }
      } catch (e) {
        // Seed not available - user will be prompted to build a plan
      }
    }
  }

  // --- Boot ---
  async function boot() {
    initStandalone();
    initPalette();
    initTheme();
    registerSW();
    registerRoutes();
    checkStreak();
    startThemeWatcher();

    // Load seed content in background before rendering
    await autoLoadSeedIfNeeded();

    Router.init();

    // Remove loading screen
    const loading = document.querySelector('.loading-screen');
    if (loading) {
      loading.style.animation = 'fadeOut 200ms ease forwards';
      setTimeout(() => loading.remove(), 200);
    }

    console.log('[Abide] App initialized');
  }

  // Wait for DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
