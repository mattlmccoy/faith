/* ============================================================
   ABIDE - Feature / Bug Feedback
   ============================================================ */

const FeedbackView = (() => {
  function render(container) {
    Router.setTitle('Send Feedback');
    Router.clearHeaderActions();

    const profile = Store.get('googleProfile') || {};
    const appVersion = window.__ABIDE_VERSION__ || 'dev';

    const div = document.createElement('div');
    div.className = 'view-content view-enter';
    div.innerHTML = `
      <div class="settings-section">
        <div class="settings-section-title">Share a Feature Request or Bug</div>
        <div class="settings-group feedback-form">
          <label class="feedback-label" for="feedback-type">Type</label>
          <select id="feedback-type" class="input">
            <option value="Feature Request">Feature Request</option>
            <option value="Bug Report">Bug Report</option>
            <option value="General Feedback">General Feedback</option>
          </select>

          <label class="feedback-label" for="feedback-subject">Subject</label>
          <input id="feedback-subject" class="input" type="text" maxlength="120" placeholder="Short summary" />

          <label class="feedback-label" for="feedback-details">Details</label>
          <textarea id="feedback-details" class="input textarea" rows="8" placeholder="What happened, what you expected, device/browser, and steps to reproduce."></textarea>

          <label class="feedback-label" for="feedback-contact">Contact Email (optional)</label>
          <input id="feedback-contact" class="input" type="email" placeholder="you@example.com" value="${profile.email || ''}" />

          <button class="btn btn-primary btn-full" id="feedback-send-btn" type="button">Submit Feedback</button>
          <p class="text-xs text-muted" style="line-height:1.6;">
            Submissions are sent directly from the app.
          </p>
        </div>
      </div>
    `;

    container.innerHTML = '';
    container.appendChild(div);
    wireForm();

    function wireForm() {
      const sendBtn = document.getElementById('feedback-send-btn');
      sendBtn?.addEventListener('click', async () => {
        const type = String(document.getElementById('feedback-type')?.value || 'General Feedback').trim();
        const subjectInput = String(document.getElementById('feedback-subject')?.value || '').trim();
        const details = String(document.getElementById('feedback-details')?.value || '').trim();
        const contact = String(document.getElementById('feedback-contact')?.value || '').trim();

        if (!subjectInput || !details) {
          alert('Please add a subject and details first.');
          return;
        }

        sendBtn.disabled = true;
        sendBtn.textContent = 'Submitting…';
        try {
          await API.submitFeedback({
            type,
            subject: subjectInput,
            details,
            contact,
            appVersion,
            page: window.location.href,
            userAgent: navigator.userAgent,
          });
          alert('Thanks. Your feedback was submitted.');
          const subjectEl = document.getElementById('feedback-subject');
          const detailsEl = document.getElementById('feedback-details');
          if (subjectEl) subjectEl.value = '';
          if (detailsEl) detailsEl.value = '';
        } catch (err) {
          alert(`Could not submit feedback: ${err.message}`);
        } finally {
          sendBtn.disabled = false;
          sendBtn.textContent = 'Submit Feedback';
        }
      });
    }
  }

  return { render };
})();

window.FeedbackView = FeedbackView;
