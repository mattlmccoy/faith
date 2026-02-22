/* ============================================================
   ABIDE - Ask-Anything Bible Chat
   Floating action button + bottom-sheet chat panel in Scripture view.
   ============================================================ */

const AskChat = (() => {
  let _history = []; // [{ role: 'user'|'assistant', content }]
  let _loading  = false;

  // ── FAB (floating action button) ────────────────────────────────────────

  function mountFAB(container) {
    // Always append the FAB to document.body so position:fixed works correctly
    // even inside scroll containers (which create new stacking contexts on iOS).
    // Remove any stale FAB first.
    document.getElementById('ask-fab-btn')?.remove();

    const fab = document.createElement('button');
    fab.id = 'ask-fab-btn';
    fab.className = 'ask-fab';
    fab.setAttribute('aria-label', 'Ask a Bible question');
    fab.title = 'Ask a Bible question';
    fab.innerHTML = `
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>`;
    fab.addEventListener('click', openSheet);
    document.body.appendChild(fab);

    // Remove the FAB when the user navigates away from the Scripture tab
    const observer = new MutationObserver(() => {
      if (!document.contains(container) || container.closest('.view-exit')) {
        fab.remove();
        observer.disconnect();
      }
    });
    observer.observe(document.getElementById('view-container') || document.body, {
      childList: true, subtree: false,
    });
  }

  // ── Sheet ────────────────────────────────────────────────────────────────

  function openSheet() {
    if (document.getElementById('ask-backdrop')) return; // already open

    const backdrop = document.createElement('div');
    backdrop.id = 'ask-backdrop';
    backdrop.className = 'ask-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.innerHTML = `
      <div id="ask-sheet" class="ask-sheet" role="dialog" aria-modal="true" aria-label="Ask a Bible question">
        <div class="ask-handle"></div>
        <div class="ask-header">
          <span class="ask-header__title">Ask the Bible</span>
          <button class="ask-close" id="ask-close" aria-label="Close">✕</button>
        </div>
        <div class="ask-conversation" id="ask-conversation">
          ${_history.length === 0 ? `
            <div class="ask-hint">
              <p>Ask anything — what does the Bible say about anxiety? Who was Melchizedek? What does "abide" mean?</p>
            </div>` : _history.map(h => renderBubbleHTML(h.role, escHtml(h.content))).join('')}
        </div>
        <div class="ask-loading" id="ask-loading" hidden>
          <span class="ask-loading__dot"></span>
          <span class="ask-loading__dot"></span>
          <span class="ask-loading__dot"></span>
        </div>
        <div class="ask-input-row" id="ask-input-row">
          <input class="ask-input" id="ask-input" type="text"
            placeholder="Ask a Bible question…"
            autocomplete="off" autocorrect="off" spellcheck="false" />
          <button class="ask-send" id="ask-send" aria-label="Send">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2.5"
              stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>`;

    document.body.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add('ask-backdrop--visible'));

    document.getElementById('ask-close').addEventListener('click', closeSheet);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeSheet(); });
    document.addEventListener('keydown', _onEscape);

    const input = document.getElementById('ask-input');
    const send  = document.getElementById('ask-send');

    function handleSend() {
      const text = input.value.trim();
      if (!text || _loading) return;
      input.value = '';
      appendBubble('user', escHtml(text));
      _history.push({ role: 'user', content: text });
      sendQuestion(text);
    }

    send.addEventListener('click', handleSend);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    });

    // Scroll to bottom if history already exists
    setTimeout(() => {
      const conv = document.getElementById('ask-conversation');
      if (conv) conv.scrollTop = conv.scrollHeight;
    }, 50);
  }

  function closeSheet() {
    const backdrop = document.getElementById('ask-backdrop');
    if (!backdrop) return;
    backdrop.classList.remove('ask-backdrop--visible');
    document.removeEventListener('keydown', _onEscape);
    setTimeout(() => backdrop.remove(), 260);
  }

  function _onEscape(e) {
    if (e.key === 'Escape') closeSheet();
  }

  // ── Messaging ────────────────────────────────────────────────────────────

  function renderBubbleHTML(role, htmlContent) {
    return `<div class="ask-msg ask-msg--${role}"><div class="ask-bubble">${htmlContent}</div></div>`;
  }

  function appendBubble(role, htmlContent) {
    const conv = document.getElementById('ask-conversation');
    if (!conv) return;
    // Remove hint if present
    conv.querySelector('.ask-hint')?.remove();
    const el = document.createElement('div');
    el.innerHTML = renderBubbleHTML(role, htmlContent);
    conv.appendChild(el.firstElementChild);
    conv.scrollTop = conv.scrollHeight;
  }

  async function sendQuestion(question) {
    if (!API.hasWorker()) {
      appendBubble('assistant', '<em>Worker URL not configured. Set it in Settings → Advanced.</em>');
      return;
    }

    _loading = true;
    const loadingEl = document.getElementById('ask-loading');
    const inputRow  = document.getElementById('ask-input-row');
    if (loadingEl) loadingEl.hidden = false;
    if (inputRow)  inputRow.style.opacity = '0.4';

    try {
      // Pass history minus the last user message (already added)
      const historyToSend = _history.slice(0, -1);
      const data = await API.askBibleQuestion(question, historyToSend);
      const reply = data.reply || 'Sorry, I couldn't find an answer. Please try again.';
      _history.push({ role: 'assistant', content: reply });
      appendBubble('assistant', mdToHtml(reply));
    } catch (err) {
      appendBubble('assistant', `<em>Error: ${escHtml(err.message)}</em>`);
    } finally {
      _loading = false;
      const le = document.getElementById('ask-loading');
      const ir = document.getElementById('ask-input-row');
      if (le) le.hidden = true;
      if (ir) ir.style.opacity = '';
      const input = document.getElementById('ask-input');
      if (input) input.focus();
    }
  }

  // ── Utilities ────────────────────────────────────────────────────────────

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function mdToHtml(md) {
    // Minimal markdown: bold, italic, line breaks, paragraphs
    return md
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/^/, '<p>').replace(/$/, '</p>');
  }

  return { mountFAB, openSheet, closeSheet };
})();

window.AskChat = AskChat;
