/* ============================================================
   ABIDE - Weekly Plan Builder
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
  ];

  let selectedTopic = '';
  let searchResults = [];

  function render(container) {
    Router.setTitle('Build This Week');
    Router.clearHeaderActions();

    const currentPlan = Store.getPlan();
    const weekStart = DateUtils.weekStart(DateUtils.today());

    const div = document.createElement('div');
    div.className = 'view-content tab-switch-enter';

    div.innerHTML = `
      ${currentPlan ? `
      <!-- Current plan info -->
      <div style="background:var(--color-primary-faint);border:1px solid rgba(45,80,22,0.15);border-radius:var(--radius-lg);padding:var(--space-4) var(--space-5);margin-bottom:24px;display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div class="text-xs font-bold text-brand" style="text-transform:uppercase;letter-spacing:0.08em;margin-bottom:2px;">Current Week</div>
          <div class="font-serif text-xl">${currentPlan.theme || 'This Week\'s Devotions'}</div>
          <div class="text-sm text-secondary">Week of ${DateUtils.format(weekStart)}</div>
        </div>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
      </div>
      ` : ''}

      <p class="text-secondary" style="margin-bottom:20px;line-height:1.6;">
        Choose a theme for this week. We'll search trusted pastors and ministries for devotional content and build your week automatically.
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
        <div class="section-header"><span class="section-title">Or enter your own</span></div>
        <input id="custom-topic" class="input" type="text" placeholder="e.g. Anxiety, Doubt, Gratitude, Lent…" value="${selectedTopic && !SUGGESTED_TOPICS.find(t => t.label === selectedTopic) ? selectedTopic : ''}" />
      </div>

      <!-- Search button -->
      <div id="search-btn-area" style="margin-bottom:24px;">
        ${API.hasWorker() ? `
        <button class="btn btn-primary btn-full" id="search-btn" onclick="PlanView.startSearch()">
          Search Devotional Content →
        </button>
        ` : `
        <div style="background:var(--color-accent-faint);border:1px solid var(--color-accent-warm);border-radius:var(--radius-md);padding:var(--space-4);">
          <p class="text-sm text-secondary" style="margin-bottom:8px;"><strong>Worker not yet connected.</strong></p>
          <p class="text-sm text-secondary" style="line-height:1.6;">To enable live devotional search, deploy the Cloudflare Worker and add its URL in <a onclick="Router.navigate('/settings')" style="color:var(--color-primary);cursor:pointer;">Settings</a>.</p>
          <div style="margin-top:12px;">
            <button class="btn btn-secondary btn-sm" onclick="PlanView.loadSeedPlan()">Load Sample Week Instead</button>
          </div>
        </div>
        `}
      </div>

      <!-- Search results -->
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

  async function startSearch() {
    const customInput = document.getElementById('custom-topic');
    const topic = customInput?.value?.trim() || selectedTopic;

    if (!topic) {
      alert('Please choose or enter a theme first.');
      return;
    }

    selectedTopic = topic;
    const results = document.getElementById('plan-results');
    if (!results) return;

    results.innerHTML = `
      <div class="plan-searching">
        <div class="plan-searching__spinner"></div>
        <p class="text-sm">Searching for "${topic}" across trusted ministries…</p>
      </div>
    `;

    try {
      const data = await API.searchDevotional(topic, DateUtils.weekStart(DateUtils.today()));
      searchResults = data.results || [];
      renderSearchResults(results, topic, searchResults);
    } catch (err) {
      if (err.message === 'NO_WORKER') {
        results.innerHTML = `<p class="text-secondary">Worker not connected. Add your worker URL in Settings first.</p>`;
      } else {
        results.innerHTML = `
          <div class="empty-state">
            <div class="empty-state__title">Search failed</div>
            <div class="empty-state__description">${err.message}</div>
          </div>
        `;
      }
    }
  }

  function renderSearchResults(container, topic, results) {
    if (!results.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__title">No results found</div>
          <div class="empty-state__description">Try a different topic or check your worker connection.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="section-header">
        <span class="section-title">Select Sources (${results.length} found)</span>
      </div>
      <p class="text-sm text-secondary" style="margin-bottom:16px;line-height:1.6;">
        Review these results. Select the ones you want to include in this week's devotions.
      </p>
      <div class="plan-sources" id="sources-list">
        ${results.map((r, i) => `
          <div class="source-card selected" data-idx="${i}">
            <div class="source-card__check">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
            <div class="source-card__content">
              ${r.pastor ? `<div class="source-card__pastor">${r.pastor}</div>` : ''}
              <div class="source-card__title">${r.title || r.url}</div>
              <div class="source-card__url">${r.url}</div>
            </div>
          </div>
        `).join('')}
      </div>
      <button class="btn btn-primary btn-full" onclick="PlanView.confirmPlan('${topic}')">
        Build This Week's Plan →
      </button>
    `;

    // Toggle selection
    container.querySelectorAll('.source-card').forEach(card => {
      card.addEventListener('click', () => {
        card.classList.toggle('selected');
      });
    });
  }

  async function confirmPlan(topic) {
    const selectedCards = document.querySelectorAll('.source-card.selected');
    const approved = [];
    selectedCards.forEach(card => {
      const idx = parseInt(card.dataset.idx);
      if (!isNaN(idx) && searchResults[idx]) {
        approved.push({ ...searchResults[idx], approved: true });
      }
    });

    // Build the plan structure with seed data augmented by sources
    const plan = buildPlan(topic, approved);
    Store.savePlan(plan);

    // Navigate home to see the result
    Router.navigate('/');
  }

  function buildPlan(topic, sources) {
    const weekStart = DateUtils.weekStart(DateUtils.today());
    const keys = DateUtils.weekKeys(weekStart);

    // Build 7 days of devotion content
    // We use a rotation of themes and scripture related to the main topic
    const dayThemes = getDayThemes(topic);

    const days = {};
    keys.forEach((key, i) => {
      const theme = dayThemes[i % dayThemes.length];
      days[key] = buildDayPlan(key, topic, theme, i, sources);
    });

    return {
      week: weekStart,
      theme: topic,
      sources,
      days,
      createdAt: new Date().toISOString(),
    };
  }

  function buildDayPlan(dateKey, topic, theme, dayIndex, sources) {
    // This creates a structured plan from available data
    // In production this would use AI to generate content from the approved sources
    return {
      theme: theme.title,
      morning: {
        title: theme.morningTitle,
        opening_verse: theme.morningVerse,
        body: [
          { type: 'paragraph', content: theme.morningOpener },
          ...(theme.morningScripture ? [{ type: 'scripture_block', reference: theme.morningScripture.ref, text: theme.morningScripture.text }] : []),
          { type: 'paragraph', content: theme.morningBody },
        ],
        reflection_prompts: theme.morningPrompts,
        prayer: theme.morningPrayer,
        midday_prompt: theme.middayPrompt,
      },
      evening: {
        title: theme.eveningTitle,
        opening_verse: theme.eveningVerse,
        body: [
          { type: 'paragraph', content: theme.eveningOpener },
        ],
        reflection_prompts: theme.eveningPrompts,
        prayer: theme.eveningPrayer,
        lectio_divina: theme.lectio,
      },
      faith_stretch: theme.faithStretch,
    };
  }

  function loadSeedPlan() {
    // Load the seed week from the JSON file
    fetch('/faith/content/seed/week-1.json')
      .then(r => r.json())
      .then(data => {
        Store.savePlan(data);
        Router.navigate('/');
      })
      .catch(() => {
        // Build a minimal in-memory plan if seed file isn't loaded yet
        const plan = buildPlan('Grace', []);
        Store.savePlan(plan);
        Router.navigate('/');
      });
  }

  function getDayThemes(topic) {
    // Returns 7 day themes related to the main topic
    const themeMap = {
      'Grace': graceThemes(),
      'Prayer': prayerThemes(),
      'Suffering': sufferingThemes(),
      'Sabbath': sabbathThemes(),
      'Faith': faithThemes(),
      'Forgiveness': forgivenessThemes(),
    };
    return themeMap[topic] || genericThemes(topic);
  }

  function graceThemes() {
    return [
      {
        title: 'New Every Morning',
        morningTitle: 'Waking to Mercy',
        morningVerse: { reference: 'Lamentations 3:22-23', text: 'The steadfast love of the Lord never ceases; his mercies never come to an end; they are new every morning; great is your faithfulness.', translation: 'WEB' },
        morningOpener: 'There is something profound about the morning. Before the weight of the day settles on your shoulders, before the inbox demands and the calendar tyrannizes — there is this: new mercy. Not recycled grace from yesterday, but fresh covenant love, pressed into your hands before you\'ve done a single thing to deserve it.',
        morningScripture: { ref: 'Romans 8:1', text: 'There is therefore now no condemnation for those who are in Christ Jesus.' },
        morningBody: 'Tim Keller once described grace as "accepting a love you can\'t afford." This morning, that love has already been extended to you. The question isn\'t whether you\'ve earned it — you haven\'t, and neither has anyone else. The question is whether you\'ll receive it.',
        morningPrompts: ['What does it feel like to start the day knowing you are already loved — not because of what you\'ll accomplish today?', 'Where did yesterday leave residue of guilt or shame? Bring that specifically to God right now.', 'What is one way you could extend today the same grace you\'ve just received?'],
        morningPrayer: 'Lord, before I reach for my phone or plan my day, I reach for you. Thank you that your mercies are already new — I didn\'t have to earn them overnight. Help me carry this grace into every interaction today. Amen.',
        middayPrompt: 'Pause for 60 seconds. Ask: "Where has God\'s grace shown up in my morning that I almost missed?"',
        eveningTitle: 'Ending in Rest',
        eveningVerse: { reference: 'Psalm 4:8', text: 'I will both lay me down in peace, and sleep; for you, the Lord alone, make me live in safety.', translation: 'WEB' },
        eveningOpener: 'The day is done. Whatever it held — the victories you expected, the failures you didn\'t — you are still held. This is the posture of evening prayer: not a review of your performance, but a returning.',
        eveningPrompts: ['Name one moment from today where you sensed God\'s presence, even faintly.', 'Is there anything from today you need to release before you sleep? Name it and give it to God.', 'Who showed you kindness today? Take 30 seconds to thank God for them by name.'],
        eveningPrayer: 'Father, I return to you at the close of this day. I lay down the weight of what I did and didn\'t do. You are faithful even when I am not. Guard my mind through the night. Amen.',
        lectio: { passage: 'Psalm 23', steps: [{ name: 'Lectio (Read)', instruction: 'Read Psalm 23 slowly, aloud if possible. Read it twice.' }, { name: 'Meditatio (Meditate)', instruction: 'Which word or phrase stopped you? Sit with it for two minutes.' }, { name: 'Oratio (Pray)', instruction: 'Let that word become your prayer. Talk to God about what it stirred in you.' }, { name: 'Contemplatio (Rest)', instruction: 'Simply rest in God\'s presence for two to three minutes. No agenda.' }] },
        faithStretch: { title: 'The Gratitude Inventory', description: 'Before bed tonight, write down 10 specific things you\'re grateful for from today. Not generic things — specific moments. The mundane details are where God hides.', journal_prompt: 'Write about a time when God showed up in a way you almost dismissed as coincidence. Looking back, what do you believe about that moment?' },
      },
      {
        title: 'The Wilderness of Grace',
        morningTitle: 'Why God Allows the Hard Road',
        morningVerse: { reference: 'Deuteronomy 8:2', text: 'You shall remember all the way which the Lord your God has led you these forty years in the wilderness, that he might humble you, to test you, to know what was in your heart, whether you would keep his commandments, or not.', translation: 'WEB' },
        morningOpener: 'The wilderness was not a mistake. God didn\'t lose his GPS coordinates and accidentally leave his people wandering. He led them there. John Mark Comer writes that the places of greatest spiritual formation are rarely the comfortable ones — they\'re the narrow roads, the dry seasons, the waiting.',
        morningScripture: { ref: 'Matthew 4:1', text: 'Then Jesus was led up by the Spirit into the wilderness to be tempted by the devil.' },
        morningBody: 'Even Jesus went through the wilderness — and he was led there by the Spirit. Whatever wilderness you\'re in right now, you are not alone, and it is not punishment. It may be the very place where God is stripping away what you don\'t need so you can find what you\'ve been looking for.',
        morningPrompts: ['What "wilderness" are you currently in — a season of waiting, uncertainty, or lack?', 'What might God be forming in you through this season that couldn\'t happen any other way?', 'Where have you been tempted to take a shortcut out of your wilderness rather than trusting God through it?'],
        morningPrayer: 'Lord, I confess I often prefer comfort to formation. But you led even your Son through the wilderness. Help me trust that you are present in mine, and that what feels like abandonment might be apprenticeship. Amen.',
        middayPrompt: 'Take 2 minutes away from your screen. Ask: "What is the thing I\'ve been avoiding feeling? Can I bring it to God right now?"',
        eveningTitle: 'Manna for Today',
        eveningVerse: { reference: 'Exodus 16:4', text: 'The Lord said to Moses, "Behold, I will rain bread from the sky for you, and the people shall go out and gather a day\'s portion every day."', translation: 'WEB' },
        eveningOpener: 'Manna didn\'t keep. You couldn\'t stockpile it for later, hoard it for a rainy day. It was daily provision — enough for today. That was the point. God was teaching his people to need him every morning, not just in times of crisis.',
        eveningPrompts: ['What did you receive today that you didn\'t earn or plan — provision that just showed up?', 'Where are you trying to "stockpile" security rather than trusting God day by day?', 'What would it look like to go to bed tonight without being anxious about tomorrow?'],
        eveningPrayer: 'Father, you gave manna in the wilderness. You provide what I need when I need it — not always when I want it, or how. Help me trust your provision for tomorrow without needing to control it tonight. Amen.',
        lectio: { passage: 'Psalm 46', steps: [{ name: 'Lectio (Read)', instruction: 'Read Psalm 46 slowly. Notice the contrast between chaos and stillness.' }, { name: 'Meditatio (Meditate)', instruction: '"Be still and know that I am God." Sit with just that phrase for two minutes.' }, { name: 'Oratio (Pray)', instruction: 'What chaos in your life needs to hear this verse? Pray it over that situation.' }, { name: 'Contemplatio (Rest)', instruction: 'Be still. No words. Just be known by God.' }] },
        faithStretch: { title: '24-Hour Fast from Complaint', description: 'For the next 24 hours, practice zero verbal complaint. Every time you feel the urge to complain — about traffic, a person, your circumstances — pause, and say one thing you\'re grateful for instead.', journal_prompt: 'Write about one area of your life where you have been complaining rather than praying. What would it look like to surrender that to God and trust him with it?' },
      },
    ];
  }

  function prayerThemes() {
    return genericThemes('Prayer');
  }

  function sufferingThemes() {
    return genericThemes('Suffering');
  }

  function sabbathThemes() {
    return genericThemes('Sabbath');
  }

  function faithThemes() {
    return genericThemes('Faith');
  }

  function forgivenessThemes() {
    return genericThemes('Forgiveness');
  }

  function genericThemes(topic) {
    // Generic 7-day structure for any topic
    const days = [
      { day: 'What is ' + topic + '?', verse: 'Hebrews 11:1' },
      { day: topic + ' in Scripture', verse: 'Romans 5:1' },
      { day: 'When ' + topic + ' is hard', verse: 'Mark 9:24' },
      { day: topic + ' and community', verse: 'Hebrews 10:24-25' },
      { day: topic + ' and action', verse: 'James 2:17' },
      { day: topic + ' and rest', verse: 'Matthew 11:28' },
      { day: 'Living ' + topic, verse: 'Philippians 4:7' },
    ];

    return days.map(d => ({
      title: d.day,
      morningTitle: 'Morning: ' + d.day,
      morningVerse: { reference: d.verse, text: 'Look up this passage in your Bible today.', translation: 'WEB' },
      morningOpener: `This week we\'re exploring the theme of ${topic}. Take time this morning to sit with what this theme means to you personally before anything else.`,
      morningScripture: null,
      morningBody: `As you approach ${topic} today, come with an open hand rather than a closed fist. What does God want to give you through this theme that you haven\'t yet received?`,
      morningPrompts: [`What does ${topic} mean to you personally — in your own words, not a definition?`, `Where in your life do you most need to experience ${topic} right now?`, `What would it look like to live this theme more fully today?`],
      morningPrayer: `Lord, I want to understand and experience ${topic} more deeply. Open my heart to what you have for me this week. Amen.`,
      middayPrompt: `Pause at noon: In what moment this morning did you experience what you prayed for? If you didn\'t notice — look again.`,
      eveningTitle: 'Evening: ' + d.day,
      eveningVerse: { reference: 'Psalm 63:6', text: 'When I remember you on my bed, and meditate on you in the night watches.', translation: 'WEB' },
      eveningOpener: 'End your day by returning to what you explored this morning. What landed? What is still sitting with you?',
      eveningPrompts: [`How did today\'s theme of ${topic} show up in your actual day — in ways you expected or didn\'t?`, 'What is one thing you want to carry from today into tomorrow?', 'Is there anything you need to surrender to God before you sleep?'],
      eveningPrayer: `Father, thank you for today. I give back to you what I cannot carry through the night. Amen.`,
      lectio: { passage: 'Psalm 63', steps: [{ name: 'Lectio (Read)', instruction: 'Read Psalm 63 slowly.' }, { name: 'Meditatio (Meditate)', instruction: 'What phrase speaks to your soul right now?' }, { name: 'Oratio (Pray)', instruction: 'Use that phrase to pray back to God.' }, { name: 'Contemplatio (Rest)', instruction: 'Rest in silence for 3 minutes.' }] },
      faithStretch: { title: topic + ' in Action', description: `This week, find one tangible way to live out ${topic} toward someone in your life.`, journal_prompt: `Write about how your understanding of ${topic} has changed or deepened this week.` },
    }));
  }

  return { render, startSearch, confirmPlan, loadSeedPlan };
})();

window.PlanView = PlanView;
