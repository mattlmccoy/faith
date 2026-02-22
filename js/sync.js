/* ============================================================
   ABIDE - Google Drive Sync (Saved Devotions + Journal)
   ============================================================ */

const Sync = (() => {
  const LEGACY_FILE_NAME = 'abide-saved-devotions.json';
  const DEVOTIONS_FILE_NAME = 'abide-devotions.json';
  const JOURNALS_FILE_NAME = 'abide-journals.json';
  const SETTINGS_FILE_NAME = 'abide-settings.json';
  const FOLDER_NAME = 'abidefaith-docs';
  const LEGACY_FOLDER_NAMES = ['abide-devotions', 'abide-devotions-docs', 'abidefaith'];
  const DEVOTIONS_FILE_CANDIDATES = [DEVOTIONS_FILE_NAME, 'abide-devotions', LEGACY_FILE_NAME, 'abide-saved-devotions'];
  const JOURNALS_FILE_CANDIDATES = [JOURNALS_FILE_NAME, 'abide-journals'];
  const SETTINGS_FILE_CANDIDATES = [SETTINGS_FILE_NAME, 'abide-settings'];
  const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const PROFILE_SCOPE = 'openid email profile';
  const DEFAULT_GOOGLE_CLIENT_ID = '1098652353842-ve34jqhnsqda5v9n1d7455n2kka9k0ek.apps.googleusercontent.com';
  let _accessToken = '';
  let _accessTokenExpiresAt = 0;
  let _tokenClient = null;
  let _googleScriptPromise = null;

  function hasGoogleClient() {
    return !!window.google?.accounts?.oauth2;
  }

  function loadGoogleScript() {
    if (hasGoogleClient()) return Promise.resolve();
    if (_googleScriptPromise) return _googleScriptPromise;

    _googleScriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-google-gsi="1"]');
      if (existing) {
        const start = Date.now();
        const timer = setInterval(() => {
          if (hasGoogleClient()) {
            clearInterval(timer);
            resolve();
            return;
          }
          if (Date.now() - start > 8000) {
            clearInterval(timer);
            reject(new Error('Google Sign-In script not loaded'));
          }
        }, 120);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.dataset.googleGsi = '1';
      script.onload = () => {
        const start = Date.now();
        const timer = setInterval(() => {
          if (hasGoogleClient()) {
            clearInterval(timer);
            resolve();
            return;
          }
          if (Date.now() - start > 8000) {
            clearInterval(timer);
            reject(new Error('Google Sign-In script not loaded'));
          }
        }, 120);
      };
      script.onerror = () => reject(new Error('Could not load Google Sign-In script'));
      document.head.appendChild(script);
    }).finally(() => {
      if (hasGoogleClient()) return;
      _googleScriptPromise = null;
    });

    return _googleScriptPromise;
  }

  function getClientId() {
    return (Store.get('googleClientId') || DEFAULT_GOOGLE_CLIENT_ID || '').trim();
  }

  async function ensureClientConfig() {
    const clientId = getClientId();
    if (!clientId) throw new Error('Missing Google Client ID in Settings → Advanced');
    if (!hasGoogleClient()) await loadGoogleScript();
    if (!hasGoogleClient()) throw new Error('Google Sign-In script not loaded');
    return clientId;
  }

  async function requestToken(interactive = true) {
    if (_accessToken && Date.now() < (_accessTokenExpiresAt - 30_000)) return _accessToken;
    const clientId = await ensureClientConfig();

    if (!_tokenClient) {
      _tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: `${DRIVE_SCOPE} ${PROFILE_SCOPE}`,
        callback: () => {},
      });
    }

    const token = await new Promise((resolve, reject) => {
      _tokenClient.callback = (resp) => {
        if (resp?.error) return reject(new Error(resp.error));
        if (!resp?.access_token) return reject(new Error('No access token returned'));
        resolve(resp);
      };
      _tokenClient.requestAccessToken({ prompt: interactive ? 'consent' : '' });
    });

    _accessToken = token.access_token;
    _accessTokenExpiresAt = Date.now() + (Number(token.expires_in || 3600) * 1000);
    return _accessToken;
  }

  function clearToken() {
    _accessToken = '';
    _accessTokenExpiresAt = 0;
  }

  async function driveFetch(url, options = {}, retry = true) {
    const token = await requestToken(true);
    const headers = {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    };
    const res = await fetch(url, { ...options, headers });
    if ((res.status === 401 || res.status === 403) && retry) {
      clearToken();
      return driveFetch(url, options, false);
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Drive API ${res.status}: ${body.slice(0, 180)}`);
    }
    return res;
  }

  async function fetchGoogleProfile() {
    const token = await requestToken(true);
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Google profile fetch failed: ${res.status} ${body.slice(0, 120)}`);
    }
    const profile = await res.json();
    const normalized = {
      sub: profile.sub || '',
      email: profile.email || '',
      name: profile.name || '',
      picture: profile.picture || '',
    };
    const patch = {
      googleProfile: normalized,
      googleConnectedAt: new Date().toISOString(),
    };
    const firstName = extractFirstName(normalized.name, normalized.email);
    if (firstName) patch.userName = firstName;
    Store.update(patch);
    return normalized;
  }

  function extractFirstName(fullName = '', email = '') {
    const cleanName = String(fullName || '').trim();
    if (cleanName) {
      const first = cleanName.split(/\s+/)[0] || '';
      return first.trim();
    }
    const local = String(email || '').split('@')[0] || '';
    return local.trim();
  }

  async function connectGoogle() {
    await requestToken(true);
    return fetchGoogleProfile();
  }

  async function ensureGoogleClient() {
    await ensureClientConfig();
    return true;
  }

  function escapeQueryValue(value = '') {
    return String(value).replace(/'/g, "\\'");
  }

  async function findFolderId() {
    const q = encodeURIComponent(
      `name='${escapeQueryValue(FOLDER_NAME)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
    );
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name,modifiedTime)&pageSize=1&orderBy=modifiedTime desc`;
    const res = await driveFetch(url);
    const data = await res.json();
    return data?.files?.[0]?.id || '';
  }

  async function findFolderIdByName(folderName) {
    const q = encodeURIComponent(
      `name='${escapeQueryValue(folderName)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
    );
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name,modifiedTime)&pageSize=1&orderBy=modifiedTime desc`;
    const res = await driveFetch(url);
    const data = await res.json();
    return data?.files?.[0]?.id || '';
  }

  async function createFolder() {
    const metadata = {
      name: FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    };
    const res = await driveFetch('https://www.googleapis.com/drive/v3/files?fields=id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(metadata),
    });
    const data = await res.json();
    return data?.id || '';
  }

  async function findOrCreateFolderId() {
    let folderId = (Store.get('googleDriveFolderId') || '').trim();
    if (!folderId) folderId = await findFolderId();
    if (!folderId) folderId = await createFolder();
    if (folderId) Store.update({ googleDriveFolderId: folderId });
    return folderId;
  }

  async function findExistingFolderId() {
    let folderId = (Store.get('googleDriveFolderId') || '').trim();
    if (!folderId) folderId = await findFolderId();
    if (!folderId) {
      for (const name of LEGACY_FOLDER_NAMES) {
        folderId = await findFolderIdByName(name);
        if (folderId) break;
      }
    }
    if (folderId) Store.update({ googleDriveFolderId: folderId });
    return folderId;
  }

  async function findFileIdByName(folderId, fileName) {
    if (!folderId) return '';
    const q = encodeURIComponent(
      `name='${escapeQueryValue(fileName)}' and '${escapeQueryValue(folderId)}' in parents and trashed=false`
    );
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name,modifiedTime)&pageSize=1&orderBy=modifiedTime desc`;
    const res = await driveFetch(url);
    const data = await res.json();
    return data?.files?.[0]?.id || '';
  }

  async function findAnyFileIdByNames(folderId, names = []) {
    for (const name of names) {
      const fileId = await findFileIdByName(folderId, name);
      if (fileId) return { fileId, fileName: name };
    }
    return { fileId: '', fileName: '' };
  }

  async function createFile(jsonBody, folderId, fileName) {
    const boundary = 'abide_boundary_' + Date.now();
    const metadata = {
      name: fileName,
      parents: [folderId],
      mimeType: 'application/json',
    };
    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(jsonBody),
      `--${boundary}--`,
      '',
    ].join('\r\n');

    const res = await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    const data = await res.json();
    return data?.id || '';
  }

  async function updateFile(fileId, jsonBody) {
    const url = `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media`;
    await driveFetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(jsonBody),
    });
    return fileId;
  }

  async function readJsonFileById(fileId) {
    if (!fileId) return { found: false, fileId: '', fileName: '', data: null };
    try {
      const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
      const res = await driveFetch(url);
      const contentType = String(res.headers.get('content-type') || '').toLowerCase();
      const data = contentType.includes('application/json')
        ? await res.json()
        : normalizeJsonPayload(await res.text());
      return { found: true, fileId, fileName: '', data };
    } catch (_) {
      return { found: false, fileId: '', fileName: '', data: null };
    }
  }

  async function upsertJsonFile(folderId, fileName, jsonBody, preferredFileId = '') {
    let fileId = String(preferredFileId || '').trim();
    if (fileId) {
      try {
        await updateFile(fileId, jsonBody);
        return fileId;
      } catch (_) {
        fileId = '';
      }
    }
    fileId = await findFileIdByName(folderId, fileName);
    if (fileId) {
      await updateFile(fileId, jsonBody);
      return fileId;
    }
    return createFile(jsonBody, folderId, fileName);
  }

  async function readJsonFile(folderId, fileName) {
    const fileId = await findFileIdByName(folderId, fileName);
    if (!fileId) return { found: false, fileId: '', data: null };
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
    const res = await driveFetch(url);
    const data = await res.json();
    return { found: true, fileId, data };
  }

  function normalizeJsonPayload(data) {
    let value = data;
    for (let i = 0; i < 2; i += 1) {
      if (typeof value !== 'string') break;
      const trimmed = value.trim();
      if (!trimmed) break;
      try {
        value = JSON.parse(trimmed);
      } catch {
        break;
      }
    }
    return value;
  }

  async function readJsonFileByCandidates(folderId, fileNames = []) {
    const { fileId, fileName } = await findAnyFileIdByNames(folderId, fileNames);
    if (!fileId) return { found: false, fileId: '', fileName: '', data: null };
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
    const res = await driveFetch(url);
    const contentType = String(res.headers.get('content-type') || '').toLowerCase();
    let data;
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      data = await res.text();
    }
    return {
      found: true,
      fileId,
      fileName,
      data: normalizeJsonPayload(data),
    };
  }

  function parseDriveFileId(linkOrId = '') {
    const value = String(linkOrId || '').trim();
    if (!value) return '';
    if (/^[A-Za-z0-9_-]{20,}$/.test(value)) return value;
    const patterns = [
      /\/d\/([A-Za-z0-9_-]{20,})/i,
      /[?&]id=([A-Za-z0-9_-]{20,})/i,
      /\/file\/d\/([A-Za-z0-9_-]{20,})/i,
    ];
    for (const re of patterns) {
      const match = value.match(re);
      if (match?.[1]) return match[1];
    }
    return '';
  }

  async function getFileLinks(fileId) {
    const fields = encodeURIComponent('id,name,webViewLink,webContentLink');
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=${fields}`;
    const res = await driveFetch(url);
    return res.json();
  }

  async function setAnyoneReaderPermission(fileId) {
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions?sendNotificationEmail=false`;
    await driveFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone',
      }),
    });
  }

  async function createSharedDevotionLink(entry = {}) {
    const folderId = await findOrCreateFolderId();
    if (!folderId) throw new Error('Could not create/find Google Drive folder');

    const profile = Store.get('googleProfile') || {};
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10);
    const random = Math.random().toString(36).slice(2, 8);
    const safeTitle = String(entry.title || entry.openingVerse?.reference || 'devotion')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 36) || 'devotion';
    const fileName = `abide-share-${datePart}-${safeTitle}-${random}.json`;

    const payload = {
      type: 'abide-shared-devotion',
      version: 1,
      sharedAt: now.toISOString(),
      from: {
        name: profile.name || '',
        email: profile.email || '',
        sub: profile.sub || '',
      },
      entry,
    };

    const fileId = await createFile(payload, folderId, fileName);
    if (!fileId) throw new Error('Could not create share file');
    await setAnyoneReaderPermission(fileId);
    const links = await getFileLinks(fileId);

    return {
      fileId,
      fileName,
      shareUrl: links.webViewLink || links.webContentLink || `https://drive.google.com/file/d/${fileId}/view`,
    };
  }

  async function importSharedDevotion(linkOrId = '') {
    const fileId = parseDriveFileId(linkOrId);
    if (!fileId) throw new Error('Could not parse a Google Drive file ID from that link');

    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
    const res = await driveFetch(url);
    const payload = normalizeJsonPayload(await res.text());
    if (!payload || typeof payload !== 'object') {
      throw new Error('Shared file did not contain valid JSON');
    }

    let entry = null;
    if (payload.type === 'abide-shared-devotion' && payload.entry && typeof payload.entry === 'object') {
      entry = payload.entry;
    } else if (payload.devotion && typeof payload.devotion === 'object') {
      entry = payload.devotion;
    } else if (payload.id && typeof payload === 'object') {
      entry = payload;
    }

    if (!entry) throw new Error('This file is not a supported shared devotional format');

    const id = String(entry.id || `${entry.dateKey || DateUtils.today()}-${entry.session || 'morning'}-shared-${fileId.slice(-6)}`);
    const normalizedEntry = { ...entry, id, importedFromShare: fileId };

    Store.importSavedDevotionsSnapshot({
      savedDevotions: [id],
      savedDevotionLibrary: { [id]: normalizedEntry },
    });

    return {
      imported: true,
      id,
      fileId,
      title: normalizedEntry.title || normalizedEntry.openingVerse?.reference || 'Shared devotion',
      from: payload.from || null,
    };
  }

  async function pushSavedDevotions() {
    const devotions = Store.exportDevotionsSnapshot();
    const journals = Store.exportJournalSnapshot();
    const settings = Store.exportSettingsSnapshot();
    const folderId = await findOrCreateFolderId();
    if (!folderId) throw new Error('Could not create/find Google Drive folder');

    const state = Store.get();
    const knownFiles = state.googleDriveFiles || { devotions: '', journals: '', settings: '' };
    const [devotionsFileId, journalsFileId, settingsFileId] = await Promise.all([
      upsertJsonFile(folderId, DEVOTIONS_FILE_NAME, devotions, knownFiles.devotions || ''),
      upsertJsonFile(folderId, JOURNALS_FILE_NAME, journals, knownFiles.journals || ''),
      upsertJsonFile(folderId, SETTINGS_FILE_NAME, settings, knownFiles.settings || ''),
    ]);

    Store.update({
      googleDriveFolderId: folderId,
      googleDriveFileId: devotionsFileId,
      googleDriveFiles: { devotions: devotionsFileId, journals: journalsFileId, settings: settingsFileId },
      lastDriveSyncAt: new Date().toISOString(),
    });
    return {
      fileId: devotionsFileId,
      count: (devotions.savedDevotions || []).length,
      journals: Object.keys(journals.journalEntries || {}).length,
      pastors: Array.isArray(settings.trustedPastors) ? settings.trustedPastors.length : 0,
      files: 3,
    };
  }

  async function pullSavedDevotions() {
    const folderId = await findExistingFolderId();
    if (!folderId) return { fileId: '', count: 0, imported: false };

    const state = Store.get();
    const knownFiles = state.googleDriveFiles || { devotions: '', journals: '', settings: '' };
    const [knownDevotions, knownJournals, knownSettings] = await Promise.all([
      readJsonFileById(knownFiles.devotions || ''),
      readJsonFileById(knownFiles.journals || ''),
      readJsonFileById(knownFiles.settings || ''),
    ]);

    const [devotionsFile, journalsFile, settingsFile] = await Promise.all([
      knownDevotions.found ? knownDevotions : readJsonFileByCandidates(folderId, DEVOTIONS_FILE_CANDIDATES),
      knownJournals.found ? knownJournals : readJsonFileByCandidates(folderId, JOURNALS_FILE_CANDIDATES),
      knownSettings.found ? knownSettings : readJsonFileByCandidates(folderId, SETTINGS_FILE_CANDIDATES),
    ]);

    let imported = false;
    let devResult = { count: 0, importedIds: 0, importedLibrary: 0, importedPlanDays: 0 };
    let journalResult = { importedJournal: 0 };
    let settingsResult = { importedSettings: false, importedPastors: 0 };

    if (devotionsFile.found && devotionsFile.data && typeof devotionsFile.data === 'object') {
      devResult = Store.importDevotionsSnapshot(devotionsFile.data || {});
      imported = true;
    }
    if (journalsFile.found && journalsFile.data && typeof journalsFile.data === 'object') {
      journalResult = Store.importJournalSnapshot(journalsFile.data || {});
      imported = true;
    }
    if (settingsFile.found && settingsFile.data && typeof settingsFile.data === 'object') {
      settingsResult = Store.importSettingsSnapshot(settingsFile.data || {});
      imported = true;
    }

    // Backward compatibility with old single-file sync.
    if (!imported) {
      const legacy = await readJsonFile(folderId, LEGACY_FILE_NAME);
      if (legacy.found && legacy.data && typeof legacy.data === 'object') {
        devResult = Store.importSavedDevotionsSnapshot(legacy.data || {});
        imported = true;
      }
    }

    if (!imported) return { fileId: '', count: 0, imported: false };

    Store.update({
      googleDriveFolderId: folderId,
      googleDriveFileId: devotionsFile.fileId || '',
      googleDriveFiles: {
        devotions: devotionsFile.fileId || '',
        journals: journalsFile.fileId || '',
        settings: settingsFile.fileId || '',
      },
      lastDriveSyncAt: new Date().toISOString(),
    });
    return {
      fileId: devotionsFile.fileId || '',
      count: devResult.count || 0,
      importedIds: devResult.importedIds || 0,
      importedLibrary: devResult.importedLibrary || 0,
      importedJournal: journalResult.importedJournal || devResult.importedJournal || 0,
      importedPastors: settingsResult.importedPastors || 0,
      importedPlanDays: devResult.importedPlanDays || 0,
      sourceFolderId: folderId,
      sourceFiles: {
        devotions: devotionsFile.fileName || '',
        journals: journalsFile.fileName || '',
        settings: settingsFile.fileName || '',
      },
      imported: true,
    };
  }

  function clearSession() {
    clearToken();
    Store.update({
      googleProfile: null,
      googleConnectedAt: null,
    });
  }

  function getDebugState() {
    const state = Store.get();
    return {
      hasGoogleClient: hasGoogleClient(),
      scriptTagPresent: !!document.querySelector('script[data-google-gsi="1"]'),
      clientIdConfigured: !!getClientId(),
      tokenCached: !!_accessToken,
      tokenExpiresInSec: _accessTokenExpiresAt ? Math.max(0, Math.round((_accessTokenExpiresAt - Date.now()) / 1000)) : 0,
      connectedProfile: !!state.googleProfile,
      googleDriveFolderId: state.googleDriveFolderId || '',
      googleDriveFiles: state.googleDriveFiles || { devotions: '', journals: '', settings: '' },
      lastDriveSyncAt: state.lastDriveSyncAt || null,
    };
  }

  return {
    requestToken,
    fetchGoogleProfile,
    connectGoogle,
    ensureGoogleClient,
    pushSavedDevotions,
    pullSavedDevotions,
    createSharedDevotionLink,
    importSharedDevotion,
    clearSession,
    getDebugState,
  };
})();

window.Sync = Sync;
