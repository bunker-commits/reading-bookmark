// Reading Bookmark - content script
// Auto-saves scroll position on every page, and lets the user mark one or
// more exact spots (via text selection, or the nearest paragraph) to resume
// from later. Button, or Alt+Shift+M / Option+Shift+M.

(function () {
  const STORAGE_PREFIX = "readpos::";
  const BLOCK_TAGS = ["P", "LI", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "PRE", "TD"];

  function getUrlKey() {
    // Ignore query string / hash so re-visits of the same article still match.
    return location.origin + location.pathname;
  }

  const urlKey = getUrlKey();
  const storageKey = STORAGE_PREFIX + urlKey;

  let banner = null;

  function debounce(fn, wait) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  function getScrollPercent() {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const docHeight =
      Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - window.innerHeight;
    return docHeight > 0 ? scrollTop / docHeight : 0;
  }

  function percentForY(y) {
    const docHeight =
      Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - window.innerHeight;
    return docHeight > 0 ? Math.max(0, Math.min(1, y / docHeight)) : 0;
  }

  function buildSelector(el) {
    if (!el || el.nodeType !== 1) return null;
    const path = [];
    let node = el;
    let depth = 0;
    while (node && node.nodeType === 1 && node !== document.body && depth < 8) {
      let selector = node.tagName.toLowerCase();
      if (node.id) {
        path.unshift(selector + "#" + CSS.escape(node.id));
        break;
      }
      const parent = node.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
        if (siblings.length > 1) {
          selector += `:nth-of-type(${siblings.indexOf(node) + 1})`;
        }
      }
      path.unshift(selector);
      node = node.parentElement;
      depth++;
    }
    return path.join(" > ");
  }

  function getElementAtViewportCenter() {
    const x = window.innerWidth / 2;
    const y = window.innerHeight / 2;
    let el = document.elementFromPoint(x, y);
    while (el && !BLOCK_TAGS.includes(el.tagName)) {
      el = el.parentElement;
    }
    return el || document.elementFromPoint(x, y);
  }

  function closestBlock(node) {
    let el = node.nodeType === 3 ? node.parentElement : node;
    while (el && !BLOCK_TAGS.includes(el.tagName)) el = el.parentElement;
    return el;
  }

  function getSelectionInfo() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const text = sel.toString().trim();
    if (!text) return null;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return null;
    return {
      text,
      range: range.cloneRange(),
      rect,
      container: closestBlock(range.startContainer),
    };
  }

  function findBySnippet(snippet) {
    if (!snippet) return null;
    const needle = snippet.slice(0, 40);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        return BLOCK_TAGS.includes(node.tagName) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent && node.textContent.includes(needle)) return node;
    }
    return null;
  }

  // ---------- storage ----------

  function getPageData(cb) {
    chrome.storage.local.get([storageKey], (res) => {
      cb(res[storageKey] || { auto: null, marks: [] });
    });
  }

  function setPageData(data, cb) {
    chrome.storage.local.set({ [storageKey]: data }, cb);
  }

  function saveAuto() {
    getPageData((data) => {
      data.auto = {
        scrollPercent: getScrollPercent(),
        scrollY: window.scrollY,
        savedAt: Date.now(),
      };
      setPageData(data);
    });
  }

  const debouncedSaveAuto = debounce(saveAuto, 1500);

  function saveManual() {
    const selInfo = getSelectionInfo();
    let scrollY, scrollPercent, selector, snippet;

    if (selInfo) {
      // Anchor to roughly a third of the way down the viewport so the
      // highlighted text lands in a comfortable reading position on restore.
      scrollY = window.scrollY + selInfo.rect.top - window.innerHeight * 0.3;
      scrollPercent = percentForY(scrollY);
      selector = buildSelector(selInfo.container);
      snippet = selInfo.text.slice(0, 100);
    } else {
      const el = getElementAtViewportCenter();
      selector = buildSelector(el);
      snippet = el ? el.textContent.trim().slice(0, 80) : "";
      scrollY = window.scrollY;
      scrollPercent = getScrollPercent();
    }

    const mark = {
      id: "m_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      scrollPercent,
      scrollY,
      selector,
      snippet,
      savedAt: Date.now(),
    };

    getPageData((data) => {
      data.marks = data.marks || [];
      data.marks.push(mark);
      data.marks.sort((a, b) => a.scrollPercent - b.scrollPercent);
      setPageData(data, () => {
        if (selInfo) {
          flashRangeHighlight(selInfo.range);
        } else {
          flashHighlight(document.querySelector(selector) || getElementAtViewportCenter());
        }
        showBanner(
          `📍 Spot marked at ~${Math.round(scrollPercent * 100)}%. Check the toolbar icon to see all saved spots.`,
          true
        );
        window.getSelection().removeAllRanges();
      });
    });
  }

  // ---------- highlighting ----------

  function flashHighlight(el) {
    if (!el) return;
    el.classList.add("readpos-highlight");
    setTimeout(() => el.classList.remove("readpos-highlight"), 2500);
  }

  function unwrapSpan(span) {
    const parent = span.parentNode;
    if (!parent) return;
    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    parent.removeChild(span);
  }

  function flashRangeHighlight(range) {
    try {
      const span = document.createElement("span");
      span.className = "readpos-highlight";
      range.surroundContents(span);
      setTimeout(() => unwrapSpan(span), 2500);
    } catch (e) {
      // Selection spanned multiple elements (can't wrap) - highlight the
      // containing block instead.
      flashHighlight(closestBlock(range.startContainer));
    }
  }

  function flashHighlightText(container, snippet) {
    if (!container) return;
    if (!snippet) {
      flashHighlight(container);
      return;
    }
    const needle = snippet.slice(0, 40);
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const idx = node.textContent.indexOf(needle);
      if (idx !== -1) {
        try {
          const range = document.createRange();
          range.setStart(node, idx);
          range.setEnd(node, Math.min(idx + needle.length, node.textContent.length));
          const span = document.createElement("span");
          span.className = "readpos-highlight";
          range.surroundContents(span);
          setTimeout(() => unwrapSpan(span), 2500);
          return;
        } catch (e) {
          break;
        }
      }
    }
    flashHighlight(container);
  }

  // ---------- restore ----------

  function scrollToPercent(percent) {
    const docHeight =
      Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - window.innerHeight;
    window.scrollTo({ top: docHeight * percent, behavior: "smooth" });
  }

  function scrollToMark(mark) {
    let target = null;
    if (mark.selector) {
      try {
        target = document.querySelector(mark.selector);
      } catch (e) {
        target = null;
      }
    }
    if (!target && mark.snippet) target = findBySnippet(mark.snippet);

    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      flashHighlightText(target, mark.snippet);
    } else {
      scrollToPercent(mark.scrollPercent);
    }
  }

  function timeAgo(ts) {
    const mins = Math.round((Date.now() - ts) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.round(hrs / 24)}d ago`;
  }

  function showBanner(text, autoHide) {
    if (banner) banner.remove();
    banner = document.createElement("div");
    banner.className = "readpos-banner";
    banner.innerHTML = `<span>${text}</span><button class="readpos-close" aria-label="Dismiss">\u2715</button>`;
    document.body.appendChild(banner);
    banner.querySelector(".readpos-close").addEventListener("click", () => banner && banner.remove());
    if (autoHide) {
      setTimeout(() => {
        if (!banner) return;
        banner.classList.add("readpos-fade");
        setTimeout(() => banner && banner.remove(), 500);
      }, 6000);
    }
  }

  function showResumeChoiceBanner(marks) {
    if (banner) banner.remove();
    banner = document.createElement("div");
    banner.className = "readpos-banner readpos-choice";
    const btns = marks
      .map(
        (m) =>
          `<button class="readpos-choice-btn" data-id="${m.id}">Resume from ~${Math.round(
            m.scrollPercent * 100
          )}%</button>`
      )
      .join("");
    banner.innerHTML = `
      <div class="readpos-choice-body">
        <div class="readpos-choice-title">You have ${marks.length} saved spots here \u2014 where to?</div>
        <div class="readpos-choice-buttons">${btns}</div>
      </div>
      <button class="readpos-close" aria-label="Dismiss">\u2715</button>`;
    document.body.appendChild(banner);
    banner.querySelectorAll(".readpos-choice-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mark = marks.find((m) => m.id === btn.dataset.id);
        if (mark) scrollToMark(mark);
        if (banner) banner.remove();
      });
    });
    banner.querySelector(".readpos-close").addEventListener("click", () => banner && banner.remove());
  }

  function restorePosition() {
    getPageData((data) => {
      const marks = data.marks || [];
      setTimeout(() => {
        if (marks.length > 1) {
          showResumeChoiceBanner(marks);
        } else if (marks.length === 1) {
          scrollToMark(marks[0]);
          showBanner(`\u21a9\ufe0f Resumed where you left off ${timeAgo(marks[0].savedAt)}.`, true);
        } else if (data.auto) {
          scrollToPercent(data.auto.scrollPercent);
          showBanner(`\u21a9\ufe0f Resumed where you left off ${timeAgo(data.auto.savedAt)}.`, true);
        }
      }, 600);
    });
  }

  // ---------- ui / wiring ----------

  function createMarkButton() {
    const btn = document.createElement("button");
    btn.className = "readpos-mark-btn";
    btn.title = "Select text (optional) then click to mark this spot \u2014 Alt+Shift+M / Option+Shift+M";
    btn.textContent = "📍 Mark spot";
    btn.addEventListener("click", saveManual);
    document.body.appendChild(btn);
  }

  function init() {
    createMarkButton();
    restorePosition();

    window.addEventListener("scroll", debouncedSaveAuto, { passive: true });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") saveAuto();
    });
    window.addEventListener("pagehide", saveAuto);
    document.addEventListener("keydown", (e) => {
      if (e.altKey && e.shiftKey && e.key.toLowerCase() === "m") saveManual();
    });

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === "readpos-scroll-to" && msg.mark) {
        scrollToMark(msg.mark);
      }
    });
  }

  if (document.body) {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  }
})();
