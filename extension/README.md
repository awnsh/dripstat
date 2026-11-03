# DripStat Live

A browser extension that keeps [DripStat](https://awnsh.github.io/dripstat/app.html) up to date without re-exporting. As you chat on **claude.ai**, **chatgpt.com** and **gemini.google.com**, it counts the tokens in each new prompt and reply (about 4 characters per token, the same as the page) and passes the daily totals to DripStat.

- Chat text never leaves your browser. The extension stores only token, prompt and chat counts per day, in `chrome.storage.local`.
- It doesn't sign in to anything or read your account; it reads the chat on the page you already have open.
- Messages already on the page are history and aren't counted, so opening old chats or scrolling up doesn't add anything. Import an export once on DripStat to fill in older history. On days covered by both, DripStat uses whichever counted more.

## Install (Chrome, Edge, Brave)

1. Download [dripstat-live.zip](https://awnsh.github.io/dripstat/dripstat-live.zip) from the DripStat site and unzip it (or clone this repository).
2. Open `chrome://extensions` (or `edge://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and pick the unzipped `dripstat-live` folder (or this `extension` folder).
4. Open DripStat. The accounts section says **DripStat Live is on** once it's connected.

Click the extension's icon to see today's counts or clear them.

## Files

| File | Runs on | Does |
|---|---|---|
| `counter.js` | claude.ai, chatgpt.com, gemini.google.com | Watches for new messages and counts their tokens |
| `background.js` | service worker | Adds counts from every tab to the daily totals |
| `bridge.js` | DripStat (and `localhost` for development) | Sends the totals to the page and pushes updates |
| `popup.html` | toolbar button | Today's and all-time counts |

## Limits

- It counts only what appears in the chat while the extension is installed, on desktop browsers. Chats on your phone or other computers aren't seen.
- The counter finds messages by each site's page structure. When a site redesigns its chat, counting for that site can stop until the selectors at the top of `counter.js` are updated.
- Like exports, it can't see hidden reasoning, files and images, or the history each turn re-reads, so real usage is higher.
