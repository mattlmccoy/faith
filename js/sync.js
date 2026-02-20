/* ============================================================
   ABIDE - Google Drive Sync (Saved Devotions + Journal)
   ============================================================ */

const Sync = (() => {
  const FILE_NAME = 'abide-saved-devotions.json';
  const FOLDER_NAME = 'abidefaith-docs';
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

  function escapeQueryValue(value = '') {
    return String(value).replace(/'/g, "\\'");
  }

  async function findFolderId() {
    const q = encodeURIComponent(
      `name='${escapeQueryValue(FOLDER_NAME)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
    );
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name,modifiedTime)&pageSize=1`;
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
    if (folderId) Store.update({ googleDriveFolderId: folderId });
    return folderId;
  }

  async function findFileId(folderId) {
    if (!folderId) return '';
    const q = encodeURIComponent(
      `name='${escapeQueryValue(FILE_NAME)}' and '${escapeQueryValue(folderId)}' in parents and trashed=false`
    );
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name,modifiedTime)&pageSize=1`;
    const res = await driveFetch(url);
    const data = await res.json();
    return data?.files?.[0]?.id || '';
  }

  async function createFile(jsonBody, folderId) {
    const boundary = 'abide_boundary_' + Date.now();
    const metadata = {
      name: FILE_NAME,
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

  async function pushSavedDevotions() {
    const snapshot = Store.exportSavedDevotionsSnapshot();
    const folderId = await findOrCreateFolderId();
    if (!folderId) throw new Error('Could not create/find Google Drive folder');
    let fileId = (Store.get('googleDriveFileId') || '').trim();
    if (!fileId) fileId = await findFileId(folderId);
    if (fileId) {
      await updateFile(fileId, snapshot);
    } else {
      fileId = await createFile(snapshot, folderId);
    }
    Store.update({
      googleDriveFolderId: folderId,
      googleDriveFileId: fileId,
      lastDriveSyncAt: new Date().toISOString(),
    });
    return { fileId, count: (snapshot.savedDevotions || []).length };
  }

  async function pullSavedDevotions() {
    const folderId = await findExistingFolderId();
    if (!folderId) return { fileId: '', count: 0, imported: false };
    let fileId = (Store.get('googleDriveFileId') || '').trim();
    if (!fileId) fileId = await findFileId(folderId);
    if (!fileId) return { fileId: '', count: 0, imported: false };

    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
    const res = await driveFetch(url);
    const data = await res.json();
    const result = Store.importSavedDevotionsSnapshot(data || {});
    Store.update({
      googleDriveFolderId: folderId,
      googleDriveFileId: fileId,
      lastDriveSyncAt: new Date().toISOString(),
    });
    return {
      fileId,
      count: result.count || 0,
      importedIds: result.importedIds || 0,
      importedLibrary: result.importedLibrary || 0,
      importedJournal: result.importedJournal || 0,
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

  return {
    requestToken,
    fetchGoogleProfile,
    connectGoogle,
    pushSavedDevotions,
    pullSavedDevotions,
    clearSession,
  };
})();

window.Sync = Sync;
