/* ============================================================
   ABIDE - Weekly Plan Builder
   Uses AI (via Cloudflare Worker → OpenAI) to generate
   a full 7-day devotional plan for any theme or phrase.
   Falls back to built-in seed content if worker is unavailable.
   ============================================================ */

const PlanView = (() => {
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

  function render(container) {
    Router.setTitle('Build This Week');
    Router.clearHeaderActions();

    const currentPlan = Store.getPlan();
    const weekStart = DateUtils.weekStart(DateUtils.today());

    const div = document.createElement('div');
    div.className = 'view-content tab-switch-enter';

    div.innerHTML = `
      ${currentPlan ? `
      <div style="background:var(--color-primary-faint);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:var(--space-4) var(--space-5);margin-bottom:var(--space-5);display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div class="text-xs font-bold text-brand" style="text-transform:uppercase;letter-spacing:0.08em;margin-bottom:2px;">Current Week</div>
          <div class="font-serif text-xl">${currentPlan.theme || 'This Week\'s Devotions'}</div>
          <div class="text-sm text-secondary">Week of ${DateUtils.format(weekStart)}</div>
        </div>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
      </div>
      ` : ''}

      <p class="text-secondary" style="margin-bottom:var(--space-5);line-height:1.6;">
        Pick a theme or type anything — a word, a struggle, a question. AI will search trusted pastors and ministries and build a full 7-day devotional plan for you.
      </p>

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
        <input id="custom-topic" class="input" type="text"
          placeholder="e.g. 'Why does God allow suffering', 'being a father', 'Psalm 23'…"
          value="${selectedTopic && !SUGGESTED_TOPICS.find(t => t.label === selectedTopic) ? selectedTopic : ''}" />
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
    root.querySelectorAll('.topic-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        selectedTopic = chip.dataset.topic;
        root.querySelectorAll('.topic-chip').forEach(c => c.classList.toggle('selected', c.dataset.topic === selectedTopic));
        const customInput = root.querySelector('#custom-topic');
        if (customInput) customInput.value = '';
      });
    });

    const customInput = root.querySelector('#custom-topic');
    if (customInput) {
      customInput.addEventListener('input', () => {
        if (customInput.value.trim()) {
          selectedTopic = customInput.value.trim();
          root.querySelectorAll('.topic-chip').forEach(c => c.classList.remove('selected'));
        }
      });
    }
  }

  async function startBuild() {
    const customInput = document.getElementById('custom-topic');
    const topic = customInput?.value?.trim() || selectedTopic;

    if (!topic) {
      alert('Please choose or type a theme first.');
      return;
    }

    selectedTopic = topic;
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
        <p class="text-xs text-muted" style="text-align:center;margin-top:4px;">This takes about 20 seconds</p>
      </div>
    `;

    try {
      // Try AI-generated plan first
      const aiPlan = await API.buildAIPlan(topic);

      if (aiPlan && aiPlan.days && aiPlan.days.length > 0) {
        // Convert AI plan format to the app's internal format
        const plan = convertAIPlanToAppFormat(topic, aiPlan);
        Store.savePlan(plan);
        showSuccess(results, topic, true);
      } else {
        throw new Error('AI returned empty plan');
      }

    } catch (err) {
      console.error('AI plan failed:', err);

      // Fall back to seed plan with an in-app message
      results.innerHTML = `
        <div style="background:var(--color-accent-warm);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:var(--space-5);text-align:center;">
          <p class="text-sm" style="margin-bottom:var(--space-3);line-height:1.6;">
            <strong>AI plan builder needs the Cloudflare Worker to be deployed.</strong><br>
            Loading a sample week on Grace in the meantime.
          </p>
          <p class="text-xs text-muted" style="margin-bottom:var(--space-3);line-height:1.5;">
            See <code>worker/README.md</code> to set up the worker once and unlock AI plans for any topic.
          </p>
          <button class="btn btn-primary btn-sm" onclick="PlanView.loadSeedPlan()">Load Sample Week</button>
        </div>
      `;
    }

    if (buildBtn) {
      buildBtn.disabled = false;
      buildBtn.textContent = '✨ Build This Week\'s Plan';
    }
  }

  function showSuccess(container, topic, isAI) {
    container.innerHTML = `
      <div style="background:var(--color-primary-faint);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:var(--space-5);text-align:center;">
        <div style="font-size:2rem;margin-bottom:var(--space-2);">✅</div>
        <div class="font-serif text-xl" style="margin-bottom:var(--space-2);">Your week is ready</div>
        <p class="text-sm text-secondary" style="margin-bottom:var(--space-4);line-height:1.5;">
          7-day devotional plan on <strong>${topic}</strong>${isAI ? ', written by AI from trusted ministry sources' : ''}.
        </p>
        <button class="btn btn-primary" onclick="Router.navigate('/')">
          Start Today's Devotion →
        </button>
      </div>
    `;
  }

  function convertAIPlanToAppFormat(topic, aiPlan) {
    const weekStart = DateUtils.weekStart(DateUtils.today());
    const keys = DateUtils.weekKeys(weekStart);

    const days = {};
    const aiDays = aiPlan.days || [];

    keys.forEach((key, i) => {
      const aiDay = aiDays[i] || aiDays[i % aiDays.length];
      if (!aiDay) return;

      days[key] = {
        theme: aiDay.title || topic,
        morning: {
          title: aiDay.morning?.title || `Morning — Day ${i + 1}`,
          opening_verse: aiDay.morning?.opening_verse || null,
          body: aiDay.morning?.body || [],
          reflection_prompts: aiDay.morning?.reflection_prompts || [],
          prayer: aiDay.morning?.prayer || '',
          midday_prompt: aiDay.morning?.midday_prompt || '',
        },
        evening: {
          title: aiDay.evening?.title || `Evening — Day ${i + 1}`,
          opening_verse: aiDay.evening?.opening_verse || null,
          body: aiDay.evening?.body || [],
          reflection_prompts: aiDay.evening?.reflection_prompts || [],
          prayer: aiDay.evening?.prayer || '',
          lectio_divina: aiDay.evening?.lectio_divina || null,
        },
        faith_stretch: aiDay.faith_stretch || null,
      };
    });

    return {
      week: weekStart,
      theme: topic,
      aiGenerated: true,
      days,
      createdAt: new Date().toISOString(),
    };
  }

  function loadSeedPlan() {
    fetch('/faith/content/seed/week-1.json')
      .then(r => r.json())
      .then(data => {
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
    const weekStart = DateUtils.weekStart(DateUtils.today());
    const keys = DateUtils.weekKeys(weekStart);
    const days = {};
    keys.forEach((key, i) => {
      days[key] = {
        theme: topic,
        morning: {
          title: `${topic} — Day ${i + 1}`,
          opening_verse: { reference: 'Lamentations 3:22-23', text: 'The steadfast love of the Lord never ceases; his mercies never come to an end; they are new every morning; great is your faithfulness.', translation: 'WEB' },
          body: [{ type: 'paragraph', content: `Today we explore the theme of ${topic}. Take a moment to sit quietly and ask God what he wants to show you today.` }],
          reflection_prompts: [`What does ${topic} mean to you personally?`, `Where do you most need to experience ${topic} right now?`],
          prayer: `Lord, open my heart to ${topic} today. Amen.`,
          midday_prompt: `How has ${topic} shown up in your morning?`,
        },
        evening: {
          title: `Evening Reflection`,
          opening_verse: { reference: 'Psalm 63:6', text: 'When I remember you on my bed, and meditate on you in the night watches.', translation: 'WEB' },
          body: [{ type: 'paragraph', content: 'End your day by returning to what you explored this morning.' }],
          reflection_prompts: [`How did ${topic} show up today?`, 'What do you want to carry into tomorrow?'],
          prayer: 'Father, thank you for today. I give back to you what I cannot carry. Amen.',
        },
      };
    });
    return { week: weekStart, theme: topic, days, createdAt: new Date().toISOString() };
  }

  // Keep for backward compatibility
  async function startSearch() { return startBuild(); }

  return { render, startBuild, startSearch, loadSeedPlan };
})();

window.PlanView = PlanView;
