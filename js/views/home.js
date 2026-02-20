/* ============================================================
   ABIDE - Home View (Today's Devotion)
   ============================================================ */

const HomeView = (() => {
  let currentSession = DateUtils.session();
  let googlePanelExpanded = false;
  let _tourActive = false;

  function render(container) {
    Router.setTitle('Abide');
    const profile = Store.get('googleProfile');
    Router.setHeaderActions(renderHeaderActions(profile));

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

    // Auto tutorial only after today's content is actually present.
    const hasTodayContent = !!(devotionData && (devotionData.morning || devotionData.evening));
    if (!Store.get('tutorialSeen') && !_tourActive && hasTodayContent) {
      _tourActive = true;
      setTimeout(() => showTutorialWalkthrough(container), 200);
    }
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
        <div class="session-toggle" id="home-session-toggle">
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
      if (!googlePanelExpanded) return '';
      const avatar = profile.picture
        ? `<img src="${profile.picture}" alt="Google avatar" class="google-avatar" />`
        : `<div class="google-avatar google-avatar--fallback">${(profile.name || profile.email || 'U').slice(0,1).toUpperCase()}</div>`;
      const displayName = profile.name || profile.email || 'Google account';
      return `
        <div class="google-panel-wrap card-enter">
          <div class="google-panel">
            <div class="google-panel__left">
              ${avatar}
              <div class="google-panel__meta">
                <div class="google-panel__title">${displayName}</div>
                <div class="google-panel__email">Google Drive sync</div>
              </div>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="HomeView.toggleGooglePanel()">Close</button>
          </div>
          <div class="google-panel__actions">
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
      googlePanelExpanded = true;
      render(document.getElementById('view-container'));
    } catch (err) {
      alert(`Google sign-in failed: ${err.message}`);
    }
  }

  function toggleGooglePanel() {
    googlePanelExpanded = !googlePanelExpanded;
    render(document.getElementById('view-container'));
  }

  function renderHeaderActions(profile) {
    const hasGoogle = !!(profile?.email || profile?.name);
    const avatar = hasGoogle
      ? (profile.picture
        ? `<img src="${profile.picture}" alt="Google account" class="header-google-avatar" />`
        : `<span class="header-google-avatar header-google-avatar--fallback">${(profile.name || profile.email || 'U').slice(0,1).toUpperCase()}</span>`)
      : `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9"></circle>
          <path d="M8 12h8"></path>
        </svg>
      `;

    const googleAction = hasGoogle
      ? `
      <button class="icon-btn" id="home-google-btn" title="Google Sync" onclick="HomeView.toggleGooglePanel()" aria-label="Google Sync">
        ${avatar}
      </button>
      `
      : `
      <button class="icon-btn" id="home-google-btn" title="Connect Google" onclick="HomeView.connectGoogle()" aria-label="Connect Google">
        ${avatar}
      </button>
      `;

    return `
      ${googleAction}
      <button class="icon-btn" id="home-build-btn" title="Build This Week" onclick="Router.navigate('/plan')" aria-label="Build This Week">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>
    `;
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

  function showTutorialWalkthrough(container) {
    const STEPS = [
      {
        route: '/', selector: '[data-tab="home"]', calloutPos: 'above', highlightPadding: 8,
        title: 'Start On Today',
        body: "The Today tab is your home base for daily devotion, scripture, and reflection.",
      },
      {
        route: '/', selector: '#home-build-btn', calloutPos: 'below', highlightPadding: 10,
        title: 'Build A Weekly Plan',
        body: "Tap + to generate a fresh 7-day plan. You can rebuild anytime with a new topic.",
      },
      {
        route: '/plan', selector: '#pastor-chips', calloutPos: 'below', highlightPadding: 10,
        title: 'Trusted Pastor Influence',
        body: "These teachers shape the generated devotional tone and references. Manage this list in Settings.",
      },
      {
        route: '/plan', selector: '.plan-dictation-row', calloutPos: 'below', highlightPadding: 10,
        title: 'Enter Your Topic',
        body: "Pick a suggested topic or type your own. You can also use the mic button to dictate your topic.",
      },
      {
        route: '/plan', selector: '#build-btn', calloutPos: 'above', highlightPadding: 10,
        title: 'Generate The Week',
        body: "Tap Build to generate a full week of morning and evening content. When done, return to Today to read each day.",
      },
      {
        route: '/', selector: '#home-google-btn', calloutPos: 'below', highlightPadding: 10,
        title: 'Google Drive Sync',
        body: "Connect Google to back up devotions, journals, and settings to your Drive so you can restore them on another device.",
      },
      {
        route: '/', selector: '#home-session-toggle', calloutPos: 'below', highlightPadding: 10,
        title: 'Morning & Evening Sessions',
        body: "Switch between your morning and evening devotion here.",
      },
      {
        route: '/scripture', selector: '[data-tab="scripture"]', calloutPos: 'above', highlightPadding: 8,
        title: 'Scripture Search',
        body: 'Use Scripture to search verses by reference or topic and change translations in Settings.',
      },
      {
        route: '/prayer', selector: '[data-tab="prayer"]', calloutPos: 'above', highlightPadding: 8,
        title: 'Guided Prayer',
        body: "Use Prayer to walk through structured prayer frameworks and stay consistent when you don't know where to start.",
      },
      {
        route: '/journal', selector: '[data-tab="journal"]', calloutPos: 'above', highlightPadding: 8,
        title: 'Personal Journal',
        body: "Capture responses to prompts and your own reflections. Journal history can be synced with Google Drive when connected.",
      },
      {
        route: '/settings', selector: '#settings-appearance-section', calloutPos: 'below', highlightPadding: 10,
        title: 'Appearance & Translation',
        body: "Choose your color palette and app theme. You can also pick Bible translation: WEB is public-domain default; ESV is available for personal devotional use.",
      },
      {
        route: '/settings', selector: '#settings-notifications-section', calloutPos: 'below', highlightPadding: 10,
        title: 'Daily Reminders',
        body: "Enable notifications for morning/evening reminders and Sunday plan prompts. iOS will ask for permission when you save.",
      },
      {
        route: '/settings', selector: '#settings-pastors-section', calloutPos: 'below', highlightPadding: 10,
        title: 'Your Trusted Pastors',
        body: "Enable or disable teachers whose theological style shapes your AI devotions. You can add anyone — the plan builder draws only from whoever is active here.",
      },
    ];

    let stepIndex = 0;

    // Spotlight div — box-shadow trick dims everything outside the highlighted rect
    const highlightEl = document.createElement('div');
    highlightEl.className = 'tour-highlight';
    document.body.appendChild(highlightEl);

    // Interaction blocker (prevents accidental taps on underlying UI)
    const blockerEl = document.createElement('div');
    blockerEl.className = 'tour-blocker';
    blockerEl.addEventListener('click', (e) => e.preventDefault());
    blockerEl.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    document.body.appendChild(blockerEl);

    // Callout tooltip div
    const calloutEl = document.createElement('div');
    calloutEl.className = 'tour-callout';
    document.body.appendChild(calloutEl);

    function goToStep(index) {
      if (index >= STEPS.length) { dismissTour(); return; }
      stepIndex = index;
      const step = STEPS[index];
      const prevStep = index > 0 ? STEPS[index - 1] : null;
      const needsNav = !prevStep || prevStep.route !== step.route;

      // Hide callout/highlight while navigating
      calloutEl.classList.remove('tour-callout--visible');
      highlightEl.classList.remove('tour-highlight--visible');

      function showStep() {
        const target = findTarget(step.selector);
        if (!target) {
          // Skip missing targets (prevents blank/odd states on dynamic views)
          goToStep(stepIndex + 1);
          return;
        }
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => positionCoachMark(step, target), 300);
      }

      if (needsNav) {
        Router.navigate(step.route);
        setTimeout(showStep, 450);
      } else {
        setTimeout(showStep, 80);
      }
    }

    function findTarget(selector) {
      const scoped = Array.from(document.querySelectorAll(`#view-container ${selector}`))
        .filter(el => !el.closest('.view-exit'));
      if (scoped.length) return scoped[scoped.length - 1];
      return document.querySelector(selector);
    }

    function positionCoachMark(step, target) {
      const pad = step.highlightPadding || 8;
      const CALLOUT_WIDTH = Math.min(300, window.innerWidth - 24);

      if (target) {
        const rect = target.getBoundingClientRect();
        // Position spotlight
        highlightEl.style.left   = (rect.left - pad) + 'px';
        highlightEl.style.top    = (rect.top - pad) + 'px';
        highlightEl.style.width  = (rect.width + pad * 2) + 'px';
        highlightEl.style.height = (rect.height + pad * 2) + 'px';
        highlightEl.classList.add('tour-highlight--visible');

        // Build callout HTML
        const isLast = stepIndex === STEPS.length - 1;
        calloutEl.className = 'tour-callout'; // reset modifier classes
        calloutEl.innerHTML = `
          <button class="tour-callout__skip" aria-label="Skip tutorial">Skip</button>
          <p class="tour-callout__step">${stepIndex + 1} of ${STEPS.length}</p>
          <h3 class="tour-callout__title">${step.title}</h3>
          <p class="tour-callout__body">${step.body}</p>
          <div class="tour-callout__dots">
            ${STEPS.map((_, i) => `<span class="tour-callout__dot${i === stepIndex ? ' active' : ''}"></span>`).join('')}
          </div>
          <div class="tour-callout__actions">
            <button class="btn btn-secondary tour-callout__back" ${stepIndex === 0 ? 'disabled' : ''}>
              ← Back
            </button>
            <button class="btn btn-primary tour-callout__next">
              ${isLast ? 'Done ✓' : 'Next →'}
            </button>
          </div>
        `;

        // Horizontal: centred on target, clamped to viewport edges
        let left = rect.left + rect.width / 2 - CALLOUT_WIDTH / 2;
        left = Math.max(12, Math.min(left, window.innerWidth - CALLOUT_WIDTH - 12));

        calloutEl.style.width  = CALLOUT_WIDTH + 'px';
        calloutEl.style.left   = left + 'px';
        calloutEl.style.removeProperty('top');
        calloutEl.style.removeProperty('bottom');

        if (step.calloutPos === 'above') {
          calloutEl.style.bottom = (window.innerHeight - rect.top + pad + 8) + 'px';
        } else {
          calloutEl.style.top = (rect.bottom + pad + 8) + 'px';
        }
      } else {
        // No target found — show centered callout with no spotlight
        highlightEl.classList.remove('tour-highlight--visible');

        const isLast = stepIndex === STEPS.length - 1;
        calloutEl.className = 'tour-callout tour-callout--centered';
        calloutEl.innerHTML = `
          <button class="tour-callout__skip" aria-label="Skip tutorial">Skip</button>
          <p class="tour-callout__step">${stepIndex + 1} of ${STEPS.length}</p>
          <h3 class="tour-callout__title">${step.title}</h3>
          <p class="tour-callout__body">${step.body}</p>
          <div class="tour-callout__dots">
            ${STEPS.map((_, i) => `<span class="tour-callout__dot${i === stepIndex ? ' active' : ''}"></span>`).join('')}
          </div>
          <div class="tour-callout__actions">
            <button class="btn btn-secondary tour-callout__back" ${stepIndex === 0 ? 'disabled' : ''}>
              ← Back
            </button>
            <button class="btn btn-primary tour-callout__next">
              ${isLast ? 'Done ✓' : 'Next →'}
            </button>
          </div>
        `;

        calloutEl.style.removeProperty('left');
        calloutEl.style.removeProperty('top');
        calloutEl.style.removeProperty('bottom');
        calloutEl.style.width = CALLOUT_WIDTH + 'px';
      }

      requestAnimationFrame(() => calloutEl.classList.add('tour-callout--visible'));

      calloutEl.querySelector('.tour-callout__skip').addEventListener('click', dismissTour);
      calloutEl.querySelector('.tour-callout__back')?.addEventListener('click', () => {
        if (stepIndex > 0) goToStep(stepIndex - 1);
      });
      calloutEl.querySelector('.tour-callout__next').addEventListener('click', () => goToStep(stepIndex + 1));
    }

    function dismissTour() {
      _tourActive = false;
      Store.set('tutorialSeen', true);
      highlightEl.classList.remove('tour-highlight--visible');
      calloutEl.classList.remove('tour-callout--visible');
      setTimeout(() => {
        highlightEl.remove();
        blockerEl.remove();
        calloutEl.remove();
        Router.navigate('/');
        setTimeout(() => {
          const vc = document.getElementById('view-container');
          if (vc) render(vc);
        }, 350);
      }, 240);
    }

    // Kick off from step 0
    goToStep(0);
  }

  return { render, toggleComplete, toggleSave, shiftDay, connectGoogle, syncSavedNow, syncDownloadNow, toggleGooglePanel };
})();

// Global collapsible toggle helper
function toggleCollapsible(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('open');
}

window.HomeView = HomeView;
