// LexiNote - 豆包网页版抓取
// 桌面版豆包无法注入，可在 popup 中手动添加
(function () {
  let lastSentText = '';
  const SEND_DEBOUNCE_MS = 2000;

  function getInputText() {
    const sel = 'textarea[placeholder*="输入"], textarea[placeholder*="消息"], [contenteditable="true"]';
    const el = document.querySelector(sel);
    if (el) {
      const text = (el.value || el.textContent || '').trim();
      if (text.length > 0 && text.length < 500) return text;
    }
    return '';
  }

  function sendToBackground(text) {
    if (!text || text === lastSentText) return;
    lastSentText = text;
    chrome.runtime.sendMessage({
      type: 'SAVE_WORD',
      payload: { text, source: 'doubao_web' }
    }, (res) => {
      if (res && res.ok && !res.duplicate) {
        console.log('[LexiNote] 已记录(豆包):', text.slice(0, 30) + (text.length > 30 ? '...' : ''));
      }
    });
  }

  let debounceTimer = null;
  function scheduleSend() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const text = getInputText();
      if (text) sendToBackground(text);
      debounceTimer = null;
    }, SEND_DEBOUNCE_MS);
  }

  function attachInput() {
    const textarea = document.querySelector('textarea[placeholder*="输入"], textarea[placeholder*="消息"]');
    if (!textarea || textarea.dataset.wordmaster) return;
    textarea.dataset.wordmaster = '1';
    textarea.addEventListener('blur', scheduleSend);
  }

  const observer = new MutationObserver(attachInput);
  observer.observe(document.body, { childList: true, subtree: true });
  attachInput();
})();
