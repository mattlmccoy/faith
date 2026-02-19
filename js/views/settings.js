/* ============================================================
   ABIDE - Settings View
   ============================================================ */

const SettingsView = (() => {
  function render(container, params = '') {
    Router.setTitle('Settings');
    Router.clearHeaderActions();

    const state = Store.get();
    const tab = new URLSearchParams(params.replace('?', '')).get('tab');

    const div = document.createElement('div');
    div.className = 'view-content tab-switch-enter';

    div.innerHTML = `
      <!-- Profile -->
      <div class="settings-section">
        <div class="settings-section-title">Profile</div>
        <div class="settings-group">
          <div class="settings-row">
            <div class="settings-row__icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            <div class="settings-row__content">
              <div class="settings-row__label">Your Name</div>
              <input
                id="settings-name"
                class="input"
                type="text"
                placeholder="What's your name?"
                value="${state.userName || ''}"
                style="margin-top:8px;"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Appearance -->
      <div class="settings-section">
        <div class="settings-section-title">Appearance</div>
        <div class="settings-group">
          <div class="settings-row">
            <div class="settings-row__icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            </div>
            <div class="settings-row__content">
              <div class="settings-row__label">Theme</div>
            </div>
            <div class="settings-row__action">
              <select id="theme-select" class="input" style="width:auto;padding:6px 12px;">
                <option value="auto" ${state.theme === 'auto' ? 'selected' : ''}>Auto (time-based)</option>
                <option value="light" ${state.theme === 'light' ? 'selected' : ''}>Light</option>
                <option value="dark" ${state.theme === 'dark' ? 'selected' : ''}>Dark</option>
              </select>
            </div>
          </div>
          <div class="settings-row">
            <div class="settings-row__icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            </div>
            <div class="settings-row__content">
              <div class="settings-row__label">Bible Translation</div>
              <div class="settings-row__value">Used for scripture search &amp; passages</div>
            </div>
            <div class="settings-row__action">
              <select id="translation-select" class="input" style="width:auto;padding:6px 12px;">
                <option value="web"   ${(state.bibleTranslation || 'web') === 'web'   ? 'selected' : ''}>WEB – World English Bible</option>
                <option value="asv"   ${state.bibleTranslation === 'asv'   ? 'selected' : ''}>ASV – American Standard Version</option>
                <option value="bbe"   ${state.bibleTranslation === 'bbe'   ? 'selected' : ''}>BBE – Bible in Basic English</option>
                <option value="kjv"   ${state.bibleTranslation === 'kjv'   ? 'selected' : ''}>KJV – King James Version</option>
                <option value="darby" ${state.bibleTranslation === 'darby' ? 'selected' : ''}>Darby Translation</option>
                <option value="esv"   ${state.bibleTranslation === 'esv'   ? 'selected' : ''}>ESV – English Standard Version ⚠️</option>
              </select>
            </div>
          </div>
          <div id="translation-notice" style="display:${state.bibleTranslation === 'esv' ? 'flex' : 'none'};background:var(--color-accent-warm);border-radius:var(--radius-sm);padding:var(--space-3);margin:0 var(--space-1);">
            <div style="display:flex;flex-direction:column;gap:4px;">
              <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);color:var(--color-text-primary);">⚠️ Copyrighted Translation</div>
              <div style="font-size:var(--text-xs);line-height:1.6;color:var(--color-text-secondary);">
                ESV is copyrighted. Passages are displayed for personal devotional use with full attribution.
                ESV® Bible © Crossway. Requires Worker to be deployed.
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Notifications -->
      <div class="settings-section">
        <div class="settings-section-title">Notifications</div>
        <div class="settings-group">
          <div class="settings-row">
            <div class="settings-row__icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            </div>
            <div class="settings-row__content">
              <div class="settings-row__label">Morning &amp; Evening Reminders</div>
              <div class="settings-row__value" id="notif-status-msg">
                ${/iPhone|iPad|iPod/.test(navigator.userAgent) && !window.navigator.standalone
                  ? '📲 Add to Home Screen first — open in Safari → Share → Add to Home Screen'
                  : 'Sends reminders at your chosen times'}
              </div>
            </div>
            <div class="settings-row__action">
              <label class="toggle__switch">
                <input type="checkbox" id="notif-toggle" ${state.notificationsEnabled ? 'checked' : ''} />
                <div class="toggle__track"></div>
              </label>
            </div>
          </div>
          <div class="settings-row">
            <div class="settings-row__icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <div class="settings-row__content">
              <div class="settings-row__label">Morning Reminder</div>
            </div>
            <div class="settings-row__action">
              <input type="time" id="morning-time" class="settings-time-input"
                value="${String(state.morningHour).padStart(2,'0')}:${String(state.morningMinute).padStart(2,'0')}"
              />
            </div>
          </div>
          <div class="settings-row">
            <div class="settings-row__icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            </div>
            <div class="settings-row__content">
              <div class="settings-row__label">Evening Reminder</div>
            </div>
            <div class="settings-row__action">
              <input type="time" id="evening-time" class="settings-time-input"
                value="${String(state.eveningHour).padStart(2,'0')}:${String(state.eveningMinute).padStart(2,'0')}"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Worker / Advanced -->
      <div class="settings-section">
        <div class="settings-section-title">Advanced</div>
        <div class="settings-group">
          <div class="settings-row" style="flex-direction:column;align-items:flex-start;gap:8px;">
            <div style="display:flex;align-items:center;gap:12px;width:100%;">
              <div class="settings-row__icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
              </div>
              <div class="settings-row__content">
                <div class="settings-row__label">Cloudflare Worker</div>
                <div class="settings-row__value">Powers AI devotional search &amp; push notifications</div>
              </div>
            </div>
            <div style="width:100%;padding:var(--space-2) var(--space-3);background:var(--color-surface-sunken);border-radius:var(--radius-sm);">
              <p class="text-xs" style="color:var(--color-text-secondary);line-height:1.6;">
                Default: <code style="font-size:0.7rem;word-break:break-all;">https://abide-worker.mattlmccoy.workers.dev</code>
              </p>
              <p class="text-xs text-muted" style="margin-top:4px;line-height:1.6;">
                The worker is shared — no setup needed. Override below only if self-hosting.
              </p>
            </div>
            <input
              id="worker-url"
              class="input"
              type="url"
              placeholder="Override URL (leave blank to use default)"
              value="${state.workerUrl || ''}"
              style="margin-top:0;"
            />
          </div>
        </div>
      </div>

      <!-- Weekly Plan -->
      <div class="settings-section">
        <div class="settings-section-title">Devotion Content</div>
        <div class="settings-group">
          <div class="settings-row" style="cursor:pointer;" onclick="Router.navigate('/plan')">
            <div class="settings-row__icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </div>
            <div class="settings-row__content">
              <div class="settings-row__label">Build This Week's Plan</div>
              <div class="settings-row__value">Choose a theme and search for devotional content</div>
            </div>
            <div class="settings-row__action">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </div>
          </div>
          <div class="settings-row" style="cursor:pointer;" onclick="PlanView.loadSeedPlan()">
            <div class="settings-row__icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
            </div>
            <div class="settings-row__content">
              <div class="settings-row__label">Load Sample Week</div>
              <div class="settings-row__value">Start with a pre-built week on Grace</div>
            </div>
            <div class="settings-row__action">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </div>
          </div>
        </div>
      </div>

      <!-- App info -->
      <div style="text-align:center;padding:var(--space-6) 0 var(--space-4);">
        <p class="text-xs text-muted">Abide · Personal Daily Devotion</p>
        <p class="text-xs text-muted" style="margin-top:4px;">Scripture: Change translation in Appearance settings above</p>
      </div>

      <!-- Save button -->
      <button class="btn btn-primary btn-full" id="save-settings" style="margin-bottom:var(--space-6);">
        Save Settings
      </button>
    `;

    container.innerHTML = '';
    container.appendChild(div);

    setupSettingsListeners(div);

    // If tab=plan, navigate to plan
    if (tab === 'plan') {
      setTimeout(() => Router.navigate('/plan'), 100);
    }
  }

  function setupSettingsListeners(root) {
    root.querySelector('#save-settings')?.addEventListener('click', () => {
      const name = root.querySelector('#settings-name')?.value?.trim() || '';
      const theme = root.querySelector('#theme-select')?.value || 'auto';
      const bibleTranslation = root.querySelector('#translation-select')?.value || 'web';
      const workerUrl = root.querySelector('#worker-url')?.value?.trim() || '';
      const notifEnabled = root.querySelector('#notif-toggle')?.checked || false;
      const morningTime = root.querySelector('#morning-time')?.value || '06:30';
      const eveningTime = root.querySelector('#evening-time')?.value || '20:00';

      const [mh, mm] = morningTime.split(':').map(Number);
      const [eh, em] = eveningTime.split(':').map(Number);

      Store.update({
        userName: name,
        theme,
        bibleTranslation,
        workerUrl,
        morningHour: mh,
        morningMinute: mm,
        eveningHour: eh,
        eveningMinute: em,
        notificationsEnabled: notifEnabled,
      });

      applyTheme(theme);

      // Handle notification toggle
      // Note: We already saved notificationsEnabled to the store above.
      // We only show a status message here — we do NOT override the saved preference
      // based on whether the push subscription succeeds. This prevents the toggle
      // from appearing to "reset" when the worker isn't reachable.
      if (notifEnabled) {
        Notifications.subscribeToPush().then(sub => {
          const msgEl = root.querySelector('#notif-status-msg');
          if (sub) {
            if (msgEl) msgEl.textContent = '✅ Reminders active!';
          } else {
            // Subscription couldn't complete (worker not deployed, not installed, etc.)
            // Show status info but KEEP the toggle on and preference saved.
            Notifications.getStatusMessage().then(msg => {
              if (msgEl) msgEl.textContent = msg || 'Enable when app is installed to Home Screen';
            });
          }
        }).catch(err => {
          console.warn('Notification setup error (preference still saved):', err);
        });
      } else {
        Notifications.unsubscribe().catch(console.error);
      }

      const btn = root.querySelector('#save-settings');
      if (btn) {
        btn.textContent = 'Saved ✓';
        btn.style.background = 'var(--color-success)';
        setTimeout(() => { if (btn) { btn.textContent = 'Save Settings'; btn.style.background = ''; } }, 2000);
      }
    });

    // Live theme preview
    root.querySelector('#theme-select')?.addEventListener('change', (e) => {
      applyTheme(e.target.value);
    });

    // Show copyright warning for ESV
    root.querySelector('#translation-select')?.addEventListener('change', (e) => {
      const notice = root.querySelector('#translation-notice');
      if (notice) {
        notice.style.display = e.target.value === 'esv' ? 'flex' : 'none';
      }
    });
  }

  function applyTheme(theme) {
    const html = document.documentElement;
    if (theme === 'dark') {
      html.setAttribute('data-theme', 'dark');
    } else if (theme === 'light') {
      html.setAttribute('data-theme', 'light');
    } else {
      // Auto: time-based
      html.setAttribute('data-theme', DateUtils.isDarkModeTime() ? 'dark' : 'light');
    }
  }

  return { render, applyTheme };
})();

window.SettingsView = SettingsView;
