function getUrlKeyFromUrl(url) {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch (e) {
    return url;
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

const marksListEl = document.getElementById("marksList");
const autoStatusEl = document.getElementById("autoStatus");
let currentStorageKey = null;
let currentTabId = null;

function render(data) {
  const marks = (data && data.marks) || [];
  marksListEl.innerHTML = "";

  if (marks.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No marked spots for this page yet.";
    marksListEl.appendChild(empty);
  } else {
    marks
      .slice()
      .sort((a, b) => a.scrollPercent - b.scrollPercent)
      .forEach((mark) => {
        const row = document.createElement("div");
        row.className = "mark-row";
        row.innerHTML = `
          <div class="mark-info">
            <div class="mark-pct">~${Math.round(mark.scrollPercent * 100)}% through</div>
            <div class="mark-snippet">${mark.snippet ? mark.snippet.replace(/</g, "&lt;") : "(no text captured)"}</div>
            <div class="mark-time">${timeAgo(mark.savedAt)}</div>
          </div>
          <div class="mark-actions">
            <button class="btn-go" data-id="${mark.id}">Go</button>
            <button class="btn-del" data-id="${mark.id}">✕</button>
          </div>`;
        marksListEl.appendChild(row);
      });
  }

  if (data && data.auto) {
    autoStatusEl.style.display = "block";
    autoStatusEl.textContent = `Also auto-tracked at ~${Math.round(data.auto.scrollPercent * 100)}% (${timeAgo(
      data.auto.savedAt
    )}).`;
  } else {
    autoStatusEl.style.display = "none";
  }

  marksListEl.querySelectorAll(".btn-go").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mark = marks.find((m) => m.id === btn.dataset.id);
      if (mark && currentTabId != null) {
        chrome.tabs.sendMessage(currentTabId, { type: "readpos-scroll-to", mark });
        window.close();
      }
    });
  });

  marksListEl.querySelectorAll(".btn-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      chrome.storage.local.get([currentStorageKey], (res) => {
        const d = res[currentStorageKey] || { auto: null, marks: [] };
        d.marks = (d.marks || []).filter((m) => m.id !== btn.dataset.id);
        chrome.storage.local.set({ [currentStorageKey]: d }, () => render(d));
      });
    });
  });
}

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  if (!tab || !tab.url || !/^https?:/.test(tab.url)) {
    marksListEl.innerHTML = '<div class="empty">Not available on this page.</div>';
    document.getElementById("clearPage").disabled = true;
    return;
  }

  currentTabId = tab.id;
  currentStorageKey = "readpos::" + getUrlKeyFromUrl(tab.url);

  chrome.storage.local.get([currentStorageKey], (res) => {
    render(res[currentStorageKey]);
  });
});

document.getElementById("clearPage").addEventListener("click", () => {
  if (!currentStorageKey) return;
  chrome.storage.local.remove(currentStorageKey, () => render(null));
});

document.getElementById("clearAll").addEventListener("click", () => {
  chrome.storage.local.get(null, (all) => {
    const keys = Object.keys(all).filter((k) => k.startsWith("readpos::"));
    chrome.storage.local.remove(keys, () => render(null));
  });
});
