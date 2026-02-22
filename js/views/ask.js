/* ============================================================
   ABIDE - Ask-Anything Bible Chat (Full-Page View)
   ============================================================ */

const AskView = (() => {
  let _history = []; // [{ role: 'user'|'assistant', content }]
  let _loading  = false;

  // ── Full-page render ──────────────────────────────────────────────────────

  function render(container) {
    Router.clearHeaderActions();

    const div = document.createElement('div');
    div.className = 'view-content ask-view';

    div.innerHTML = `
      <div class="ask-page">
        <div class="ask-conversation" id="ask-conversation">
          ${_history.length === 0 ? `
            <div class="ask-hint">
              <div class="ask-hint__icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <p class="ask-hint__title">Ask the Bible</p>
              <p class="ask-hint__body">What does the Bible say about anxiety? Who was Melchizedek? What does "abide" mean?</p>
              <div class="ask-suggestions">
                <button class="ask-suggestion-chip" data-q="What does the Bible say about anxiety?">Anxiety</button>
                <button class="ask-suggestion-chip" data-q="What does it mean to abide in Christ?">Abide</button>
                <button class="ask-suggestion-chip" data-q="Who was Melchizedek?">Melchizedek</button>
                <button class="ask-suggestion-chip" data-q="What is the armor of God?">Armor of God</button>
                <button class="ask-suggestion-chip" data-q="How should I pray?">Prayer</button>
                <button class="ask-suggestion-chip" data-q="What does the Bible say about forgiveness?">Forgiveness</button>
              </div>
            </div>` : _history.map(h => renderBubbleHTML(h.role, h.role === 'user' ? escHtml(h.content) : mdToHtml(h.content))).join('')}
        </div>
        <div class="ask-loading ask-loading--page" id="ask-loading" hidden>
          <span class="ask-loading__dot"></span>
          <span class="ask-loading__dot"></span>
          <span class="ask-loading__dot"></span>
        </div>
        <div class="ask-input-row ask-input-row--page" id="ask-input-row">
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

    container.innerHTML = '';
    container.appendChild(div);

    const input = document.getElementById('ask-input');
    const send  = document.getElementById('ask-send');

    function handleSend(text) {
      text = text || input.value.trim();
      if (!text || _loading) return;
      input.value = '';
      // Remove hint on first message
      div.querySelector('.ask-hint')?.remove();
      appendBubble('user', escHtml(text));
      _history.push({ role: 'user', content: text });
      sendQuestion(text);
    }

    send.addEventListener('click', () => handleSend());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    });

    // Suggestion chips
    div.querySelectorAll('.ask-suggestion-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const q = chip.dataset.q;
        if (q) handleSend(q);
      });
    });

    // Scroll to bottom if history exists
    setTimeout(() => {
      const conv = document.getElementById('ask-conversation');
      if (conv) conv.scrollTop = conv.scrollHeight;
      input.focus();
    }, 60);
  }

  // ── Messaging ────────────────────────────────────────────────────────────

  function renderBubbleHTML(role, htmlContent) {
    return `<div class="ask-msg ask-msg--${role}"><div class="ask-bubble">${htmlContent}</div></div>`;
  }

  function appendBubble(role, htmlContent) {
    const conv = document.getElementById('ask-conversation');
    if (!conv) return;
    const el = document.createElement('div');
    el.innerHTML = renderBubbleHTML(role, htmlContent);
    conv.appendChild(el.firstElementChild);
    conv.scrollTop = conv.scrollHeight;
  }

  async function sendQuestion(question) {
    if (!API.hasWorker()) {
      appendBubble('assistant', '<em>Worker URL not configured. Go to Settings → Advanced to set it up.</em>');
      return;
    }

    _loading = true;
    const loadingEl = document.getElementById('ask-loading');
    const inputRow  = document.getElementById('ask-input-row');
    if (loadingEl) loadingEl.hidden = false;
    if (inputRow)  inputRow.style.opacity = '0.4';

    try {
      const historyToSend = _history.slice(0, -1);
      const data = await API.askBibleQuestion(question, historyToSend);
      const reply = data.reply || "Sorry, I couldn't find an answer. Please try again.";
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
    return md
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/^/, '<p>').replace(/$/, '</p>');
  }

  return { render };
})();

window.AskView = AskView;
