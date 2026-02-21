/* ============================================================
   ABIDE - Devotional Share Helpers
   ============================================================ */

const DevotionShare = (() => {
  function clean(text = '') {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  async function writeClipboard(text = '') {
    const value = String(text || '');
    if (!value) return false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch (_) {}
    try {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch (_) {
      return false;
    }
  }

  function manualPromptCopy(value = '', label = 'Copy this and share it') {
    const text = String(value || '').trim();
    if (!text || typeof window.prompt !== 'function') return false;
    try {
      window.prompt(label, text);
      return true;
    } catch (_) {
      return false;
    }
  }

  function canInvokeNativeShare() {
    if (!navigator.share) return false;
    const ua = navigator.userActivation;
    if (!ua) return true;
    return !!ua.isActive;
  }

  function fromBodyBlocks(body = []) {
    if (!Array.isArray(body)) return '';
    return body
      .map((block) => {
        if (block?.type === 'paragraph') return clean(block.content);
        if (block?.type === 'heading') return clean(block.content);
        if (block?.type === 'scripture_block') {
          const quote = clean(block.text);
          const ref = clean(block.reference);
          return quote ? `${quote}${ref ? ` (${ref})` : ''}` : '';
        }
        return '';
      })
      .filter(Boolean)
      .join('\n\n');
  }

  function buildPayload({ title = '', dateKey = '', session = 'morning', theme = '', openingVerse = null, body = [], prompts = [], prayer = '' } = {}) {
    const verseLine = openingVerse?.reference
      ? `${openingVerse.reference}${openingVerse.text ? ` — ${clean(openingVerse.text)}` : ''}`
      : '';
    const promptLines = Array.isArray(prompts) && prompts.length
      ? prompts.slice(0, 3).map((p, i) => `${i + 1}. ${clean(p)}`).join('\n')
      : '';
    const bodyText = fromBodyBlocks(body);
    const sessionLabel = session === 'evening' ? 'Evening' : 'Morning';
    const dateLabel = dateKey ? DateUtils.format(dateKey) : DateUtils.format(DateUtils.today());
    const heading = clean(title) || (verseLine ? openingVerse.reference : `Abide ${sessionLabel} Devotion`);
    const intro = [theme ? `Theme: ${theme}` : '', `${sessionLabel} • ${dateLabel}`].filter(Boolean).join('\n');

    const text = [
      heading,
      intro,
      verseLine ? `\nScripture\n${verseLine}` : '',
      bodyText ? `\nDevotion\n${bodyText}` : '',
      promptLines ? `\nReflection Prompts\n${promptLines}` : '',
      prayer ? `\nPrayer\n${clean(prayer)}` : '',
      '\nShared from Abide',
    ].filter(Boolean).join('\n');

    return {
      title: heading,
      text,
    };
  }

  function fromCurrentDay(dayData, session, dateKey) {
    const sessionData = dayData?.[session];
    if (!sessionData) return null;
    return buildPayload({
      title: sessionData.title || sessionData.opening_verse?.reference || '',
      dateKey,
      session,
      theme: dayData?.theme || '',
      openingVerse: sessionData.opening_verse || null,
      body: sessionData.body || [],
      prompts: sessionData.reflection_prompts || [],
      prayer: sessionData.prayer || '',
    });
  }

  function fromSavedEntry(entry) {
    const devotionData = entry?.devotionData || {};
    const session = entry?.session || 'morning';
    const sessionData = devotionData?.[session] || {};
    return buildPayload({
      title: entry?.title || sessionData.title || sessionData.opening_verse?.reference || '',
      dateKey: entry?.dateKey || '',
      session,
      theme: entry?.theme || devotionData?.theme || '',
      openingVerse: sessionData.opening_verse || entry?.openingVerse || null,
      body: (sessionData.body && sessionData.body.length ? sessionData.body : entry?.body) || [],
      prompts: (sessionData.reflection_prompts && sessionData.reflection_prompts.length ? sessionData.reflection_prompts : entry?.reflectionPrompts) || [],
      prayer: sessionData.prayer || entry?.prayer || '',
    });
  }

  async function share(payload) {
    if (!payload) return;
    const shareData = {
      title: payload.title || 'Abide Devotion',
      text: payload.text || '',
    };
    try {
      if (canInvokeNativeShare()) {
        await navigator.share(shareData);
        return { ok: true, method: 'native' };
      }
    } catch (err) {
      if (String(err?.name || '') === 'AbortError') return { ok: false, aborted: true };
    }
    const copyText = [shareData.title, shareData.text].filter(Boolean).join('\n\n');
    if (await writeClipboard(copyText)) {
      return { ok: true, method: 'clipboard' };
    }
    if (manualPromptCopy(copyText, 'Copy devotion text and share')) {
      return { ok: true, method: 'manual' };
    }
    return { ok: false, error: 'share-failed' };
  }

  async function shareLink({ title = 'Abide Devotion', text = '', url = '' } = {}) {
    const shareData = { title: clean(title), text: clean(text), url: String(url || '').trim() };
    try {
      if (canInvokeNativeShare()) {
        await navigator.share(shareData);
        return { ok: true, method: 'native' };
      }
    } catch (err) {
      if (String(err?.name || '') === 'AbortError') return { ok: false, aborted: true };
    }
    const copyText = [shareData.title, shareData.text, shareData.url].filter(Boolean).join('\n\n');
    if (await writeClipboard(copyText)) {
      return { ok: true, method: 'clipboard' };
    }
    if (manualPromptCopy(shareData.url || copyText, 'Copy share link')) {
      return { ok: true, method: 'manual' };
    }
    return { ok: false, error: 'share-link-failed' };
  }

  return {
    fromCurrentDay,
    fromSavedEntry,
    share,
    shareLink,
  };
})();

window.DevotionShare = DevotionShare;
