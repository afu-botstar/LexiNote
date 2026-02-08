// LexiNote - Background Service Worker
// 存储 key
const STORAGE_KEY = 'wordmaster_words';

// 生成唯一 id
function generateId() {
  return 'wm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
}

// 获取今日日期字符串 YYYY-MM-DD
function getTodayDateStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// 从 Wiktionary（FreeDictionaryAPI.com）拉取例句，作为第二来源
async function fetchExamplesFromWiktionary(word) {
  const w = (word || '').toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return [];
  try {
    const res = await fetch(`https://api.freedictionaryapi.com/api/v1/entries/en/${encodeURIComponent(w)}`);
    if (!res.ok) return [];
    const data = await res.json();
    const entries = data && data.entries;
    if (!Array.isArray(entries)) return [];
    const out = [];
    for (const ent of entries) {
      const senses = ent.senses;
      if (!Array.isArray(senses)) continue;
      for (const sense of senses) {
        const exs = sense.examples;
        if (Array.isArray(exs)) {
          for (const ex of exs) {
            const s = (ex && typeof ex === 'string' ? ex : '').trim();
            if (s && !out.includes(s)) out.push(s);
            if (out.length >= 1) return out.slice(0, 1);
          }
        }
        const sub = sense.subsenses;
        if (Array.isArray(sub)) {
          for (const subSense of sub) {
            const subExs = subSense.examples;
            if (Array.isArray(subExs)) {
              for (const ex of subExs) {
                const s = (ex && typeof ex === 'string' ? ex : '').trim();
                if (s && !out.includes(s)) out.push(s);
                if (out.length >= 1) return out.slice(0, 1);
              }
            }
          }
        }
      }
    }
    return out.slice(0, 1);
  } catch (e) {
    return [];
  }
}

// 无例句时用搭配词生成简单 B2 风格句（避免纯 "I'm learning the word" 式兜底）
function buildExamplesFromCollocations(word, collocations) {
  const w = (word || '').trim();
  const list = Array.isArray(collocations) ? collocations.filter((c) => c && String(c).trim()) : [];
  const out = [];
  const used = new Set();
  for (const phrase of list.slice(0, 1)) {
    const p = String(phrase).trim();
    if (!p || used.has(p.toLowerCase())) continue;
    used.add(p.toLowerCase());
    if (p.toLowerCase().startsWith(w.toLowerCase() + ' ')) {
      out.push(`She likes to ${p}.`);
    } else if (p.toLowerCase().endsWith(' ' + w.toLowerCase())) {
      out.push(`This is a ${p}.`);
    } else {
      out.push(`You can use "${p}" in many contexts.`);
    }
    if (out.length >= 1) break;
  }
  if (out.length === 0 && w) {
    out.push(`Try to use "${w}" in your writing or speaking.`);
  }
  return out.slice(0, 1);
}

// 判断是否为“无效”例句（无内容或仅为占位句）
function isUselessExample(ex) {
  const s = (ex || '').trim();
  if (!s) return true;
  if (/I'm learning the word/i.test(s)) return true;
  if (/No example yet/i.test(s)) return true;
  return false;
}

// 从 API 获取英文释义（B1 水平简短）和例句（并行请求以缩短到 1 秒内）
async function fetchWordData(text) {
  const trimmedText = text.trim();
  const word = trimmedText.split(/\s+/)[0];
  if (!word) return { definition: '', examples: [], examplesZh: [], collocations: [], zhNote: '' };

  const dictUrl = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
  // 第一波：词典、搭配、Wiktionary 同时请求
  const [dictRes, collocations, wiktionaryExamples] = await Promise.all([
    fetch(dictUrl),
    fetchCollocations(word),
    fetchExamplesFromWiktionary(word)
  ]);

  function buildFallback(zhNote, colls, wiktionary) {
    let fallbackExamples = (wiktionary && wiktionary.length > 0) ? wiktionary.slice(0, 1) : buildExamplesFromCollocations(trimmedText, colls || []);
    if (fallbackExamples.length === 0 && trimmedText) fallbackExamples = [`Try to use "${trimmedText}" in your writing or speaking.`];
    while (fallbackExamples.length < 1) fallbackExamples.push('');
    const exText = (fallbackExamples[0] || '').trim();
    return { zhNote, collocations: colls || [], fallbackExamples, exText };
  }

  try {
    if (!dictRes.ok) {
      const { zhNote, collocations: colls, fallbackExamples, exText } = buildFallback('', collocations, wiktionaryExamples);
      const [finalZhNote, exampleZh] = await Promise.all([
        fetchZhNote(trimmedText.slice(0, 80)),
        exText ? fetchZhNote(exText.slice(0, 80)) : Promise.resolve('')
      ]);
      return {
        definition: '',
        examples: fallbackExamples.slice(0, 1),
        examplesZh: [exampleZh].slice(0, 1),
        collocations: colls,
        zhNote: finalZhNote || zhNote || ''
      };
    }
    const data = await dictRes.json();
    if (!Array.isArray(data) || !data[0]) {
      const { zhNote, collocations: colls, fallbackExamples, exText } = buildFallback('', collocations, wiktionaryExamples);
      const [finalZhNote, exampleZh] = await Promise.all([
        fetchZhNote(trimmedText.slice(0, 80)),
        exText ? fetchZhNote(exText.slice(0, 80)) : Promise.resolve('')
      ]);
      return {
        definition: '',
        examples: fallbackExamples.slice(0, 1),
        examplesZh: [exampleZh].slice(0, 1),
        collocations: colls,
        zhNote: finalZhNote || zhNote || ''
      };
    }

    const entry = data[0];
    let definition = '';
    const definitionTexts = [];
    const examples = [];

    if (entry.meanings && entry.meanings[0]) {
      const firstMeaning = entry.meanings[0];
      if (firstMeaning.definitions && firstMeaning.definitions[0]) {
        definition = firstMeaning.definitions[0].definition || '';
        for (let i = 0; i < Math.min(2, firstMeaning.definitions.length); i++) {
          const d = firstMeaning.definitions[i].definition;
          if (d && d.trim() && !definitionTexts.includes(d.trim())) definitionTexts.push(d.trim());
        }
        if (firstMeaning.definitions[0].example) examples.push(firstMeaning.definitions[0].example);
      }
      for (const def of firstMeaning.definitions || []) {
        if (def.example && !examples.includes(def.example)) examples.push(def.example);
        if (examples.length >= 1) break;
      }
    }
    for (const m of entry.meanings || []) {
      for (const d of m.definitions || []) {
        if (d.example && !examples.includes(d.example)) examples.push(d.example);
        if (examples.length >= 1) break;
      }
      if (examples.length >= 1) break;
    }

    let finalExamples = examples.slice(0, 1).filter((ex) => ex && ex.trim() && !isUselessExample(ex));
    if (finalExamples.length === 0 || finalExamples.every(isUselessExample)) {
      if (wiktionaryExamples.length > 0) finalExamples = wiktionaryExamples.slice(0, 1);
      else {
        const fromCollocations = buildExamplesFromCollocations(trimmedText, collocations);
        finalExamples = fromCollocations.length > 0 ? fromCollocations.slice(0, 1) : (trimmedText ? [`Try to use "${trimmedText}" in your writing or speaking.`] : []);
      }
    }
    while (finalExamples.length < 1) finalExamples.push('');
    const exText = (finalExamples[0] || '').trim();
    const wordForZh = trimmedText.split(/\s+/)[0];

    // 第二波：所有中文翻译并行
    const zhPromises = [];
    if (definitionTexts[0]) zhPromises.push(fetchZhNote(definitionTexts[0].slice(0, 80)));
    if (definitionTexts[1]) zhPromises.push(fetchZhNote(definitionTexts[1].slice(0, 80)));
    zhPromises.push(fetchZhNote(wordForZh.slice(0, 40)));
    if (exText) zhPromises.push(fetchZhNote(exText.slice(0, 80)));
    const zhResults = await Promise.all(zhPromises);

    let zhNote = '';
    const nDef = definitionTexts.length;
    if (nDef > 0 && zhResults[0]) {
      const parts = zhResults.slice(0, nDef).map((r) => (r && r.trim()) || '').filter(Boolean);
      if (parts.length > 0) zhNote = parts.join('；').slice(0, 100);
      const wordZh = zhResults[nDef];
      if (wordZh && wordZh.trim() && !zhNote.includes(wordZh.trim())) zhNote = (zhNote + '（' + wordZh.trim().slice(0, 15) + '）').slice(0, 120);
    }
    if (!zhNote) zhNote = zhResults[nDef] || (await fetchZhNote(trimmedText.slice(0, 80)));
    const exampleZh = exText ? (zhResults[zhResults.length - 1] || '') : '';

    return {
      definition: definition.slice(0, 200),
      examples: finalExamples.slice(0, 1),
      examplesZh: [exampleZh].slice(0, 1),
      collocations,
      zhNote: zhNote || ''
    };
  } catch (e) {
    const { fallbackExamples, exText } = buildFallback('', collocations, wiktionaryExamples);
    const [zhNote, exampleZh] = await Promise.all([
      fetchZhNote(trimmedText.slice(0, 80)),
      exText ? fetchZhNote(exText.slice(0, 80)) : Promise.resolve('')
    ]);
    return {
      definition: '',
      examples: fallbackExamples.slice(0, 1),
      examplesZh: [exampleZh].slice(0, 1),
      collocations: collocations || [],
      zhNote: zhNote || ''
    };
  }
}

// 中文简短注释：MyMemory 免费翻译 API（英→中）
async function fetchZhNote(text) {
  const t = text.trim().slice(0, 80);
  if (!t) return '';
  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(t)}&langpair=en|zh-CN`
    );
    if (!res.ok) return '';
    const data = await res.json();
    const translated = data.responseData && data.responseData.translatedText;
    return (translated && translated.trim()) ? translated.trim().slice(0, 100) : '';
  } catch (e) {
    return '';
  }
}

// 文章全文翻译（英→中），用于弹窗第二屏。MyMemory 单次请求上限 500 字符，按段翻译后拼接
const TRANSLATE_CHUNK_MAX = 480;

function chunkTextForTranslate(str) {
  const s = (str || '').trim();
  if (!s) return [];
  const chunks = [];
  for (let i = 0; i < s.length; i += TRANSLATE_CHUNK_MAX) {
    chunks.push(s.slice(i, i + TRANSLATE_CHUNK_MAX));
  }
  return chunks;
}

async function translateArticle(text) {
  const t = (text || '').trim();
  if (!t) return '';
  const chunks = chunkTextForTranslate(t);
  const results = [];
  for (const chunk of chunks) {
    if (!chunk) continue;
    try {
      const res = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=en|zh-CN`
      );
      if (!res.ok) continue;
      const data = await res.json();
      const translated = data.responseData && data.responseData.translatedText;
      const err = data.responseStatus || 0;
      if (err !== 200 || !translated || /LIMIT EXCEEDED/i.test(String(translated))) continue;
      results.push(translated.trim());
    } catch (e) {
      results.push('');
    }
  }
  return results.join('').trim() || '';
}

// 常见搭配：Datamuse API（rel_bga=常跟在该词后的词, rel_bgb=常在该词前的词）
async function fetchCollocations(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return [];
  try {
    const [afterRes, beforeRes] = await Promise.all([
      fetch(`https://api.datamuse.com/words?rel_bga=${encodeURIComponent(w)}&max=5`),
      fetch(`https://api.datamuse.com/words?rel_bgb=${encodeURIComponent(w)}&max=5`)
    ]);
    const after = await afterRes.json();
    const before = await beforeRes.json();
    const list = [];
    (before || []).slice(0, 5).forEach((o) => {
      if (o.word) list.push(o.word + ' ' + w);
    });
    (after || []).slice(0, 5).forEach((o) => {
      if (o.word) list.push(w + ' ' + o.word);
    });
    return [...new Set(list)].slice(0, 8);
  } catch (e) {
    return [];
  }
}

// 监听来自 content script 或 popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SAVE_WORD') {
    const { text, source, zhNote: payloadZhNote } = message.payload;
    if (!text || !text.trim()) {
      sendResponse({ ok: false, error: 'empty' });
      return true;
    }
    const trimmed = text.trim();
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      const list = result[STORAGE_KEY] || [];
      const today = getTodayDateStr();
      const normalized = trimmed.toLowerCase();
      const existing = list.find((w) => (w.text || '').trim().toLowerCase() === normalized);
      if (existing) {
        sendResponse({ ok: true, duplicate: true });
        return;
      }
      // 先写入占位，立即返回，实现 0.1 秒内出现
      const item = {
        id: generateId(),
        text: trimmed,
        date: today,
        source: source || 'manual',
        checkCount: 0,
        b1Definition: '',
        zhNote: (payloadZhNote != null && payloadZhNote !== '') ? String(payloadZhNote) : '',
        b2Examples: [''],
        b2ExamplesZh: [''],
        collocations: [],
        loading: true,
        createdAt: Date.now()
      };
      list.unshift(item);
      chrome.storage.local.set({ [STORAGE_KEY]: list }, () => {
        sendResponse({ ok: true, id: item.id, item: item });
        // 后台拉取释义与例句，完成后更新存储并通知 popup
        fetchWordData(trimmed).then((wordData) => {
          chrome.storage.local.get([STORAGE_KEY], (res) => {
            const arr = res[STORAGE_KEY] || [];
            const idx = arr.findIndex((w) => w.id === item.id);
            if (idx >= 0) {
              arr[idx] = {
                ...arr[idx],
                b1Definition: (wordData.definition || '').slice(0, 200),
                zhNote: wordData.zhNote || arr[idx].zhNote || '',
                b2Examples: (wordData.examples || ['']).slice(0, 1),
                b2ExamplesZh: (wordData.examplesZh || ['']).slice(0, 1),
                collocations: wordData.collocations || [],
                loading: false
              };
              chrome.storage.local.set({ [STORAGE_KEY]: arr });
              try {
                chrome.runtime.sendMessage({ type: 'WORD_DATA_READY', payload: { item: arr[idx] } });
              } catch (e) {}
            }
          });
        }).catch(() => {});
      });
    });
    return true;
  }

  if (message.type === 'GET_WORDS') {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      sendResponse({ list: result[STORAGE_KEY] || [] });
    });
    return true;
  }

  if (message.type === 'CHECK_WORD') {
    const { id } = message.payload;
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      const list = result[STORAGE_KEY] || [];
      const item = list.find((w) => w.id === id);
      if (!item) {
        sendResponse({ ok: false });
        return;
      }
      item.checkCount = Math.min(3, (item.checkCount || 0) + 1);
      chrome.storage.local.set({ [STORAGE_KEY]: list }, () => {
        sendResponse({ ok: true, checkCount: item.checkCount });
      });
    });
    return true;
  }

  if (message.type === 'REMOVE_WORD') {
    const { id } = message.payload;
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      const list = (result[STORAGE_KEY] || []).filter((w) => w.id !== id);
      chrome.storage.local.set({ [STORAGE_KEY]: list }, () => {
        sendResponse({ ok: true });
      });
    });
    return true;
  }

  if (message.type === 'UPDATE_WORD_ZH') {
    const { id, zhNote } = message.payload || {};
    if (!id) {
      sendResponse({ ok: false });
      return true;
    }
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      const list = result[STORAGE_KEY] || [];
      const item = list.find((w) => w.id === id);
      if (!item) {
        sendResponse({ ok: false });
        return;
      }
      item.zhNote = (zhNote != null) ? String(zhNote) : '';
      chrome.storage.local.set({ [STORAGE_KEY]: list }, () => {
        sendResponse({ ok: true });
      });
    });
    return true;
  }

  if (message.type === 'REFRESH_WORD_DATA') {
    const { id } = message.payload;
    chrome.storage.local.get([STORAGE_KEY], async (result) => {
      const list = result[STORAGE_KEY] || [];
      const item = list.find((w) => w.id === id);
      if (!item) {
        sendResponse({ ok: false });
        return true;
      }
      const wordData = await fetchWordData(item.text);
      item.b1Definition = wordData.definition;
      item.zhNote = wordData.zhNote || '';
      item.b2Examples = [
        ...(wordData.examples || []),
        ...Array(Math.max(0, 1 - (wordData.examples || []).length)).fill('')
      ].slice(0, 1);
      item.b2ExamplesZh = (wordData.examplesZh || []).slice(0, 1);
      chrome.storage.local.set({ [STORAGE_KEY]: list }, () => {
        sendResponse({ ok: true });
      });
    });
    return true;
  }

  if (message.type === 'TRANSLATE_ARTICLE') {
    const { text } = message.payload || {};
    translateArticle(text || '').then((zhText) => {
      sendResponse({ zhText: zhText || '' });
    });
    return true;
  }

  return false;
});

