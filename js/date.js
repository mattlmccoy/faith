/* ============================================================
   ABIDE - Date Utilities
   ============================================================ */

const DateUtils = (() => {
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
  const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function today() {
    const d = new Date();
    return toKey(d);
  }

  function toKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function fromKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function format(date, pattern = 'full') {
    if (typeof date === 'string') date = fromKey(date);
    switch (pattern) {
      case 'full':
        return `${DAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
      case 'short':
        return `${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}`;
      case 'monthYear':
        return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
      default:
        return date.toLocaleDateString();
    }
  }

  function weekStart(dateKey) {
    const d = fromKey(dateKey || today());
    const day = d.getDay(); // 0=Sun
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((day + 6) % 7));
    return toKey(monday);
  }

  function hour() {
    return new Date().getHours();
  }

  function session() {
    const h = hour();
    // Evening: after 5pm (17:00)
    return h >= 17 ? 'evening' : 'morning';
  }

  function greeting(name) {
    const h = hour();
    let timeOfDay;
    if (h < 12) timeOfDay = 'morning';
    else if (h < 17) timeOfDay = 'afternoon';
    else timeOfDay = 'evening';
    return `Good ${timeOfDay}, ${name || 'friend'}`;
  }

  function isToday(dateKey) {
    return dateKey === today();
  }

  function daysBetween(keyA, keyB) {
    const a = fromKey(keyA);
    const b = fromKey(keyB);
    return Math.round((b - a) / (1000 * 60 * 60 * 24));
  }

  // Get array of date keys for a week starting Monday
  function weekKeys(weekStartKey) {
    const keys = [];
    const start = fromKey(weekStartKey);
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      keys.push(toKey(d));
    }
    return keys;
  }

  function isDarkModeTime() {
    const h = hour();
    return h >= 20 || h < 6;
  }

  return {
    today,
    toKey,
    fromKey,
    format,
    weekStart,
    hour,
    session,
    greeting,
    isToday,
    daysBetween,
    weekKeys,
    isDarkModeTime,
  };
})();

window.DateUtils = DateUtils;
