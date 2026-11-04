// Keeps the live totals in chrome.storage.local under "live":
//   { claude: { days: { "2026-11-03": { in, out, msgs, convs } }, since, updatedAt }, chatgpt: {...}, gemini: {...} }
// Every tab's counter sends its additions here so writes from several tabs never race.
const PROVIDERS = ["claude", "chatgpt", "gemini"];
let queue = Promise.resolve();

async function add({ provider, date, tokensIn = 0, tokensOut = 0, msgs = 0, convs = 0 }) {
  if (!PROVIDERS.includes(provider) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  const { live = {} } = await chrome.storage.local.get("live");
  const now = new Date().toISOString();
  const p = live[provider] ||= { days: {}, since: now };
  const d = p.days[date] ||= { in: 0, out: 0, msgs: 0, convs: 0 };
  d.in += tokensIn; d.out += tokensOut; d.msgs += msgs; d.convs += convs;
  p.updatedAt = now;
  await chrome.storage.local.set({ live });
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg && msg.type === "add") {
    queue = queue.then(() => add(msg)).catch(() => {});
    queue.then(() => reply({ ok: true }));
    return true;
  }
  if (msg && msg.type === "clear") {
    queue = queue.then(() => chrome.storage.local.remove("live"));
    queue.then(() => reply({ ok: true }));
    return true;
  }
});

// Tabs open before an install, update or reload keep a counter tied to the old
// extension, which can't send anything, so they'd stop counting until you
// refreshed them. Start fresh copies of the content scripts in those tabs.
chrome.runtime.onInstalled.addListener(async () => {
  for (const { matches, js } of chrome.runtime.getManifest().content_scripts) {
    for (const tab of await chrome.tabs.query({ url: matches })) {
      chrome.scripting.executeScript({ target: { tabId: tab.id }, files: js }).catch(() => {});
    }
  }
});
