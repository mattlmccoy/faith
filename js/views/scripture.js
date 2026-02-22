/* ============================================================
   ABIDE - Scripture Search View
   Supports: book/chapter/verse autocomplete + keyword phrase search
   ============================================================ */

const ScriptureView = (() => {
  let searchTimeout = null;
  let currentRef = '';
  let searchMode = 'reference'; // 'reference' | 'phrase'
  let activePhraseContext = null; // { phrase, refs, aiWhy, usedAI, aiLabel }

  const QUICK_REFS = [
    'Psalm 23', 'John 3:16', 'Romans 8:28', 'Philippians 4:6-7',
    'Isaiah 40:31', 'Jeremiah 29:11', 'Proverbs 3:5-6', 'Matthew 11:28-30',
    'Hebrews 11:1', '1 Corinthians 13', 'Romans 12:1-2', 'Lamentations 3:22-23',
  ];

  // Keyword → passage map for offline phrase search fallback
  // Each entry: { ref, preview } — keywords are matched loosely
  const KEYWORD_PASSAGES = [
    { keywords: ['fear', 'afraid', 'anxiety', 'worried', 'worry'],
      refs: ['Isaiah 41:10', 'Psalm 23:4', 'Joshua 1:9', 'Philippians 4:6-7', '2 Timothy 1:7'] },
    { keywords: ['love', 'loved', 'loving'],
      refs: ['John 3:16', '1 John 4:8', 'Romans 8:38-39', '1 Corinthians 13:4-7', 'John 15:13'] },
    { keywords: ['hope', 'hopeless', 'despair'],
      refs: ['Romans 15:13', 'Jeremiah 29:11', 'Lamentations 3:22-23', 'Isaiah 40:31', 'Psalm 42:11'] },
    { keywords: ['strength', 'strong', 'weak', 'tired', 'weary', 'exhausted'],
      refs: ['Isaiah 40:29-31', 'Philippians 4:13', '2 Corinthians 12:9', 'Psalm 46:1', 'Matthew 11:28-30'] },
    { keywords: ['peace', 'calm', 'anxious', 'rest'],
      refs: ['John 14:27', 'Philippians 4:6-7', 'Matthew 11:28-30', 'Psalm 46:10', 'Isaiah 26:3'] },
    { keywords: ['forgiveness', 'forgive', 'guilt', 'shame', 'sin'],
      refs: ['1 John 1:9', 'Psalm 103:12', 'Romans 8:1', 'Micah 7:19', 'Isaiah 43:25'] },
    { keywords: ['faith', 'trust', 'doubt', 'believe'],
      refs: ['Hebrews 11:1', 'Proverbs 3:5-6', 'Mark 9:24', 'Romans 10:17', 'James 1:6'] },
    { keywords: ['prayer', 'pray', 'ask', 'seek'],
      refs: ['Matthew 6:9-13', 'James 5:16', 'Philippians 4:6-7', 'Psalm 27:7-8', '1 Thessalonians 5:17'] },
    { keywords: ['grace', 'mercy', 'compassion'],
      refs: ['Ephesians 2:8-9', 'Titus 2:11', 'Lamentations 3:22-23', 'Hebrews 4:16', '2 Corinthians 12:9'] },
    { keywords: ['purpose', 'calling', 'will', 'plan'],
      refs: ['Jeremiah 29:11', 'Romans 8:28', 'Ephesians 2:10', 'Proverbs 16:9', 'Isaiah 46:10'] },
    { keywords: ['joy', 'happiness', 'rejoice', 'delight'],
      refs: ['Psalm 16:11', 'John 15:11', 'Nehemiah 8:10', 'Philippians 4:4', 'James 1:2-3'] },
    { keywords: ['suffering', 'pain', 'trial', 'hardship', 'struggle'],
      refs: ['Romans 8:18', 'James 1:2-4', '2 Corinthians 4:17', '1 Peter 4:12-13', 'Psalm 34:18'] },
    { keywords: ['loneliness', 'lonely', 'alone', 'abandoned'],
      refs: ['Psalm 34:18', 'Deuteronomy 31:8', 'Hebrews 13:5', 'Matthew 28:20', 'Isaiah 43:2'] },
    { keywords: ['salvation', 'saved', 'eternal life', 'heaven'],
      refs: ['Romans 10:9-10', 'John 3:16', 'Ephesians 2:8-9', 'Acts 4:12', 'John 14:6'] },
    { keywords: ['wisdom', 'understanding', 'knowledge', 'discernment'],
      refs: ['James 1:5', 'Proverbs 2:6', 'Proverbs 9:10', 'Colossians 2:3', 'Psalm 111:10'] },
    { keywords: ['anger', 'rage', 'temper', 'frustrated'],
      refs: ['James 1:19-20', 'Ephesians 4:26-27', 'Proverbs 15:1', 'Psalm 37:8', 'Colossians 3:8'] },
    { keywords: ['money', 'wealth', 'greed', 'contentment', 'generous'],
      refs: ['Matthew 6:24', '1 Timothy 6:6-8', 'Philippians 4:11-12', 'Proverbs 11:28', 'Luke 12:15'] },
    { keywords: ['marriage', 'spouse', 'husband', 'wife', 'relationship'],
      refs: ['Ephesians 5:25', '1 Corinthians 13:4-7', 'Proverbs 31:10', 'Genesis 2:24', 'Colossians 3:19'] },
    { keywords: ['courage', 'brave', 'boldness'],
      refs: ['Joshua 1:9', 'Psalm 27:1', 'Acts 4:29', '2 Timothy 1:7', 'Deuteronomy 31:6'] },
    { keywords: ['identity', 'worth', 'value', 'self'],
      refs: ['Psalm 139:14', 'Ephesians 1:4-5', 'Genesis 1:27', 'Romans 8:17', '1 Peter 2:9'] },
  ];

  // Copyright attribution strings for each translation
  const TRANSLATION_ATTRIBUTION = {
    esv: 'ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved.',
    niv: 'Holy Bible, New International Version®, NIV® © 1973, 1978, 1984, 2011 by Biblica, Inc.™ Used by permission. All rights reserved worldwide.',
    kjv: 'King James Version (KJV). Public Domain.',
    web: 'World English Bible (WEB). Public Domain.',
    net: 'NET Bible® © 1996–2017 by Biblical Studies Press. Used by permission. All rights reserved.',
    asv: 'American Standard Version (ASV, 1901). Public Domain.',
    bbe: 'Bible in Basic English (BBE). Public Domain.',
    darby: 'Darby Translation (1890). Public Domain.',
  };

  function render(container) {
    Router.setTitle('Scripture');
    Router.clearHeaderActions();

    const div = document.createElement('div');
    div.className = 'view-content tab-switch-enter';

    div.innerHTML = `
      <!-- Search bar -->
      <div class="scripture-search-bar">
        <!-- Mode toggle -->
        <div style="display:flex;gap:8px;margin-bottom:10px;">
          <button id="mode-ref" class="btn btn-sm ${searchMode === 'reference' ? 'btn-primary' : 'btn-secondary'}" style="flex:1;font-size:var(--text-sm);">
            📖 Book / Chapter
          </button>
          <button id="mode-phrase" class="btn btn-sm ${searchMode === 'phrase' ? 'btn-primary' : 'btn-secondary'}" style="flex:1;font-size:var(--text-sm);">
            🔍 Topic / Phrase
          </button>
        </div>
        <div class="search-input-wrap" style="position:relative;">
          <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            id="scripture-search"
            class="input"
            type="text"
            placeholder="${searchMode === 'reference' ? 'John 3:16, Psalm 23, Romans 8…' : 'faith, fear not, peace, love…'}"
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
          />
          <div id="autocomplete-dropdown" class="autocomplete-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:100;"></div>
        </div>
      </div>

      <!-- Passage / phrase results display -->
      <div id="passage-container"></div>

      <!-- Quick links -->
      <div class="scripture-quick-links" id="quick-links">
        <div class="section-header">
          <span class="section-title">Key Passages</span>
        </div>
        <div class="quick-links-grid">
          ${QUICK_REFS.map(ref => `
            <button class="quick-link-btn" onclick="ScriptureView.loadPassage('${ref}')">${ref}</button>
          `).join('')}
        </div>
        <div class="section-header" style="margin-top:var(--space-4);">
          <span class="section-title">Topics</span>
        </div>
        <div class="quick-links-grid">
          ${['Fear', 'Hope', 'Peace', 'Love', 'Strength', 'Forgiveness', 'Faith', 'Joy', 'Wisdom', 'Identity'].map(t => `
            <button class="quick-link-btn" onclick="ScriptureView.searchPhrase('${t}')" style="background:var(--color-accent-warm);color:var(--color-text-secondary);">${t}</button>
          `).join('')}
        </div>
      </div>
    `;

    container.innerHTML = '';
    container.appendChild(div);

    setupModeToggle(div);
    setupSearch(div);

    if (currentRef) {
      loadPassage(currentRef);
    }
  }

  function setupModeToggle(root) {
    root.querySelector('#mode-ref')?.addEventListener('click', () => {
      searchMode = 'reference';
      root.querySelector('#mode-ref').className = 'btn btn-sm btn-primary';
      root.querySelector('#mode-phrase').className = 'btn btn-sm btn-secondary';
      const input = root.querySelector('#scripture-search');
      if (input) { input.placeholder = 'John 3:16, Psalm 23, Romans 8…'; input.value = ''; input.focus(); }
      hideDropdown(root.querySelector('#autocomplete-dropdown'));
    });

    root.querySelector('#mode-phrase')?.addEventListener('click', () => {
      searchMode = 'phrase';
      root.querySelector('#mode-phrase').className = 'btn btn-sm btn-primary';
      root.querySelector('#mode-ref').className = 'btn btn-sm btn-secondary';
      const input = root.querySelector('#scripture-search');
      if (input) { input.placeholder = 'faith, fear not, peace, love…'; input.value = ''; input.focus(); }
      hideDropdown(root.querySelector('#autocomplete-dropdown'));
    });
  }

  function setupSearch(root) {
    const input = root.querySelector('#scripture-search');
    const dropdown = root.querySelector('#autocomplete-dropdown');
    if (!input) return;

    input.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      const q = input.value.trim();
      if (q.length < 2) { hideDropdown(dropdown); return; }

      if (searchMode === 'reference') {
        searchTimeout = setTimeout(() => {
          const suggestions = API.getSuggestions(q);
          renderDropdown(dropdown, suggestions, input);
        }, 120);
      } else {
        // Phrase mode: show matching topic suggestions
        searchTimeout = setTimeout(() => {
          const suggestions = getPhraseSuggestions(q);
          renderPhraseSuggestions(dropdown, suggestions, input);
        }, 150);
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        hideDropdown(dropdown);
        const q = input.value.trim();
        if (!q) return;
        if (searchMode === 'reference') {
          loadPassage(q);
        } else {
          searchPhrase(q);
        }
      }
      if (e.key === 'Escape') hideDropdown(dropdown);
    });

    document.addEventListener('click', (e) => {
      if (!root.contains(e.target)) hideDropdown(dropdown);
    }, { once: false });
  }

  // --- Reference autocomplete ---

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

  // --- Phrase / topic search ---

  function getPhraseSuggestions(query) {
    const q = query.toLowerCase();
    const results = [];
    for (const entry of KEYWORD_PASSAGES) {
      if (entry.keywords.some(k => k.includes(q) || q.includes(k))) {
        results.push(...entry.keywords.slice(0, 2));
      }
    }
    // Also just pass the query itself
    if (!results.includes(q)) results.unshift(query);
    return [...new Set(results)].slice(0, 6).map(r => ({ label: r, phrase: r }));
  }

  function renderPhraseSuggestions(dropdown, suggestions, input) {
    if (!suggestions.length) { hideDropdown(dropdown); return; }

    dropdown.innerHTML = suggestions.map(s => `
      <div class="autocomplete-item" data-phrase="${s.phrase}" style="display:flex;align-items:center;gap:8px;">
        <span style="color:var(--color-text-muted);font-size:var(--text-sm);">🔍</span>
        ${highlightMatch(s.label, input.value)}
      </div>
    `).join('');

    dropdown.style.display = 'block';

    dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
      item.addEventListener('click', () => {
        input.value = item.dataset.phrase;
        hideDropdown(dropdown);
        searchPhrase(item.dataset.phrase);
      });
    });
  }

  async function searchPhrase(phrase) {
    searchMode = 'phrase';
    const input = document.getElementById('scripture-search');
    if (input) input.value = phrase;

    const container = document.getElementById('passage-container');
    const quickLinks = document.getElementById('quick-links');
    if (!container) return;

    if (quickLinks) quickLinks.style.display = 'none';

    // Show loading state
    container.innerHTML = `
      <div style="padding:32px;text-align:center;">
        <div class="plan-searching__spinner" style="margin:0 auto;"></div>
        <p class="text-muted text-sm" style="margin-top:12px;">Finding verses about "${phrase}"…</p>
      </div>
    `;

    // Try AI search first, fall back to local keyword map
    let matchedRefs = [];
    let aiWhy = {};
    let usedAI = false;
    let aiLabel = '';

    try {
      const aiResult = await API.searchPhrase(phrase);
      if (!aiResult.fallback && aiResult.verses?.length) {
        matchedRefs = aiResult.verses.map(v => v.ref);
        aiResult.verses.forEach(v => { aiWhy[v.ref] = v.why; });
        usedAI = true;
        const provider = aiResult.provider ? String(aiResult.provider) : '';
        const model = aiResult.model ? String(aiResult.model) : '';
        aiLabel = [provider, model].filter(Boolean).join(' · ');
      }
    } catch (e) {
      console.warn('AI phrase search unavailable, using local fallback');
    }

    // Fallback: local keyword map
    if (!matchedRefs.length) {
      const q = phrase.toLowerCase();
      for (const entry of KEYWORD_PASSAGES) {
        if (entry.keywords.some(k => q.includes(k) || k.includes(q))) {
          matchedRefs.push(...entry.refs);
        }
      }
      matchedRefs = [...new Set(matchedRefs)].slice(0, 8);
    }

    if (!matchedRefs.length) {
      activePhraseContext = null;
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__title">No matching passages</div>
          <div class="empty-state__description">Try different words, or switch to Book/Chapter mode to look up a specific passage.</div>
          <button class="btn btn-secondary btn-sm" onclick="ScriptureView.clearPassage()">Clear</button>
        </div>
      `;
      return;
    }

    activePhraseContext = { phrase, refs: matchedRefs, aiWhy, usedAI, aiLabel };
    renderPhraseResults(container, activePhraseContext);
  }

  function renderPhraseResults(container, context) {
    const phrase = context?.phrase || '';
    const matchedRefs = Array.isArray(context?.refs) ? context.refs : [];
    const aiWhy = context?.aiWhy || {};
    const usedAI = !!context?.usedAI;
    const aiLabel = context?.aiLabel || '';

    container.innerHTML = `
      <div style="margin-bottom:var(--space-4);">
        <div class="section-header">
          <span class="section-title">Verses about "${phrase}"</span>
          ${usedAI ? `<span class="text-xs text-muted">✨ AI matched${aiLabel ? ` (${aiLabel})` : ''}</span>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:var(--space-2);margin-top:var(--space-2);">
          ${matchedRefs.map(ref => `
            <button class="quick-link-btn" onclick="ScriptureView.loadPassageFromPhrase('${ref.replace(/'/g, "\\'")}')"
              style="display:flex;align-items:center;justify-content:space-between;text-align:left;padding:var(--space-3) var(--space-4);">
              <span style="font-weight:600;">${ref}</span>
              ${aiWhy[ref] ? `<span style="font-size:var(--text-xs);color:var(--color-text-muted);margin-left:8px;flex:1;text-align:right;line-height:1.3;">${aiWhy[ref]}</span>` : ''}
            </button>
          `).join('')}
        </div>
        <div style="margin-top:var(--space-3);">
          <button class="btn btn-ghost btn-sm" onclick="ScriptureView.clearPassage()">← Clear results</button>
        </div>
      </div>
    `;
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

  // --- Passage loading ---

  async function loadPassage(ref, options = {}) {
    const preservePhraseContext = !!options.preservePhraseContext;
    currentRef = ref;
    searchMode = 'reference';
    if (!preservePhraseContext) activePhraseContext = null;
    const container = document.getElementById('passage-container');
    const quickLinks = document.getElementById('quick-links');
    if (!container) return;

    if (quickLinks) quickLinks.style.display = 'none';

    container.innerHTML = `
      <div style="padding:32px;text-align:center;">
        <div class="plan-searching__spinner" style="margin:0 auto;"></div>
        <p class="text-muted text-sm" style="margin-top:12px;">Loading ${ref}…</p>
      </div>
    `;

    try {
      const data = await API.getPassage(ref);
      renderPassage(container, data, ref, preservePhraseContext);
    } catch (err) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__title">Couldn't load passage</div>
          <div class="empty-state__description">Try a different reference like "John 3" or "Psalm 23:1-6".</div>
          <button class="btn btn-secondary btn-sm" onclick="ScriptureView.clearPassage()">Clear</button>
        </div>
      `;
    }
  }

  function renderPassage(container, data, ref, fromPhraseResults = false) {
    const verses = data.verses || [];
    const reference = data.reference || ref;
    const translationId = (data.translation_id || API.bibleTranslation()).toLowerCase();
    const translationLabel = translationId.toUpperCase();
    const attribution = TRANSLATION_ATTRIBUTION[translationId] || '';
    const isCopyrighted = ['esv', 'niv'].includes(translationId);

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
            <div class="passage-nav__translation">${translationLabel}</div>
          </div>
          <div class="flex gap-2">
            ${chapter > 1 ? `
            <button class="icon-btn" title="Previous chapter" onclick="ScriptureView.${fromPhraseResults ? 'loadPassageFromPhrase' : 'loadPassage'}('${bookName} ${chapter - 1}')">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            ` : ''}
            <button class="icon-btn" title="Next chapter" onclick="ScriptureView.${fromPhraseResults ? 'loadPassageFromPhrase' : 'loadPassage'}('${bookName} ${chapter + 1}')">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
            <button class="icon-btn" title="Clear" onclick="ScriptureView.clearPassage()">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <!-- Passage text -->
        <div class="passage-text" id="passage-text-body">
          ${verses.length > 0 ? verses.map(v => `
            <span class="passage-verse">
              <sup class="verse-num">${v.verse}</sup>${v.text.trim()}
            </span>
            ${' '}
          `).join('') : `<span class="passage-verse">${data.text || ''}</span>`}
        </div>

        <!-- Action row: Dive Deeper + Parallel toggle -->
        <div class="passage-dive-row">
          <button class="passage-dive-btn" id="passage-dive-btn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
            </svg>
            Dive Deeper
          </button>
          <button class="passage-dive-btn passage-parallel-btn" id="passage-parallel-btn" title="Side-by-side translation">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/>
            </svg>
            Compare
          </button>
        </div>

        <!-- Parallel translation panel (hidden until toggled) -->
        <div class="passage-parallel-panel" id="passage-parallel-panel" hidden>
          <div class="passage-parallel-header">
            <span class="passage-parallel-label" id="parallel-translation-label"></span>
            <button class="icon-btn" id="passage-parallel-close" aria-label="Close comparison" title="Close">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="passage-parallel-grid" id="passage-parallel-grid">
            <div class="passage-parallel-col">
              <div class="passage-parallel-col__label">${translationLabel}</div>
              <div class="passage-text passage-parallel-text" id="parallel-primary">
                ${verses.length > 0 ? verses.map(v => `<span class="passage-verse"><sup class="verse-num">${v.verse}</sup>${v.text.trim()}</span> `).join('') : `<span class="passage-verse">${data.text || ''}</span>`}
              </div>
            </div>
            <div class="passage-parallel-col">
              <div class="passage-parallel-col__label" id="parallel-alt-label">—</div>
              <div class="passage-text passage-parallel-text" id="parallel-alt">
                <div class="passage-parallel-loading">
                  <div class="plan-searching__spinner" style="width:20px;height:20px;margin:0 auto;"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Historical Context — lazy loaded -->
        <div class="passage-section-card" id="context-card">
          <button class="passage-section-toggle" id="context-toggle" aria-expanded="false">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            Historical Context
            <svg class="toggle-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div class="passage-section-body" id="context-body" hidden>
            <div class="passage-section-loading" id="context-loading">
              <div class="plan-searching__spinner" style="width:18px;height:18px;margin:0 auto;"></div>
              <span>Loading context…</span>
            </div>
            <div id="context-content" hidden></div>
          </div>
        </div>

        <!-- Cross-references (See Also) — lazy loaded -->
        <div class="passage-section-card" id="xref-card">
          <button class="passage-section-toggle" id="xref-toggle" aria-expanded="false">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
              <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
            </svg>
            See Also
            <svg class="toggle-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div class="passage-section-body" id="xref-body" hidden>
            <div class="passage-section-loading" id="xref-loading">
              <div class="plan-searching__spinner" style="width:18px;height:18px;margin:0 auto;"></div>
              <span>Loading cross-references…</span>
            </div>
            <div id="xref-list" hidden></div>
          </div>
        </div>

        <!-- Copyright attribution -->
        ${attribution ? `
        <div style="margin-top:var(--space-4);padding:var(--space-3);background:var(--color-surface-sunken);border-radius:var(--radius-sm);border-left:3px solid var(--color-border-strong);">
          <p style="font-size:var(--text-xs);line-height:1.6;color:var(--color-text-muted);">${attribution}</p>
          ${isCopyrighted ? `<p style="font-size:var(--text-xs);margin-top:4px;color:var(--color-text-muted);">For personal devotional use only. Not for reproduction or distribution.</p>` : ''}
        </div>
        ` : ''}

        <div style="margin-top:24px;">
          ${fromPhraseResults && activePhraseContext ? `
          <button class="btn btn-secondary btn-sm" onclick="ScriptureView.backToPhraseResults()">← Back to Results</button>
          ` : ''}
          <button class="btn btn-ghost btn-sm" onclick="ScriptureView.clearPassage()">← Search again</button>
        </div>
      </div>
    `;

    // Staggered verse entrance animation
    requestAnimationFrame(() => {
      container.querySelectorAll('.passage-verse').forEach((el, i) => {
        el.style.opacity = '0';
        el.style.animationDelay = `${Math.min(i, 9) * 40}ms`;
        el.classList.add('verse-enter');
      });
    });

    // Wire "Dive Deeper"
    const diveBtn = container.querySelector('#passage-dive-btn');
    const passageBody = container.querySelector('#passage-text-body');
    if (diveBtn && passageBody && window.WordLookup) {
      const verseText = verses.length > 0
        ? verses.map(v => v.text.trim()).join(' ')
        : (data.text || '');
      diveBtn.addEventListener('click', () => {
        WordLookup.openPassage({ reference, verseText }, diveBtn, passageBody);
      });
    }

    // ── 1B: Historical Context (lazy, toggle) ────────────────────────────
    _wireCollapsibleSection({
      toggleId: 'context-toggle',
      bodyId: 'context-body',
      loadingId: 'context-loading',
      contentId: 'context-content',
      fetch: async () => {
        if (!API.hasWorker()) throw new Error('Worker not configured');
        return API.getPassageContext(reference);
      },
      render: (data) => {
        return `
          <div class="context-card-inner">
            ${data.author || data.period ? `<p class="context-meta">${[data.author, data.period].filter(Boolean).join(' · ')}</p>` : ''}
            <p class="context-text">${data.context || ''}</p>
          </div>`;
      },
    });

    // ── 1A: Cross-references (lazy, toggle) ──────────────────────────────
    _wireCollapsibleSection({
      toggleId: 'xref-toggle',
      bodyId: 'xref-body',
      loadingId: 'xref-loading',
      contentId: 'xref-list',
      fetch: async () => {
        if (!API.hasWorker()) throw new Error('Worker not configured');
        return API.getPassageCrossRefs(reference);
      },
      render: (data) => {
        const refs = Array.isArray(data.refs) ? data.refs : [];
        if (!refs.length) return '<p class="text-sm text-muted" style="padding:var(--space-2) 0;">No cross-references found.</p>';
        return `<div class="xref-list">${refs.map(r => `
          <button class="xref-item" onclick="ScriptureView.loadPassage('${r.ref.replace(/'/g, "\\'")}')">
            <span class="xref-item__ref">${r.ref}</span>
            <span class="xref-item__why">${r.why}</span>
          </button>`).join('')}</div>`;
      },
    });

    // ── 1C: Parallel Translation ─────────────────────────────────────────
    _wireParallelTranslation({ container, reference, currentTranslationId: translationId, translationLabel });
  }

  // Helper: wire a collapsible section that lazy-fetches on first open
  function _wireCollapsibleSection({ toggleId, bodyId, loadingId, contentId, fetch: doFetch, render }) {
    const toggle = document.getElementById(toggleId);
    const body   = document.getElementById(bodyId);
    if (!toggle || !body) return;

    // Capture elements now while DOM is fresh — don't rely on getElementById after async gaps
    const loadingEl = document.getElementById(loadingId);
    const contentEl = document.getElementById(contentId);

    let loaded = false;
    toggle.addEventListener('click', async () => {
      const isOpen = !body.hidden;
      body.hidden = isOpen;
      toggle.setAttribute('aria-expanded', String(!isOpen));
      toggle.classList.toggle('passage-section-toggle--open', !isOpen);
      haptic([6]);

      if (!isOpen && !loaded) {
        loaded = true;
        try {
          const data = await doFetch();
          if (loadingEl) loadingEl.remove();
          if (contentEl) {
            contentEl.innerHTML = render(data);
            contentEl.removeAttribute('hidden');
          }
        } catch (err) {
          if (loadingEl) loadingEl.remove();
          if (contentEl) {
            contentEl.innerHTML = `<p class="text-sm text-muted" style="padding:var(--space-2) 0;">Could not load: ${err.message}</p>`;
            contentEl.removeAttribute('hidden');
          }
        }
      }
    });
  }

  // Helper: wire parallel translation toggle
  function _wireParallelTranslation({ container, reference, currentTranslationId, translationLabel }) {
    const btn   = container.querySelector('#passage-parallel-btn');
    const panel = container.querySelector('#passage-parallel-panel');
    const close = container.querySelector('#passage-parallel-close');
    const altEl = container.querySelector('#parallel-alt');
    const altLabel = container.querySelector('#parallel-alt-label');
    const panelLabel = container.querySelector('#parallel-translation-label');
    if (!btn || !panel) return;

    // Determine the "other" translation
    const PARALLEL_PAIRS = { esv: 'web', web: 'esv', kjv: 'web', net: 'web', bbe: 'web', darby: 'web', asv: 'web' };
    const altTranslationId = PARALLEL_PAIRS[currentTranslationId] || (currentTranslationId === 'web' ? 'kjv' : 'web');
    const altLabel_ = altTranslationId.toUpperCase();
    if (altLabel) altLabel.textContent = altLabel_;
    if (panelLabel) panelLabel.textContent = `Comparing ${translationLabel} · ${altLabel_}`;

    let loaded = false;
    btn.addEventListener('click', async () => {
      panel.hidden = false;
      btn.style.display = 'none';
      haptic([6]);

      if (!loaded) {
        loaded = true;
        try {
          const altData = await API.getPassage_translation(reference, altTranslationId);
          const altVerses = altData.verses || [];
          if (altEl) {
            altEl.innerHTML = altVerses.length > 0
              ? altVerses.map(v => `<span class="passage-verse"><sup class="verse-num">${v.verse}</sup>${v.text.trim()}</span> `).join('')
              : `<span class="passage-verse">${altData.text || ''}</span>`;
          }
        } catch (err) {
          if (altEl) altEl.innerHTML = `<p class="text-sm text-muted">Could not load ${altLabel_}: ${err.message}</p>`;
        }
      }
    });

    close.addEventListener('click', () => {
      panel.hidden = true;
      btn.style.display = '';
      haptic([6]);
    });
  }

  function loadPassageFromPhrase(ref) {
    return loadPassage(ref, { preservePhraseContext: true });
  }

  function backToPhraseResults() {
    const container = document.getElementById('passage-container');
    const quickLinks = document.getElementById('quick-links');
    if (!container || !activePhraseContext) return;
    if (quickLinks) quickLinks.style.display = 'none';
    currentRef = '';
    searchMode = 'phrase';
    renderPhraseResults(container, activePhraseContext);
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

  return { render, loadPassage, loadPassageFromPhrase, backToPhraseResults, clearPassage, searchPhrase };
})();

window.ScriptureView = ScriptureView;
