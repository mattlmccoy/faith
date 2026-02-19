/* ============================================================
   ABIDE - Push Notifications
   ============================================================ */

const Notifications = (() => {
  async function isSupported() {
    return 'Notification' in window && 'serviceWorker' in navigator;
  }

  async function getPermission() {
    if (!await isSupported()) return 'unsupported';
    return Notification.permission;
  }

  async function requestPermission() {
    if (!await isSupported()) return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
  }

  async function subscribeToPush() {
    if (!API.hasWorker()) return null;
    try {
      const reg = await navigator.serviceWorker.ready;
      // Get VAPID public key from worker
      const res = await fetch(`${Store.get('workerUrl')}/push/vapid-key`);
      const { publicKey } = await res.json();

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // Send subscription to worker
      await API.subscribePush({
        subscription: subscription.toJSON(),
        morningHour: Store.get('morningHour'),
        morningMinute: Store.get('morningMinute'),
        eveningHour: Store.get('eveningHour'),
        eveningMinute: Store.get('eveningMinute'),
      });

      Store.set('notificationsEnabled', true);
      Store.set('pushSubscription', subscription.toJSON());
      return subscription;
    } catch (err) {
      console.error('Push subscription failed:', err);
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
    } catch (err) {
      console.error('Unsubscribe failed:', err);
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

  // Show an in-app local notification (while app is open)
  function showLocal(title, body) {
    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/faith/icons/icon-192.png', badge: '/faith/icons/icon-192.png' });
    }
  }

  return {
    isSupported,
    getPermission,
    requestPermission,
    subscribeToPush,
    unsubscribe,
    showLocal,
  };
})();

window.Notifications = Notifications;
