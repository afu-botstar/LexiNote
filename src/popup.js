// LexiNote - 未学会/已学会 Tab、播放、中文释义、导出
const manualInput = document.getElementById('manualInput');
const addBtn = document.getElementById('addBtn');
const addStatus = document.getElementById('addStatus');
const dateStartFilter = document.getElementById('dateStartFilter');
const dateEndFilter = document.getElementById('dateEndFilter');
const wordList = document.getElementById('wordList');
const dateExportPanel = document.getElementById('dateExportPanel');
const dateExportPanelSummary = document.getElementById('dateExportPanelSummary');

const STORAGE_KEY = 'wordmaster_words';
const DATE_FILTER_STORAGE_KEY = 'wordmaster_date_filter';
let allWords = [];
let currentTab = 'unlearned'; // unlearned | learned

function saveDateFilter() {
  const start = dateStartFilter.value;
  const end = dateEndFilter.value;
  chrome.storage.local.set({ [DATE_FILTER_STORAGE_KEY]: { start, end } });
}

// 单词中文释义：在 popup 内请求 MyMemory（与文章翻译同环境，避免 background 请求失败）
async function fetchZhNoteInPopup(text) {
  const t = (text || '').trim().slice(0, 80);
  if (!t) return '';
  try {
    const res = await fetch('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(t) + '&langpair=en|zh-CN');
    if (!res.ok) return '';
    const data = await res.json();
    const translated = data.responseData && data.responseData.translatedText;
    return (translated && translated.trim()) ? translated.trim().slice(0, 100) : '';
  } catch (e) {
    return '';
  }
}

function getTodayDateStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function showStatus(msg, isError) {
  addStatus.textContent = msg;
  addStatus.style.color = isError ? '#cf222e' : 'var(--text-muted)';
  if (msg) setTimeout(() => { addStatus.textContent = ''; }, 3000);
}

function loadWords() {
  chrome.storage.local.get([STORAGE_KEY, DATE_FILTER_STORAGE_KEY], (result) => {
    allWords = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
    const savedFilter = result[DATE_FILTER_STORAGE_KEY] || { start: '', end: '' };
    updateUIForTab();
    renderDateFilter(allWords, savedFilter);
    renderWordList();
  });
}

function getDateOptions(list) {
  const set = new Set();
  list.forEach((w) => { if (w.date) set.add(w.date); });
  return Array.from(set).sort((a, b) => b.localeCompare(a));
}

function getDateOptionsForTab(list, tab) {
  const base = tab === 'learned'
    ? list.filter((w) => (w.checkCount || 0) >= 3)
    : list.filter((w) => (w.checkCount || 0) < 3);
  return getDateOptions(base);
}

function renderDateFilter(list, savedFilter) {
  const dates = getDateOptionsForTab(list, currentTab);
  const today = getTodayDateStr();
  // 关闭再打开 popup 时从 storage 恢复上次选择的日期，否则用当前下拉框的值
  const startVal = savedFilter ? (savedFilter.start || '') : dateStartFilter.value;
  const endVal = savedFilter ? (savedFilter.end || '') : dateEndFilter.value;
  const startOpt = '<option value="">全部</option>' + dates.map((d) => `<option value="${d}">${formatDateLabel(d)}</option>`).join('');
  dateStartFilter.innerHTML = startOpt;
  if (startVal === '' || dates.includes(startVal)) dateStartFilter.value = startVal;
  else if (dates.length > 0) dateStartFilter.value = dates.includes(today) ? today : dates[0];
  else dateStartFilter.value = '';
  const startSelected = dateStartFilter.value;
  const endDates = startSelected ? dates.filter((d) => d >= startSelected) : dates;
  const endOpt = '<option value="">全部</option>' + endDates.map((d) => `<option value="${d}">${formatDateLabel(d)}</option>`).join('');
  dateEndFilter.innerHTML = endOpt;
  if (endVal === '' || endDates.includes(endVal)) dateEndFilter.value = endVal;
  else if (endDates.length > 0) dateEndFilter.value = startSelected || endDates[0];
  else dateEndFilter.value = '';
  updateDateExportSummary();
}

function formatDateLabel(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return (parseInt(m, 10) + '月' + parseInt(d, 10) + '日');
}

function updateDateExportSummary() {
  if (!dateExportPanelSummary) return;
  const start = dateStartFilter.value;
  const end = dateEndFilter.value;
  if (!start && !end) {
    dateExportPanelSummary.textContent = '全部';
    return;
  }
  if (start && end && start === end) {
    dateExportPanelSummary.textContent = formatDateLabel(start);
    return;
  }
  dateExportPanelSummary.textContent = (start ? formatDateLabel(start) : '…') + ' — ' + (end ? formatDateLabel(end) : '…');
}

function toggleDateExportPanel() {
  if (!dateExportPanel) return;
  dateExportPanel.classList.toggle('collapsed');
}

function getFilteredByDate(list) {
  const start = dateStartFilter.value;
  const end = dateEndFilter.value;
  if (!start && !end) return list;
  const dates = getDateOptionsForTab(list, currentTab);
  if (dates.length === 0) return list;
  const startDate = start || dates[dates.length - 1];
  const endDate = end || dates[0];
  return list.filter((w) => w.date >= startDate && w.date <= endDate);
}

function getFilteredByTab(list) {
  const byDate = getFilteredByDate(list);
  if (currentTab === 'learned') return byDate.filter((w) => (w.checkCount || 0) >= 3);
  return byDate.filter((w) => (w.checkCount || 0) < 3);
}

function getWordsByDate(list) {
  const byDate = {};
  list.forEach((w) => {
    if (!byDate[w.date]) byDate[w.date] = [];
    byDate[w.date].push(w);
  });
  return byDate;
}

// 圆形进度条：0/3、1/3、2/3、3/3
function renderCheckProgress(id, count) {
  const r = 14;
  const circumference = 2 * Math.PI * r;
  const filled = count >= 3 ? circumference : (count / 3) * circumference;
  return `
    <div class="check-progress-wrap" data-id="${id}" data-count="${count}" title="点击 3 次即掌握">
      <svg class="check-progress-svg" viewBox="0 0 32 32">
        <circle class="check-progress-bg" cx="16" cy="16" r="${r}" />
        <circle class="check-progress-fill" cx="16" cy="16" r="${r}"
          stroke-dasharray="${circumference}"
          stroke-dashoffset="${circumference - filled}" />
      </svg>
      <span class="check-progress-check">${count >= 3 ? '✓' : count}</span>
    </div>`;
}

function renderWordModule(w, options) {
  const count = w.checkCount || 0;
  const examples = (w.b2Examples || ['']).slice(0, 1);
  const examplesZh = (w.b2ExamplesZh || ['']).slice(0, 1);
  const zhNote = w.zhNote || '';
  const showRemove = options.showRemove === true;
  const loading = w.loading === true;
  const examplesHtml = examples.map((ex, i) => {
    const zh = (examplesZh[i] || '').trim();
    if (!ex || !ex.trim()) return `<li class="example-item"><span class="empty">${loading ? '加载中…' : '暂无例句'}</span></li>`;
    return `<li class="example-item">
      <div class="example-en">${escapeHtml(ex)}</div>
      ${zh ? `<div class="example-zh">${escapeHtml(zh)}</div>` : ''}
    </li>`;
  }).join('');
  return `
    <li class="word-module" data-id="${w.id}">
      <div class="word-module-header-row">
        <div class="word-row">
          <button type="button" class="play-btn" data-text="${escapeAttr(w.text)}" title="点击朗读">▶</button>
          <span class="word-text" data-mastered="${count >= 3}" title="${escapeHtml(w.b1Definition || '')}">
            ${escapeHtml(w.text)}
            ${w.b1Definition ? `<span class="tooltip">${escapeHtml(w.b1Definition)}</span>` : ''}
          </span>
        </div>
        <button type="button" class="word-module-toggle" title="收起/展开" aria-label="收起展开"><span class="toggle-icon">−</span></button>
      </div>
      <div class="word-module-body">
        ${zhNote ? `<div class="zh-translation"><span class="zh-label">中文翻译：</span>${escapeHtml(zhNote)}</div>` : (loading ? '<div class="zh-translation"><span class="zh-label">中文翻译：</span><span class="empty">加载中…</span></div>' : '')}
        <div class="examples-block">
          <div class="examples-block-title">例句</div>
          <ol class="examples-list">${examplesHtml}</ol>
        </div>
      </div>
      <div class="word-module-footer">
        <span class="source-tag">来源: ${sourceLabel(w.source)}</span>
        <div class="footer-right">
          ${showRemove ? `<button type="button" class="remove-btn" data-id="${w.id}" title="从列表中移除">移除</button>` : `<button type="button" class="remove-word-btn" data-id="${w.id}" data-text="${escapeAttr(w.text || '')}" title="移除该单词">移除</button>` + renderCheckProgress(w.id, count)}
        </div>
      </div>
    </li>`;
}

function escapeAttr(s) {
  if (!s) return '';
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML.replace(/"/g, '&quot;');
}

function escapeHtml(s) {
  if (!s) return '';
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function sourceLabel(source) {
  const map = { google_translate: 'Google 翻译', doubao_web: '豆包网页', manual: '手动添加', google_search: 'Google 搜索' };
  return map[source] || source || '—';
}

// 已学会 Tab：胶囊标签
function renderLearnedCapsule(w) {
  return `<span class="learned-capsule" data-id="${w.id}">
    <span class="learned-capsule-text">${escapeHtml(w.text || '')}</span>
    <button type="button" class="learned-capsule-close" data-id="${w.id}" title="删除">×</button>
  </span>`;
}

function renderWordList() {
  const filtered = getFilteredByTab(allWords);
  const byDate = getWordsByDate(filtered);
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
  const isLearnedTab = currentTab === 'learned';

  if (dates.length === 0) {
    wordList.innerHTML = isLearnedTab
      ? '<div class="empty-state"><p>暂无已学会的词</p><p>对未学会的词点击右侧圆形进度 3 次即归入已学会</p></div>'
      : '<div class="empty-state"><p>暂无记录</p><p>在 Google 翻译 / Google 搜索或此处手动添加单词</p></div>';
    return;
  }

  if (isLearnedTab) {
    wordList.innerHTML = dates
      .map((date) => {
        const items = byDate[date];
        const capsules = items.map((w) => renderLearnedCapsule(w)).join('');
        return `<div class="date-group"><h2 class="date-group-title">${date}</h2><div class="learned-capsules-wrap">${capsules}</div></div>`;
      })
      .join('');
    wordList.querySelectorAll('.learned-capsule-close').forEach((btn) => btn.addEventListener('click', onCapsuleRemove));
    return;
  }

  wordList.innerHTML = dates
    .map((date) => {
      const items = byDate[date];
      const modules = items.map((w) => renderWordModule(w, { showRemove: false })).join('');
      const genBtn = `<button type="button" class="gen-article-btn" data-date="${date}">生成今日文章</button>`;
      return `<div class="date-group"><h2 class="date-group-title">${date}</h2><ul class="word-list-inner">${modules}</ul><div class="date-group-actions">${genBtn}</div></div>`;
    })
    .join('');

  wordList.querySelectorAll('.play-btn').forEach((btn) => {
    btn.addEventListener('click', onPlay);
    btn.addEventListener('mouseenter', (e) => onPlayBtnHover(e, true));
  });
  wordList.querySelectorAll('.check-progress-wrap').forEach((wrap) => wrap.addEventListener('click', onCheck));
  wordList.querySelectorAll('.remove-word-btn').forEach((btn) => btn.addEventListener('click', onRemoveWord));
  wordList.querySelectorAll('.word-module-toggle').forEach((btn) => btn.addEventListener('click', onCardToggle));
  wordList.querySelectorAll('.gen-article-btn').forEach((btn) => btn.addEventListener('click', onGenArticle));
}

function getWordsInDateRange() {
  return getFilteredByDate(allWords);
}

function onExportRange() {
  const words = getWordsInDateRange();
  if (words.length === 0) {
    showStatus('当前日期区间内无单词', true);
    return;
  }
  if (!confirm('确定将当前日期区间内的 ' + words.length + ' 个单词导出为 txt 吗？')) return;
  const lines = words.map((w) => (w.text || '').trim()).filter(Boolean);
  const text = lines.join('\n');
  const start = dateStartFilter.value || 'start';
  const end = dateEndFilter.value || 'end';
  const filename = 'LexiNote_' + start + '_' + end + '.txt';
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
  showStatus('已导出 ' + lines.length + ' 个单词', false);
}

function onCardToggle(e) {
  e.stopPropagation();
  const btn = e.currentTarget;
  const card = btn.closest('.word-module');
  if (!card) return;
  card.classList.toggle('collapsed');
  const icon = btn.querySelector('.toggle-icon');
  if (icon) icon.textContent = card.classList.contains('collapsed') ? '+' : '−';
  btn.setAttribute('title', card.classList.contains('collapsed') ? '展开' : '收起');
}

function onCapsuleRemove(e) {
  e.stopPropagation();
  const btn = e.currentTarget;
  const id = btn.dataset.id;
  if (!id) return;
  chrome.runtime.sendMessage({ type: 'REMOVE_WORD', payload: { id } }, (res) => {
    if (res && res.ok) loadWords();
  });
}

// Pollinations.AI 生成文章（https://text.pollinations.ai/）
const POLLINATIONS_OPENAI_URL = 'https://text.pollinations.ai/openai';

async function fetchArticleFromPollinations(words) {
  const wordList = words.map((w) => (w.text || '').trim()).filter(Boolean);
  if (wordList.length === 0) return '';
  const vocab = wordList.join(', ');
  const prompt = `Write one short, natural-sounding English paragraph (about 80-150 words) that reads like real life—e.g. a blog post, a diary entry, or a short story moment. Weave in every word or phrase naturally: ${vocab}. Vary sentence length and rhythm; avoid textbook-style or list-like sentences. Output only the paragraph, no title or explanation.`;
  const res = await fetch(POLLINATIONS_OPENAI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai',
      messages: [
        { role: 'system', content: 'You write natural, engaging English that sounds like a native in a blog or story—not like a textbook. Use concrete situations and a consistent tone. Output only the requested text.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.85,
      max_tokens: 400
    })
  });
  if (!res.ok) throw new Error(res.statusText);
  const data = await res.json();
  const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  return (text && typeof text === 'string' && text.trim()) ? text.trim() : '';
}

// 过渡语，让拼接后的句子读起来有逻辑、有层次（Pollinations 失败时回退）
const ARTICLE_TRANSITIONS = ['Furthermore, ', 'Moreover, ', 'Additionally, ', 'In this way, ', 'Finally, ', 'Also, '];

function generateArticleForDate(date) {
  const words = allWords.filter((w) => w.date === date && (w.checkCount || 0) < 3);
  if (words.length === 0) return { text: '', words: [] };
  const raw = [];
  words.forEach((w) => {
    const ex = (w.b2Examples || []).filter(Boolean)[0];
    if (ex && ex.trim()) {
      raw.push(ex.trim().replace(/\.+$/, '') + '.');
    } else {
      raw.push('I learned the word "' + (w.text || '').trim() + '".');
    }
  });
  if (raw.length === 0) return { text: '', words: [] };
  // 按句长排序，短句在前，读起来更顺
  const sentences = [...raw].sort((a, b) => a.length - b.length);
  const intro = "Here is a short passage using today's vocabulary.";
  const parts = sentences.map((s, i) => {
    if (i === 0) return 'To begin with, ' + s;
    const transition = ARTICLE_TRANSITIONS[(i - 1) % ARTICLE_TRANSITIONS.length];
    return transition + s;
  });
  const text = intro + ' ' + parts.join(' ');
  return { text, words };
}

// 将短语中的连字符/空格变成正则：可匹配 -、空格、多种 Unicode 横线
const HYPHEN_SPACE_RE = /[\s\u002D\u2010-\u2015\u2212\u00AD]+/;

function wordToPattern(word) {
  const w = (word || '').trim();
  if (!w) return null;
  const parts = w.split(HYPHEN_SPACE_RE).filter(Boolean);
  if (parts.length === 0) return null;
  const escapedParts = parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const hyphenSpace = '[\\s\\-\u2010-\u2015\u2212\u00AD]+';
  const pattern = escapedParts.length === 1
    ? escapedParts[0]
    : escapedParts.join(hyphenSpace);
  return '\\b(' + pattern + ')\\b';
}

// 在文章中把当天所学单词用马克笔色块标出（#0ADACC 底纹）
function highlightWordsInArticle(text, words) {
  if (!text || !words.length) return escapeHtml(text || '');
  let html = escapeHtml(text);
  const sorted = [...words].filter((w) => (w.text || '').trim()).sort((a, b) => (b.text || '').length - (a.text || '').length);
  sorted.forEach((w) => {
    const word = (w.text || '').trim();
    if (!word) return;
    const pattern = wordToPattern(word);
    if (!pattern) return;
    const re = new RegExp(pattern, 'gi');
    html = html.replace(re, '<span class="article-highlight">$1</span>');
  });
  return html;
}

// 文章全文翻译（英→中），在 popup 内请求 MyMemory，避免依赖 background 导致无响应
const TRANSLATE_CHUNK_MAX = 480;
function chunkTextForTranslate(str) {
  const s = (str || '').trim();
  if (!s) return [];
  const chunks = [];
  for (let i = 0; i < s.length; i += TRANSLATE_CHUNK_MAX) chunks.push(s.slice(i, i + TRANSLATE_CHUNK_MAX));
  return chunks;
}
async function translateArticleInPopup(text) {
  const t = (text || '').trim();
  if (!t) return '';
  const chunks = chunkTextForTranslate(t);
  const results = [];
  for (const chunk of chunks) {
    if (!chunk) continue;
    try {
      const res = await fetch('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(chunk) + '&langpair=en|zh-CN');
      if (res.status === 429) throw new Error('429');
      if (!res.ok) continue;
      const data = await res.json();
      const translated = data.responseData && data.responseData.translatedText;
      const err = data.responseStatus || 0;
      if (err !== 200 || !translated || /LIMIT EXCEEDED/i.test(String(translated))) continue;
      results.push(translated.trim().replace(/\s+/g, ' '));
    } catch (e) {
      if (e && e.message === '429') throw e;
      results.push('');
    }
  }
  const joined = results.join('').trim().replace(/\s+/g, ' ');
  return joined || '';
}

function openArticleModal(date, text, words) {
  const overlay = document.createElement('div');
  overlay.className = 'article-overlay';
  overlay.innerHTML =
    '<div class="article-modal">' +
    '<div class="article-modal-header">' +
    '<h3 class="article-modal-title">' + date + ' 今日所学 · 巩固文章</h3>' +
    '<button type="button" class="article-modal-close">关闭</button>' +
    '</div>' +
    '<div class="article-modal-carousel">' +
    '<div class="article-panel article-panel-en active"><div class="article-panel-inner"></div></div>' +
    '<div class="article-panel article-panel-zh"><div class="article-panel-inner"></div></div>' +
    '</div>' +
    '<div class="article-modal-nav">' +
    '<button type="button" class="article-nav-btn article-nav-prev" title="上一屏">‹</button>' +
    '<span class="article-nav-dots"><span class="dot active" data-index="0">英文</span><span class="dot" data-index="1">中文</span></span>' +
    '<button type="button" class="article-nav-btn article-nav-next" title="下一屏">›</button>' +
    '</div>' +
    '<div class="article-modal-actions"><button type="button" class="article-copy-btn">复制到剪贴板</button></div>' +
    '</div>';
  const panelEn = overlay.querySelector('.article-panel-en .article-panel-inner');
  const panelZh = overlay.querySelector('.article-panel-zh .article-panel-inner');
  let currentText = text || '';
  if (currentText) {
    panelEn.innerHTML = highlightWordsInArticle(currentText, words);
    panelZh.textContent = '翻译中…';
  } else {
    panelEn.textContent = '生成中…';
    panelZh.textContent = '';
  }
  const close = function () { overlay.remove(); };
  overlay.querySelector('.article-modal-close').addEventListener('click', close);
  overlay.addEventListener('click', function (ev) { if (ev.target === overlay) close(); });
  overlay.querySelector('.article-modal').addEventListener('click', function (ev) { ev.stopPropagation(); });
  let currentScreen = 0;
  function setScreen(index) {
    if (index !== undefined) currentScreen = index < 0 ? 0 : index > 1 ? 1 : index;
    overlay.querySelectorAll('.article-panel').forEach((p, i) => { p.classList.toggle('active', i === currentScreen); });
    overlay.querySelectorAll('.article-nav-dots .dot').forEach((d, i) => { d.classList.toggle('active', i === currentScreen); });
  }
  overlay.querySelector('.article-nav-prev').addEventListener('click', () => { setScreen(currentScreen - 1); });
  overlay.querySelector('.article-nav-next').addEventListener('click', () => { setScreen(currentScreen + 1); });
  overlay.querySelectorAll('.article-nav-dots .dot').forEach((dot) => {
    dot.addEventListener('click', () => { setScreen(parseInt(dot.dataset.index, 10)); });
  });
  overlay.querySelector('.article-copy-btn').addEventListener('click', function () {
    const toCopy = currentScreen === 0 ? currentText : (panelZh.textContent || '');
    navigator.clipboard.writeText(toCopy).then(function () {
      overlay.querySelector('.article-copy-btn').textContent = '已复制';
      setTimeout(close, 800);
    });
  });
  function setZhPanel(content, isError) {
    if (!panelZh) return;
    panelZh.textContent = '';
    panelZh.innerHTML = '';
    if (!isError) {
      panelZh.textContent = content || '暂无翻译';
      return;
    }
    const p = document.createElement('p');
    p.textContent = content;
    p.style.margin = '0 0 8px 0';
    panelZh.appendChild(p);
    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'article-retry-translate';
    retryBtn.textContent = '重试翻译';
    retryBtn.addEventListener('click', function () {
      retryBtn.disabled = true;
      panelZh.textContent = '翻译中…';
      translateArticleInPopup(currentText).then((zh) => {
        if (zh && zh.trim()) setZhPanel(zh, false);
        else setZhPanel('暂无翻译', true);
      }).catch(() => setZhPanel('翻译失败，请稍后再试', true));
    });
    panelZh.appendChild(retryBtn);
  }
  function startTranslate() {
    if (!currentText) return;
    panelZh.textContent = '翻译中…';
    (async function setZh() {
      try {
        const zh = await Promise.race([
          translateArticleInPopup(currentText),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000))
        ]);
        if (zh && zh.trim()) setZhPanel(zh, false);
        else setZhPanel('暂无翻译', true);
      } catch (err) {
        const msg = (err && err.message === '429') ? '翻译服务请求过多(429)，请稍后再试' : (err && err.message === 'timeout' ? '翻译超时，请稍后再试' : '翻译失败或超时，请稍后再试');
        setZhPanel(msg, true);
      }
    })();
  }
  function setContent(text, wordsForHighlight) {
    if (!text || !overlay.parentNode) return;
    currentText = text;
    panelEn.innerHTML = highlightWordsInArticle(text, wordsForHighlight || words);
    panelZh.textContent = '翻译中…';
    startTranslate();
  }
  if (currentText) {
    (async function setZh() {
      try {
        const zh = await Promise.race([
          translateArticleInPopup(currentText),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000))
        ]);
        if (zh && zh.trim()) setZhPanel(zh, false);
        else setZhPanel('暂无翻译', true);
      } catch (err) {
        const msg = (err && err.message === '429') ? '翻译服务请求过多(429)，请稍后再试' : (err && err.message === 'timeout' ? '翻译超时，请稍后再试' : '翻译失败或超时，请稍后再试');
        setZhPanel(msg, true);
      }
    })();
  }
  document.body.appendChild(overlay);
  return { setContent, words };
}

async function onGenArticle(e) {
  const date = e.currentTarget.dataset.date;
  const words = allWords.filter((w) => w.date === date && (w.checkCount || 0) < 3);
  if (words.length === 0) {
    showStatus('当日单词已全部掌握，无需生成文章', false);
    return;
  }
  const modal = openArticleModal(date, '', words);
  try {
    const text = await fetchArticleFromPollinations(words);
    if (text) {
      modal.setContent(text, words);
    } else {
      const { text: localText, words: wordsForHighlight } = generateArticleForDate(date);
      modal.setContent(localText, wordsForHighlight);
    }
  } catch (err) {
    const { text: localText, words: wordsForHighlight } = generateArticleForDate(date);
    modal.setContent(localText, wordsForHighlight);
  }
}

// 悬停时预加载有道音频，点击时若已缓冲则立即播放
function getYoudaoAudioUrl(text) {
  return 'https://dict.youdao.com/dictvoice?type=0&audio=' + encodeURIComponent((text || '').slice(0, 200));
}

function playWithYoudao(text, btn, preloaded) {
  const url = getYoudaoAudioUrl(text);
  const audio = preloaded && preloaded.readyState >= 2 ? preloaded : new Audio(url);
  if (audio !== preloaded) audio.preload = 'auto';
  let done = false;
  function enableBtn() {
    if (done) return;
    done = true;
    btn.disabled = false;
  }
  const safetyTimer = setTimeout(enableBtn, 15000);
  audio.onended = function () { clearTimeout(safetyTimer); enableBtn(); };
  audio.onerror = function () {
    clearTimeout(safetyTimer);
    if (!done) { done = true; playWithSpeechSynthesis(text, btn); }
  };
  if (audio.currentTime > 0) audio.currentTime = 0;
  audio.play().catch(function () {
    clearTimeout(safetyTimer);
    if (!done) { done = true; playWithSpeechSynthesis(text, btn); }
  });
}

function playWithSpeechSynthesis(text, btn) {
  if (!window.speechSynthesis) { btn.disabled = false; return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.slice(0, 200));
  u.lang = 'en-US';
  u.rate = 0.9;
  let done = false;
  function enableBtn() {
    if (done) return;
    done = true;
    btn.disabled = false;
  }
  const safetyTimer = setTimeout(enableBtn, 10000);
  u.onend = function () { clearTimeout(safetyTimer); enableBtn(); };
  u.onerror = function () { clearTimeout(safetyTimer); enableBtn(); };
  try {
    speechSynthesis.speak(u);
  } catch (err) {
    clearTimeout(safetyTimer);
    btn.disabled = false;
  }
}

function onPlay(e) {
  e.stopPropagation();
  const btn = e.currentTarget;
  const text = (btn.getAttribute('data-text') || '').trim();
  if (!text || btn.disabled) return;
  btn.disabled = true;
  const preloaded = btn._preloadedAudio && btn._preloadedText === text ? btn._preloadedAudio : null;
  playWithYoudao(text, btn, preloaded);
}

// 悬停 ▶ 时预加载该词的有道音频，点击时更快出声
function onPlayBtnHover(e, isEnter) {
  const btn = e.currentTarget;
  const text = (btn.getAttribute('data-text') || '').trim();
  if (!text) return;
  if (isEnter) {
    if (btn._preloadedText === text) return;
    btn._preloadedText = text;
    const audio = new Audio(getYoudaoAudioUrl(text));
    audio.preload = 'auto';
    btn._preloadedAudio = audio;
  }
}

function onCheck(e) {
  const wrap = e.currentTarget;
  if (wrap.tagName !== 'DIV') return;
  const id = wrap.dataset.id;
  const count = parseInt(wrap.dataset.count, 10);
  if (count >= 3) return;
  chrome.runtime.sendMessage({ type: 'CHECK_WORD', payload: { id } }, (res) => {
    if (res && res.ok) {
      allWords = allWords.map((w) => (w.id === id ? { ...w, checkCount: res.checkCount } : w));
      if (res.checkCount >= 3) {
        wrap.innerHTML = '<span class="check-emoji check-emoji-pop">🥳</span>';
        wrap.classList.add('check-done');
        setTimeout(function () {
          renderWordList();
        }, 800);
      } else {
        wrap.dataset.count = res.checkCount;
        wrap.querySelector('.check-progress-check').textContent = res.checkCount;
        const r = 14;
        const circumference = 2 * Math.PI * r;
        const filled = (res.checkCount / 3) * circumference;
        const circle = wrap.querySelector('.check-progress-fill');
        if (circle) circle.setAttribute('stroke-dashoffset', circumference - filled);
      }
    }
  });
}

function onRemove(e) {
  e.stopPropagation();
  const btn = e.currentTarget;
  const id = btn.dataset.id;
  if (!id) return;
  chrome.runtime.sendMessage({ type: 'REMOVE_WORD', payload: { id } }, (res) => {
    if (res && res.ok) loadWords();
  });
}

/** 与插件风格一致的自定义确认弹窗，返回 Promise<boolean> */
function showConfirmModal(options) {
  const { message = '', confirmText = '确定', cancelText = '取消', danger = false } = options || {};
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML =
    '<div class="confirm-modal">' +
    '<p class="confirm-message"></p>' +
    '<div class="confirm-actions">' +
    '<button type="button" class="confirm-btn confirm-cancel">' + escapeHtml(cancelText) + '</button>' +
    '<button type="button" class="confirm-btn confirm-ok' + (danger ? ' confirm-ok-danger' : '') + '">' + escapeHtml(confirmText) + '</button>' +
    '</div></div>';
  const msgEl = overlay.querySelector('.confirm-message');
  msgEl.textContent = message;
  const cancelBtn = overlay.querySelector('.confirm-cancel');
  const okBtn = overlay.querySelector('.confirm-ok');
  const close = (result) => {
    overlay.remove();
    resolveConfirm(result);
  };
  let resolveConfirm;
  const p = new Promise((resolve) => { resolveConfirm = resolve; });
  cancelBtn.addEventListener('click', () => close(false));
  okBtn.addEventListener('click', () => close(true));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
  overlay.querySelector('.confirm-modal').addEventListener('click', (e) => e.stopPropagation());
  document.body.appendChild(overlay);
  return p;
}

function onRemoveWord(e) {
  e.stopPropagation();
  const btn = e.currentTarget;
  const id = btn.dataset.id;
  const text = (btn.dataset.text || '').trim();
  if (!id) return;
  const msg = text ? `确定要移除「${text}」吗？` : '确定要移除该单词吗？';
  showConfirmModal({ message: msg, confirmText: '确定移除', cancelText: '取消', danger: true }).then((ok) => {
    if (!ok) return;
    chrome.runtime.sendMessage({ type: 'REMOVE_WORD', payload: { id } }, (res) => {
      if (res && res.ok) loadWords();
    });
  });
}

function updateUIForTab() {
  const addSection = document.getElementById('addSection');
  const exportRangeBtn = document.getElementById('exportRangeBtn');
  if (addSection) addSection.style.display = currentTab === 'learned' ? 'none' : '';
  if (exportRangeBtn) exportRangeBtn.style.display = currentTab === 'learned' ? 'none' : '';
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    currentTab = tab.dataset.tab;
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    updateUIForTab();
    renderDateFilter(allWords);
    renderWordList();
  });
});

addBtn.addEventListener('click', () => {
  const text = manualInput.value.trim();
  if (!text) { showStatus('请输入单词或短语', true); return; }
  addBtn.disabled = true;
  chrome.runtime.sendMessage(
    { type: 'SAVE_WORD', payload: { text, source: 'manual' } },
    (res) => {
      addBtn.disabled = false;
      if (res && res.ok) {
        if (res.duplicate) { showStatus('该词今日已存在', false); loadWords(); }
        else {
          showStatus('已添加', false);
          manualInput.value = '';
          if (res.item) {
            allWords = [res.item].concat(allWords);
            renderDateFilter(allWords);
            renderWordList();
          } else loadWords();
        }
      } else { showStatus('添加失败', true); }
    }
  );
});

manualInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addBtn.click(); });
dateStartFilter.addEventListener('change', () => {
  saveDateFilter();
  renderDateFilter(allWords);
  renderWordList();
});
dateEndFilter.addEventListener('change', () => {
  saveDateFilter();
  updateDateExportSummary();
  renderWordList();
});

if (dateExportPanel) {
  const header = document.getElementById('dateExportPanelHeader');
  const toggleBtn = dateExportPanel.querySelector('.date-export-panel-toggle');
  if (header) header.addEventListener('click', (e) => { if (!toggleBtn || !toggleBtn.contains(e.target)) toggleDateExportPanel(); });
  if (toggleBtn) toggleBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleDateExportPanel(); });
}

const confirmFilterBtn = document.getElementById('confirmFilterBtn');
if (confirmFilterBtn) {
  confirmFilterBtn.addEventListener('click', () => {
    saveDateFilter();
    renderWordList();
    toggleDateExportPanel();
  });
}

const exportRangeBtn = document.getElementById('exportRangeBtn');
if (exportRangeBtn) exportRangeBtn.addEventListener('click', onExportRange);

// 后台拉完释义/例句后推送更新，卡片自动刷新
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'WORD_DATA_READY' && message.payload && message.payload.item) {
    const item = message.payload.item;
    const idx = allWords.findIndex((w) => w.id === item.id);
    if (idx >= 0) {
      allWords[idx] = item;
      renderWordList();
    }
  }
});

loadWords();
