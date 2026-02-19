/* ============================================================
   ABIDE - Scripture Search View
   ============================================================ */

const ScriptureView = (() => {
  let searchTimeout = null;
  let currentRef = '';

  const QUICK_REFS = [
    'Psalm 23', 'John 3:16', 'Romans 8:28', 'Philippians 4:6-7',
    'Isaiah 40:31', 'Jeremiah 29:11', 'Proverbs 3:5-6', 'Matthew 11:28-30',
    'Hebrews 11:1', '1 Corinthians 13', 'Romans 12:1-2', 'Lamentations 3:22-23',
  ];

  function render(container) {
    Router.setTitle('Scripture');
    Router.clearHeaderActions();

    const div = document.createElement('div');
    div.className = 'view-content tab-switch-enter';

    div.innerHTML = `
      <!-- Search bar -->
      <div class="scripture-search-bar">
        <div class="search-input-wrap" style="position:relative;">
          <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            id="scripture-search"
            class="input"
            type="text"
            placeholder="Search... John 3:16, Psalm 23, Romans 8"
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
          />
          <div id="autocomplete-dropdown" class="autocomplete-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:100;"></div>
        </div>
      </div>

      <!-- Passage display -->
      <div id="passage-container"></div>

      <!-- Quick links -->
      <div class="scripture-quick-links" id="quick-links">
        <div class="section-header">
          <span class="section-title">Favorites & Key Passages</span>
        </div>
        <div class="quick-links-grid">
          ${QUICK_REFS.map(ref => `
            <button class="quick-link-btn" onclick="ScriptureView.loadPassage('${ref}')">${ref}</button>
          `).join('')}
        </div>
      </div>
    `;

    container.innerHTML = '';
    container.appendChild(div);

    setupSearch(div);

    // If a ref was loaded before, restore it
    if (currentRef) {
      loadPassage(currentRef);
    }
  }

  function setupSearch(root) {
    const input = root.querySelector('#scripture-search');
    const dropdown = root.querySelector('#autocomplete-dropdown');
    if (!input) return;

    input.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      const q = input.value.trim();
      if (q.length < 2) { hideDropdown(dropdown); return; }

      searchTimeout = setTimeout(() => {
        const suggestions = API.getSuggestions(q);
        renderDropdown(dropdown, suggestions, input);
      }, 120);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        hideDropdown(dropdown);
        const q = input.value.trim();
        if (q) loadPassage(q);
      }
      if (e.key === 'Escape') hideDropdown(dropdown);
    });

    document.addEventListener('click', (e) => {
      if (!root.contains(e.target)) hideDropdown(dropdown);
    }, { once: false });
  }

  function renderDropdown(dropdown, suggestions, input) {
    if (!suggestions.length) { hideDropdown(dropdown); return; }

    dropdown.innerHTML = suggestions.map(s => `
      <div class="autocomplete-item" data-ref="${s.ref}">
        ${highlightMatch(s.label, input.value)}
      </div>
    `).join('');

    dropdown.style.display = 'block';

    dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
      item.addEventListener('click', () => {
        input.value = item.dataset.ref;
        hideDropdown(dropdown);
        loadPassage(item.dataset.ref);
      });
    });
  }

  function hideDropdown(dropdown) {
    if (dropdown) dropdown.style.display = 'none';
  }

  function highlightMatch(label, query) {
    const q = query.trim();
    if (!q) return label;
    const idx = label.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return label;
    return label.slice(0, idx) + `<strong>${label.slice(idx, idx + q.length)}</strong>` + label.slice(idx + q.length);
  }

  async function loadPassage(ref) {
    currentRef = ref;
    const container = document.getElementById('passage-container');
    const quickLinks = document.getElementById('quick-links');
    if (!container) return;

    // Hide quick links, show loading
    if (quickLinks) quickLinks.style.display = 'none';

    container.innerHTML = `
      <div style="padding:32px;text-align:center;">
        <div class="plan-searching__spinner" style="margin:0 auto;"></div>
        <p class="text-muted text-sm" style="margin-top:12px;">Loading ${ref}…</p>
      </div>
    `;

    try {
      const data = await API.getPassage(ref);
      renderPassage(container, data, ref);
    } catch (err) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__title">Couldn't load passage</div>
          <div class="empty-state__description">Try a different reference, like "John 3" or "Psalm 23:1-6".</div>
          <button class="btn btn-secondary btn-sm" onclick="ScriptureView.clearPassage()">Clear</button>
        </div>
      `;
    }
  }

  function renderPassage(container, data, ref) {
    const verses = data.verses || [];
    const reference = data.reference || ref;
    const translation = data.translation_id?.toUpperCase() || API.BIBLE_TRANSLATION;

    // Parse chapter for prev/next nav
    const chMatch = reference.match(/(.+?)\s+(\d+)/);
    const bookName = chMatch?.[1] || '';
    const chapter = parseInt(chMatch?.[2] || '1');

    container.innerHTML = `
      <div class="passage-view">
        <!-- Nav bar -->
        <div class="passage-nav">
          <div>
            <div class="passage-nav__ref">${reference}</div>
            <div class="passage-nav__translation">${translation} · World English Bible</div>
          </div>
          <div class="flex gap-2">
            ${chapter > 1 ? `
            <button class="icon-btn" title="Previous chapter" onclick="ScriptureView.loadPassage('${bookName} ${chapter - 1}')">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            ` : ''}
            <button class="icon-btn" title="Next chapter" onclick="ScriptureView.loadPassage('${bookName} ${chapter + 1}')">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
            <button class="icon-btn" title="Clear" onclick="ScriptureView.clearPassage()">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <!-- Passage text -->
        <div class="passage-text">
          ${verses.length > 0 ? verses.map(v => `
            <span class="passage-verse">
              <sup class="verse-num">${v.verse}</sup>${v.text.trim()}
            </span>
            ${' '}
          `).join('') : `<span class="passage-verse">${data.text || ''}</span>`}
        </div>

        <div style="margin-top:24px;">
          <button class="btn btn-ghost btn-sm" onclick="ScriptureView.clearPassage()">← Search again</button>
        </div>
      </div>
    `;
  }

  function clearPassage() {
    currentRef = '';
    const container = document.getElementById('passage-container');
    const quickLinks = document.getElementById('quick-links');
    if (container) container.innerHTML = '';
    if (quickLinks) quickLinks.style.display = '';
    const input = document.getElementById('scripture-search');
    if (input) { input.value = ''; input.focus(); }
  }

  return { render, loadPassage, clearPassage };
})();

window.ScriptureView = ScriptureView;
