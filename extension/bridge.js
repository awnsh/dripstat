// Runs on the DripStat page. Hands the live totals to the page and pushes
// updates as they arrive. Only pages that opt in with <meta name="dripstat-live"> get data.
(() => {
  if (!document.querySelector('meta[name="dripstat-live"]')) return;
  const version = chrome.runtime.getManifest().version;

  async function post() {
    try {
      const { live = {} } = await chrome.storage.local.get("live");
      window.postMessage({ source: "dripstat-ext", type: "live", version, live }, location.origin);
    } catch { /* extension reloaded */ }
  }

  window.addEventListener("message", e => {
    if (e.source !== window || !e.data || e.data.source !== "dripstat-page") return;
    if (e.data.type === "hello") post();
    // "Delete all data" on the page also clears the extension's counts.
    if (e.data.type === "clear") chrome.runtime.sendMessage({ type: "clear" }).catch(() => {});
  });
  chrome.storage.onChanged.addListener((changes, area) => { if (area === "local" && changes.live) post(); });
  post();
})();
