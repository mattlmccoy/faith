/* ============================================================
   ABIDE - Devotional Share Helpers
   ============================================================ */

const DevotionShare = (() => {
  function clean(text = '') {
    return String(text || '').replace(/\s+/g, ' ').trim();
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
      if (navigator.share) {
        await navigator.share(shareData);
        return { ok: true, method: 'native' };
      }
    } catch (err) {
      if (String(err?.name || '') === 'AbortError') return { ok: false, aborted: true };
    }
    try {
      await navigator.clipboard.writeText([shareData.title, shareData.text].filter(Boolean).join('\n\n'));
      return { ok: true, method: 'clipboard' };
    } catch (err) {
      return { ok: false, error: err?.message || 'share-failed' };
    }
  }

  async function shareLink({ title = 'Abide Devotion', text = '', url = '' } = {}) {
    const shareData = { title: clean(title), text: clean(text), url: String(url || '').trim() };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return { ok: true, method: 'native' };
      }
    } catch (err) {
      if (String(err?.name || '') === 'AbortError') return { ok: false, aborted: true };
    }
    try {
      await navigator.clipboard.writeText([shareData.title, shareData.text, shareData.url].filter(Boolean).join('\n\n'));
      return { ok: true, method: 'clipboard' };
    } catch (err) {
      return { ok: false, error: err?.message || 'share-link-failed' };
    }
  }

  return {
    fromCurrentDay,
    fromSavedEntry,
    share,
    shareLink,
  };
})();

window.DevotionShare = DevotionShare;
