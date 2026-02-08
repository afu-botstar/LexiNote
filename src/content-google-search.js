// LexiNote - Google 搜索与搜索结果页翻译抓取
(function () {
  let lastSentText = '';
  const SEND_DEBOUNCE_MS = 1500;

  function sendToBackground(text) {
    const t = (text || '').trim();
    if (!t || t === lastSentText || t.length > 500) return;
    lastSentText = t;
    chrome.runtime.sendMessage(
      { type: 'SAVE_WORD', payload: { text, source: 'google_search' } },
      (res) => {
        if (res && res.ok && !res.duplicate) {
          console.log('[LexiNote] 已记录(Google):', t.slice(0, 40) + (t.length > 40 ? '...' : ''));
        }
      }
    );
  }

  function tryCaptureFromTranslationCard() {
    // 搜索结果页的翻译卡片：常见结构
    const selectors = [
      '[data-attrid*="translation"]',
      '[data-attrid*="wd:/translations"]',
      '[data-tts="source"]',
      '.translation-card [data-text]',
      '.lr_dct_sf_h [data-dobid]',
      'span[data-dobid="dhb"]',
      '.LrzXr',  // 翻译结果里的源词有时用这个
      '[data-dtype="d3if"]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = (el.textContent || el.innerText || el.getAttribute('data-text') || '').trim();
        if (text && /^[a-zA-Z\s\-']+$/.test(text) && text.length < 200) {
          sendToBackground(text);
          return;
        }
      }
    }
    // 翻译相关区块：查找“翻译”附近英文
    const labels = document.querySelectorAll('[role="heading"], .g, [data-hveid]');
    for (const node of labels) {
      const txt = (node.textContent || '').trim();
      if (txt.indexOf('翻译') === -1 && txt.indexOf('Translation') === -1) continue;
      const parent = node.closest('.g') || node.parentElement;
      if (!parent) continue;
      const spans = parent.querySelectorAll('span, div');
      for (const s of spans) {
        const t = (s.textContent || '').trim();
        if (t && /^[a-zA-Z\s\-']{1,100}$/.test(t) && t.split(/\s+/).length <= 5) {
          sendToBackground(t);
          return;
        }
      }
    }
  }

  function tryCaptureFromSearchBox() {
    const input = document.querySelector('input[name="q"], textarea[name="q"], #search input');
    if (!input || !input.value) return;
    const v = (input.value || '').trim();
    if (v.length < 2 || v.length > 150) return;
    if (!/^[a-zA-Z\s\-'.]+$/.test(v)) return;
    if (v.split(/\s+/).length > 8) return;
    const url = (window.location.href || '').toLowerCase();
    const q = v.toLowerCase();
    if (url.indexOf('translate') !== -1 || url.indexOf('translation') !== -1 || q.indexOf('meaning') !== -1 || q.indexOf('意思') !== -1 || q.indexOf('translate') !== -1 || q.indexOf('翻译') !== -1) {
      sendToBackground(v);
    }
  }

  function runCapture() {
    tryCaptureFromTranslationCard();
    tryCaptureFromSearchBox();
  }

  let debounceTimer = null;
  function schedule() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      runCapture();
      debounceTimer = null;
    }, SEND_DEBOUNCE_MS);
  }

  const observer = new MutationObserver(() => { schedule(); });
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(runCapture, 2000);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(runCapture, 2000);
    });
  }
  setInterval(runCapture, 4000);
})();
