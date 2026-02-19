/* ============================================================
   ABIDE - Prayer View
   ============================================================ */

const PrayerView = (() => {
  let sessionActive = false;
  let stepIndex = 0;
  let timer = null;
  let timerSeconds = 0;
  let currentFramework = null;

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
