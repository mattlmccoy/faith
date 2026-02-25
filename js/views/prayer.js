/* ============================================================
   ABIDE - Prayer View
   ============================================================ */

const PrayerView = (() => {
  let sessionActive = false;
  let stepIndex = 0;
  let timer = null;
  let timerSeconds = 0;
  let currentFramework = null;
  let sessionScripture = null; // { reference, text, verses[] } — set during pre-step

  // Frameworks that benefit from a scripture passage pre-step
  const SCRIPTURE_FRAMEWORKS = ['lectio', 'breath'];

  // Curated passages well-suited to contemplative prayer
  const CURATED_PASSAGES = [
    { ref: 'Psalm 23:1-6', label: 'Psalm 23 — The Lord is my shepherd' },
    { ref: 'Psalm 46:1-3', label: 'Psalm 46 — God is our refuge' },
    { ref: 'John 15:1-8', label: 'John 15 — The vine and the branches' },
    { ref: 'Philippians 4:6-7', label: 'Philippians 4:6-7 — Do not be anxious' },
    { ref: 'Isaiah 40:31', label: 'Isaiah 40:31 — Renew your strength' },
    { ref: 'Matthew 11:28-30', label: 'Matthew 11:28-30 — Come to me and rest' },
  ];

  const FRAMEWORKS = [
    {
      id: 'acts',
      name: 'ACTS Prayer',
      tagline: 'A structured framework for balanced, complete prayer',
      duration_minutes: 10,
      steps: [
        {
          label: 'A',
          name: 'Adoration',
          description: 'Begin by praising God for who He is — not what He\'s done, but His character. His holiness, faithfulness, love, and power.',
          prompts: [
            '"God, you are ______. Help me see you as you actually are right now."',
            'What attribute of God do you most need to encounter today? Praise Him for it specifically.',
          ],
          duration_seconds: 150,
        },
        {
          label: 'C',
          name: 'Confession',
          description: 'Come honest. Not to earn forgiveness — it\'s already given through Christ — but to walk in the light with nothing hidden.',
          prompts: [
            'What have I done this week that was more about my glory than God\'s?',
            'Where have I been avoiding God\'s presence because of shame or guilt?',
          ],
          duration_seconds: 120,
        },
        {
          label: 'T',
          name: 'Thanksgiving',
          description: 'Name specific gifts — not generic ones. The mundane details of your life are where God hides.',
          prompts: [
            'What happened in the last 24 hours that I almost took for granted?',
            'Who has God placed in my life that I haven\'t thanked Him for recently?',
          ],
          duration_seconds: 120,
        },
        {
          label: 'S',
          name: 'Supplication',
          description: 'Now bring your requests — for yourself and others. Pray boldly. God is not annoyed by your asking.',
          prompts: [
            'What do I actually need today? Not want — need.',
            'Who is on my heart that needs prayer? Name them specifically and pray for them by name.',
          ],
          duration_seconds: 120,
        },
      ],
    },
    {
      id: 'lectio',
      name: 'Lectio Divina',
      tagline: 'Ancient monastic practice of sacred reading — slow, attentive, prayerful',
      duration_minutes: 15,
      steps: [
        {
          label: '1',
          name: 'Lectio — Read',
          description: 'Choose a short passage (4-8 verses). Read it slowly, aloud if possible. Read it twice. Let the words land.',
          prompts: [
            'Suggested passage: Whatever is in today\'s devotion, or Psalm 46, or John 15:1-8.',
            'Don\'t rush. There\'s no prize for finishing quickly.',
          ],
          duration_seconds: 180,
        },
        {
          label: '2',
          name: 'Meditatio — Meditate',
          description: 'Which word or phrase stopped you? Don\'t analyze it — sit with it. Let it simmer. Repeat it quietly.',
          prompts: [
            'What word or phrase feels like it was written for you today?',
            'Why might God be drawing your attention to that word right now?',
          ],
          duration_seconds: 180,
        },
        {
          label: '3',
          name: 'Oratio — Pray',
          description: 'Let that word become your prayer. Move from reading to talking. Tell God what it stirred in you.',
          prompts: [
            'Use the word or phrase as the starting point of your prayer.',
            'What is God inviting you toward through this text?',
          ],
          duration_seconds: 180,
        },
        {
          label: '4',
          name: 'Contemplatio — Rest',
          description: 'Simply rest in God\'s presence. No agenda, no more talking. Just be with Him. This is the hardest step.',
          prompts: [
            'Set everything down. Just be present.',
            'If your mind wanders, return to the word or phrase and breathe.',
          ],
          duration_seconds: 180,
        },
      ],
    },
    {
      id: 'examen',
      name: 'Daily Examen',
      tagline: 'An Ignatian practice for reviewing your day with God — gratitude and honesty',
      duration_minutes: 10,
      steps: [
        {
          label: '1',
          name: 'Become Aware',
          description: 'Ask the Holy Spirit to help you see your day clearly — not through guilt or pride, but through truth and grace.',
          prompts: [
            'Quiet yourself. Take three slow breaths.',
            '"Holy Spirit, show me my day as you see it."',
          ],
          duration_seconds: 60,
        },
        {
          label: '2',
          name: 'Give Thanks',
          description: 'Review the last 24 hours and notice gifts — large and small. Gratitude opens the eyes.',
          prompts: [
            'What happened today that I\'m genuinely grateful for?',
            'Name three specific moments. They can be small.',
          ],
          duration_seconds: 120,
        },
        {
          label: '3',
          name: 'Review the Day',
          description: 'Walk back through your day like you\'re reviewing a film. Where did you move toward God? Away? Where did love show up or fail?',
          prompts: [
            'Where did you feel most alive, most yourself today?',
            'Where did you feel drained, anxious, or distant from God?',
          ],
          duration_seconds: 180,
        },
        {
          label: '4',
          name: 'Face the Darkness',
          description: 'Name honestly any failure, wrong word, missed moment. Bring it to Jesus. He already knows.',
          prompts: [
            'Is there anything from today you need to confess or release?',
            'Receive forgiveness. Don\'t carry it into tomorrow.',
          ],
          duration_seconds: 90,
        },
        {
          label: '5',
          name: 'Look to Tomorrow',
          description: 'What does tomorrow hold? Surrender it. Ask for what you\'ll need.',
          prompts: [
            'What is tomorrow asking of you?',
            '"Lord, give me what I need for tomorrow. I trust you."',
          ],
          duration_seconds: 90,
        },
      ],
    },
    {
      id: 'breath',
      name: 'Breath Prayer',
      tagline: 'A single phrase prayed in rhythm with breathing — ancient and accessible',
      duration_minutes: 5,
      steps: [
        {
          label: '→',
          name: 'Choose Your Phrase',
          description: 'Select or create a short two-part prayer. One phrase for the inhale, one for the exhale. Simple enough to carry all day.',
          prompts: [
            '"Breathe in: Lord Jesus Christ / Breathe out: have mercy on me."',
            '"Breathe in: You are with me / Breathe out: I am not afraid."',
            '"Breathe in: I am yours / Breathe out: You are mine."',
          ],
          duration_seconds: 60,
        },
        {
          label: '◉',
          name: 'Breathe and Pray',
          description: 'Close your eyes. Inhale slowly for 4 counts. Hold for 2. Exhale for 4. Repeat your chosen phrase in rhythm with each breath.',
          prompts: [
            'Inhale slowly, speak the first phrase in your heart.',
            'Exhale slowly, speak the second phrase.',
            'Let the rhythm quiet your mind. This is prayer without words running out.',
          ],
          duration_seconds: 240,
        },
      ],
    },
  ];

  function render(container) {
    Router.setTitle('Prayer');
    Router.clearHeaderActions();

    const div = document.createElement('div');
    div.className = 'view-content tab-switch-enter';

    div.innerHTML = `
      <p class="text-secondary" style="margin-bottom:24px;line-height:1.6;">
        Choose a prayer practice. Each one is a different posture before God — find what your soul needs today.
      </p>
      <div class="prayer-frameworks-list">
        ${FRAMEWORKS.map(f => `
          <button class="framework-card" data-id="${f.id}">
            <div class="framework-card__accent"></div>
            <div class="framework-card__body">
              <div class="framework-card__header">
                <div class="framework-card__name">${f.name}</div>
                <div class="framework-card__duration">${f.duration_minutes} min</div>
              </div>
              <div class="framework-card__tagline">${f.tagline}</div>
            </div>
          </button>
        `).join('')}
      </div>
    `;

    div.querySelectorAll('.framework-card').forEach(card => {
      card.addEventListener('click', () => {
        const fw = FRAMEWORKS.find(f => f.id === card.dataset.id);
        if (fw) startSession(container, fw);
      });
    });

    container.innerHTML = '';
    container.appendChild(div);
  }

  function startSession(container, framework) {
    currentFramework = framework;
    stepIndex = 0;
    sessionActive = true;
    sessionScripture = null;

    if (SCRIPTURE_FRAMEWORKS.includes(framework.id)) {
      renderScripturePicker(container, framework);
    } else {
      renderStep(container, framework, 0);
    }
  }

  function renderScripturePicker(container, framework) {
    Router.setTitle(framework.name);
    Router.setHeaderActions(`<button class="btn btn-ghost btn-sm" onclick="PrayerView.endSession()">Done</button>`);

    const div = document.createElement('div');
    div.className = 'view-content prayer-step-enter';
    div.innerHTML = `
      <div style="text-align:center;margin-bottom:20px;">
        <div style="font-family:var(--font-serif);font-size:var(--text-2xl);color:var(--text-primary);margin-bottom:6px;">Choose a Passage</div>
        <div style="font-size:var(--text-sm);color:var(--text-secondary);">Select the scripture you'll meditate on during ${framework.name}.</div>
      </div>

      <!-- Today's devotion option -->
      <div class="prayer-scripture-option" id="picker-today" style="display:flex;align-items:center;gap:12px;padding:14px 16px;background:var(--glass-fill);border:1px solid var(--glass-border);border-radius:var(--radius-md);margin-bottom:12px;cursor:pointer;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;color:var(--accent)"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <div style="flex:1;min-width:0;">
          <div style="font-size:var(--text-sm);font-weight:var(--weight-medium);color:var(--text-primary);">Today's Devotion</div>
          <div style="font-size:var(--text-xs);color:var(--text-secondary)" id="today-verse-ref">Loading…</div>
        </div>
        <div class="prayer-scripture-spinner" id="today-spinner" style="display:none;"><div class="plan-searching__spinner" style="width:16px;height:16px;"></div></div>
      </div>

      <!-- Topic/phrase search -->
      <div style="margin-bottom:12px;">
        <div style="display:flex;gap:8px;">
          <input type="text" id="scripture-topic-input" class="input" placeholder="Search by topic or phrase…" style="flex:1;" />
          <button class="btn btn-secondary btn-sm" id="scripture-search-btn">Search</button>
        </div>
        <div id="scripture-search-results" style="margin-top:10px;display:flex;flex-direction:column;gap:8px;"></div>
      </div>

      <!-- Curated suggestions -->
      <div class="section-header" style="margin-bottom:10px;"><span class="section-title">Suggested Passages</span></div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:24px;">
        ${CURATED_PASSAGES.map(p => `
          <button class="btn btn-secondary picker-curated" data-ref="${p.ref}" style="text-align:left;justify-content:flex-start;font-size:var(--text-sm);padding:10px 14px;">
            ${p.label}
          </button>
        `).join('')}
      </div>

      <button class="btn btn-ghost btn-sm" style="width:100%;" id="picker-skip">Skip — use my own passage</button>
    `;

    container.innerHTML = '';
    container.appendChild(div);

    // Auto-load today's verse reference using Store APIs
    const todayRef = container.querySelector('#today-verse-ref');
    const todaySpinner = container.querySelector('#today-spinner');
    const todayCard = container.querySelector('#picker-today');
    (() => {
      try {
        const dateKey = Store.getSelectedDevotionDate();
        const dayData = Store.getDevotionData(dateKey);
        const session = (typeof DateUtils !== 'undefined' ? DateUtils.session() : 'morning');
        const sessionData = dayData?.[session] || dayData?.morning;
        const verseRef = sessionData?.scripture_reference || sessionData?.verse_reference || sessionData?.reference;
        if (verseRef) {
          if (todayRef) todayRef.textContent = verseRef;
          todayCard._verseRef = verseRef;
        } else {
          if (todayRef) todayRef.textContent = 'No devotion loaded yet';
          todayCard.style.opacity = '0.5';
          todayCard.style.pointerEvents = 'none';
        }
      } catch (_) {
        if (todayRef) todayRef.textContent = 'No devotion loaded yet';
      }
    })();

    // Today's devotion click
    todayCard.addEventListener('click', async () => {
      const ref = todayCard._verseRef;
      if (!ref) return;
      if (todaySpinner) todaySpinner.style.display = 'block';
      await _loadAndStart(container, framework, ref);
    });

    // Curated passage clicks
    div.querySelectorAll('.picker-curated').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Loading…';
        await _loadAndStart(container, framework, btn.dataset.ref);
      });
    });

    // Topic search
    const searchBtn = div.querySelector('#scripture-search-btn');
    const topicInput = div.querySelector('#scripture-topic-input');
    const resultsEl = div.querySelector('#scripture-search-results');
    searchBtn.addEventListener('click', async () => {
      const q = topicInput.value.trim();
      if (!q) return;
      searchBtn.disabled = true;
      searchBtn.textContent = '…';
      resultsEl.innerHTML = '<div class="plan-searching__spinner" style="width:18px;height:18px;margin:8px auto;"></div>';
      try {
        const results = await API.searchPhrase(q);
        const verses = results?.results || results?.verses || [];
        if (!verses.length) {
          resultsEl.innerHTML = '<p style="font-size:var(--text-xs);color:var(--text-secondary);padding:4px 0;">No results found.</p>';
        } else {
          resultsEl.innerHTML = verses.slice(0, 4).map(v => `
            <button class="btn btn-secondary picker-search-result" data-ref="${v.reference || v.ref}" style="text-align:left;justify-content:flex-start;font-size:var(--text-xs);padding:10px 12px;line-height:1.5;">
              <strong style="display:block;margin-bottom:2px;">${v.reference || v.ref}</strong>
              <span style="color:var(--text-secondary);">${(v.text || '').slice(0, 100)}${(v.text || '').length > 100 ? '…' : ''}</span>
            </button>
          `).join('');
          resultsEl.querySelectorAll('.picker-search-result').forEach(btn => {
            btn.addEventListener('click', async () => {
              btn.disabled = true;
              await _loadAndStart(container, framework, btn.dataset.ref);
            });
          });
        }
      } catch (_) {
        resultsEl.innerHTML = '<p style="font-size:var(--text-xs);color:var(--text-secondary);padding:4px 0;">Search unavailable.</p>';
      }
      searchBtn.disabled = false;
      searchBtn.textContent = 'Search';
    });
    topicInput.addEventListener('keydown', e => { if (e.key === 'Enter') searchBtn.click(); });

    // Skip
    div.querySelector('#picker-skip').addEventListener('click', () => {
      sessionScripture = null;
      renderStep(container, framework, 0);
    });
  }

  async function _loadAndStart(container, framework, ref) {
    try {
      const data = await API.getPassage(ref);
      sessionScripture = {
        reference: data.reference || ref,
        text: data.text || '',
        verses: data.verses || [],
      };
    } catch (_) {
      sessionScripture = { reference: ref, text: '', verses: [] };
    }
    renderStep(container, framework, 0);
  }

  function renderStep(container, framework, index) {
    const step = framework.steps[index];
    const isLast = index === framework.steps.length - 1;

    Router.setTitle(framework.name);
    Router.setHeaderActions(`
      <button class="btn btn-ghost btn-sm" onclick="PrayerView.endSession()">Done</button>
    `);

    const div = document.createElement('div');
    div.className = 'view-content prayer-step-enter';

    div.innerHTML = `
      <!-- Step progress dots -->
      <div class="prayer-session__progress" style="margin-bottom:24px;">
        ${framework.steps.map((_, i) => `
          <div class="prayer-session__step-dot ${i === index ? 'active' : i < index ? 'done' : ''}"></div>
        `).join('')}
      </div>

      <!-- Step label + name -->
      <div style="text-align:center;margin-bottom:24px;">
        <div class="prayer-session__step-label">Step ${index + 1} of ${framework.steps.length}</div>
        ${step.label !== undefined ? `<div style="font-family:var(--font-serif);font-size:3rem;color:var(--color-primary);margin:8px 0;line-height:1;">${step.label}</div>` : ''}
        <h2 style="font-family:var(--font-serif);font-size:var(--text-2xl);color:var(--color-text-primary);">${step.name}</h2>
      </div>

      <!-- Description -->
      <div class="prayer-card" style="margin-bottom:24px;text-align:center;">
        <div class="prayer-card__text" style="font-style:normal;font-size:var(--text-base);line-height:1.7;">${step.description}</div>
      </div>

      <!-- Scripture passage (Lectio Divina / Breath Prayer) -->
      ${sessionScripture && SCRIPTURE_FRAMEWORKS.includes(framework.id) ? (() => {
        const verses = sessionScripture.verses || [];
        const passageHtml = verses.length > 0
          ? verses.map(v => `<span class="passage-verse" style="display:block;margin-bottom:6px;"><sup style="font-size:0.7em;margin-right:4px;color:var(--text-tertiary);">${v.verse}</sup>${v.text.trim()}</span>`).join('')
          : `<p style="line-height:1.8;">${sessionScripture.text || ''}</p>`;
        if (index === 0) {
          // Step 1: show passage prominently
          return `
            <div class="scripture-card" style="margin-bottom:24px;">
              <div class="scripture-card__ref" style="font-size:var(--text-xs);color:var(--text-secondary);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;">${sessionScripture.reference}</div>
              <div class="scripture-card__text" style="font-family:var(--font-serif);font-size:var(--text-lg);line-height:1.7;">${passageHtml}</div>
            </div>
          `;
        } else {
          // Later steps: collapsed reference bar, expandable
          return `
            <details style="margin-bottom:16px;background:var(--glass-fill);border:1px solid var(--glass-border);border-radius:var(--radius-sm);padding:8px 12px;">
              <summary style="font-size:var(--text-xs);color:var(--text-secondary);cursor:pointer;list-style:none;display:flex;align-items:center;gap:6px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                ${sessionScripture.reference}
              </summary>
              <div style="margin-top:10px;font-family:var(--font-serif);font-size:var(--text-base);line-height:1.7;color:var(--text-primary);">${passageHtml}</div>
            </details>
          `;
        }
      })() : ''}

      <!-- Prompts -->
      ${step.prompts?.length ? `
      <div class="section-header"><span class="section-title">Prompts</span></div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:24px;">
        ${step.prompts.map(p => `
          <div class="devotion-scripture-block">
            <div class="devotion-scripture-block__text" style="font-size:var(--text-base);font-style:italic;">${p}</div>
          </div>
        `).join('')}
      </div>
      ` : ''}

      <!-- Timer -->
      <div style="text-align:center;margin-bottom:32px;">
        <div class="timer-display" id="prayer-timer">${formatTime(step.duration_seconds)}</div>
        <div class="progress-bar" style="margin-top:12px;">
          <div class="progress-bar__fill" id="timer-progress" style="width:100%;background:var(--color-primary);"></div>
        </div>
        <button class="btn btn-ghost btn-sm" id="timer-toggle" style="margin-top:12px;" onclick="PrayerView.toggleTimer()">
          Start Timer
        </button>
      </div>

      <!-- Footer nav -->
      <div style="display:flex;gap:12px;">
        ${index > 0 ? `
        <button class="btn btn-secondary" style="flex:1;" onclick="PrayerView.prevStep()">← Back</button>
        ` : `
        <button class="btn btn-secondary" style="flex:1;" onclick="PrayerView.endSession()">Exit</button>
        `}
        <button class="btn btn-primary" style="flex:1;" onclick="PrayerView.nextStep()">
          ${isLast ? 'Finish ✓' : 'Next Step →'}
        </button>
      </div>
    `;

    container.innerHTML = '';
    container.appendChild(div);

    // Reset timer state
    timerSeconds = step.duration_seconds;
    clearInterval(timer);
    timer = null;
    document.getElementById('prayer-timer').textContent = formatTime(timerSeconds);
  }

  let timerRunning = false;
  let totalDuration = 0;

  function toggleTimer() {
    const btn = document.getElementById('timer-toggle');
    if (!timerRunning) {
      timerRunning = true;
      if (btn) btn.textContent = 'Pause';
      totalDuration = timerSeconds;
      timer = setInterval(() => {
        timerSeconds--;
        const el = document.getElementById('prayer-timer');
        const prog = document.getElementById('timer-progress');
        if (el) {
          el.textContent = formatTime(timerSeconds);
          if (timerSeconds <= 10) el.classList.add('timer-warning');
        }
        if (prog) {
          const pct = (timerSeconds / totalDuration) * 100;
          prog.style.width = `${Math.max(0, pct)}%`;
        }
        if (timerSeconds <= 0) {
          clearInterval(timer);
          timerRunning = false;
          if (btn) btn.textContent = 'Done ✓';
          if (el) { el.classList.remove('timer-warning'); el.textContent = '0:00'; }
        }
      }, 1000);
    } else {
      timerRunning = false;
      clearInterval(timer);
      if (btn) btn.textContent = 'Resume';
    }
  }

  function nextStep() {
    clearInterval(timer);
    timerRunning = false;
    const container = document.getElementById('view-container');
    if (stepIndex >= currentFramework.steps.length - 1) {
      endSession();
    } else {
      stepIndex++;
      renderStep(container, currentFramework, stepIndex);
    }
  }

  function prevStep() {
    clearInterval(timer);
    timerRunning = false;
    const container = document.getElementById('view-container');
    if (stepIndex > 0) {
      stepIndex--;
      renderStep(container, currentFramework, stepIndex);
    }
  }

  function endSession() {
    clearInterval(timer);
    timerRunning = false;
    sessionActive = false;
    currentFramework = null;
    stepIndex = 0;
    sessionScripture = null;
    Router.clearHeaderActions();
    const container = document.getElementById('view-container');
    render(container);
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  return { render, startSession, nextStep, prevStep, endSession, toggleTimer };
})();

window.PrayerView = PrayerView;
