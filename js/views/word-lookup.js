/* ============================================================
   ABIDE - Hebrew / Greek Word Deep Dive
   WordLookup.openPassage(context, diveBtn, passageEl)
     — AI picks key words, highlights them in the passage, renders chips
   WordLookup.open(word, context)
     — open single-word sheet (fetches from worker)
   WordLookup.openWithSummary(word, ctx, wordEntry)
     — sheet with pre-fetched summary (no extra network call)
   context = { reference: "Eph 2:8", verseText: "For by grace…" }
   ============================================================ */

const WordLookup = (() => {
  // ── state ─────────────────────────────────────────────────────────
  let _word    = '';
  let _context = {};
  let _history = []; // [{ role: 'user'|'assistant', content: string }]
  let _tapCleanup = null; // active tap-any-word cleanup fn

  // ── minimal markdown → safe HTML ──────────────────────────────────
  function mdToHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/_(.+?)_/g, '<em>$1</em>')
      .split(/\n\n+/)
      .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
      .join('');
  }

  // ── helpers ───────────────────────────────────────────────────────
  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── panel teardown ────────────────────────────────────────────────
  function teardown() {
    document.getElementById('wl-backdrop')?.remove();
    document.removeEventListener('keydown', _onEscape);
    if (_tapCleanup) { _tapCleanup(); _tapCleanup = null; }
  }

  function _onEscape(e) {
    if (e.key === 'Escape') teardown();
  }

  // ── append a message bubble ───────────────────────────────────────
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

  // ── populate header ───────────────────────────────────────────────
  function populateHeader(data) {
    const orig  = document.getElementById('wl-original');
    const tr    = document.getElementById('wl-translit');
    const badge = document.getElementById('wl-badge');
    if (orig)  orig.textContent = data.word || _word;
    if (tr)    tr.textContent   = data.transliteration || '';
    if (badge) {
      const lang    = data.language || '';
      const strongs = data.strongsNumber || '';
      badge.textContent = [lang, strongs].filter(Boolean).join(' · ');
      badge.hidden = !badge.textContent;
    }
  }

  // ── send a follow-up turn ─────────────────────────────────────────
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

  // ── build the bottom-sheet panel ─────────────────────────────────
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
            <span class="wl-original" id="wl-original">${escHtml(_word)}</span>
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
    requestAnimationFrame(() => backdrop.classList.add('wl-backdrop--visible'));

    document.getElementById('wl-close').addEventListener('click', teardown);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) teardown(); });
    document.addEventListener('keydown', _onEscape);

    const input = document.getElementById('wl-input');
    const send  = document.getElementById('wl-send');

    function handleSend() {
      const text = input.value.trim();
      if (!text) return;
      _history.push({ role: 'user', content: text });
      appendBubble('user', escHtml(text));
      sendTurn(text);
    }

    send.addEventListener('click', handleSend);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    });
  }

  // ── highlight AI-selected words in the passage element ────────────
  // Finds each word's English form in the passage text nodes and wraps
  // it with a <mark class="wl-highlight"> that taps to openWithSummary.
  function highlightWordsInPassage(passageEl, words, context) {
    if (!passageEl || !words.length) return;

    // Build a map: lowercase english → wordEntry
    const wordMap = new Map();
    words.forEach(w => {
      if (w.english) wordMap.set(w.english.toLowerCase().trim(), w);
    });

    // Build a regex that matches any of the english words (whole word, case-insensitive)
    const escaped = [...wordMap.keys()].map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!escaped.length) return;
    const re = new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');

    // Walk all text nodes inside the passage element
    function walkTextNodes(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        if (!re.test(text)) { re.lastIndex = 0; return; }
        re.lastIndex = 0;

        const frag = document.createDocumentFragment();
        let last = 0;
        let m;
        re.lastIndex = 0;
        while ((m = re.exec(text)) !== null) {
          // Text before match
          if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));

          const entry = wordMap.get(m[0].toLowerCase());
          const mark = document.createElement('mark');
          mark.className = 'wl-highlight';
          mark.textContent = m[0];
          mark.setAttribute('title', entry?.original || '');
          mark.addEventListener('click', (e) => {
            e.stopPropagation();
            if (entry) openWithSummary(entry.english || m[0], context, entry);
          });
          frag.appendChild(mark);
          last = re.lastIndex;
        }
        // Remaining text
        if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));

        node.parentNode.replaceChild(frag, node);
      } else if (
        node.nodeType === Node.ELEMENT_NODE &&
        node.nodeName !== 'MARK' &&
        node.nodeName !== 'SCRIPT' &&
        node.nodeName !== 'STYLE'
      ) {
        // Clone child list since we're mutating the DOM
        [...node.childNodes].forEach(walkTextNodes);
      }
    }

    walkTextNodes(passageEl);
  }

  // ── clear highlights (restore plain text) ─────────────────────────
  function clearHighlights(passageEl) {
    if (!passageEl) return;
    passageEl.querySelectorAll('mark.wl-highlight').forEach(mark => {
      mark.replaceWith(document.createTextNode(mark.textContent));
    });
    // Normalize adjacent text nodes
    passageEl.normalize();
  }

  // ── tap-any-word mode (private) ───────────────────────────────────
  function getWordAtPoint(e) {
    let word = '';
    if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(e.clientX, e.clientY);
      if (range) { range.expand('word'); word = range.toString(); }
    } else if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
      if (pos && pos.offsetNode?.nodeType === Node.TEXT_NODE) {
        const text = pos.offsetNode.textContent;
        let s = pos.offset, en = pos.offset;
        while (s > 0 && /\w/.test(text[s - 1])) s--;
        while (en < text.length && /\w/.test(text[en])) en++;
        word = text.slice(s, en);
      }
    }
    return word.replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '').trim();
  }

  // Activates tap-any-word on a passage element. Cleans up automatically
  // after one tap. doneCallback is called after each successful word open.
  function activateTapMode(passageEl, context, exploreBtn) {
    if (!passageEl) return;
    if (_tapCleanup) { _tapCleanup(); _tapCleanup = null; }

    passageEl.classList.add('wl-tap-active');
    if (exploreBtn) exploreBtn.classList.add('wl-explore-btn--active');

    function onClick(e) {
      // Ignore clicks on existing highlights (those open directly)
      if (e.target.classList.contains('wl-highlight')) return;
      const word = getWordAtPoint(e);
      if (!word) return;
      cleanup();
      open(word, context);
    }

    function cleanup() {
      passageEl.classList.remove('wl-tap-active');
      if (exploreBtn) exploreBtn.classList.remove('wl-explore-btn--active');
      passageEl.removeEventListener('click', onClick);
      _tapCleanup = null;
    }

    passageEl.addEventListener('click', onClick);
    _tapCleanup = cleanup;
    return cleanup;
  }

  // ── public: open(word, context) ───────────────────────────────────
  function open(word, context) {
    _word    = word.replace(/[^\w\u0370-\u03FF\u0400-\u04FF\u05D0-\u05EA\u0600-\u06FF'\-]/g, '').trim() || word.trim();
    _context = context || {};
    _history = [];

    buildPanel();

    const firstMsg = `In ${_context.reference || 'this passage'}: "${_context.verseText || ''}" — explain the word "${_word}".`;
    _history.push({ role: 'user', content: firstMsg });

    const loading = document.getElementById('wl-loading');
    if (loading) loading.hidden = false;

    sendTurn(firstMsg);
  }

  // ── public: openWithSummary(word, context, wordEntry) ─────────────
  function openWithSummary(word, context, wordEntry) {
    _word    = wordEntry.english || word;
    _context = context || {};
    _history = [];

    buildPanel();

    populateHeader({
      word:            wordEntry.original || word,
      transliteration: wordEntry.transliteration || '',
      strongsNumber:   wordEntry.strongsNumber || '',
      language:        wordEntry.language || '',
    });

    const loading = document.getElementById('wl-loading');
    if (loading) loading.hidden = true;

    appendBubble('ai', mdToHtml(wordEntry.summary || ''));

    const seedMsg = `In ${context.reference || 'this passage'}: "${context.verseText || ''}" — explain the word "${_word}".`;
    _history.push({ role: 'user', content: seedMsg });
    _history.push({ role: 'assistant', content: wordEntry.summary || '' });
  }

  // ── public: openPassage(context, diveBtn, passageEl) ──────────────
  // passageEl is optional — the element whose text gets highlighted.
  // In scripture.js pass #passage-text-body; in devotion.js pass the
  // scripture block text element.
  async function openPassage(context, diveBtn, passageEl) {
    if (!diveBtn) return;

    const row = diveBtn.closest('.passage-dive-row') || diveBtn.parentElement;
    if (!row) return;

    // Clear any existing highlights before re-analysing
    if (passageEl) clearHighlights(passageEl);

    // Replace button with loading indicator
    row.innerHTML = `
      <div class="wl-chips-loading">
        <span class="wl-loading__dot"></span>
        <span class="wl-loading__dot"></span>
        <span class="wl-loading__dot"></span>
        <span class="wl-chips-loading__label">Analysing passage…</span>
      </div>`;

    const diveIconSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
    </svg>`;

    try {
      const data = await API.wordLookupPassage(context);
      const words = data.words || [];

      if (!words.length) {
        row.innerHTML = `<p class="wl-chips-empty">No key words found. <button class="btn btn-ghost btn-sm wl-chips-retry">Retry</button></p>`;
        row.querySelector('.wl-chips-retry')?.addEventListener('click', () => {
          row.innerHTML = `<button class="passage-dive-btn">${diveIconSvg} Dive Deeper</button>`;
          openPassage(context, row.querySelector('.passage-dive-btn'), passageEl);
        });
        return;
      }

      // ── Highlight the words in the passage text ──────────────────
      if (passageEl) highlightWordsInPassage(passageEl, words, context);

      // ── Render chips + "Explore any word" button ─────────────────
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
          <button class="wl-explore-btn" title="Tap any word in the passage to look it up">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            Explore any word
          </button>
        </div>`;

      // Wire chip taps
      row.querySelectorAll('.wl-word-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          const idx = parseInt(chip.getAttribute('data-word-index'), 10);
          const w   = words[idx];
          if (w) openWithSummary(w.english || '', context, w);
        });
      });

      // Wire "Explore any word" — toggle tap mode on passage element
      const exploreBtn = row.querySelector('.wl-explore-btn');
      if (exploreBtn && passageEl) {
        exploreBtn.addEventListener('click', () => {
          if (_tapCleanup) {
            // Already active — cancel
            _tapCleanup();
          } else {
            activateTapMode(passageEl, context, exploreBtn);
          }
        });
      }
    } catch (err) {
      row.innerHTML = `<p class="wl-chips-empty">Could not analyse passage. <button class="btn btn-ghost btn-sm wl-chips-retry">Retry</button></p>`;
      row.querySelector('.wl-chips-retry')?.addEventListener('click', () => {
        row.innerHTML = `<button class="passage-dive-btn">${diveIconSvg} Dive Deeper</button>`;
        openPassage(context, row.querySelector('.passage-dive-btn'), passageEl);
      });
    }
  }

  return { open, openWithSummary, openPassage };
})();

window.WordLookup = WordLookup;
