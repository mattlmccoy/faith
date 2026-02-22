/* ============================================================
   ABIDE - Memory Verse Practice
   Bottom sheet with progressive word-reveal practice mode.
   ============================================================ */

const MemoryVerseView = (() => {
  // ── Open Sheet ────────────────────────────────────────────────────────────

  function openSheet(reference, verseText) {
    document.getElementById('memory-backdrop')?.remove();

    const words = verseText.trim().split(/\s+/).filter(Boolean);
    let revealed = 0; // how many words are currently shown
    let mode = 'read'; // 'read' | 'practice'

    const backdrop = document.createElement('div');
    backdrop.id = 'memory-backdrop';
    backdrop.className = 'memory-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');

    backdrop.innerHTML = `
      <div id="memory-sheet" class="memory-sheet" role="dialog" aria-modal="true" aria-label="Memory verse practice">
        <div class="memory-handle"></div>
        <div class="memory-header">
          <div>
            <div class="memory-reference">${reference}</div>
            <div class="memory-subtitle" id="memory-subtitle">Read and memorize</div>
          </div>
          <button class="ask-close" id="memory-close" aria-label="Close">✕</button>
        </div>

        <!-- Read mode -->
        <div id="memory-read-mode">
          <div class="memory-verse-text" id="memory-full-text">${_escHtml(verseText)}</div>
          <button class="btn btn-primary btn-full" id="memory-start-btn" style="margin-top:var(--space-4);">
            Start Practice
          </button>
        </div>

        <!-- Practice mode -->
        <div id="memory-practice-mode" hidden>
          <div class="memory-words" id="memory-words">${_buildWordHTML(words, 0)}</div>
          <div class="memory-controls">
            <div class="memory-progress-row">
              <span class="memory-progress-label" id="memory-progress-label">0 / ${words.length}</span>
              <div class="memory-progress-bar">
                <div class="memory-progress-fill" id="memory-progress-fill" style="width:0%"></div>
              </div>
            </div>
            <div class="memory-btn-row">
              <button class="btn btn-secondary btn-sm" id="memory-reset-btn">Reset</button>
              <button class="btn btn-primary" id="memory-reveal-btn">Reveal Next Word</button>
            </div>
          </div>
        </div>
      </div>`;

    document.body.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add('memory-backdrop--visible'));

    // Close
    const closeBtn = backdrop.querySelector('#memory-close');
    closeBtn.addEventListener('click', () => _close(backdrop));
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) _close(backdrop); });
    document.addEventListener('keydown', _escListener = (e) => { if (e.key === 'Escape') _close(backdrop); });

    // Start Practice
    backdrop.querySelector('#memory-start-btn').addEventListener('click', () => {
      backdrop.querySelector('#memory-read-mode').hidden = true;
      backdrop.querySelector('#memory-practice-mode').hidden = false;
      backdrop.querySelector('#memory-subtitle').textContent = 'Tap to reveal each word';
      revealed = 0;
      _updatePractice(backdrop, words, revealed);
      haptic([8]);
    });

    // Reveal Next
    backdrop.querySelector('#memory-reveal-btn').addEventListener('click', () => {
      if (revealed < words.length) {
        revealed++;
        haptic([6]);
        _updatePractice(backdrop, words, revealed);
        if (revealed === words.length) {
          backdrop.querySelector('#memory-subtitle').textContent = '🎉 Complete!';
          backdrop.querySelector('#memory-reveal-btn').textContent = 'Done';
          backdrop.querySelector('#memory-reveal-btn').classList.replace('btn-primary', 'btn-secondary');
          haptic([15, 8, 15]);
        }
      } else {
        _close(backdrop);
      }
    });

    // Reset
    backdrop.querySelector('#memory-reset-btn').addEventListener('click', () => {
      revealed = 0;
      backdrop.querySelector('#memory-subtitle').textContent = 'Tap to reveal each word';
      backdrop.querySelector('#memory-reveal-btn').textContent = 'Reveal Next Word';
      backdrop.querySelector('#memory-reveal-btn').classList.replace('btn-secondary', 'btn-primary');
      _updatePractice(backdrop, words, revealed);
      haptic([6]);
    });
  }

  let _escListener = null;

  function _close(backdrop) {
    backdrop.classList.remove('memory-backdrop--visible');
    if (_escListener) { document.removeEventListener('keydown', _escListener); _escListener = null; }
    setTimeout(() => backdrop.remove(), 260);
  }

  function _buildWordHTML(words, revealed) {
    return words.map((w, i) => {
      if (i < revealed) {
        return `<span class="memory-word memory-word--shown">${_escHtml(w)}</span>`;
      }
      // Shown as blank placeholder — same width as the word
      const len = w.replace(/[^a-zA-Z0-9]/g, '').length;
      const cls = len <= 3 ? 'short' : len <= 6 ? 'med' : 'long';
      return `<span class="memory-word memory-word--hidden memory-word--${cls}" aria-label="hidden word"></span>`;
    }).join(' ');
  }

  function _updatePractice(backdrop, words, revealed) {
    const wordsEl = backdrop.querySelector('#memory-words');
    const fillEl = backdrop.querySelector('#memory-progress-fill');
    const labelEl = backdrop.querySelector('#memory-progress-label');
    if (wordsEl) wordsEl.innerHTML = _buildWordHTML(words, revealed);
    const pct = words.length ? Math.round((revealed / words.length) * 100) : 0;
    if (fillEl) fillEl.style.width = `${pct}%`;
    if (labelEl) labelEl.textContent = `${revealed} / ${words.length}`;
  }

  function _escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { openSheet };
})();

window.MemoryVerseView = MemoryVerseView;
