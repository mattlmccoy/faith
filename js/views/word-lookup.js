/* ============================================================
   ABIDE - Hebrew / Greek Word Deep Dive
   WordLookup.openPassage(context, diveBtn) — AI picks key words, renders chips
   WordLookup.open(word, context)           — open single-word sheet (tap chip)
   WordLookup.openWithSummary(word, ctx, wordEntry) — sheet with pre-fetched summary
   context = { reference: "Eph 2:8", verseText: "For by grace…" }
   ============================================================ */

const WordLookup = (() => {
  // ── state ─────────────────────────────────────────────────────────
  let _word = '';
  let _context = {};
  let _history = []; // [{ role: 'user'|'assistant', content: string }]

  // ── minimal markdown → safe HTML ──────────────────────────────────
  function mdToHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Bold **text** or __text__
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>')
      // Italic *text* or _text_
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/_(.+?)_/g, '<em>$1</em>')
      // Line breaks → paragraphs (double newline)
      .split(/\n\n+/)
      .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
      .join('');
  }

  // ── panel teardown ────────────────────────────────────────────────
  function teardown() {
    document.getElementById('wl-backdrop')?.remove();
    document.removeEventListener('keydown', _onEscape);
  }

  function _onEscape(e) {
    if (e.key === 'Escape') teardown();
  }

  // ── append a message bubble to the conversation ───────────────────
  function appendBubble(role, htmlContent) {
    const conv = document.getElementById('wl-conversation');
    if (!conv) return;
    const msg = document.createElement('div');
    msg.className = `wl-msg wl-msg--${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'wl-bubble';
    bubble.innerHTML = htmlContent;
    msg.appendChild(bubble);
    conv.appendChild(msg);
    conv.scrollTop = conv.scrollHeight;
  }

  // ── populate header after first response ─────────────────────────
  function populateHeader(data) {
    const orig  = document.getElementById('wl-original');
    const tr    = document.getElementById('wl-translit');
    const badge = document.getElementById('wl-badge');
    if (orig)  orig.textContent  = data.word || _word;
    if (tr)    tr.textContent    = data.transliteration || '';
    if (badge) {
      const lang    = data.language || '';
      const strongs = data.strongsNumber || '';
      badge.textContent = [lang, strongs].filter(Boolean).join(' · ');
      badge.hidden = !badge.textContent;
    }
  }

  // ── send a follow-up turn to the API ─────────────────────────────
  async function sendTurn(userText) {
    const loading  = document.getElementById('wl-loading');
    const inputRow = document.getElementById('wl-input-row');
    const input    = document.getElementById('wl-input');
    const send     = document.getElementById('wl-send');

    if (loading)  loading.hidden = false;
    if (inputRow) inputRow.style.opacity = '0.5';
    if (send)     send.disabled = true;

    try {
      const data = await API.wordLookup(_word, _context, _history);
      _history.push({ role: 'assistant', content: data.reply || '' });

      populateHeader(data);
      appendBubble('ai', mdToHtml(data.reply || 'No content returned.'));
    } catch (err) {
      appendBubble('ai', `<p style="color:var(--color-text-muted)">Sorry — ${err.message || 'lookup failed'}. Please try again.</p>`);
    } finally {
      if (loading)  loading.hidden = true;
      if (inputRow) inputRow.style.opacity = '1';
      if (input)    input.value = '';
      if (send)     send.disabled = false;
    }
  }

  // ── build and inject the panel HTML ──────────────────────────────
  function buildPanel() {
    teardown();

    const backdrop = document.createElement('div');
    backdrop.id = 'wl-backdrop';
    backdrop.className = 'wl-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.innerHTML = `
      <div id="wl-sheet" class="wl-sheet" role="dialog" aria-modal="true" aria-label="Word Deep Dive">
        <div class="wl-handle"></div>

        <div class="wl-header">
          <div class="wl-header__left">
            <span class="wl-original" id="wl-original">${_word}</span>
            <span class="wl-translit" id="wl-translit"></span>
          </div>
          <div class="wl-header__right">
            <span class="wl-badge" id="wl-badge" hidden></span>
            <button class="wl-close" id="wl-close" aria-label="Close word lookup">✕</button>
          </div>
        </div>

        <div class="wl-conversation" id="wl-conversation"></div>

        <div class="wl-loading" id="wl-loading">
          <span class="wl-loading__dot"></span>
          <span class="wl-loading__dot"></span>
          <span class="wl-loading__dot"></span>
        </div>

        <div class="wl-input-row" id="wl-input-row">
          <input class="wl-input" id="wl-input" type="text"
            placeholder="Ask a follow-up question…"
            autocomplete="off" />
          <button class="wl-send" id="wl-send" aria-label="Send">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2.5"
              stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    // Animate in
    requestAnimationFrame(() => backdrop.classList.add('wl-backdrop--visible'));

    // Wire close controls
    document.getElementById('wl-close').addEventListener('click', teardown);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) teardown(); });
    document.addEventListener('keydown', _onEscape);

    // Wire send button + Enter key
    const input = document.getElementById('wl-input');
    const send  = document.getElementById('wl-send');

    function handleSend() {
      const text = input.value.trim();
      if (!text) return;
      _history.push({ role: 'user', content: text });
      appendBubble('user', text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
      sendTurn(text);
    }

    send.addEventListener('click', handleSend);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    });
  }

  // ── public: open(word, context) ── single-word, fetches from worker ──
  function open(word, context) {
    _word    = word.replace(/[^\w\u0370-\u03FF\u0400-\u04FF\u05D0-\u05EA\u0600-\u06FF'\-]/g, '').trim() || word.trim();
    _context = context || {};
    _history = [];

    buildPanel();

    // First turn — inject the user prompt silently (not shown as a bubble)
    const firstMsg = `In ${_context.reference || 'this passage'}: "${_context.verseText || ''}" — explain the word "${_word}".`;
    _history.push({ role: 'user', content: firstMsg });

    // Show loading immediately
    const loading = document.getElementById('wl-loading');
    if (loading) loading.hidden = false;

    sendTurn(firstMsg);
  }

  // ── public: openWithSummary(word, context, wordEntry) ─────────────
  // Opens the sheet using the pre-fetched summary from passage analysis.
  // No extra network call for the initial display; follow-ups still work.
  function openWithSummary(word, context, wordEntry) {
    _word    = wordEntry.english || word;
    _context = context || {};
    _history = [];

    buildPanel();

    // Populate header immediately from word entry data
    populateHeader({
      word:            wordEntry.original || word,
      transliteration: wordEntry.transliteration || '',
      strongsNumber:   wordEntry.strongsNumber || '',
      language:        wordEntry.language || '',
    });

    // Hide loading — we already have the summary
    const loading = document.getElementById('wl-loading');
    if (loading) loading.hidden = true;

    // Show the pre-fetched summary as the first AI bubble
    appendBubble('ai', mdToHtml(wordEntry.summary || ''));

    // Seed history so follow-up questions have context
    const seedMsg = `In ${context.reference || 'this passage'}: "${context.verseText || ''}" — explain the word "${_word}".`;
    _history.push({ role: 'user', content: seedMsg });
    _history.push({ role: 'assistant', content: wordEntry.summary || '' });
  }

  // ── public: openPassage(context, diveBtn) ─────────────────────────
  // Replaces the Dive Deeper button with loading dots → word chips.
  // Each chip tap calls openWithSummary() — no second network call.
  async function openPassage(context, diveBtn) {
    if (!diveBtn) return;

    const row = diveBtn.closest('.passage-dive-row') || diveBtn.parentElement;
    if (!row) return;

    // Replace button with loading indicator
    row.innerHTML = `
      <div class="wl-chips-loading">
        <span class="wl-loading__dot"></span>
        <span class="wl-loading__dot"></span>
        <span class="wl-loading__dot"></span>
        <span class="wl-chips-loading__label">Analysing passage…</span>
      </div>`;

    try {
      const data = await API.wordLookupPassage(context);
      const words = data.words || [];

      if (!words.length) {
        row.innerHTML = `<p class="wl-chips-empty">No key words found. <button class="btn btn-ghost btn-sm wl-chips-retry">Retry</button></p>`;
        row.querySelector('.wl-chips-retry')?.addEventListener('click', () => {
          // Restore button and retry
          row.innerHTML = `<button class="passage-dive-btn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
            </svg>
            Dive Deeper
          </button>`;
          openPassage(context, row.querySelector('.passage-dive-btn'));
        });
        return;
      }

      // Render word chips
      row.innerHTML = `
        <div class="wl-word-chips">
          <p class="wl-chips-label">Key words in this passage</p>
          <div class="wl-chips-row">
            ${words.map((w, i) => `
              <button class="wl-word-chip" data-word-index="${i}">
                <span class="wl-chip-english">${escHtml(w.english || '')}</span>
                ${w.original ? `<span class="wl-chip-original">${escHtml(w.original)}</span>` : ''}
                ${w.strongsNumber ? `<span class="wl-chip-strongs">${escHtml(w.strongsNumber)}</span>` : ''}
              </button>
            `).join('')}
          </div>
        </div>`;

      row.querySelectorAll('.wl-word-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          const idx = parseInt(chip.getAttribute('data-word-index'), 10);
          const w   = words[idx];
          if (w) openWithSummary(w.english || '', context, w);
        });
      });
    } catch (err) {
      row.innerHTML = `<p class="wl-chips-empty">Could not analyse passage. <button class="btn btn-ghost btn-sm wl-chips-retry">Retry</button></p>`;
      row.querySelector('.wl-chips-retry')?.addEventListener('click', () => {
        row.innerHTML = `<button class="passage-dive-btn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
          </svg>
          Dive Deeper
        </button>`;
        openPassage(context, row.querySelector('.passage-dive-btn'));
      });
    }
  }

  // ── helpers ───────────────────────────────────────────────────────
  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return { open, openWithSummary, openPassage };
})();

window.WordLookup = WordLookup;
