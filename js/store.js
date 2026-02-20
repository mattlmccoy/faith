/* ============================================================
   ABIDE - State Management (localStorage)
   ============================================================ */

const Store = (() => {
  const KEY = 'abide_state';
  const DEFAULT_GOOGLE_CLIENT_ID = '1098652353842-ve34jqhnsqda5v9n1d7455n2kka9k0ek.apps.googleusercontent.com';
  const USAGE_METRICS = [
    'bibleQueries',
    'esvQueries',
    'aiPlanRequests',
    'aiPhraseQueries',
    'devotionalSearchQueries',
    'pushTestRequests',
  ];
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
    sundayReminderEnabled: true,
    pushSubscription: null,
    currentWeekPlan: null,    // Full week plan object from plan builder
    journalEntries: {},       // { 'YYYY-MM-DD': { prompt, text, savedAt } }
    completedDevotions: [],   // ['YYYY-MM-DD-morning', 'YYYY-MM-DD-evening']
    savedDevotions: [],       // ['YYYY-MM-DD-morning', 'YYYY-MM-DD-evening']
    savedDevotionLibrary: {}, // { id: { ...devotion snapshot... } }
    selectedDevotionDate: null,
    currentStreak: 0,
    lastOpenedDate: null,
    workerUrl: '',            // Set in settings after deploying worker
    onboardingDone: false,
    bibleTranslation: 'web',  // 'web' | 'kjv' | 'net' | 'bbe' | 'darby'
    palette: 'tuscan-sunset', // Color palette / theme
    trustedPastors: DEFAULT_TRUSTED_PASTORS,
    usageStats: {
      monthKey: '',
      bibleQueries: 0,
      esvQueries: 0,
      aiPlanRequests: 0,
      aiPhraseQueries: 0,
      devotionalSearchQueries: 0,
      pushTestRequests: 0,
    },
    usageLimits: {
      esvQueries: 500,
      aiPlanRequests: 120,
      aiPhraseQueries: 400,
      bibleQueries: 3000,
    },
    lastAIPlanMeta: null,
    lastAIPhraseMeta: null,
    googleClientId: DEFAULT_GOOGLE_CLIENT_ID,
    googleDriveFolderId: '',
    googleDriveFileId: '',
    lastDriveSyncAt: null,
    googleProfile: null,      // { sub, email, name, picture }
    googleConnectedAt: null,
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
      if (!_state.savedDevotionLibrary || typeof _state.savedDevotionLibrary !== 'object') {
        _state.savedDevotionLibrary = {};
      }
      _state.usageStats = normalizeUsageStats(_state.usageStats);
      _state.usageLimits = normalizeUsageLimits(_state.usageLimits);
      if (!_state.googleClientId || !_state.googleClientId.trim()) {
        _state.googleClientId = DEFAULT_GOOGLE_CLIENT_ID;
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

  function currentMonthKey() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${m}`;
  }

  function normalizeUsageStats(input) {
    const monthKey = currentMonthKey();
    const base = { ...defaults.usageStats, monthKey };
    const merged = { ...base, ...(input || {}) };

    if (merged.monthKey !== monthKey) {
      merged.monthKey = monthKey;
      USAGE_METRICS.forEach((k) => { merged[k] = 0; });
    } else {
      USAGE_METRICS.forEach((k) => {
        const value = Number(merged[k]);
        merged[k] = Number.isFinite(value) && value >= 0 ? value : 0;
      });
    }
    return merged;
  }

  function normalizeUsageLimits(input) {
    const merged = { ...defaults.usageLimits, ...(input || {}) };
    Object.keys(defaults.usageLimits).forEach((k) => {
      const value = Number(merged[k]);
      merged[k] = Number.isFinite(value) && value > 0 ? Math.round(value) : defaults.usageLimits[k];
    });
    return merged;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(_state));
    } catch (e) {
      console.warn('Store: could not save state', e);
    }
  }

  function ensureUsageState() {
    _state.usageStats = normalizeUsageStats(_state.usageStats);
    _state.usageLimits = normalizeUsageLimits(_state.usageLimits);
  }

  function get(key) {
    if (!_state) load();
    ensureUsageState();
    return key ? _state[key] : { ..._state };
  }

  function set(key, value) {
    if (!_state) load();
    ensureUsageState();
    _state[key] = value;
    save();
    return _state[key];
  }

  function update(patch) {
    if (!_state) load();
    ensureUsageState();
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

  function getAllJournalEntries() {
    const entries = _state.journalEntries || {};
    return Object.entries(entries)
      .sort(([a], [b]) => b.localeCompare(a))
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
    if (has) {
      _state.savedDevotions = _state.savedDevotions.filter(x => x !== id);
      if (_state.savedDevotionLibrary && _state.savedDevotionLibrary[id]) {
        delete _state.savedDevotionLibrary[id];
      }
    } else {
      _state.savedDevotions = [..._state.savedDevotions, id];
      const day = getDevotionData(dateKey) || {};
      const sessionData = day?.[session] || null;
      if (sessionData) {
        _state.savedDevotionLibrary[id] = buildSavedEntry(id, dateKey, session, day, sessionData);
      }
    }
    save();
    return !has;
  }

  function isSavedDevotion(dateKey, session) {
    return _state.savedDevotions.includes(`${dateKey}-${session}`);
  }

  function getSavedDevotionLibrary() {
    const lib = _state.savedDevotionLibrary || {};
    return Object.values(lib)
      .sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')));
  }

  function getSavedDevotionById(id) {
    if (!id) return null;
    return (_state.savedDevotionLibrary || {})[id] || null;
  }

  function buildSavedEntry(id, dateKey, session, day, sessionData, existingSavedAt = '') {
    return {
      id,
      dateKey,
      session,
      savedAt: existingSavedAt || new Date().toISOString(),
      theme: day.theme || '',
      title: sessionData.title || '',
      openingVerse: sessionData.opening_verse || null,
      body: Array.isArray(sessionData.body) ? sessionData.body : [],
      reflectionPrompts: Array.isArray(sessionData.reflection_prompts) ? sessionData.reflection_prompts : [],
      prayer: sessionData.prayer || '',
      inspiredBy: Array.isArray(sessionData.inspired_by) ? sessionData.inspired_by : [],
      devotionData: JSON.parse(JSON.stringify({
        theme: day.theme || '',
        sources: Array.isArray(day.sources) ? day.sources : [],
        faith_stretch: day.faith_stretch || null,
        morning: day.morning || null,
        evening: day.evening || null,
      })),
    };
  }

  function exportSavedDevotionsSnapshot() {
    const list = Array.isArray(_state.savedDevotions) ? _state.savedDevotions : [];
    const lib = { ...(_state.savedDevotionLibrary || {}) };

    Object.keys(lib).forEach((id) => {
      const entry = lib[id] || {};
      if (entry.devotionData && entry.body?.length) return;
      const parts = String(id).split('-');
      const session = parts.pop();
      const dateKey = parts.join('-');
      if (!dateKey || !session) return;
      const day = getDevotionData(dateKey) || {};
      const sessionData = day?.[session];
      if (!sessionData) return;
      lib[id] = buildSavedEntry(id, dateKey, session, day, sessionData, entry.savedAt || '');
    });

    list.forEach((id) => {
      if (lib[id]) return;
      const parts = String(id).split('-');
      const session = parts.pop();
      const dateKey = parts.join('-');
      if (!dateKey || !session) return;
      const day = getDevotionData(dateKey) || {};
      const sessionData = day?.[session];
      if (!sessionData) return;
      lib[id] = buildSavedEntry(id, dateKey, session, day, sessionData, lib[id]?.savedAt || '');
    });

    const uniqueIds = Array.from(new Set([...list, ...Object.keys(lib)]));

    return {
      version: 2,
      exportedAt: new Date().toISOString(),
      profile: {
        userName: _state.userName || '',
        bibleTranslation: _state.bibleTranslation || 'web',
        palette: _state.palette || 'tuscan-sunset',
        trustedPastors: getTrustedPastors(),
      },
      savedDevotions: uniqueIds,
      savedDevotionLibrary: lib,
      journalEntries: _state.journalEntries || {},
    };
  }

  function importSavedDevotionsSnapshot(snapshot = {}) {
    const list = Array.isArray(snapshot.savedDevotions) ? snapshot.savedDevotions : [];
    const lib = snapshot.savedDevotionLibrary && typeof snapshot.savedDevotionLibrary === 'object'
      ? snapshot.savedDevotionLibrary
      : {};

    const mergedIds = new Set([
      ...(Array.isArray(_state.savedDevotions) ? _state.savedDevotions : []),
      ...list,
      ...Object.keys(lib),
    ]);
    _state.savedDevotions = [...mergedIds];
    _state.savedDevotionLibrary = { ...(_state.savedDevotionLibrary || {}), ...lib };
    const incomingProfile = snapshot.profile && typeof snapshot.profile === 'object' ? snapshot.profile : {};
    if (incomingProfile.userName && !_state.userName) {
      _state.userName = String(incomingProfile.userName).trim();
    }
    if (incomingProfile.bibleTranslation && !_state.bibleTranslation) {
      _state.bibleTranslation = String(incomingProfile.bibleTranslation).toLowerCase();
    }
    if (incomingProfile.palette && !_state.palette) {
      _state.palette = String(incomingProfile.palette);
    }
    if (Array.isArray(incomingProfile.trustedPastors) && incomingProfile.trustedPastors.length) {
      const mergedPastors = [...getTrustedPastors(), ...incomingProfile.trustedPastors];
      _state.trustedPastors = normalizeTrustedPastors(mergedPastors);
    }
    // Backfill library entries from current plan when older snapshots only contain IDs.
    _state.savedDevotions.forEach((id) => {
      if (_state.savedDevotionLibrary[id]) return;
      const parts = String(id).split('-');
      const session = parts.pop();
      const dateKey = parts.join('-');
      if (!dateKey || !session) return;
      const day = getDevotionData(dateKey) || {};
      const sessionData = day?.[session];
      if (!sessionData) return;
      _state.savedDevotionLibrary[id] = buildSavedEntry(id, dateKey, session, day, sessionData);
    });
    const incomingJournal = snapshot.journalEntries && typeof snapshot.journalEntries === 'object'
      ? snapshot.journalEntries
      : {};
    const currentJournal = _state.journalEntries && typeof _state.journalEntries === 'object'
      ? _state.journalEntries
      : {};
    Object.entries(incomingJournal).forEach(([dateKey, entry]) => {
      const existing = currentJournal[dateKey];
      const inSavedAt = String(entry?.savedAt || '');
      const exSavedAt = String(existing?.savedAt || '');
      if (!existing || inSavedAt > exSavedAt) {
        currentJournal[dateKey] = {
          prompt: String(entry?.prompt || ''),
          text: String(entry?.text || ''),
          savedAt: inSavedAt || new Date().toISOString(),
        };
      }
    });
    _state.journalEntries = currentJournal;
    _state.lastDriveSyncAt = new Date().toISOString();
    save();
    return {
      count: _state.savedDevotions.length,
      importedIds: list.length,
      importedLibrary: Object.keys(lib).length,
      importedJournal: Object.keys(incomingJournal).length,
    };
  }

  // --- Pastors ---
  function getTrustedPastors() {
    return normalizeTrustedPastors(_state.trustedPastors);
  }

  function setTrustedPastors(pastors) {
    _state.trustedPastors = normalizeTrustedPastors(pastors);
    save();
  }

  // --- Usage tracking ---
  function trackUsage(metric, amount = 1) {
    if (!_state) load();
    ensureUsageState();
    if (!USAGE_METRICS.includes(metric)) return;
    const inc = Number(amount) || 1;
    _state.usageStats[metric] = Math.max(0, (_state.usageStats[metric] || 0) + inc);
    save();
  }

  function getUsageStats() {
    if (!_state) load();
    ensureUsageState();
    return { ..._state.usageStats };
  }

  function getUsageLimits() {
    if (!_state) load();
    ensureUsageState();
    return { ..._state.usageLimits };
  }

  function setUsageLimits(limits = {}) {
    if (!_state) load();
    _state.usageLimits = normalizeUsageLimits({ ..._state.usageLimits, ...limits });
    save();
  }

  function resetUsageStats() {
    if (!_state) load();
    _state.usageStats = normalizeUsageStats({ monthKey: '' });
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
    getAllJournalEntries,
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
    getSavedDevotionLibrary,
    getSavedDevotionById,
    exportSavedDevotionsSnapshot,
    importSavedDevotionsSnapshot,
    getTrustedPastors,
    setTrustedPastors,
    trackUsage,
    getUsageStats,
    getUsageLimits,
    setUsageLimits,
    resetUsageStats,
    load,
  };
})();

window.Store = Store;
