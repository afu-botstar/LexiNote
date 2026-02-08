// LexiNote - Google 翻译页面抓取
(function () {
  let lastSentText = '';
  const SEND_DEBOUNCE_MS = 1200;

  function getSourceText() {
    // 多种选择器，适配不同版本的 Google 翻译
    const selectors = [
      'textarea[aria-label*="Source"]',
      'textarea[aria-label="Source text"]',
      'textarea[data-placeholder]',
      'textarea[jsname="BJE2fc"]',
      'form textarea',
      'textarea'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.value && el.value.trim()) return el.value.trim();
    }
    // 备用：页面上第一个有内容的 textarea（通常是源输入框）
    const all = document.querySelectorAll('textarea');
    for (let i = 0; i < all.length; i++) {
      const v = (all[i].value || '').trim();
      if (v && v.length < 2000) return v;
    }
    return '';
  }

  function sendOneToBackground(text) {
    const t = (text || '').trim();
    if (!t) return;
    chrome.runtime.sendMessage(
      { type: 'SAVE_WORD', payload: { text: t, source: 'google_translate' } },
      (res) => {
        if (res && res.ok && !res.duplicate) {
          console.log('[LexiNote] 已记录:', t.slice(0, 40) + (t.length > 40 ? '...' : ''));
        }
      }
    );
  }

  // 以换行和标点符号为拆分，分词保存；同批内去重
  function sendToBackground(text) {
    const raw = (text || '').trim();
    if (!raw || raw === lastSentText) return;
    lastSentText = raw;
    const parts = [];
    const lines = raw.split(/\r?\n/);
    const punct = /[.,;:，。；：！？、]+/;
    lines.forEach((line) => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return;
      if (punct.test(trimmedLine)) {
        trimmedLine.split(punct).forEach((s) => {
          const t = s.trim();
          if (t && t.length > 0) parts.push(t);
        });
      } else {
        parts.push(trimmedLine);
      }
    });
    const seen = new Set();
    parts.forEach((t) => {
      const key = t.toLowerCase().trim();
      if (!key || seen.has(key)) return;
      seen.add(key);
      sendOneToBackground(t);
    });
  }

  function trySave() {
    const text = getSourceText();
    if (!text) return;
    sendToBackground(text);
  }

  let debounceTimer = null;
  function scheduleSave() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      trySave();
      debounceTimer = null;
    }, SEND_DEBOUNCE_MS);
  }

  function attachToSource() {
    const textarea = document.querySelector('textarea[aria-label*="Source"], textarea[data-placeholder], textarea[jsname="BJE2fc"], textarea[aria-label="Source text"], form textarea, textarea');
    if (!textarea || textarea.dataset.wordmaster) return;
    textarea.dataset.wordmaster = '1';
    textarea.addEventListener('blur', scheduleSave);
    textarea.addEventListener('input', scheduleSave);
    textarea.addEventListener('change', scheduleSave);
  }

  const observer = new MutationObserver(() => {
    attachToSource();
  });
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
    attachToSource();
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { childList: true, subtree: true });
      attachToSource();
    });
  }

  // 定期检查（应对动态渲染、延迟加载）
  setInterval(scheduleSave, 2500);
})();
