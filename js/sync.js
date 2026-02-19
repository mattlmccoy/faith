/* ============================================================
   ABIDE - Google Drive Sync (Saved Devotions)
   ============================================================ */

const Sync = (() => {
  const FILE_NAME = 'abide-saved-devotions.json';
  const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const PROFILE_SCOPE = 'openid email profile';
  const DEFAULT_GOOGLE_CLIENT_ID = '1098652353842-ve34jqhnsqda5v9n1d7455n2kka9k0ek.apps.googleusercontent.com';
  let _accessToken = '';
  let _tokenClient = null;

  function hasGoogleClient() {
    return !!window.google?.accounts?.oauth2;
  }

  function getClientId() {
    return (Store.get('googleClientId') || DEFAULT_GOOGLE_CLIENT_ID || '').trim();
  }

  function ensureClientConfig() {
    const clientId = getClientId();
    if (!clientId) throw new Error('Missing Google Client ID in Settings → Advanced');
    if (!hasGoogleClient()) throw new Error('Google Sign-In script not loaded');
    return clientId;
  }

  async function requestToken(interactive = true) {
    if (_accessToken) return _accessToken;
    const clientId = ensureClientConfig();

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
        resolve(resp.access_token);
      };
      _tokenClient.requestAccessToken({ prompt: interactive ? 'consent' : '' });
    });

    _accessToken = token;
    return token;
  }

  async function driveFetch(url, options = {}) {
    const token = await requestToken(true);
    const headers = {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    };
    const res = await fetch(url, { ...options, headers });
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
    Store.update({
      googleProfile: normalized,
      googleConnectedAt: new Date().toISOString(),
    });
    return normalized;
  }

  async function connectGoogle() {
    await requestToken(true);
    return fetchGoogleProfile();
  }

  async function findFileId() {
    const q = encodeURIComponent(`name='${FILE_NAME}' and 'appDataFolder' in parents and trashed=false`);
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&spaces=appDataFolder&fields=files(id,name,modifiedTime)&pageSize=1`;
    const res = await driveFetch(url);
    const data = await res.json();
    return data?.files?.[0]?.id || '';
  }

  async function createFile(jsonBody) {
    const boundary = 'abide_boundary_' + Date.now();
    const metadata = {
      name: FILE_NAME,
      parents: ['appDataFolder'],
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
    let fileId = (Store.get('googleDriveFileId') || '').trim();
    if (!fileId) fileId = await findFileId();
    if (fileId) {
      await updateFile(fileId, snapshot);
    } else {
      fileId = await createFile(snapshot);
    }
    Store.update({
      googleDriveFileId: fileId,
      lastDriveSyncAt: new Date().toISOString(),
    });
    return { fileId, count: (snapshot.savedDevotions || []).length };
  }

  async function pullSavedDevotions() {
    let fileId = (Store.get('googleDriveFileId') || '').trim();
    if (!fileId) fileId = await findFileId();
    if (!fileId) return { fileId: '', count: 0, imported: false };

    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
    const res = await driveFetch(url);
    const data = await res.json();
    const result = Store.importSavedDevotionsSnapshot(data || {});
    Store.update({
      googleDriveFileId: fileId,
      lastDriveSyncAt: new Date().toISOString(),
    });
    return { fileId, count: result.count || 0, imported: true };
  }

  function clearSession() {
    _accessToken = '';
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
