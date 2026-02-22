/* ============================================================
   ABIDE - Hebrew / Greek Word Deep Dive
   WordLookup.open(word, context)            — open panel for a word
   WordLookup.activateWordTapMode(el, ctx)   — enter tap-to-look-up mode
   context = { reference: "Eph 2:8", verseText: "For by grace…" }
   ============================================================ */

const WordLookup = (() => {
  // ── state ─────────────────────────────────────────────────────────
  let _word = '';
  let _context = {};
  let _history = []; // [{ role: 'user'|'assistant', content: string }]
  let _tapCleanup = null; // function to remove tap mode listeners

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
    if (_tapCleanup) { _tapCleanup(); _tapCleanup = null; }
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
    const orig = document.getElementById('wl-original');
    const tr   = document.getElementById('wl-translit');
    const badge = document.getElementById('wl-badge');
    if (orig)  orig.textContent  = data.word || _word;
    if (tr)    tr.textContent    = data.transliteration || '';
    if (badge) {
      const lang   = data.language || '';
      const strongs = data.strongsNumber || '';
      badge.textContent = [lang, strongs].filter(Boolean).join(' · ');
      badge.hidden = !badge.textContent;
    }
  }

  // ── send a turn to the API ────────────────────────────────────────
  async function sendTurn(userText) {
    const loading = document.getElementById('wl-loading');
    const inputRow = document.getElementById('wl-input-row');
    const input = document.getElementById('wl-input');
    const send  = document.getElementById('wl-send');

    if (loading)   loading.hidden = false;
    if (inputRow)  inputRow.style.opacity = '0.5';
    if (send)      send.disabled = true;

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

  // ── public: open(word, context) ───────────────────────────────────
  function open(word, context) {
    _word    = word.replace(/[^\w\u0370-\u03FF\u0400-\u04FF\u05D0-\u05EA\u0600-\u06FF'\-]/g, '').trim() || word.trim();
    _context = context || {};
    _history = [];

    // Remove any active tap mode banner
    document.querySelectorAll('.wl-tap-banner').forEach(b => b.remove());

    buildPanel();

    // First turn — inject the user prompt silently (not shown as a bubble)
    const firstMsg = `In ${_context.reference || 'this passage'}: "${_context.verseText || ''}" — explain the word "${_word}".`;
    _history.push({ role: 'user', content: firstMsg });

    sendTurn(firstMsg);
  }

  // ── get word at click point ───────────────────────────────────────
  function getWordAtPoint(e) {
    let word = '';

    // Try the modern Caret API
    if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(e.clientX, e.clientY);
      if (range) {
        range.expand('word');
        word = range.toString();
      }
    } else if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
      if (pos) {
        const range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.setEnd(pos.offsetNode, pos.offset);
        // Expand manually to word boundary
        const node = pos.offsetNode;
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent;
          let start = pos.offset;
          let end = pos.offset;
          while (start > 0 && /\w/.test(text[start - 1])) start--;
          while (end < text.length && /\w/.test(text[end])) end++;
          word = text.slice(start, end);
        }
      }
    }

    // Strip punctuation at edges, lowercase for lookup
    return word.replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '').trim();
  }

  // ── public: activateWordTapMode(containerEl, context) ─────────────
  function activateWordTapMode(containerEl, context) {
    if (!containerEl) return;

    // Deactivate any previous tap mode
    if (_tapCleanup) { _tapCleanup(); _tapCleanup = null; }

    containerEl.classList.add('wl-tap-active');

    // Banner above the container
    const banner = document.createElement('div');
    banner.className = 'wl-tap-banner';
    banner.innerHTML = `
      <span>Tap any word to look it up</span>
      <button class="wl-tap-cancel" aria-label="Cancel word tap mode"
        style="background:none;border:none;color:inherit;font-size:0.8rem;cursor:pointer;padding:0 4px;">
        ✕ Cancel
      </button>
    `;
    containerEl.parentElement?.insertBefore(banner, containerEl);

    function cleanup() {
      containerEl.classList.remove('wl-tap-active');
      banner.remove();
      containerEl.removeEventListener('click', onClick);
    }

    function onClick(e) {
      const word = getWordAtPoint(e);
      if (!word) return;
      cleanup();
      _tapCleanup = null;
      open(word, context);
    }

    banner.querySelector('.wl-tap-cancel').addEventListener('click', cleanup);
    containerEl.addEventListener('click', onClick);
    _tapCleanup = cleanup;
  }

  return { open, activateWordTapMode };
})();

window.WordLookup = WordLookup;
