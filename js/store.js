/* ============================================================
   ABIDE - State Management (localStorage)
   ============================================================ */

const Store = (() => {
  const KEY = 'abide_state';

  const defaults = {
    userName: '',
    theme: 'auto',            // 'auto' | 'light' | 'dark'
    morningHour: 6,
    morningMinute: 30,
    eveningHour: 20,
    eveningMinute: 0,
    notificationsEnabled: false,
    pushSubscription: null,
    currentWeekPlan: null,    // Full week plan object from plan builder
    journalEntries: {},       // { 'YYYY-MM-DD': { prompt, text, savedAt } }
    completedDevotions: [],   // ['YYYY-MM-DD-morning', 'YYYY-MM-DD-evening']
    currentStreak: 0,
    lastOpenedDate: null,
    workerUrl: '',            // Set in settings after deploying worker
    onboardingDone: false,
  };

  let _state = null;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      _state = raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults };
    } catch (e) {
      _state = { ...defaults };
    }
    return _state;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(_state));
    } catch (e) {
      console.warn('Store: could not save state', e);
    }
  }

  function get(key) {
    if (!_state) load();
    return key ? _state[key] : { ..._state };
  }

  function set(key, value) {
    if (!_state) load();
    _state[key] = value;
    save();
    return _state[key];
  }

  function update(patch) {
    if (!_state) load();
    Object.assign(_state, patch);
    save();
  }

  // --- Streak logic ---
  function updateStreak() {
    const today = DateUtils.today();
    const last = _state.lastOpenedDate;
    if (last === today) return _state.currentStreak;

    let streak = _state.currentStreak;
    if (last) {
      const diff = DateUtils.daysBetween(last, today);
      if (diff === 1) {
        streak += 1;
      } else if (diff > 1) {
        streak = 1;
      }
    } else {
      streak = 1;
    }

    update({ currentStreak: streak, lastOpenedDate: today });
    return streak;
  }

  // --- Devotion completion ---
  function markCompleted(dateKey, session) {
    const id = `${dateKey}-${session}`;
    if (!_state.completedDevotions.includes(id)) {
      _state.completedDevotions = [..._state.completedDevotions, id];
      save();
    }
  }

  function isCompleted(dateKey, session) {
    return _state.completedDevotions.includes(`${dateKey}-${session}`);
  }

  // --- Journal ---
  function saveJournalEntry(dateKey, prompt, text) {
    if (!_state.journalEntries) _state.journalEntries = {};
    _state.journalEntries[dateKey] = { prompt, text, savedAt: new Date().toISOString() };
    save();
  }

  function getJournalEntry(dateKey) {
    return _state.journalEntries?.[dateKey] || null;
  }

  function getRecentJournalEntries(limit = 10) {
    const entries = _state.journalEntries || {};
    return Object.entries(entries)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, limit)
      .map(([date, entry]) => ({ date, ...entry }));
  }

  // --- Plan ---
  function savePlan(plan) {
    set('currentWeekPlan', plan);
  }

  function getPlan() {
    return get('currentWeekPlan');
  }

  function getTodayDevotionData() {
    const plan = getPlan();
    const today = DateUtils.today();
    return plan?.days?.[today] || null;
  }

  // Initialize
  load();

  return {
    get,
    set,
    update,
    updateStreak,
    markCompleted,
    isCompleted,
    saveJournalEntry,
    getJournalEntry,
    getRecentJournalEntries,
    savePlan,
    getPlan,
    getTodayDevotionData,
    load,
  };
})();

window.Store = Store;
