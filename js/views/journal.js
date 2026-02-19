/* ============================================================
   ABIDE - Journal View
   ============================================================ */

const JournalView = (() => {
  let saveTimeout = null;

  function render(container) {
    Router.setTitle('Journal');
    Router.clearHeaderActions();

    const today = DateUtils.today();
    const devotionData = Store.getTodayDevotionData();
    const existingEntry = Store.getJournalEntry(today);
    const recentEntries = Store.getRecentJournalEntries(5).filter(e => e.date !== today);
    const streak = Store.get('currentStreak');

    // Get prompt from today's devotion or use a fallback
    const prompt = devotionData?.faith_stretch?.journal_prompt || getFallbackPrompt(today);

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
        <div class="journal-entry-card__prompt">${prompt}</div>
        <textarea
          id="journal-textarea"
          class="journal-entry-card__textarea"
          placeholder="Write freely... there's no wrong answer here."
        >${existingEntry?.text || ''}</textarea>
        <div class="journal-entry-card__footer">
          <span class="journal-entry-card__date">${existingEntry?.savedAt ? `Saved ${formatRelative(existingEntry.savedAt)}` : 'Not yet saved'}</span>
          <button class="btn btn-primary btn-sm" id="journal-save-btn" onclick="JournalView.saveEntry()">Save</button>
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
      ${recentEntries.length > 0 ? `
      <div class="journal-past">
        <div class="section-header">
          <span class="section-title">Past Entries</span>
        </div>
        ${recentEntries.map(e => `
          <div class="journal-past-item">
            <div class="journal-past-item__date">${DateUtils.format(e.date)}</div>
            ${e.prompt ? `<div class="journal-past-item__preview" style="color:var(--color-text-muted);font-style:italic;margin-bottom:4px;">${e.prompt.slice(0, 80)}${e.prompt.length > 80 ? '…' : ''}</div>` : ''}
            <div class="journal-past-item__preview">${e.text || '(no entry)'}</div>
          </div>
        `).join('')}
      </div>
      ` : ''}
    `;

    container.innerHTML = '';
    container.appendChild(div);

    // Auto-save on type
    const textarea = div.querySelector('#journal-textarea');
    if (textarea) {
      textarea.addEventListener('input', () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
          autoSave(today, prompt, textarea.value);
        }, 1500);
      });
    }
  }

  function saveEntry() {
    const today = DateUtils.today();
    const devotionData = Store.getTodayDevotionData();
    const prompt = devotionData?.faith_stretch?.journal_prompt || getFallbackPrompt(today);
    const textarea = document.getElementById('journal-textarea');
    const text = textarea?.value || '';
    Store.saveJournalEntry(today, prompt, text);

    const btn = document.getElementById('journal-save-btn');
    if (btn) {
      btn.textContent = 'Saved ✓';
      btn.style.background = 'var(--color-success)';
      setTimeout(() => { if (btn) { btn.textContent = 'Save'; btn.style.background = ''; } }, 2000);
    }

    const dateEl = document.querySelector('.journal-entry-card__date');
    if (dateEl) dateEl.textContent = 'Saved just now';
  }

  function autoSave(dateKey, prompt, text) {
    Store.saveJournalEntry(dateKey, prompt, text);
    const dateEl = document.querySelector('.journal-entry-card__date');
    if (dateEl) dateEl.textContent = 'Auto-saved';
  }

  function usePrompt(prompt) {
    const textarea = document.getElementById('journal-textarea');
    if (textarea) {
      if (textarea.value && textarea.value.trim()) {
        textarea.value += '\n\n' + prompt + '\n';
      } else {
        textarea.value = '';
      }
      textarea.focus();
      // Update the displayed prompt
      const promptEl = document.querySelector('.journal-entry-card__prompt');
      if (promptEl) promptEl.textContent = prompt;
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

  return { render, saveEntry, usePrompt };
})();

window.JournalView = JournalView;
