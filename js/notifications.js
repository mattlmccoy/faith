/* ============================================================
   ABIDE - Push Notifications
   iOS 16.4+ PWA push requirements:
     1. App MUST be installed to home screen (Add to Home Screen)
     2. App MUST be opened from the home screen icon (not Safari)
     3. User must grant notification permission from within the installed app
     4. Service worker must be registered and active
   ============================================================ */

const Notifications = (() => {
  let _lastError = '';

  function setLastError(message = '') {
    _lastError = String(message || '');
  }

  // Detect if running as installed PWA on iOS
  function isInstalledPWA() {
    return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  }

  // iOS 16.4+ supports push; check Safari version
  function isiOSPushSupported() {
    const ua = navigator.userAgent;
    if (!/iPhone|iPad|iPod/.test(ua)) return true; // Non-iOS: standard check
    // Require iOS 16.4+
    const match = ua.match(/OS (\d+)_(\d+)/);
    if (!match) return false;
    const major = parseInt(match[1], 10);
    const minor = parseInt(match[2], 10);
    return major > 16 || (major === 16 && minor >= 4);
  }

  async function isSupported() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return false;
    if (!('PushManager' in window)) return false;
    return true;
  }

  async function getPermission() {
    if (!await isSupported()) return 'unsupported';
    return Notification.permission;
  }

  // Returns { granted, reason } — reason explains any failure
  async function requestPermission() {
    if (!await isSupported()) {
      setLastError('not-supported');
      return { granted: false, reason: 'not-supported' };
    }

    // On iOS, must be installed as PWA
    if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
      if (!isInstalledPWA()) {
        setLastError('not-installed');
        return { granted: false, reason: 'not-installed' };
      }
      if (!isiOSPushSupported()) {
        setLastError('ios-too-old');
        return { granted: false, reason: 'ios-too-old' };
      }
    }

    const result = await Notification.requestPermission();
    if (result !== 'granted') setLastError(result);
    else setLastError('');
    return { granted: result === 'granted', reason: result };
  }

  async function subscribeToPush() {
    const { granted, reason } = await requestPermission();

    if (!granted) {
      console.warn('Push permission not granted:', reason);
      setLastError(`permission:${reason}`);
      return null;
    }

    if (!API.hasWorker()) {
      console.warn('No worker URL configured');
      setLastError('worker-missing');
      return null;
    }

    try {
      const reg = await navigator.serviceWorker.ready;

      // Ensure push manager is available (iOS installed PWA check)
      if (!reg.pushManager) {
        console.warn('PushManager not available — app may not be installed to home screen');
        setLastError('push-manager-missing');
        return null;
      }

      // Get VAPID public key from worker
      const workerBase = API.workerUrl();
      const keyRes = await fetch(`${workerBase}/push/vapid-key`);
      if (!keyRes.ok) throw new Error('Failed to fetch VAPID key');
      const { publicKey } = await keyRes.json();

      // Check for existing subscription first
      let subscription = await reg.pushManager.getSubscription();

      // Re-subscribe if key changed or not subscribed
      if (!subscription) {
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      // Register subscription with worker (includes notification schedule)
      await API.subscribePush({
        subscription: subscription.toJSON(),
        morningHour: Store.get('morningHour'),
        morningMinute: Store.get('morningMinute'),
        eveningHour: Store.get('eveningHour'),
        eveningMinute: Store.get('eveningMinute'),
        sundayReminderEnabled: Store.get('sundayReminderEnabled') !== false,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });

      Store.set('notificationsEnabled', true);
      Store.set('pushSubscription', subscription.toJSON());
      setLastError('');
      return subscription;
    } catch (err) {
      console.error('Push subscription failed:', err);
      setLastError(err?.message || 'subscribe-failed');
      return null;
    }
  }

  async function unsubscribe() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      Store.set('notificationsEnabled', false);
      Store.set('pushSubscription', null);
      setLastError('');
    } catch (err) {
      console.error('Unsubscribe failed:', err);
      setLastError(err?.message || 'unsubscribe-failed');
    }
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  // Show an in-app local notification (while app is open, non-push)
  function showLocal(title, body) {
    if (Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
      });
    }
  }

  // Returns a human-readable status string for display in Settings
  async function getStatusMessage() {
    const isiOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    if (isiOS && !isInstalledPWA()) {
      return '📲 Add Abide to your Home Screen first, then enable reminders.';
    }
    if (isiOS && !isiOSPushSupported()) {
      return '⚠️ iOS 16.4 or later required for notifications.';
    }
    const perm = await getPermission();
    if (perm === 'denied') return '🚫 Notifications blocked. Enable in iOS Settings → Notifications → Abide.';
    if (perm === 'granted') return '✅ Notifications active.';
    return '🔔 Tap Enable to receive morning & evening reminders.';
  }

  async function getDiagnostics() {
    const report = {
      supported: await isSupported(),
      permission: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
      installedPWA: isInstalledPWA(),
      iosPushSupported: isiOSPushSupported(),
      hasPushManager: 'PushManager' in window,
      hasServiceWorker: 'serviceWorker' in navigator,
      serviceWorkerController: !!navigator.serviceWorker?.controller,
      workerConfigured: API.hasWorker(),
      workerUrl: API.workerUrl(),
      notificationsEnabled: !!Store.get('notificationsEnabled'),
      lastError: _lastError || null,
      storedSubscription: !!Store.get('pushSubscription'),
    };

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager?.getSubscription();
      report.serviceWorkerReady = true;
      report.liveSubscription = !!sub;
      if (sub?.endpoint) {
        report.subscriptionEndpointHint = sub.endpoint.slice(-32);
      }
    } catch (err) {
      report.serviceWorkerReady = false;
      report.readyError = err?.message || 'service-worker-not-ready';
    }

    return report;
  }

  async function sendTestPush() {
    try {
      const response = await API.sendTestPush();
      setLastError('');
      return { ok: true, response };
    } catch (err) {
      const message = err?.message || 'test-push-failed';
      setLastError(message);
      return { ok: false, error: message };
    }
  }

  return {
    isSupported,
    isInstalledPWA,
    isiOSPushSupported,
    getPermission,
    requestPermission,
    subscribeToPush,
    unsubscribe,
    showLocal,
    getStatusMessage,
    getDiagnostics,
    sendTestPush,
  };
})();

window.Notifications = Notifications;
