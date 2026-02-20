/* ============================================================
   ABIDE - Home View (Today's Devotion)
   ============================================================ */

const HomeView = (() => {
  let currentSession = DateUtils.session();

  function render(container) {
    Router.setTitle('Abide');
    Router.setHeaderActions(`
      <button class="icon-btn" title="Build This Week" onclick="Router.navigate('/plan')" aria-label="Build This Week">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>
    `);

    currentSession = Store.get('_sessionOverride') || DateUtils.session();

    const selectedDate = Store.getSelectedDevotionDate();
    const devotionData = Store.getDevotionData(selectedDate);
    const userName = Store.get('userName');
    if (!devotionData && !Store.get('onboardingDone')) {
      renderSetup(container, userName);
      return;
    }

    const div = document.createElement('div');
    div.className = 'view-content tab-switch-enter';

    if (devotionData) {
      renderDevotion(div, devotionData, userName, selectedDate);
    } else {
      renderNoPlan(div, selectedDate);
    }

    container.innerHTML = '';
    container.appendChild(div);

    // Update streak
    Store.updateStreak();
  }

  function renderSetup(container, userName) {
    const div = document.createElement('div');
    div.className = 'view-content tab-switch-enter';
    div.innerHTML = `
      <div class="setup-prompt">
        <div class="setup-prompt__cross">
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
            <rect x="27" y="5" width="10" height="54" rx="5" fill="currentColor"/>
            <rect x="5" y="22" width="54" height="10" rx="5" fill="currentColor"/>
          </svg>
        </div>
        <h1 class="setup-prompt__title">Welcome to Abide</h1>
        <p class="setup-prompt__subtitle">A place to meet with God every morning and evening.</p>
        ${!userName ? `
        <div style="width:100%;max-width:300px;">
          <input id="setup-name" class="input" type="text" placeholder="What's your name?" autocomplete="given-name" style="margin-bottom:12px;text-align:center;" />
        </div>
        ` : ''}
        <button class="btn btn-primary" id="setup-start">
          Build Your First Week
        </button>
        <p class="text-sm text-secondary" style="max-width:260px;line-height:1.6;">
          Pick a theme for this week. We'll search for devotional content from trusted pastors and build your week automatically.
        </p>
      </div>
    `;

    container.innerHTML = '';
    container.appendChild(div);

    document.getElementById('setup-start')?.addEventListener('click', () => {
      const nameInput = document.getElementById('setup-name');
      if (nameInput && nameInput.value.trim()) {
        Store.set('userName', nameInput.value.trim());
      }
      Store.set('onboardingDone', true);
      Router.navigate('/plan');
    });
  }

  function renderNoPlan(div, selectedDate) {
    const googleCard = renderGooglePanel();
    div.innerHTML = `
      ${googleCard}
      <div class="empty-state">
        <div class="empty-state__icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          </svg>
        </div>
        <h2 class="empty-state__title">No devotion for today</h2>
        <p class="empty-state__description">No devotion found for ${DateUtils.format(selectedDate)}. Build this week's plan to start your daily devotions.</p>
        <button class="btn btn-primary" onclick="Router.navigate('/plan')">Build This Week's Plan</button>
        <button class="btn btn-secondary" style="margin-top:10px;" onclick="Router.navigate('/saved')">View Saved Devotionals</button>
      </div>
    `;
  }

  function renderDevotion(div, data, userName, selectedDate) {
    const session = currentSession;
    const sessionData = data[session];
    if (!sessionData) { renderNoPlan(div, selectedDate); return; }

    const isCompleted = Store.isCompleted(selectedDate, session);
    const isSaved = Store.isSavedDevotion(selectedDate, session);
    const dayKeys = Store.getPlanDayKeys();
    const dayIndex = Math.max(0, dayKeys.indexOf(selectedDate));
    const hasPrev = dayIndex > 0;
    const hasNext = dayIndex < dayKeys.length - 1;
    const googleCard = renderGooglePanel();

    div.innerHTML = `
      ${googleCard}
      <!-- Greeting -->
      <div class="home-greeting card-enter">
        <div class="home-greeting__time">${DateUtils.format(selectedDate)}</div>
        <h2 class="home-greeting__name">${DateUtils.greeting(userName)}</h2>
      </div>

      <div class="home-session-toggle card-enter" style="margin-top:10px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <button class="btn btn-secondary btn-sm" ${hasPrev ? '' : 'disabled'} onclick="HomeView.shiftDay(-1)">← Previous</button>
          <div class="text-sm text-secondary">Day ${dayIndex + 1} of ${dayKeys.length || 7}</div>
          <button class="btn btn-secondary btn-sm" ${hasNext ? '' : 'disabled'} onclick="HomeView.shiftDay(1)">Next →</button>
        </div>
      </div>

      <!-- Date + series -->
      <div class="home-date-row card-enter" style="margin-top:6px;margin-bottom:20px;">
        ${data.theme ? `<span class="home-series">${data.theme}</span>` : ''}
        ${renderStreak()}
      </div>

      <!-- Session toggle -->
      <div class="home-session-toggle card-enter">
        <div class="session-toggle">
          <button class="session-toggle__btn ${session === 'morning' ? 'session-toggle__btn--active' : ''}" data-session="morning">
            ☀️ Morning
          </button>
          <button class="session-toggle__btn ${session === 'evening' ? 'session-toggle__btn--active' : ''}" data-session="evening">
            🌙 Evening
          </button>
        </div>
      </div>

      <!-- Key Verse -->
      <div class="home-verse card-enter">
        ${renderVerseCard(sessionData.opening_verse, session, selectedDate)}
      </div>

      <!-- Scripture splash -->
      <div class="home-devotion-excerpt card-enter">
        ${renderScriptureSplash(sessionData)}
      </div>

      <!-- Reflection prompts -->
      ${sessionData.reflection_prompts?.length ? `
      <div class="home-prompts card-enter">
        <div class="section-header">
          <span class="section-title">Reflect</span>
        </div>
        ${sessionData.reflection_prompts.slice(0, 3).map((p, i) => `
          <div class="prompt-card">
            <div class="prompt-card__number">${i + 1}</div>
            <div class="prompt-card__text">${p}</div>
          </div>
        `).join('')}
      </div>
      ` : ''}

      <!-- Midday prompt (morning only) -->
      ${session === 'morning' && sessionData.midday_prompt ? `
      <div class="home-midday card-enter">
        <div class="midday-banner">
          <div class="midday-banner__icon">⏰</div>
          <div class="midday-banner__content">
            <div class="midday-banner__title">Midday Check-in</div>
            <div class="midday-banner__text">${sessionData.midday_prompt}</div>
          </div>
        </div>
      </div>
      ` : ''}

      <!-- Prayer of the day -->
      ${sessionData.prayer ? `
      <div class="home-prayer card-enter">
        <div class="collapsible" id="prayer-collapsible">
          <button class="collapsible__trigger" onclick="toggleCollapsible('prayer-collapsible')">
            <span class="collapsible__trigger-text">Prayer of the Day</span>
            <svg class="collapsible__chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
          <div class="collapsible__content">
            <div class="prayer-card">
              <div class="prayer-card__label">A Prayer</div>
              <div class="prayer-card__text">${sessionData.prayer}</div>
            </div>
          </div>
        </div>
      </div>
      ` : ''}

      <!-- Lectio Divina (evening) -->
      ${session === 'evening' && sessionData.lectio_divina ? `
      <div class="card-enter">
        <div class="collapsible" id="lectio-collapsible">
          <button class="collapsible__trigger" onclick="toggleCollapsible('lectio-collapsible')">
            <span class="collapsible__trigger-text">Lectio Divina — ${sessionData.lectio_divina.passage || ''}</span>
            <svg class="collapsible__chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
          <div class="collapsible__content">
            ${sessionData.lectio_divina.steps.map(s => `
              <div class="lectio-step">
                <div class="lectio-step__name">${s.name}</div>
                <div class="lectio-step__instruction">${s.instruction}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
      ` : ''}

      <!-- Faith Stretch -->
      ${data.faith_stretch ? `
      <div class="home-stretch card-enter">
        <div class="section-header">
          <span class="section-title">Faith Stretch</span>
        </div>
        <div class="stretch-card">
          <div class="stretch-card__label">Today's Challenge</div>
          <div class="stretch-card__title">${data.faith_stretch.title}</div>
          <div class="stretch-card__description">${data.faith_stretch.description}</div>
        </div>
      </div>
      ` : ''}

      <!-- Actions -->
      <div class="home-actions card-enter">
        <button class="btn btn-secondary" style="flex:1;" onclick="Router.navigate('/devotion')">
          Read Full Devotion
        </button>
        <button class="btn ${isSaved ? 'btn-primary' : 'btn-secondary'}" style="flex:1;" id="save-devotion-btn" onclick="HomeView.toggleSave()">
          ${isSaved ? 'Saved ✓' : 'Save Devotion'}
        </button>
      </div>

      <!-- Complete button -->
      <div class="home-complete-row card-enter">
        <button class="complete-btn ${isCompleted ? 'completed' : ''}" id="complete-btn" onclick="HomeView.toggleComplete()">
          ${isCompleted ? `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            Completed
          ` : `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>
            Mark as Done
          `}
        </button>
      </div>

      <div class="home-complete-row card-enter" style="margin-top:12px;">
        <button class="btn btn-secondary btn-full" onclick="Router.navigate('/saved')">
          View Saved Devotionals
        </button>
      </div>
    `;

    // Session toggle listeners
    div.querySelectorAll('.session-toggle__btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const s = btn.dataset.session;
        currentSession = s;
        Store.set('_sessionOverride', s);
        render(document.getElementById('view-container'));
      });
    });

    hydrateOpeningVerse(div, sessionData, selectedDate);
  }

  function renderVerseCard(verse, session, selectedDate) {
    if (!verse) return '';
    const selectedTranslation = API.translationLabel(Store.get('bibleTranslation') || 'web');
    return `
      <div class="scripture-card scripture-card--${session}" data-opening-verse data-date="${selectedDate}">
        <div class="scripture-card__text" data-opening-text>${verse.text || ''}</div>
        <div class="scripture-card__reference" data-opening-ref>${verse.reference || ''}</div>
        <div class="scripture-card__translation" data-opening-translation>${selectedTranslation}</div>
      </div>
    `;
  }

  function renderScriptureSplash(sessionData) {
    const verse = sessionData.opening_verse || {};
    if (!verse.reference && !verse.text) return '';
    const text = verse.text || '';

    return `
      <div class="section-header">
        <span class="section-title">Scripture Splash</span>
        <button class="section-action" onclick="Router.navigate('/devotion')">Read all →</button>
      </div>
      <p class="home-devotion-text" data-splash-scripture>${text}</p>
      <p class="text-xs text-secondary" data-splash-reference>${verse.reference || ''}</p>
    `;
  }

  function renderStreak() {
    const streak = Store.get('currentStreak');
    if (!streak || streak < 2) return '';
    return `
      <div class="streak-badge heartbeat">
        <span class="streak-badge__flame">🔥</span>
        <span class="streak-badge__count">${streak}</span>
        <span class="streak-badge__label">day streak</span>
      </div>
    `;
  }

  function renderGooglePanel() {
    const profile = Store.get('googleProfile');
    if (profile?.email || profile?.name) {
      const avatar = profile.picture
        ? `<img src="${profile.picture}" alt="Google avatar" class="google-avatar" />`
        : `<div class="google-avatar google-avatar--fallback">${(profile.name || profile.email || 'U').slice(0,1).toUpperCase()}</div>`;
      return `
        <div class="google-panel card-enter">
          <div class="google-panel__left">
            ${avatar}
            <div class="google-panel__meta">
              <div class="google-panel__title">Google connected</div>
              <div class="google-panel__email">${profile.name || profile.email || ''}</div>
            </div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <button class="btn btn-ghost btn-sm" onclick="HomeView.syncDownloadNow()">Download</button>
            <button class="btn btn-ghost btn-sm" onclick="HomeView.syncSavedNow()">Upload</button>
          </div>
        </div>
      `;
    }
    return `
      <div class="google-panel card-enter">
        <div class="google-panel__meta">
          <div class="google-panel__title">Sign in with Google</div>
          <div class="google-panel__email">Sync saved devotions across devices.</div>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="HomeView.connectGoogle()">Connect</button>
      </div>
    `;
  }

  async function connectGoogle() {
    try {
      await Sync.connectGoogle();
      render(document.getElementById('view-container'));
    } catch (err) {
      alert(`Google sign-in failed: ${err.message}`);
    }
  }

  async function syncSavedNow() {
    try {
      const result = await Sync.pushSavedDevotions();
      alert(`Uploaded ${result.count || 0} saved devotionals, ${result.journals || 0} journal entries, and settings metadata to Google Drive.`);
    } catch (err) {
      alert(`Upload failed: ${err.message}`);
    }
  }

  async function syncDownloadNow() {
    try {
      const result = await Sync.pullSavedDevotions();
      if (!result.imported) {
        alert('No synced Drive file found yet.');
        return;
      }
      alert(`Downloaded ${result.importedLibrary || 0} saved devotionals, ${result.importedJournal || 0} journal entries, and settings metadata.`);
    } catch (err) {
      alert(`Download failed: ${err.message}`);
    }
  }

  function toggleComplete() {
    const selectedDate = Store.getSelectedDevotionDate();
    const session = currentSession;
    const isNow = Store.isCompleted(selectedDate, session);
    if (!isNow) {
      Store.markCompleted(selectedDate, session);
      const btn = document.getElementById('complete-btn');
      if (btn) {
        btn.classList.add('completed');
        btn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          Completed
        `;
      }
    }
  }

  function toggleSave() {
    const selectedDate = Store.getSelectedDevotionDate();
    const saved = Store.toggleSavedDevotion(selectedDate, currentSession);
    const btn = document.getElementById('save-devotion-btn');
    if (btn) {
      btn.className = `btn ${saved ? 'btn-primary' : 'btn-secondary'}`;
      btn.textContent = saved ? 'Saved ✓' : 'Save Devotion';
    }
  }

  function shiftDay(offset) {
    const next = Store.shiftSelectedDevotionDay(offset);
    if (!next) return;
    render(document.getElementById('view-container'));
  }

  async function hydrateOpeningVerse(root, sessionData, selectedDate) {
    const ref = sessionData?.opening_verse?.reference;
    if (!ref) return;
    const selectedRef = Store.getSelectedDevotionDate();
    if (selectedRef !== selectedDate) return;

    try {
      const data = await API.getPassage(ref);
      if (Store.getSelectedDevotionDate() !== selectedDate) return;
      const text = (data.text || '').trim();
      const translation = API.translationLabel(data.translation_id || Store.get('bibleTranslation'));
      const textEl = root.querySelector('[data-opening-text]');
      const refEl = root.querySelector('[data-opening-ref]');
      const translationEl = root.querySelector('[data-opening-translation]');
      const splashText = root.querySelector('[data-splash-scripture]');
      const splashRef = root.querySelector('[data-splash-reference]');
      if (textEl && text) textEl.textContent = text;
      if (refEl) refEl.textContent = ref;
      if (translationEl) translationEl.textContent = translation;
      if (splashText && text) splashText.textContent = text;
      if (splashRef) splashRef.textContent = ref;
    } catch (err) {
      console.warn('Could not hydrate opening verse:', err);
    }
  }

  return { render, toggleComplete, toggleSave, shiftDay, connectGoogle, syncSavedNow, syncDownloadNow };
})();

// Global collapsible toggle helper
function toggleCollapsible(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('open');
}

window.HomeView = HomeView;
