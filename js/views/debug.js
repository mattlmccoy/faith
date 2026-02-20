/* ============================================================
   ABIDE - Hidden Debug View
   ============================================================ */

const DebugView = (() => {
  let lastReport = null;

  function escapeHtml(text = '') {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function render(container) {
    Router.setTitle('Debug');
    Router.clearHeaderActions();

    const div = document.createElement('div');
    div.className = 'view-content tab-switch-enter';
    div.innerHTML = `
      <div class="settings-section">
        <div class="settings-section-title">Diagnostics</div>
        <div class="settings-group">
          <div id="debug-status" class="text-sm text-secondary">Collecting diagnostics...</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
            <button class="btn btn-secondary btn-sm" id="debug-refresh-btn">Refresh</button>
            <button class="btn btn-secondary btn-sm" id="debug-copy-btn">Copy JSON</button>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">Notification Tests</div>
        <div class="settings-group">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-secondary btn-sm" id="debug-perm-btn">Request Permission</button>
            <button class="btn btn-secondary btn-sm" id="debug-subscribe-btn">Subscribe Push</button>
            <button class="btn btn-secondary btn-sm" id="debug-test-push-btn">Send Test Push</button>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">Google Sync Tests</div>
        <div class="settings-group">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-secondary btn-sm" id="debug-google-script-btn">Load Google Script</button>
            <button class="btn btn-secondary btn-sm" id="debug-google-connect-btn">Google Sign In</button>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">Output</div>
        <div class="settings-group">
          <pre id="debug-output" class="debug-output"></pre>
        </div>
      </div>
    `;

    container.innerHTML = '';
    container.appendChild(div);
    setupListeners(div);
    refreshDiagnostics(div);
  }

  async function collectDiagnostics() {
    const report = {
      at: new Date().toISOString(),
      app: {
        version: window.__ABIDE_VERSION__ || 'dev',
        href: window.location.href,
        userAgent: navigator.userAgent,
        online: navigator.onLine,
        standalone: window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches,
      },
      worker: {
        configured: API.hasWorker(),
        url: API.workerUrl(),
      },
      notifications: await Notifications.getDiagnostics(),
      sync: Sync.getDebugState ? Sync.getDebugState() : {},
    };

    if (report.worker.configured) {
      try {
        const res = await fetch(`${API.workerUrl()}/health`);
        report.worker.healthStatus = res.status;
        report.worker.health = await res.json();
      } catch (err) {
        report.worker.healthError = err.message;
      }
    }

    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      report.serviceWorkers = regs.map((r) => ({
        scope: r.scope,
        active: !!r.active,
        installing: !!r.installing,
        waiting: !!r.waiting,
      }));
    } catch (err) {
      report.serviceWorkerError = err.message;
    }

    return report;
  }

  async function refreshDiagnostics(root) {
    const status = root.querySelector('#debug-status');
    const output = root.querySelector('#debug-output');
    if (status) status.textContent = 'Collecting diagnostics...';

    try {
      lastReport = await collectDiagnostics();
      if (output) output.textContent = JSON.stringify(lastReport, null, 2);
      if (status) status.textContent = 'Diagnostics ready.';
    } catch (err) {
      if (output) output.textContent = '';
      if (status) status.textContent = `Diagnostics failed: ${escapeHtml(err.message)}`;
    }
  }

  function setupListeners(root) {
    const status = root.querySelector('#debug-status');

    root.querySelector('#debug-refresh-btn')?.addEventListener('click', async () => {
      await refreshDiagnostics(root);
    });

    root.querySelector('#debug-copy-btn')?.addEventListener('click', async () => {
      if (!lastReport) await refreshDiagnostics(root);
      if (!lastReport) return;
      const payload = JSON.stringify(lastReport, null, 2);
      try {
        await navigator.clipboard.writeText(payload);
        if (status) status.textContent = 'Diagnostics copied to clipboard.';
      } catch (err) {
        if (status) status.textContent = `Clipboard copy failed: ${err.message}`;
      }
    });

    root.querySelector('#debug-perm-btn')?.addEventListener('click', async () => {
      const result = await Notifications.requestPermission();
      if (status) status.textContent = `Permission result: granted=${result.granted}, reason=${result.reason}`;
      await refreshDiagnostics(root);
    });

    root.querySelector('#debug-subscribe-btn')?.addEventListener('click', async () => {
      const sub = await Notifications.subscribeToPush();
      if (status) status.textContent = sub ? 'Push subscription created/updated.' : 'Push subscription failed.';
      await refreshDiagnostics(root);
    });

    root.querySelector('#debug-test-push-btn')?.addEventListener('click', async () => {
      const result = await Notifications.sendTestPush();
      if (status) {
        status.textContent = result.ok
          ? 'Test push request sent. Check system notification center.'
          : `Test push failed: ${result.error}`;
      }
      await refreshDiagnostics(root);
    });

    root.querySelector('#debug-google-script-btn')?.addEventListener('click', async () => {
      try {
        await Sync.ensureGoogleClient();
        if (status) status.textContent = 'Google script loaded.';
      } catch (err) {
        if (status) status.textContent = `Google script failed: ${err.message}`;
      }
      await refreshDiagnostics(root);
    });

    root.querySelector('#debug-google-connect-btn')?.addEventListener('click', async () => {
      try {
        const profile = await Sync.connectGoogle();
        if (status) status.textContent = `Google connected: ${profile.name || profile.email || 'ok'}`;
      } catch (err) {
        if (status) status.textContent = `Google connect failed: ${err.message}`;
      }
      await refreshDiagnostics(root);
    });
  }

  return { render };
})();

window.DebugView = DebugView;
