/* ============================================================
   ABIDE - Main Entry Point
   ============================================================ */

(function () {
  'use strict';
  const APP_VERSION = '2026.02.19.2';
  window.__ABIDE_VERSION__ = APP_VERSION;

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
    if (window.navigator.standalone === true) {
      document.documentElement.dataset.standalone = 'true';
    }
  }

  function initIOS() {
    const ua = window.navigator.userAgent || '';
    const platform = window.navigator.platform || '';
    const touchPoints = window.navigator.maxTouchPoints || 0;
    const isIOS = /iPhone|iPad|iPod/i.test(ua) || (platform === 'MacIntel' && touchPoints > 1);
    if (isIOS) {
      document.documentElement.dataset.ios = 'true';
    }
  }

  function initViewportHeightFix() {
    if (document.documentElement.dataset.ios !== 'true') return;
    const setHeight = () => {
      const vv = window.visualViewport;
      const height = vv?.height || window.innerHeight || 0;
      if (height > 0) {
        document.documentElement.style.setProperty('--app-height', `${Math.round(height)}px`);
      }
    };

    setHeight();
    window.addEventListener('resize', setHeight, { passive: true });
    window.addEventListener('orientationchange', setHeight, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', setHeight, { passive: true });
      window.visualViewport.addEventListener('scroll', setHeight, { passive: true });
    }
  }

  // --- Register service worker ---
  function registerSW() {
    if ('serviceWorker' in navigator) {
      const basePath = getBasePath();
      navigator.serviceWorker.register(`${basePath}sw.js`, { scope: basePath })
        .then(reg => {
          console.log('[Abide] SW registered:', reg.scope);
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
    initIOS();
    initStandalone();
    initViewportHeightFix();
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
