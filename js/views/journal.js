/* ============================================================
   ABIDE - Journal View
   ============================================================ */

const JournalView = (() => {
  let saveTimeout = null;
  let openPastDate = '';
  let syncingHistory = false;
  let currentPrompt = '';

  function escapeHtml(text = '') {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(text = '') {
    return escapeHtml(text).replace(/"/g, '&quot;');
  }

  function render(container) {
    Router.setTitle('Journal');
    Router.clearHeaderActions();

    const today = DateUtils.today();
    const devotionData = Store.getTodayDevotionData();
    const existingEntry = Store.getJournalEntry(today);
    const pastEntries = Store.getAllJournalEntries().filter(e => e.date !== today);
    const streak = Store.get('currentStreak');
    const googleConnected = !!Store.get('googleProfile');

    // Get prompt from today's devotion or use a fallback
    currentPrompt = existingEntry?.prompt || devotionData?.faith_stretch?.journal_prompt || getFallbackPrompt(today);

    const div = document.createElement('div');
    div.className = 'view-content tab-switch-enter';

    div.innerHTML = `
      <!-- Streak -->
      ${streak >= 2 ? `
      <div class="journal-streak-row">
        <div class="streak-badge heartbeat">
          <span class="streak-badge__flame">🔥</span>
          <span class="streak-badge__count">${streak}</span>
          <span class="streak-badge__label">day streak</span>
        </div>
      </div>
      ` : ''}

      <!-- Today's entry -->
      <div class="section-header">
        <span class="section-title">Today — ${DateUtils.format(today, 'short')}</span>
      </div>
      <div class="journal-entry-card">
        <div class="journal-entry-card__prompt">${currentPrompt}</div>
        <textarea
          id="journal-textarea"
          class="journal-entry-card__textarea"
          placeholder="Write freely... there's no wrong answer here."
        >${existingEntry?.text || ''}</textarea>
        <div class="journal-entry-card__footer">
          <span class="journal-entry-card__date">${existingEntry?.savedAt ? `Saved ${formatRelative(existingEntry.savedAt)}` : 'Not yet saved'}</span>
          <div style="display:flex;gap:8px;align-items:center;">
            <button class="btn btn-secondary btn-sm" onclick="JournalView.deleteEntry('${escapeAttr(today)}')">Delete</button>
            <button class="btn btn-primary btn-sm" id="journal-save-btn" onclick="JournalView.saveEntry()">Save</button>
          </div>
        </div>
      </div>

      <!-- Faith Stretch for today -->
      ${devotionData?.faith_stretch ? `
      <div class="section-header" style="margin-top:8px;">
        <span class="section-title">Today's Challenge</span>
      </div>
      <div class="stretch-card" style="margin-bottom:24px;">
        <div class="stretch-card__label">Faith Stretch</div>
        <div class="stretch-card__title">${devotionData.faith_stretch.title}</div>
        <div class="stretch-card__description">${devotionData.faith_stretch.description}</div>
      </div>
      ` : ''}

      <!-- More prompts to spark reflection -->
      <div class="section-header">
        <span class="section-title">More to Explore</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:28px;">
        ${getExtraPrompts(today).map((p, i) => `
          <button class="prompt-card" style="text-align:left;cursor:pointer;width:100%;" onclick="JournalView.usePrompt('${p.replace(/'/g, "\\'")}')">
            <div class="prompt-card__number">${i + 2}</div>
            <div class="prompt-card__text">${p}</div>
          </button>
        `).join('')}
      </div>

      <!-- Past entries -->
      <div class="journal-past">
        <div class="section-header">
          <span class="section-title">Past Entries ${pastEntries.length ? `(${pastEntries.length})` : ''}</span>
          <div style="display:flex;gap:8px;align-items:center;">
            ${syncingHistory ? `<span class="text-xs text-secondary">Refreshing...</span>` : ''}
            ${googleConnected ? `<button class="btn btn-ghost btn-sm" onclick="JournalView.downloadHistory()">Download</button>` : ''}
            ${googleConnected ? `<button class="btn btn-ghost btn-sm" onclick="JournalView.uploadHistory()">Upload</button>` : ''}
          </div>
        </div>
        ${pastEntries.length ? pastEntries.map(e => {
          const isOpen = openPastDate === e.date;
          return `
          <div class="journal-past-item">
            <div class="journal-past-item__date">${DateUtils.format(e.date)}</div>
            ${e.prompt ? `<div class="journal-past-item__preview" style="color:var(--color-text-muted);font-style:italic;margin-bottom:4px;">${escapeHtml(isOpen ? e.prompt : `${e.prompt.slice(0, 80)}${e.prompt.length > 80 ? '…' : ''}`)}</div>` : ''}
            <div class="journal-past-item__preview ${isOpen ? 'journal-past-item__preview--open' : ''}">${escapeHtml(e.text || '(no entry)')}</div>
            <div style="margin-top:10px;">
              <button class="btn btn-secondary btn-sm" onclick="JournalView.togglePast('${escapeAttr(e.date)}')">${isOpen ? 'Collapse' : 'Open'}</button>
              <button class="btn btn-secondary btn-sm" style="margin-left:8px;" onclick="JournalView.deleteEntry('${escapeAttr(e.date)}')">Delete</button>
            </div>
          </div>
        `;
        }).join('') : `
          <div class="empty-state" style="padding: var(--space-8) var(--space-5);">
            <div class="empty-state__icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
            </div>
            <p class="empty-state__title">No past entries yet</p>
            <p class="empty-state__description">Your reflections will appear here as you write each day.</p>
          </div>`}
      </div>
    `;

    container.innerHTML = '';
    container.appendChild(div);

    // Auto-save on type
    const textarea = div.querySelector('#journal-textarea');
    if (textarea) {
      textarea.addEventListener('input', () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
          autoSave(today, textarea.value);
        }, 1500);
      });
    }
  }

  function saveEntry() {
    const today = DateUtils.today();
    const prompt = currentPrompt || getFallbackPrompt(today);
    const textarea = document.getElementById('journal-textarea');
    const text = textarea?.value || '';
    Store.saveJournalEntry(today, prompt, text);
    haptic([8]);

    const btn = document.getElementById('journal-save-btn');
    if (btn) {
      btn.textContent = 'Saved ✓';
      btn.style.background = 'var(--color-success)';
      setTimeout(() => { if (btn) { btn.textContent = 'Save'; btn.style.background = ''; } }, 2000);
    }

    const dateEl = document.querySelector('.journal-entry-card__date');
    if (dateEl) dateEl.textContent = 'Saved just now';
  }

  function autoSave(dateKey, text) {
    Store.saveJournalEntry(dateKey, currentPrompt || getFallbackPrompt(dateKey), text);
    const dateEl = document.querySelector('.journal-entry-card__date');
    if (dateEl) dateEl.textContent = 'Auto-saved';
  }

  function usePrompt(prompt) {
    const textarea = document.getElementById('journal-textarea');
    if (textarea) {
      if (textarea.value && textarea.value.trim()) {
        textarea.value += '\n\n' + prompt + '\n';
      } else {
        textarea.value = `${prompt}\n\n`;
      }
      textarea.focus();
      // Update the displayed prompt
      const promptEl = document.querySelector('.journal-entry-card__prompt');
      if (promptEl) promptEl.textContent = prompt;
      currentPrompt = prompt;
    }
  }

  function getFallbackPrompt(dateKey) {
    const prompts = [
      'Where did you sense God\'s presence today, even faintly?',
      'What is one thing you\'re grateful for that you almost took for granted this week?',
      'What is God teaching you in this season that you didn\'t expect?',
      'Where are you currently resisting what God might be asking of you?',
      'Who in your life needs prayer right now, and why do you think God has put them on your heart?',
      'Describe a moment in the last week when you felt closest to God. What was happening?',
      'What lie have you been tempted to believe about God or yourself lately?',
      'What would it look like to trust God more completely in the area of your life you most want to control?',
      'How have you seen God\'s faithfulness in your life over the last year?',
      'What does rest look like for you, and are you actually resting?',
      'Where is your faith being stretched right now, and how are you responding?',
      'What is one step of obedience you\'ve been putting off? What\'s stopping you?',
    ];
    // Rotate based on day of year
    const d = new Date(dateKey.replace(/-/g, '/'));
    const dayOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
    return prompts[dayOfYear % prompts.length];
  }

  function getExtraPrompts(dateKey) {
    const all = [
      'What is God teaching you in this season that you didn\'t expect?',
      'Where are you currently resisting what God might be asking of you?',
      'Who in your life needs prayer right now? Why do you think God has put them on your heart?',
      'What would it look like to trust God more completely in the area of your life you most want to control?',
      'What lie have you been tempted to believe about God or yourself lately?',
      'How have you seen God\'s faithfulness in your life over the last year?',
      'What is one step of obedience you\'ve been putting off? What\'s stopping you?',
      'Describe a moment in the last week when you felt closest to God. What was happening?',
    ];
    const d = new Date(dateKey.replace(/-/g, '/'));
    const dayOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
    // Return 3 prompts, offset from the primary one
    return [0, 1, 2].map(i => all[(dayOfYear + 1 + i) % all.length]);
  }

  function formatRelative(iso) {
    const now = new Date();
    const then = new Date(iso);
    const diff = Math.floor((now - then) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return DateUtils.format(DateUtils.toKey(then), 'short');
  }

  function togglePast(dateKey) {
    openPastDate = openPastDate === dateKey ? '' : dateKey;
    render(document.getElementById('view-container'));
  }

  async function uploadHistory() {
    if (syncingHistory) return;
    syncingHistory = true;
    render(document.getElementById('view-container'));
    try {
      const result = await Sync.pushSavedDevotions();
      alert(`Uploaded ${result.count || 0} saved devotionals, ${result.journals || 0} journal entries, and settings metadata.`);
    } catch (err) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      syncingHistory = false;
      render(document.getElementById('view-container'));
    }
  }

  async function downloadHistory() {
    if (syncingHistory) return;
    syncingHistory = true;
    render(document.getElementById('view-container'));
    try {
      const result = await Sync.pullSavedDevotions();
      if (!result.imported) {
        alert('No synced Drive file found yet.');
        return;
      }
      alert(`Downloaded ${result.importedLibrary || 0} saved devotionals, ${result.importedJournal || 0} journal entries, and settings metadata.`);
    } catch (err) {
      alert(`Download failed: ${err.message}`);
    } finally {
      syncingHistory = false;
      render(document.getElementById('view-container'));
    }
  }

  async function askDeleteScope(label = 'entry') {
    const googleConnected = !!Store.get('googleProfile');
    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.className = 'abide-delete-dialog-backdrop';
      backdrop.innerHTML = `
        <div class="abide-delete-dialog" role="dialog" aria-modal="true" aria-label="Delete journal ${escapeAttr(label)}">
          <div class="abide-delete-dialog__title">Delete journal ${escapeHtml(label)}?</div>
          <div class="abide-delete-dialog__body">
            Choose where to remove this journal entry.
          </div>
          <div class="abide-delete-dialog__actions">
            <button class="btn btn-secondary btn-sm" data-delete-action="cancel">Cancel</button>
            <button class="btn btn-secondary btn-sm" data-delete-action="local">Delete locally</button>
            ${googleConnected ? `<button class="btn btn-primary btn-sm" data-delete-action="global">Delete locally &amp; from Drive</button>` : ''}
          </div>
        </div>
      `;

      function close(result = '') {
        backdrop.remove();
        resolve(result);
      }

      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) close('');
      });
      backdrop.querySelector('[data-delete-action="cancel"]')?.addEventListener('click', () => close(''));
      backdrop.querySelector('[data-delete-action="local"]')?.addEventListener('click', () => close('local'));
      backdrop.querySelector('[data-delete-action="global"]')?.addEventListener('click', () => close('global'));

      document.body.appendChild(backdrop);
    });
  }

  async function deleteEntry(dateKey) {
    const key = String(dateKey || '').trim();
    if (!key) return;
    const scope = await askDeleteScope('entry');
    if (!scope) return;
    const result = Store.deleteJournalEntry(key);
    if (!result.removed) {
      alert('Could not delete that journal entry.');
      return;
    }
    try {
      if (scope === 'global') {
        await Sync.pushSavedDevotions();
      }
    } catch (err) {
      alert(`Deleted locally, but Drive sync failed: ${err.message}`);
    }
    if (openPastDate === key) openPastDate = '';
    render(document.getElementById('view-container'));
  }

  return { render, saveEntry, usePrompt, togglePast, uploadHistory, downloadHistory, deleteEntry };
})();

window.JournalView = JournalView;
