/* ============================================================
   ABIDE - State Management (localStorage)
   ============================================================ */

const Store = (() => {
  const KEY = 'abide_state';
  const DEFAULT_TRUSTED_PASTORS = [
    { name: 'Tim Keller', enabled: true },
    { name: 'John Mark Comer', enabled: true },
    { name: 'Jon Pokluda', enabled: true },
    { name: 'Louie Giglio', enabled: true },
    { name: 'John Piper', enabled: true },
    { name: 'Ben Stuart', enabled: true },
  ];

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
    savedDevotions: [],       // ['YYYY-MM-DD-morning', 'YYYY-MM-DD-evening']
    selectedDevotionDate: null,
    currentStreak: 0,
    lastOpenedDate: null,
    workerUrl: '',            // Set in settings after deploying worker
    onboardingDone: false,
    bibleTranslation: 'web',  // 'web' | 'kjv' | 'net' | 'bbe' | 'darby'
    palette: 'tuscan-sunset', // Color palette / theme
    trustedPastors: DEFAULT_TRUSTED_PASTORS,
  };

  let _state = null;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      _state = raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults };
      _state.trustedPastors = normalizeTrustedPastors(_state.trustedPastors);
      if (!_state.savedDevotions || !Array.isArray(_state.savedDevotions)) {
        _state.savedDevotions = [];
      }
    } catch (e) {
      _state = { ...defaults };
    }
    return _state;
  }

  function normalizeTrustedPastors(input) {
    const source = Array.isArray(input) ? input : DEFAULT_TRUSTED_PASTORS;
    const names = new Set();
    const normalized = [];

    source.forEach((entry) => {
      const name = typeof entry === 'string' ? entry : entry?.name;
      if (!name) return;
      const clean = String(name).trim();
      if (!clean) return;
      const key = clean.toLowerCase();
      if (names.has(key)) return;
      names.add(key);
      normalized.push({
        name: clean,
        enabled: typeof entry === 'object' ? entry.enabled !== false : true,
      });
    });

    return normalized.length ? normalized : DEFAULT_TRUSTED_PASTORS.map(p => ({ ...p }));
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
    const keys = getPlanDayKeys();
    if (!keys.length) return;
    const today = DateUtils.today();
    _state.selectedDevotionDate = keys.includes(today) ? today : keys[0];
    save();
  }

  function getPlan() {
    return get('currentWeekPlan');
  }

  function getPlanDayKeys() {
    const plan = getPlan();
    const keys = Object.keys(plan?.days || {});
    return keys.sort((a, b) => a.localeCompare(b));
  }

  function getDevotionData(dateKey) {
    const plan = getPlan();
    return plan?.days?.[dateKey] || null;
  }

  function getSelectedDevotionDate() {
    const keys = getPlanDayKeys();
    if (!keys.length) return DateUtils.today();
    const current = _state.selectedDevotionDate;
    if (current && keys.includes(current)) return current;
    const today = DateUtils.today();
    return keys.includes(today) ? today : keys[0];
  }

  function setSelectedDevotionDate(dateKey) {
    if (!dateKey) return;
    _state.selectedDevotionDate = dateKey;
    save();
  }

  function shiftSelectedDevotionDay(offset) {
    const keys = getPlanDayKeys();
    if (!keys.length) return null;
    const current = getSelectedDevotionDate();
    const idx = Math.max(0, keys.indexOf(current));
    const nextIdx = Math.min(keys.length - 1, Math.max(0, idx + offset));
    _state.selectedDevotionDate = keys[nextIdx];
    save();
    return _state.selectedDevotionDate;
  }

  function getTodayDevotionData() {
    const plan = getPlan();
    const today = DateUtils.today();
    return plan?.days?.[today] || null;
  }

  // --- Saved devotions ---
  function toggleSavedDevotion(dateKey, session) {
    const id = `${dateKey}-${session}`;
    const has = _state.savedDevotions.includes(id);
    _state.savedDevotions = has
      ? _state.savedDevotions.filter(x => x !== id)
      : [..._state.savedDevotions, id];
    save();
    return !has;
  }

  function isSavedDevotion(dateKey, session) {
    return _state.savedDevotions.includes(`${dateKey}-${session}`);
  }

  // --- Pastors ---
  function getTrustedPastors() {
    return normalizeTrustedPastors(_state.trustedPastors);
  }

  function setTrustedPastors(pastors) {
    _state.trustedPastors = normalizeTrustedPastors(pastors);
    save();
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
    getPlanDayKeys,
    getDevotionData,
    getSelectedDevotionDate,
    setSelectedDevotionDate,
    shiftSelectedDevotionDay,
    getTodayDevotionData,
    toggleSavedDevotion,
    isSavedDevotion,
    getTrustedPastors,
    setTrustedPastors,
    load,
  };
})();

window.Store = Store;
