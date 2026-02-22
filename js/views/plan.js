/* ============================================================
   ABIDE - Weekly Plan Builder
   Uses AI (via Cloudflare Worker → OpenAI) to generate
   a full 7-day devotional plan for any theme or phrase.
   Falls back to built-in seed content if worker is unavailable.
   ============================================================ */

const PlanView = (() => {
  const DEFAULT_WEEK_THEME = 'Grace';
  const MIN_MORNING_WORDS = 260;
  const MIN_EVENING_WORDS = 190;
  const MIN_MORNING_PARAS = 4;
  const MIN_EVENING_PARAS = 3;
  const SUGGESTED_TOPICS = [
    { label: 'Grace', icon: '🕊️' },
    { label: 'Prayer', icon: '🙏' },
    { label: 'Suffering', icon: '✝️' },
    { label: 'Sabbath', icon: '🌿' },
    { label: 'Vocation', icon: '⚒️' },
    { label: 'Community', icon: '🫂' },
    { label: 'Forgiveness', icon: '💛' },
    { label: 'Hope', icon: '🌅' },
    { label: 'Faith', icon: '⚓' },
    { label: 'Surrender', icon: '🤲' },
    { label: 'Identity', icon: '👤' },
    { label: 'Anxiety', icon: '🌊' },
    { label: 'Gratitude', icon: '🙌' },
    { label: 'Holiness', icon: '✨' },
  ];

  let selectedTopic = '';

  function inferThemeFromDays(plan) {
    const days = plan?.days || {};
    const values = Object.values(days)
      .map((d) => String(d?.theme || '').trim())
      .filter(Boolean);
    if (!values.length) return '';
    const counts = new Map();
    values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  }

  function textWordCount(text = '') {
    return String(text).trim().split(/\s+/).filter(Boolean).length;
  }

  function escapeHtml(text = '') {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function summarizeTopicLocal(raw) {
    if (!raw || raw.length <= 40) return raw;
    // Extract the first sentence fragment or first 6 words — whichever is shorter
    const firstSentence = raw.split(/[.!?]/)[0].trim();
    const words = firstSentence.split(/\s+/).slice(0, 6).join(' ');
    // Trim trailing minor words (prepositions, articles, conjunctions)
    return words.replace(/\s+(a|an|the|in|of|on|and|but|or|for|to)$/i, '').trim();
  }

  function dateKeyPlusDays(dateKey, days = 0) {
    const base = DateUtils.fromKey(dateKey || DateUtils.today());
    const out = new Date(base);
    out.setDate(base.getDate() + Number(days || 0));
    return DateUtils.toKey(out);
  }

  function buildConsecutiveKeys(startDateKey, count = 7) {
    const keys = [];
    for (let i = 0; i < count; i += 1) keys.push(dateKeyPlusDays(startDateKey, i));
    return keys;
  }

  function paragraphsFromSession(session = {}) {
    if (Array.isArray(session.body)) {
      return session.body
        .filter(b => b?.type === 'paragraph' && b?.content)
        .map(b => b.content.trim())
        .filter(Boolean);
    }
    const raw = String(session.devotion || '').trim();
    if (!raw) return [];
    return raw.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  }

  function validatePlanLength(aiPlan) {
    const issues = [];
    const days = aiPlan?.days || [];

    days.forEach((day, i) => {
      const dayNum = i + 1;
      const mParas = paragraphsFromSession(day?.morning || {});
      const eParas = paragraphsFromSession(day?.evening || {});
      const mWords = textWordCount(mParas.join(' '));
      const eWords = textWordCount(eParas.join(' '));

      if (mParas.length < MIN_MORNING_PARAS || mWords < MIN_MORNING_WORDS) {
        issues.push(`Day ${dayNum} morning too short (${mWords} words / ${mParas.length} paragraphs)`);
      }
      if (eParas.length < MIN_EVENING_PARAS || eWords < MIN_EVENING_WORDS) {
        issues.push(`Day ${dayNum} evening too short (${eWords} words / ${eParas.length} paragraphs)`);
      }
    });

    return issues;
  }

  function render(container) {
    Router.setTitle('Build This Week');
    Router.clearHeaderActions();

    const currentPlan = Store.getPlan();
    const defaultWeekStart = DateUtils.weekStart(DateUtils.today());
    const currentWeekTheme = String(currentPlan?.theme || '').trim() || inferThemeFromDays(currentPlan) || DEFAULT_WEEK_THEME;
    const currentWeekStart = currentPlan?.week || defaultWeekStart;
    const isDefaultWeek = !currentPlan || !!currentPlan?.seedDefault;
    const trustedPastors = Store.getTrustedPastors().filter(p => p.enabled).map(p => p.name);
    const hasPreviousPlan = Store.hasPlanHistory();
    const pendingPlan = Store.getPendingPlanInfo();
    const dayKeys = Object.keys(currentPlan?.days || {}).sort((a, b) => a.localeCompare(b));
    const totalSessions = dayKeys.length * 2;
    const savedSessions = dayKeys.reduce((count, key) => {
      let next = count;
      if (Store.isSavedDevotion(key, 'morning')) next += 1;
      if (Store.isSavedDevotion(key, 'evening')) next += 1;
      return next;
    }, 0);

    const div = document.createElement('div');
    div.className = 'view-content tab-switch-enter';

    div.innerHTML = `
      ${pendingPlan?.activationDate ? `
      <div style="background:var(--accent-soft);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:var(--space-3) var(--space-4);margin-bottom:var(--space-4);">
        <div class="text-xs text-muted" style="text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">Queued Plan</div>
        <div class="text-sm" style="line-height:1.5;">
          <strong>${escapeHtml(pendingPlan.theme || 'Next Plan')}</strong> will activate on <strong>${DateUtils.format(pendingPlan.activationDate)}</strong>.
        </div>
      </div>` : ''}

      <div style="background:var(--color-primary-faint);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:var(--space-4) var(--space-5);margin-bottom:var(--space-5);display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div class="text-xs font-bold text-brand" style="text-transform:uppercase;letter-spacing:0.08em;margin-bottom:2px;">
            ${isDefaultWeek ? 'Current Week (Default)' : 'Current Week'}
          </div>
          <div class="font-serif text-xl">${escapeHtml(currentWeekTheme)}</div>
          <div class="text-sm text-secondary">Week of ${DateUtils.format(currentWeekStart)}</div>
          ${isDefaultWeek ? '<div class="text-xs text-muted" style="margin-top:4px;">Build a new plan any time to replace this default week.</div>' : ''}
          <div class="text-xs text-muted" style="margin-top:6px;">
            ${totalSessions ? `Saved devotions from this week: ${savedSessions} of ${totalSessions}` : 'No generated week found yet. Build a week, then save all 7 days at once.'}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end;">
          ${hasPreviousPlan ? `<button class="btn btn-secondary btn-sm" onclick="PlanView.revertPreviousPlan()">Revert Previous</button>` : ''}
          <button class="btn btn-secondary btn-sm" onclick="PlanView.saveWholeWeek()">${totalSessions && savedSessions >= totalSessions ? 'Week Saved ✓' : 'Save Full Week'}</button>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </div>
      </div>

      <!-- Pastor transparency -->
      <div style="background:var(--glass-fill);backdrop-filter:blur(var(--glass-blur));-webkit-backdrop-filter:blur(var(--glass-blur));border:1px solid var(--glass-border);border-radius:var(--radius-lg);padding:var(--space-4) var(--space-5);margin-bottom:var(--space-5);">
        <div style="font-size:var(--text-xs);font-weight:var(--weight-bold);color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:var(--space-2);">Inspired by trusted teachers</div>
        <div id="pastor-chips" style="display:flex;flex-wrap:wrap;gap:var(--space-2);margin-bottom:var(--space-3);">
          ${trustedPastors.length
            ? trustedPastors.map(name => `<span class="pastor-chip">${name}</span>`).join('')
            : '<span class="text-sm text-secondary">No trusted pastors selected yet.</span>'}
        </div>
        <p style="font-size:var(--text-xs);color:var(--text-tertiary);line-height:1.5;">
          Manage trusted pastors in Settings. Every generated day will list who influenced it.
        </p>
      </div>

      <!-- Topic suggestions -->
      <div class="section-header"><span class="section-title">Choose a Theme</span></div>
      <div class="plan-topics" id="topics-grid">
        ${SUGGESTED_TOPICS.map(t => `
          <button class="topic-chip ${selectedTopic === t.label ? 'selected' : ''}" data-topic="${t.label}">
            ${t.icon} ${t.label}
          </button>
        `).join('')}
      </div>

      <!-- Custom topic input -->
      <div class="plan-custom-input">
        <div class="section-header"><span class="section-title">Or type anything</span></div>
        <div class="plan-dictation-row">
          <input id="custom-topic" class="input plan-topic-input" type="text"
            placeholder="e.g. 'Why does God allow suffering', 'being a father', 'Psalm 23'…"
            value="${selectedTopic && !SUGGESTED_TOPICS.find(t => t.label === selectedTopic) ? selectedTopic : ''}" />
          <button class="plan-mic-btn" id="btn-mic" title="Dictate your topic" aria-label="Start voice dictation" type="button">
            <svg class="plan-mic-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="2" width="6" height="12" rx="3"/>
              <path d="M5 10a7 7 0 0 0 14 0"/>
              <line x1="12" y1="17" x2="12" y2="22"/>
              <line x1="8" y1="22" x2="16" y2="22"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Build button -->
      <div id="build-btn-area" style="margin-bottom:var(--space-6);">
        <button class="btn btn-primary btn-full" id="build-btn" onclick="PlanView.startBuild()">
          ✨ Build This Week's Plan
        </button>
        <p class="text-xs text-muted" style="text-align:center;margin-top:var(--space-2);line-height:1.5;">
          Takes 15–30 seconds. Uses AI to write original devotions inspired by your approved pastors.
        </p>
      </div>

      <!-- Use sample instead -->
      <div style="text-align:center;margin-bottom:var(--space-6);">
        <button class="btn btn-ghost btn-sm" onclick="PlanView.loadSeedPlan()">
          Use sample week instead (Grace)
        </button>
      </div>

      <!-- Build results / progress -->
      <div id="plan-results"></div>
    `;

    container.innerHTML = '';
    container.appendChild(div);
    setupTopicPicker(div);
  }

  function setupTopicPicker(root) {
    root.querySelectorAll('.topic-chip[data-topic]').forEach(chip => {
      chip.addEventListener('click', () => {
        selectedTopic = chip.dataset.topic;
        root.querySelectorAll('.topic-chip[data-topic]').forEach(c => c.classList.toggle('selected', c.dataset.topic === selectedTopic));
        const customInput = root.querySelector('#custom-topic');
        if (customInput) customInput.value = '';
      });
    });

    const customInput = root.querySelector('#custom-topic');
    if (customInput) {
      customInput.addEventListener('input', () => {
        if (customInput.value.trim()) {
          selectedTopic = customInput.value.trim();
          root.querySelectorAll('.topic-chip[data-topic]').forEach(c => c.classList.remove('selected'));
        }
      });
    }

    // Voice dictation
    const micBtn = root.querySelector('#btn-mic');
    if (micBtn) {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) {
        micBtn.remove();
      } else {
        let recognition = null;
        let isRecording = false;
        let fullTranscript = '';
        let interimTranscript = '';
        let latestComposed = '';
        let stopTimer = null;

        const clearStopTimer = () => {
          if (stopTimer) {
            clearTimeout(stopTimer);
            stopTimer = null;
          }
        };

        const resetMicUi = () => {
          isRecording = false;
          clearStopTimer();
          micBtn.classList.remove('recording');
          micBtn.setAttribute('aria-label', 'Start voice dictation');
        };

        micBtn.addEventListener('click', () => {
          if (isRecording) {
            try { recognition?.stop(); } catch {}
            micBtn.setAttribute('aria-label', 'Stopping recording');
            return;
          }

          try {
            recognition = new SR();
          } catch (err) {
            console.warn('Could not initialize speech recognition:', err);
            alert('Voice dictation is not available on this browser.');
            return;
          }

          // Safari is more stable with single-shot recognition than continuous mode.
          recognition.continuous = false;
          recognition.interimResults = true;
          recognition.lang = 'en-US';
          recognition.maxAlternatives = 1;

          isRecording = true;
          fullTranscript = customInput ? customInput.value.trim() : (selectedTopic || '');
          micBtn.classList.add('recording');
          micBtn.setAttribute('aria-label', 'Stop recording');

          recognition.onresult = (e) => {
            interimTranscript = '';
            let finalChunk = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
              if (e.results[i].isFinal) finalChunk += e.results[i][0].transcript;
              else interimTranscript += e.results[i][0].transcript;
            }
            if (finalChunk) fullTranscript = (fullTranscript ? fullTranscript + ' ' : '') + finalChunk.trim();
            latestComposed = (fullTranscript + (interimTranscript ? ' ' + interimTranscript : '')).trim();
            if (customInput) customInput.value = latestComposed;
            // Keep selectedTopic in sync
            selectedTopic = customInput ? customInput.value.trim() : latestComposed;
            root.querySelectorAll('.topic-chip[data-topic]').forEach(c => c.classList.remove('selected'));
          };

          recognition.onend = () => {
            const committed = (latestComposed || fullTranscript || (customInput ? customInput.value : '') || '').trim();
            fullTranscript = committed;
            resetMicUi();
            if (customInput) customInput.value = committed;
            selectedTopic = (customInput ? customInput.value.trim() : committed).trim();
            latestComposed = '';
            interimTranscript = '';
          };

          recognition.onerror = (e) => {
            console.warn('Speech recognition error:', e.error);
            resetMicUi();
            if (e.error && !['no-speech', 'aborted'].includes(e.error)) {
              alert('Voice dictation could not start. Please type your topic or try again.');
            }
          };

          try {
            recognition.start();
            // Failsafe: if the recognizer stalls and never resolves, recover UI.
            stopTimer = setTimeout(() => {
              try { recognition?.stop(); } catch {}
              resetMicUi();
            }, 15000);
          } catch (err) {
            console.warn('Speech recognition start failed:', err);
            resetMicUi();
            alert('Voice dictation could not start. Please type your topic.');
          }
        });
      }
    }

  }

  async function startBuild() {
    const customInput = document.getElementById('custom-topic');
    const rawTopic = customInput?.value?.trim() || selectedTopic;

    if (!rawTopic) {
      alert('Please choose or type a theme first.');
      return;
    }

    const topic = rawTopic;               // full text sent to AI
    let displayTopic = summarizeTopicLocal(rawTopic); // short title for plan theme
    if (rawTopic.split(/\s+/).filter(Boolean).length > 5) {
      try {
        const summary = await API.summarizeTopic(rawTopic);
        const label = String(summary?.label || '').trim();
        if (label) displayTopic = label;
      } catch (err) {
        console.warn('AI topic summary failed, using local summary:', err.message || err);
      }
    }
    selectedTopic = rawTopic;

    const trustedPastors = Store.getTrustedPastors().filter(p => p.enabled).map(p => p.name);
    if (!trustedPastors.length) {
      alert('Select at least one trusted pastor in Settings first.');
      return;
    }

    const results = document.getElementById('plan-results');
    const buildBtn = document.getElementById('build-btn');
    if (!results) return;

    // Disable button, show progress
    if (buildBtn) {
      buildBtn.disabled = true;
      buildBtn.textContent = '✨ Building your plan…';
    }

    results.innerHTML = `
      <div class="plan-searching">
        <div class="plan-searching__spinner"></div>
        <p class="text-sm text-secondary" style="text-align:center;max-width:260px;">
          Searching trusted ministries for "${topic}"<br>and writing your devotions…
        </p>
        <p class="text-xs text-muted" style="text-align:center;margin-top:4px;">Influences: ${trustedPastors.join(', ')}</p>
        <p class="text-xs text-muted" style="text-align:center;margin-top:4px;">This takes about 20 seconds</p>
      </div>
    `;

    try {
      const aiPlan = await API.buildAIPlan(topic, trustedPastors, {
        minMorningWords: MIN_MORNING_WORDS,
        minEveningWords: MIN_EVENING_WORDS,
        minMorningParagraphs: MIN_MORNING_PARAS,
        minEveningParagraphs: MIN_EVENING_PARAS,
      });

      if (aiPlan && aiPlan.days && aiPlan.days.length > 0) {
        const lengthIssues = validatePlanLength(aiPlan);
        if (lengthIssues.length) {
          throw new Error(`Plan too short: ${lengthIssues.slice(0, 2).join('; ')}`);
        }
        const todayKey = DateUtils.today();
        const tomorrowKey = dateKeyPlusDays(todayKey, 1);
        const existingPlan = Store.getPlan();
        const existingKeys = Object.keys(existingPlan?.days || {});
        const hasExistingPlan = existingKeys.length > 0;
        const preferredMode = String(Store.get('planBuildStartMode') || '').trim().toLowerCase();
        let activationMode = 'today';

        if (hasExistingPlan) {
          activationMode = await askPlanActivationMode(preferredMode === 'tomorrow' ? 'tomorrow' : 'today');
          if (!activationMode) {
            if (buildBtn) {
              buildBtn.disabled = false;
              buildBtn.textContent = '✨ Build This Week\'s Plan';
            }
            Store.set('planBuildStartMode', '');
            return;
          }
        }

        const startDateKey = activationMode === 'tomorrow' ? tomorrowKey : todayKey;
        const plan = convertAIPlanToAppFormat(topic, displayTopic, aiPlan, trustedPastors, startDateKey);

        if (activationMode === 'tomorrow') {
          Store.queuePlanForDate(plan, tomorrowKey);
          showSuccess(results, displayTopic, true, formatPlanModelLabel(aiPlan?.ai_meta), true, tomorrowKey);
        } else {
          Store.savePlan(plan);
          showSuccess(results, displayTopic, true, formatPlanModelLabel(aiPlan?.ai_meta));
        }
        Store.set('planBuildStartMode', '');
      } else {
        throw new Error('AI returned empty plan');
      }

    } catch (err) {
      console.error('AI plan failed:', err);
      const reason = escapeHtml(err?.message || 'generation error');

      // Fall back to seed plan with an in-app message
      results.innerHTML = `
        <div style="background:var(--color-accent-warm);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:var(--space-5);text-align:center;">
          <p class="text-sm" style="margin-bottom:var(--space-3);line-height:1.6;">
            <strong>AI plan generation did not return long-form content yet.</strong><br>
            Reason: ${reason}
          </p>
          <p class="text-xs text-muted" style="margin-bottom:var(--space-3);line-height:1.5;">
            You can retry, or load a longer built-in sample week.
          </p>
          <button class="btn btn-secondary btn-sm" style="margin-right:8px;" onclick="PlanView.startBuild()">Retry AI Build</button>
          <button class="btn btn-primary btn-sm" onclick="PlanView.loadSeedPlan()">Load Sample Week</button>
        </div>
      `;
    }

    if (buildBtn) {
      buildBtn.disabled = false;
      buildBtn.textContent = '✨ Build This Week\'s Plan';
    }
  }

  function formatPlanModelLabel(meta = null) {
    if (!meta?.provider) return '';
    const provider = String(meta.provider).trim();
    const models = Array.isArray(meta.models) ? meta.models.filter(Boolean) : [];
    if (!models.length) return `Provider: ${provider}`;
    return `Provider: ${provider} | Model${models.length > 1 ? 's' : ''}: ${models.join(', ')}`;
  }

  function showSuccess(container, topic, isAI, modelLine = '', queued = false, queuedDate = '') {
    container.innerHTML = `
      <div style="background:var(--color-primary-faint);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:var(--space-5);text-align:center;">
        <div style="font-size:2rem;margin-bottom:var(--space-2);">✅</div>
        <div class="font-serif text-xl" style="margin-bottom:var(--space-2);">${queued ? 'Your next week is queued' : 'Your week is ready'}</div>
        <p class="text-sm text-secondary" style="margin-bottom:var(--space-4);line-height:1.5;">
          7-day devotional plan on <strong>${topic}</strong>${isAI ? ', written by AI from trusted ministry sources' : ''}${queued ? `.<br>It will activate on <strong>${DateUtils.format(queuedDate)}</strong>.` : '.'}
        </p>
        ${modelLine ? `<p class="text-xs text-muted" style="margin-bottom:var(--space-3);">${escapeHtml(modelLine)}</p>` : ''}
        <button class="btn btn-primary" onclick="Router.navigate('/')">
          ${queued ? 'Return To Today →' : 'Start Today\'s Devotion →'}
        </button>
      </div>
    `;
  }

  function convertAIPlanToAppFormat(topic, displayTopic, aiPlan, trustedPastors = [], startDateKey = DateUtils.today()) {
    const weekStart = DateUtils.weekStart(startDateKey);
    const keys = buildConsecutiveKeys(startDateKey, 7);
    const translation = API.translationLabel(Store.get('bibleTranslation') || 'web');

    const days = {};
    const aiDays = aiPlan.days || [];

    keys.forEach((key, i) => {
      const aiDay = aiDays[i] || aiDays[i % aiDays.length];
      if (!aiDay) return;

      // Build the opening_verse object from the AI's scripture_ref field
      const morningRef = aiDay.morning?.scripture_ref || '';
      const eveningRef = aiDay.evening?.scripture_ref || '';

      const inspiredBy = Array.isArray(aiDay.inspired_by) && aiDay.inspired_by.length
        ? aiDay.inspired_by
        : trustedPastors.slice(0, 3);

      days[key] = {
        theme: aiDay.title || topic,
        morning: {
          title: aiDay.morning?.title || `Morning — Day ${i + 1}`,
          opening_verse: morningRef
            ? { reference: morningRef, text: '', translation }
            : (aiDay.morning?.opening_verse || null),
          body: aiDay.morning?.body
            ? aiDay.morning.body
            : (aiDay.morning?.devotion
                ? aiDay.morning.devotion.split(/\n{2,}/).map(p => ({ type: 'paragraph', content: p.trim() })).filter(b => b.content)
                : []),
          reflection_prompts: aiDay.morning?.reflection_prompts || [],
          prayer: aiDay.morning?.prayer || '',
          midday_prompt: aiDay.morning?.midday_prompt || '',
          inspired_by: inspiredBy,
        },
        evening: {
          title: aiDay.evening?.title || `Evening — Day ${i + 1}`,
          opening_verse: eveningRef
            ? { reference: eveningRef, text: '', translation }
            : (aiDay.evening?.opening_verse || null),
          body: aiDay.evening?.body
            ? aiDay.evening.body
            : (aiDay.evening?.devotion
                ? aiDay.evening.devotion.split(/\n{2,}/).map(p => ({ type: 'paragraph', content: p.trim() })).filter(b => b.content)
                : []),
          reflection_prompts: aiDay.evening?.reflection_prompts || [],
          prayer: aiDay.evening?.prayer || '',
          lectio_divina: aiDay.evening?.lectio_divina || null,
          inspired_by: inspiredBy,
        },
        faith_stretch: aiDay.faith_stretch || null,
        sources: inspiredBy.map(name => ({
          pastor: name,
          approved: true,
          note: 'Pastoral influence',
        })),
      };
    });

    return {
      week: weekStart,
      startDate: startDateKey,
      theme: displayTopic || topic,
      aiGenerated: true,
      seedDefault: false,
      aiMeta: aiPlan?.ai_meta || null,
      days,
      createdAt: new Date().toISOString(),
    };
  }

  function loadSeedPlan() {
    fetch('content/seed/week-1.json')
      .then(r => r.json())
      .then(data => {
        data.seedDefault = true;
        data.startDate = DateUtils.today();
        Store.savePlan(data);
        Router.navigate('/');
      })
      .catch(() => {
        const plan = buildFallbackPlan('Grace');
        Store.savePlan(plan);
        Router.navigate('/');
      });
  }

  // Minimal fallback if everything fails
  function buildFallbackPlan(topic) {
    const startDate = DateUtils.today();
    const weekStart = DateUtils.weekStart(startDate);
    const keys = buildConsecutiveKeys(startDate, 7);
    const days = {};
    keys.forEach((key, i) => {
      days[key] = {
        theme: topic,
        morning: {
          title: `${topic} — Day ${i + 1}`,
          opening_verse: { reference: 'Lamentations 3:22-23', text: 'The steadfast love of the Lord never ceases; his mercies never come to an end; they are new every morning; great is your faithfulness.', translation: 'WEB' },
          body: [
            { type: 'paragraph', content: `Today we explore the theme of ${topic}, not as an abstract idea but as lived discipleship. Begin by slowing down and naming where your attention has been shaped this week. Much of our spiritual fatigue comes from reacting to everything and reflecting on very little. Before you move into tasks, ask God for clarity: what one truth do I need to receive today so I can walk faithfully rather than anxiously?` },
            { type: 'paragraph', content: `Scripture invites us to form a deeper interior life, where obedience grows from trust. As you read, notice which phrase confronts your assumptions. The goal is not information alone, but transformation through surrender. Consider where resistance appears in you: fear of change, fear of loss, or simply distraction. Bring that resistance into prayer directly and specifically. God does not shame honest confession; he meets it with grace and direction.` },
            { type: 'paragraph', content: `Before ending this morning, translate conviction into one concrete step. Choose something measurable and practical: one conversation to begin, one habit to pause, one act of mercy to offer, one apology to make, or one person to encourage. Small faithfulness, repeated daily, is how character forms over time. Ask the Spirit to keep your heart attentive through the day so this devotion becomes embodied rather than forgotten.` },
          ],
          reflection_prompts: [`What does ${topic} mean to you personally?`, `Where do you most need to experience ${topic} right now?`],
          prayer: `Lord, open my heart to ${topic} today. Amen.`,
          midday_prompt: `How has ${topic} shown up in your morning?`,
        },
        evening: {
          title: `Evening Reflection`,
          opening_verse: { reference: 'Psalm 63:6', text: 'When I remember you on my bed, and meditate on you in the night watches.', translation: 'WEB' },
          body: [
            { type: 'paragraph', content: `End your day by returning to what you explored this morning. Review your day with honesty and mercy: where did you respond in faith, and where did you drift into hurry, defensiveness, or self-reliance? Don’t flatten the day into success or failure. Instead, trace moments of grace and moments of need. This kind of reflection trains your heart to notice God’s presence in ordinary hours.` },
            { type: 'paragraph', content: `Now release what you are still carrying. Name unresolved tensions, undone tasks, and emotional residue from difficult interactions. Offer them to God without pretending they are small. Christian rest is not denial; it is trust. Ask for peace that is deeper than immediate resolution, and for renewed desire to follow Jesus tomorrow with humility, courage, and attentiveness.` },
          ],
          reflection_prompts: [`How did ${topic} show up today?`, 'What do you want to carry into tomorrow?'],
          prayer: 'Father, thank you for today. I give back to you what I cannot carry. Amen.',
        },
      };
    });
    return { week: weekStart, startDate, theme: topic, seedDefault: true, days, createdAt: new Date().toISOString() };
  }

  async function askPlanActivationMode(preferred = 'today') {
    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.className = 'abide-delete-dialog-backdrop';
      backdrop.innerHTML = `
        <div class="abide-delete-dialog" role="dialog" aria-modal="true" aria-label="Plan activation">
          <div class="abide-delete-dialog__title">When should this plan start?</div>
          <div class="abide-delete-dialog__body">
            Start now to replace today immediately, or queue it for tomorrow so you can finish today’s study.
          </div>
          <div class="abide-delete-dialog__actions">
            <button class="btn btn-secondary btn-sm" data-plan-action="cancel">Cancel</button>
            <button class="btn ${preferred === 'today' ? 'btn-primary' : 'btn-secondary'} btn-sm" data-plan-action="today">Start today (Day 1)</button>
            <button class="btn ${preferred === 'tomorrow' ? 'btn-primary' : 'btn-secondary'} btn-sm" data-plan-action="tomorrow">Start tomorrow</button>
          </div>
        </div>
      `;
      function close(value = '') {
        backdrop.remove();
        resolve(value);
      }
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(''); });
      backdrop.querySelector('[data-plan-action="cancel"]')?.addEventListener('click', () => close(''));
      backdrop.querySelector('[data-plan-action="today"]')?.addEventListener('click', () => close('today'));
      backdrop.querySelector('[data-plan-action="tomorrow"]')?.addEventListener('click', () => close('tomorrow'));
      document.body.appendChild(backdrop);
    });
  }

  function prepareNextStudy() {
    Store.set('planBuildStartMode', 'tomorrow');
    Router.navigate('/plan');
  }

  // Keep for backward compatibility
  async function startSearch() { return startBuild(); }

  function saveWholeWeek() {
    const result = Store.saveEntirePlan();
    if (!result.total) {
      alert('No current weekly plan found to save yet.');
      return;
    }
    alert(`Saved ${result.total} devotion sessions for this week. (${result.added} new)`);
    const container = document.getElementById('view-container');
    if (container) render(container);
  }

  function revertPreviousPlan() {
    const result = Store.restorePreviousPlan();
    if (!result?.ok) {
      alert('No previous plan is available to restore.');
      return;
    }
    const container = document.getElementById('view-container');
    if (container) render(container);
    alert(`Restored previous plan${result.theme ? `: ${result.theme}` : ''}.`);
  }

  return { render, startBuild, startSearch, loadSeedPlan, saveWholeWeek, revertPreviousPlan, prepareNextStudy };
})();

window.PlanView = PlanView;
