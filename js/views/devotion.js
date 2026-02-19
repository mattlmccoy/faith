/* ============================================================
   ABIDE - Full Devotion Reader
   ============================================================ */

const DevotionView = (() => {
  let openSavedId = '';
  let syncingLibrary = false;

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
    Router.setTitle('Devotion');
    Router.clearHeaderActions();

    const selectedDate = Store.getSelectedDevotionDate();
    const devotionData = Store.getDevotionData(selectedDate);
    const session = Store.get('_sessionOverride') || DateUtils.session();
    const div = document.createElement('div');
    div.className = 'view-content view-enter';

    if (!devotionData) {
      div.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__title">No devotion for today</div>
          <div class="empty-state__description">Build this week's plan to get started.</div>
          <button class="btn btn-primary" onclick="Router.navigate('/settings')">Build Plan</button>
        </div>
        ${renderSavedLibrarySection()}
      `;
      container.innerHTML = '';
      container.appendChild(div);
      return;
    }

    const sessionData = devotionData[session];
    if (!sessionData) {
      div.innerHTML = `<p class="text-secondary" style="padding:20px;">No ${session} devotion available.</p>`;
      container.innerHTML = '';
      container.appendChild(div);
      return;
    }
    const dayKeys = Store.getPlanDayKeys();
    const dayIndex = Math.max(0, dayKeys.indexOf(selectedDate));
    const hasPrev = dayIndex > 0;
    const hasNext = dayIndex < dayKeys.length - 1;
    const isSaved = Store.isSavedDevotion(selectedDate, session);
    const sourceList = devotionData.sources?.filter(s => s.approved)?.length
      ? devotionData.sources.filter(s => s.approved)
      : (sessionData.inspired_by || []).map(name => ({ pastor: name, note: 'Pastoral influence', approved: true }));

    div.innerHTML = `
      <!-- Session toggle at top -->
      <div style="margin-bottom: 20px;">
        <div class="session-toggle">
          <button class="session-toggle__btn ${session === 'morning' ? 'session-toggle__btn--active' : ''}" data-session="morning">
            ☀️ Morning
          </button>
          <button class="session-toggle__btn ${session === 'evening' ? 'session-toggle__btn--active' : ''}" data-session="evening">
            🌙 Evening
          </button>
        </div>
      </div>

      <div style="margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <button class="btn btn-secondary btn-sm" ${hasPrev ? '' : 'disabled'} onclick="DevotionView.shiftDay(-1)">← Previous</button>
        <div class="text-sm text-secondary">Day ${dayIndex + 1} of ${dayKeys.length || 7}</div>
        <button class="btn btn-secondary btn-sm" ${hasNext ? '' : 'disabled'} onclick="DevotionView.shiftDay(1)">Next →</button>
      </div>

      <!-- Header -->
      <div class="devotion-header">
        <div class="devotion-meta">
          <span class="badge badge-${session === 'morning' ? 'morning' : 'evening'}">${session === 'morning' ? '☀️ Morning' : '🌙 Evening'}</span>
          <span class="text-sm text-muted">${DateUtils.format(selectedDate)}</span>
        </div>
        ${devotionData.theme ? `<p class="text-sm text-brand font-medium" style="margin-bottom:8px;">${devotionData.theme}</p>` : ''}
        <h1 class="devotion-title">${sessionData.opening_verse?.reference || sessionData.title || 'Today\'s Devotion'}</h1>
      </div>

      <!-- Opening verse -->
      ${sessionData.opening_verse ? `
      <div style="margin-bottom:28px;">
        <div class="scripture-card scripture-card--${session}" data-opening-verse>
          <div class="scripture-card__text" data-opening-text>${sessionData.opening_verse.text || ''}</div>
          <div class="scripture-card__reference" data-opening-ref>${sessionData.opening_verse.reference || ''}</div>
          <div class="scripture-card__translation" data-opening-translation>${API.translationLabel(Store.get('bibleTranslation') || 'web')}</div>
        </div>
      </div>
      ` : ''}

      <!-- Devotion body -->
      <div class="devotion-body">
        ${renderBody(sessionData.body || [])}
      </div>

      <div class="divider"></div>

      <!-- Reflection prompts -->
      ${sessionData.reflection_prompts?.length ? `
      <div class="devotion-reflection">
        <div class="devotion-reflection-title">Questions for Reflection</div>
        <div class="devotion-prompts-list">
          ${sessionData.reflection_prompts.map((p, i) => `
            <div class="prompt-card">
              <div class="prompt-card__number">${i + 1}</div>
              <div class="prompt-card__text">${p}</div>
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}

      <!-- Prayer -->
      ${sessionData.prayer ? `
      <div class="devotion-prayer">
        <div class="prayer-card">
          <div class="prayer-card__label">A Prayer</div>
          <div class="prayer-card__text">${sessionData.prayer}</div>
        </div>
      </div>
      ` : ''}

      <!-- Midday prompt (morning only) -->
      ${session === 'morning' && sessionData.midday_prompt ? `
      <div class="midday-banner" style="margin-bottom:24px;">
        <div class="midday-banner__icon">⏰</div>
        <div class="midday-banner__content">
          <div class="midday-banner__title">Midday Check-in</div>
          <div class="midday-banner__text">${sessionData.midday_prompt}</div>
        </div>
      </div>
      ` : ''}

      <!-- Lectio Divina (evening) -->
      ${session === 'evening' && sessionData.lectio_divina ? `
      <div class="devotion-lectio">
        <div class="devotion-reflection-title">Lectio Divina — ${sessionData.lectio_divina.passage || ''}</div>
        <p class="text-secondary text-sm" style="margin-bottom:16px;line-height:1.6;">
          An ancient practice of sacred reading. Move through each step slowly and without hurry.
        </p>
        ${sessionData.lectio_divina.steps.map(s => `
          <div class="lectio-step">
            <div class="lectio-step__name">${s.name}</div>
            <div class="lectio-step__instruction">${s.instruction}</div>
          </div>
        `).join('')}
      </div>
      ` : ''}

      <!-- Faith Stretch -->
      ${devotionData.faith_stretch ? `
      <div style="margin-bottom:24px;">
        <div class="section-header">
          <span class="section-title">Faith Stretch</span>
        </div>
        <div class="stretch-card">
          <div class="stretch-card__label">Today's Challenge</div>
          <div class="stretch-card__title">${devotionData.faith_stretch.title}</div>
          <div class="stretch-card__description">${devotionData.faith_stretch.description}</div>
        </div>
      </div>

      ${devotionData.faith_stretch.journal_prompt ? `
      <div style="margin-bottom:24px;">
        <button class="btn btn-secondary btn-full" onclick="Router.navigate('/journal')">
          Open Journal →
        </button>
      </div>
      ` : ''}
      ` : ''}

      <!-- Sources -->
      ${sourceList.length ? `
      <div class="divider-text">Sources</div>
      ${sourceList.map(s => `
        <div class="text-xs text-muted" style="margin-bottom:4px;">
          ${s.pastor ? `<strong>${s.pastor}</strong> — ` : ''}
          ${s.url
            ? `<a href="${s.url}" target="_blank" rel="noopener" style="color:var(--color-primary);">${s.url}</a>`
            : (s.note || 'Referenced influence')}
        </div>
      `).join('')}
      ` : ''}

      <div style="margin:24px 0;">
        <button class="btn ${isSaved ? 'btn-primary' : 'btn-secondary'} btn-full" id="save-devotion-btn" onclick="DevotionView.toggleSave()">
          ${isSaved ? 'Saved ✓' : 'Save This Devotion'}
        </button>
      </div>

      ${renderSavedLibrarySection()}
    `;

    // Session toggle
    div.querySelectorAll('.session-toggle__btn').forEach(btn => {
      btn.addEventListener('click', () => {
        Store.set('_sessionOverride', btn.dataset.session);
        render(container);
      });
    });

    container.innerHTML = '';
    container.appendChild(div);
    hydrateScripture(div, sessionData, selectedDate);
  }

  function renderSavedLibrarySection() {
    const saved = Store.getSavedDevotionLibrary();
    const googleConnected = !!Store.get('googleProfile');
    const openEntry = openSavedId ? Store.getSavedDevotionById(openSavedId) : null;

    return `
      <div class="section-header" style="margin-top:10px;">
        <span class="section-title">Saved Devotionals</span>
        <div style="display:flex;gap:8px;align-items:center;">
          ${syncingLibrary ? `<span class="text-xs text-secondary">Refreshing...</span>` : ''}
          ${googleConnected ? `<button class="btn btn-ghost btn-sm" onclick="DevotionView.syncLibrary()">Refresh from Drive</button>` : ''}
        </div>
      </div>
      ${saved.length ? `
      <div class="devotion-library-list">
        ${saved.map((item) => {
          const isOpen = item.id === openSavedId;
          const title = item.title || item.openingVerse?.reference || 'Saved devotion';
          const when = `${DateUtils.format(item.dateKey || DateUtils.today(), 'short')} · ${item.session || ''}`;
          return `
            <div class="devotion-library-item">
              <div class="devotion-library-item__meta">${escapeHtml(when)}</div>
              <div class="devotion-library-item__title">${escapeHtml(title)}</div>
              ${item.theme ? `<div class="devotion-library-item__theme">${escapeHtml(item.theme)}</div>` : ''}
              <div style="margin-top:10px;">
                <button class="btn btn-secondary btn-sm" onclick="DevotionView.openSaved('${escapeAttr(item.id)}')">${isOpen ? 'Hide' : 'Open'}</button>
              </div>
              ${isOpen ? renderSavedDetail(openEntry || item) : ''}
            </div>
          `;
        }).join('')}
      </div>
      ` : `<div class="text-sm text-secondary" style="margin-bottom:20px;">No saved devotionals yet.</div>`}
    `;
  }

  function renderSavedDetail(entry) {
    if (!entry) return '';
    const devotionData = entry.devotionData || {};
    const sessionData = devotionData[entry.session] || {};
    const body = Array.isArray(sessionData.body) ? sessionData.body : [];
    const prompts = Array.isArray(sessionData.reflection_prompts) ? sessionData.reflection_prompts : (entry.reflectionPrompts || []);
    return `
      <div class="devotion-library-detail">
        ${sessionData.opening_verse?.text || entry.openingVerse?.text ? `
          <div class="scripture-card scripture-card--${entry.session === 'evening' ? 'evening' : 'morning'}" style="margin-top:10px;">
            <div class="scripture-card__text">${escapeHtml(sessionData.opening_verse?.text || entry.openingVerse?.text || '')}</div>
            <div class="scripture-card__reference">${escapeHtml(sessionData.opening_verse?.reference || entry.openingVerse?.reference || '')}</div>
          </div>
        ` : ''}
        ${body.length ? `<div class="devotion-body" style="margin-top:12px;">${renderBody(body)}</div>` : ''}
        ${prompts.length ? `
          <div class="devotion-reflection" style="margin-top:12px;">
            <div class="devotion-reflection-title">Questions</div>
            <div class="devotion-prompts-list">
              ${prompts.map((p, i) => `
                <div class="prompt-card">
                  <div class="prompt-card__number">${i + 1}</div>
                  <div class="prompt-card__text">${escapeHtml(p)}</div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
        ${(sessionData.prayer || entry.prayer) ? `
          <div class="prayer-card" style="margin-top:12px;">
            <div class="prayer-card__label">A Prayer</div>
            <div class="prayer-card__text">${escapeHtml(sessionData.prayer || entry.prayer || '')}</div>
          </div>
        ` : ''}
      </div>
    `;
  }

  function renderBody(body) {
    return body.map(block => {
      if (block.type === 'paragraph') {
        return `<p class="devotion-paragraph">${block.content}</p>`;
      }
      if (block.type === 'scripture_block') {
        return `
          <div class="devotion-scripture-block" data-scripture-block data-ref="${block.reference || ''}">
            <div class="devotion-scripture-block__text" data-scripture-text>"${block.text || ''}"</div>
            ${block.reference ? `<div class="devotion-scripture-block__ref" data-scripture-ref>— ${block.reference}</div>` : ''}
          </div>
        `;
      }
      if (block.type === 'heading') {
        return `<h3 class="text-xl font-serif" style="margin-bottom:12px;">${block.content}</h3>`;
      }
      return '';
    }).join('');
  }

  async function hydrateScripture(root, sessionData, selectedDate) {
    try {
      const openingRef = sessionData?.opening_verse?.reference;
      if (openingRef) {
        const opening = await API.getPassage(openingRef);
        if (Store.getSelectedDevotionDate() !== selectedDate) return;
        const text = (opening.text || '').trim();
        const translation = API.translationLabel(opening.translation_id || Store.get('bibleTranslation'));
        const textEl = root.querySelector('[data-opening-text]');
        const translationEl = root.querySelector('[data-opening-translation]');
        if (textEl && text) textEl.textContent = text;
        if (translationEl) translationEl.textContent = translation;
      }

      const blocks = Array.from(root.querySelectorAll('[data-scripture-block][data-ref]'));
      for (const blockEl of blocks) {
        const ref = blockEl.getAttribute('data-ref');
        if (!ref) continue;
        const passage = await API.getPassage(ref);
        if (Store.getSelectedDevotionDate() !== selectedDate) return;
        const textEl = blockEl.querySelector('[data-scripture-text]');
        const refEl = blockEl.querySelector('[data-scripture-ref]');
        if (textEl && passage.text) textEl.textContent = `"${passage.text.trim()}"`;
        if (refEl) refEl.textContent = `— ${ref}`;
      }
    } catch (err) {
      console.warn('Could not hydrate devotion scripture:', err);
    }
  }

  function toggleSave() {
    const date = Store.getSelectedDevotionDate();
    const session = Store.get('_sessionOverride') || DateUtils.session();
    const saved = Store.toggleSavedDevotion(date, session);
    const btn = document.getElementById('save-devotion-btn');
    if (btn) {
      btn.className = `btn ${saved ? 'btn-primary' : 'btn-secondary'} btn-full`;
      btn.textContent = saved ? 'Saved ✓' : 'Save This Devotion';
    }
  }

  function shiftDay(offset) {
    Store.shiftSelectedDevotionDay(offset);
    render(document.getElementById('view-container'));
  }

  function openSaved(id) {
    openSavedId = openSavedId === id ? '' : id;
    render(document.getElementById('view-container'));
  }

  async function syncLibrary() {
    if (syncingLibrary) return;
    syncingLibrary = true;
    render(document.getElementById('view-container'));
    try {
      await Sync.pullSavedDevotions();
    } catch (err) {
      alert(`Drive refresh failed: ${err.message}`);
    } finally {
      syncingLibrary = false;
      render(document.getElementById('view-container'));
    }
  }

  return { render, toggleSave, shiftDay, openSaved, syncLibrary };
})();

window.DevotionView = DevotionView;
