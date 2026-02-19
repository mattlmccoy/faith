/* ============================================================
   ABIDE - Full Devotion Reader
   ============================================================ */

const DevotionView = (() => {
  function render(container) {
    Router.setTitle('Devotion');
    Router.clearHeaderActions();

    const devotionData = Store.getTodayDevotionData();
    const session = Store.get('_sessionOverride') || DateUtils.session();
    const div = document.createElement('div');
    div.className = 'view-content view-enter';

    if (!devotionData) {
      div.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__title">No devotion for today</div>
          <div class="empty-state__description">Build this week's plan to get started.</div>
          <button class="btn btn-primary" onclick="Router.navigate('/settings')">Build Plan</button>
        </div>
      `;
      container.innerHTML = '';
      container.appendChild(div);
      return;
    }

    const sessionData = devotionData[session];
    if (!sessionData) {
      div.innerHTML = `<p class="text-secondary" style="padding:20px;">No ${session} devotion available.</p>`;
      container.innerHTML = '';
      container.appendChild(div);
      return;
    }

    div.innerHTML = `
      <!-- Session toggle at top -->
      <div style="margin-bottom: 20px;">
        <div class="session-toggle">
          <button class="session-toggle__btn ${session === 'morning' ? 'session-toggle__btn--active' : ''}" data-session="morning">
            ☀️ Morning
          </button>
          <button class="session-toggle__btn ${session === 'evening' ? 'session-toggle__btn--active' : ''}" data-session="evening">
            🌙 Evening
          </button>
        </div>
      </div>

      <!-- Header -->
      <div class="devotion-header">
        <div class="devotion-meta">
          <span class="badge badge-${session === 'morning' ? 'morning' : 'evening'}">${session === 'morning' ? '☀️ Morning' : '🌙 Evening'}</span>
          <span class="text-sm text-muted">${DateUtils.format(DateUtils.today())}</span>
        </div>
        ${devotionData.theme ? `<p class="text-sm text-brand font-medium" style="margin-bottom:8px;">${devotionData.theme}</p>` : ''}
        <h1 class="devotion-title">${sessionData.title || 'Today\'s Devotion'}</h1>
      </div>

      <!-- Opening verse -->
      ${sessionData.opening_verse ? `
      <div style="margin-bottom:28px;">
        <div class="scripture-card scripture-card--${session}">
          <div class="scripture-card__text">${sessionData.opening_verse.text}</div>
          <div class="scripture-card__reference">${sessionData.opening_verse.reference}</div>
          <div class="scripture-card__translation">${sessionData.opening_verse.translation || 'WEB'}</div>
        </div>
      </div>
      ` : ''}

      <!-- Devotion body -->
      <div class="devotion-body">
        ${renderBody(sessionData.body || [])}
      </div>

      <div class="divider"></div>

      <!-- Reflection prompts -->
      ${sessionData.reflection_prompts?.length ? `
      <div class="devotion-reflection">
        <div class="devotion-reflection-title">Questions for Reflection</div>
        <div class="devotion-prompts-list">
          ${sessionData.reflection_prompts.map((p, i) => `
            <div class="prompt-card">
              <div class="prompt-card__number">${i + 1}</div>
              <div class="prompt-card__text">${p}</div>
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}

      <!-- Prayer -->
      ${sessionData.prayer ? `
      <div class="devotion-prayer">
        <div class="prayer-card">
          <div class="prayer-card__label">A Prayer</div>
          <div class="prayer-card__text">${sessionData.prayer}</div>
        </div>
      </div>
      ` : ''}

      <!-- Midday prompt (morning only) -->
      ${session === 'morning' && sessionData.midday_prompt ? `
      <div class="midday-banner" style="margin-bottom:24px;">
        <div class="midday-banner__icon">⏰</div>
        <div class="midday-banner__content">
          <div class="midday-banner__title">Midday Check-in</div>
          <div class="midday-banner__text">${sessionData.midday_prompt}</div>
        </div>
      </div>
      ` : ''}

      <!-- Lectio Divina (evening) -->
      ${session === 'evening' && sessionData.lectio_divina ? `
      <div class="devotion-lectio">
        <div class="devotion-reflection-title">Lectio Divina — ${sessionData.lectio_divina.passage || ''}</div>
        <p class="text-secondary text-sm" style="margin-bottom:16px;line-height:1.6;">
          An ancient practice of sacred reading. Move through each step slowly and without hurry.
        </p>
        ${sessionData.lectio_divina.steps.map(s => `
          <div class="lectio-step">
            <div class="lectio-step__name">${s.name}</div>
            <div class="lectio-step__instruction">${s.instruction}</div>
          </div>
        `).join('')}
      </div>
      ` : ''}

      <!-- Faith Stretch -->
      ${devotionData.faith_stretch ? `
      <div style="margin-bottom:24px;">
        <div class="section-header">
          <span class="section-title">Faith Stretch</span>
        </div>
        <div class="stretch-card">
          <div class="stretch-card__label">Today's Challenge</div>
          <div class="stretch-card__title">${devotionData.faith_stretch.title}</div>
          <div class="stretch-card__description">${devotionData.faith_stretch.description}</div>
        </div>
      </div>

      ${devotionData.faith_stretch.journal_prompt ? `
      <div style="margin-bottom:24px;">
        <button class="btn btn-secondary btn-full" onclick="Router.navigate('/journal')">
          Open Journal →
        </button>
      </div>
      ` : ''}
      ` : ''}

      <!-- Sources -->
      ${devotionData.sources?.filter(s => s.approved)?.length ? `
      <div class="divider-text">Sources</div>
      ${devotionData.sources.filter(s => s.approved).map(s => `
        <div class="text-xs text-muted" style="margin-bottom:4px;">
          ${s.pastor ? `<strong>${s.pastor}</strong> — ` : ''}
          <a href="${s.url}" target="_blank" rel="noopener" style="color:var(--color-primary);">${s.url}</a>
        </div>
      `).join('')}
      ` : ''}
    `;

    // Session toggle
    div.querySelectorAll('.session-toggle__btn').forEach(btn => {
      btn.addEventListener('click', () => {
        Store.set('_sessionOverride', btn.dataset.session);
        render(container);
      });
    });

    container.innerHTML = '';
    container.appendChild(div);
  }

  function renderBody(body) {
    return body.map(block => {
      if (block.type === 'paragraph') {
        return `<p class="devotion-paragraph">${block.content}</p>`;
      }
      if (block.type === 'scripture_block') {
        return `
          <div class="devotion-scripture-block">
            <div class="devotion-scripture-block__text">"${block.text}"</div>
            ${block.reference ? `<div class="devotion-scripture-block__ref">— ${block.reference}</div>` : ''}
          </div>
        `;
      }
      if (block.type === 'heading') {
        return `<h3 class="text-xl font-serif" style="margin-bottom:12px;">${block.content}</h3>`;
      }
      return '';
    }).join('');
  }

  return { render };
})();

window.DevotionView = DevotionView;
