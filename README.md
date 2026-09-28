# 📍 Reading Bookmark

A tiny Chrome extension that remembers where you left off on long articles — so you can close the tab, come back a day later, and pick up exactly where you stopped reading.

No account, no sync, no tracking. Everything is stored locally in your browser via `chrome.storage.local`.

## Features

- **Auto-tracking**: your scroll position is quietly saved as you read, as a fallback.
- **Manual marks**: select a sentence and click "📍 Mark spot" (or press `Alt+Shift+M`, `Option+Shift+M` on Mac) to save that exact spot. Mark as many spots as you want on one page.
- **Resume picker**: come back to a page with multiple saved spots, and a small banner lets you choose which one to jump to.
- **Popup manager**: click the toolbar icon to see every saved spot on the current page, jump to one, or delete it.

## Install

This extension isn't on the Chrome Web Store (to keep it free and dependency-free), so install it manually — it only takes a minute and Chrome fully supports running extensions this way long-term:

1. Download this repo:
   - **Option A** — click **Code → Download ZIP** on this GitHub page, then unzip it.
   - **Option B** — or clone it: `git clone https://github.com/bunker-commits/reading-bookmark.git`
   - **Option C** — grab a pre-built zip from the [Releases](../../releases) page, if one has been published.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the unzipped `reading-bookmark` folder.
5. Done — open any article and a small "📍 Mark spot" button will appear bottom-right.

If a specific site doesn't seem to load the extension, check `chrome://extensions` → **Reading Bookmark** → **Details** → **Site access** is set to **On all sites**.

## Updating

- Cloned it? Run `git pull`, then hit the refresh icon on the extension's card in `chrome://extensions`.
- Downloaded a zip? Re-download, replace the folder, then hit refresh the same way.

## Why not the Chrome Web Store?

Publishing there requires a one-time $5 developer registration fee and a review process. This project skips that — you install it directly from source, which is free and gives you full visibility into exactly what code is running.

## Contributing

Issues and pull requests are welcome. The whole thing is three small files:
- `content.js` — runs on every page: saving, restoring, marking, highlighting.
- `popup.html` / `popup.js` — the toolbar popup for managing saved spots.
- `manifest.json` — extension configuration (Manifest V3).

## License

MIT — see [LICENSE](LICENSE).
