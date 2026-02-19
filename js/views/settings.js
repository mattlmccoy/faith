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
              <div class="settings-row__label">Enable Reminders</div>
              <div class="settings-row__value">Requires app installed on home screen (iOS 16.4+)</div>
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

      <!-- Worker URL -->
      <div class="settings-section">
        <div class="settings-section-title">Advanced</div>
        <div class="settings-group">
          <div class="settings-row" style="flex-direction:column;align-items:flex-start;gap:8px;">
            <div style="display:flex;align-items:center;gap:12px;width:100%;">
              <div class="settings-row__icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
              </div>
              <div class="settings-row__content">
                <div class="settings-row__label">Cloudflare Worker URL</div>
                <div class="settings-row__value">Required for live search + notifications</div>
              </div>
            </div>
            <input
              id="worker-url"
              class="input"
              type="url"
              placeholder="https://abide-worker.username.workers.dev"
              value="${state.workerUrl || ''}"
              style="margin-top:4px;"
            />
            <p class="text-xs text-muted" style="line-height:1.6;padding:0 4px;">
              Deploy the worker from the <code style="background:var(--color-surface-sunken);padding:1px 4px;border-radius:4px;">worker/</code> folder, then paste the URL here. See <code>worker/README.md</code> for instructions.
            </p>
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
        <p class="text-xs text-muted" style="margin-top:4px;">Scripture: World English Bible (Public Domain)</p>
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
      const workerUrl = root.querySelector('#worker-url')?.value?.trim() || '';
      const notifEnabled = root.querySelector('#notif-toggle')?.checked || false;
      const morningTime = root.querySelector('#morning-time')?.value || '06:30';
      const eveningTime = root.querySelector('#evening-time')?.value || '20:00';

      const [mh, mm] = morningTime.split(':').map(Number);
      const [eh, em] = eveningTime.split(':').map(Number);

      Store.update({
        userName: name,
        theme,
        workerUrl,
        morningHour: mh,
        morningMinute: mm,
        eveningHour: eh,
        eveningMinute: em,
        notificationsEnabled: notifEnabled,
      });

      applyTheme(theme);

      // Handle notification toggle
      if (notifEnabled) {
        Notifications.requestPermission().then(granted => {
          if (granted && API.hasWorker()) {
            Notifications.subscribeToPush().catch(console.error);
          }
        });
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
