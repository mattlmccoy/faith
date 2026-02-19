/* ============================================================
   ABIDE - Saved Devotionals Library
   ============================================================ */

const SavedView = (() => {
  let openSavedId = '';
  let syncing = false;

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
    Router.setTitle('Saved Devotionals');
    Router.clearHeaderActions();

    const saved = Store.getSavedDevotionLibrary();
    const googleConnected = !!Store.get('googleProfile');
    const openEntry = openSavedId ? Store.getSavedDevotionById(openSavedId) : null;

    const div = document.createElement('div');
    div.className = 'view-content view-enter';
    div.innerHTML = `
      <div class="section-header">
        <span class="section-title">Saved Devotionals (${saved.length})</span>
        <div style="display:flex;gap:8px;align-items:center;">
          ${syncing ? `<span class="text-xs text-secondary">Syncing...</span>` : ''}
          ${googleConnected ? `<button class="btn btn-ghost btn-sm" onclick="SavedView.download()">Download</button>` : ''}
          ${googleConnected ? `<button class="btn btn-ghost btn-sm" onclick="SavedView.upload()">Upload</button>` : ''}
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
              <div style="display:flex;gap:8px;margin-top:10px;">
                <button class="btn btn-secondary btn-sm" onclick="SavedView.openSaved('${escapeAttr(item.id)}')">${isOpen ? 'Hide' : 'Open'}</button>
                <button class="btn btn-secondary btn-sm" onclick="SavedView.goToDay('${escapeAttr(item.dateKey)}','${escapeAttr(item.session || 'morning')}')">Go to day</button>
              </div>
              ${isOpen ? renderSavedDetail(openEntry || item) : ''}
            </div>
          `;
        }).join('')}
      </div>
      ` : `<div class="text-sm text-secondary">No saved devotionals yet. Save one from Today, then upload to Drive.</div>`}
    `;

    container.innerHTML = '';
    container.appendChild(div);
  }

  function renderSavedDetail(entry) {
    if (!entry) return '';
    const devotionData = entry.devotionData || {};
    const sessionData = devotionData[entry.session] || {};
    const prompts = Array.isArray(sessionData.reflection_prompts) ? sessionData.reflection_prompts : (entry.reflectionPrompts || []);
    const fallbackBody = Array.isArray(entry.body) ? entry.body : [];
    const body = Array.isArray(sessionData.body) && sessionData.body.length ? sessionData.body : fallbackBody;
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
    return body.map((block) => {
      if (block.type === 'paragraph') {
        return `<p class="devotion-paragraph">${escapeHtml(block.content || '')}</p>`;
      }
      if (block.type === 'scripture_block') {
        return `
          <div class="devotion-scripture-block">
            <div class="devotion-scripture-block__text">"${escapeHtml(block.text || '')}"</div>
            ${block.reference ? `<div class="devotion-scripture-block__ref">— ${escapeHtml(block.reference)}</div>` : ''}
          </div>
        `;
      }
      if (block.type === 'heading') {
        return `<h3 class="text-xl font-serif" style="margin-bottom:12px;">${escapeHtml(block.content || '')}</h3>`;
      }
      return '';
    }).join('');
  }

  function openSaved(id) {
    openSavedId = openSavedId === id ? '' : id;
    render(document.getElementById('view-container'));
  }

  function goToDay(dateKey, session) {
    if (dateKey) Store.setSelectedDevotionDate(dateKey);
    Store.set('_sessionOverride', session || 'morning');
    Router.navigate('/');
  }

  async function upload() {
    if (syncing) return;
    syncing = true;
    render(document.getElementById('view-container'));
    try {
      const result = await Sync.pushSavedDevotions();
      alert(`Uploaded ${result.count || 0} saved devotionals and journal entries.`);
    } catch (err) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      syncing = false;
      render(document.getElementById('view-container'));
    }
  }

  async function download() {
    if (syncing) return;
    syncing = true;
    render(document.getElementById('view-container'));
    try {
      const result = await Sync.pullSavedDevotions();
      if (!result.imported) {
        alert('No synced Drive file found yet.');
        return;
      }
      alert(`Downloaded ${result.importedLibrary || 0} saved devotionals and ${result.importedJournal || 0} journal entries.`);
    } catch (err) {
      alert(`Download failed: ${err.message}`);
    } finally {
      syncing = false;
      render(document.getElementById('view-container'));
    }
  }

  return { render, openSaved, goToDay, upload, download };
})();

window.SavedView = SavedView;
