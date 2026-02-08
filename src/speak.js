(function () {
  function getText() {
    var hash = window.location.hash.slice(1);
    if (hash) return decodeURIComponent(hash);
    return null;
  }

  function speakAndClose(text) {
    if (!text || !text.trim()) {
      document.getElementById('status').textContent = '无内容';
      setTimeout(closeTab, 1500);
      return;
    }
    var u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.9;
    u.onend = function () {
      document.getElementById('status').textContent = '朗读完成';
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.getCurrent(function (tab) {
          if (tab && tab.id) chrome.tabs.remove(tab.id);
        });
      }
    };
    u.onerror = function () {
      document.getElementById('status').textContent = '朗读失败';
      setTimeout(closeTab, 2000);
    };
    speechSynthesis.speak(u);
  }

  function closeTab() {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.getCurrent(function (tab) {
        if (tab && tab.id) chrome.tabs.remove(tab.id);
      });
    }
  }

  var text = getText();
  if (text) {
    speakAndClose(text);
  } else {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['wordmaster_speak_text'], function (r) {
        var t = r && r.wordmaster_speak_text;
        if (t) {
          chrome.storage.local.remove(['wordmaster_speak_text']);
          speakAndClose(t);
        } else {
          document.getElementById('status').textContent = '无内容';
          setTimeout(closeTab, 1500);
        }
      });
    } else {
      document.getElementById('status').textContent = '无内容';
      setTimeout(closeTab, 1500);
    }
  }
})();
