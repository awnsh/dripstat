// Runs on Google Search. Counts AI Overviews and AI Mode replies (both Gemini)
// toward the Gemini total. Each reply is a div[data-scope-id="turn"], which
// usually gets data-complete="true" once it has finished writing.
//
// Unlike a chat, every search loads a fresh page and Google shows the reply on
// its own, so a reply counts as soon as it finishes. To keep reloads, Back and
// reopened tabs from counting it again, a short hash of each counted reply is
// kept for two days (the text itself is never stored).
(() => {
  const TURN = '[data-scope-id="turn"]';
  // Citation chips, buttons, the "AI Overview" / "AI Mode reply for …" labels, and
  // whatever Google itself leaves out when you copy the answer.
  const SKIP = "button, [role=button], [role=heading], h3, [data-ignore-copy]";
  const KEEP_MS = 2 * 24 * 3600e3, STABLE_MS = 3000;
  const tok = s => Math.ceil(s.length / 4);
  const dayKey = d => { const z = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0).toString(36); };

  // Visible reply text only: each citation also holds a hidden preview of its
  // source pages, which would otherwise more than double the count.
  function replyText(el) {
    let t = el.innerText;
    for (const s of el.querySelectorAll(SKIP)) {
      const outer = s.parentElement.closest(SKIP);
      if (outer && el.contains(outer)) continue; // already removed with its parent
      const x = s.innerText;
      if (x) t = t.replace(x, "");
    }
    return t.replace(/\s+/g, " ").trim();
  }
  // AI Mode labels each reply "AI Mode reply for <your question>"; AI Overviews
  // answer the search itself.
  function queryFor(el) {
    for (const h of el.querySelectorAll("h3, [role=heading]")) {
      const m = h.textContent.match(/^AI Mode reply for (.+)/i);
      if (m) return m[1].trim();
    }
    return new URLSearchParams(location.search).get("q") || "";
  }

  const done = new WeakSet(), pending = new WeakMap();
  let busy = false;

  async function scan() {
    if (busy) return;
    busy = true;
    try {
      const turns = [...document.querySelectorAll(TURN)];
      for (const [i, el] of turns.entries()) {
        if (done.has(el)) continue;
        const text = replyText(el);
        if (!text) continue;
        // Finished when Google marks it complete (it doesn't always), or when the
        // text has stopped changing for a few seconds.
        if (el.getAttribute("data-complete") !== "true") {
          const p = pending.get(el);
          if (!p || p.text !== text) { pending.set(el, { text, at: Date.now() }); continue; }
          if (Date.now() - p.at < STABLE_MS) continue;
        }
        done.add(el);

        const query = queryFor(el);
        const key = hash(query + "\n" + text.slice(0, 400));
        const { googleSeen = {} } = await chrome.storage.local.get("googleSeen");
        const now = Date.now();
        for (const k in googleSeen) if (now - googleSeen[k] > KEEP_MS) delete googleSeen[k];
        if (googleSeen[key]) continue;
        googleSeen[key] = now;
        await chrome.storage.local.set({ googleSeen });
        send({ tokensIn: tok(query), tokensOut: tok(text), msgs: 1, convs: i === 0 ? 1 : 0 });
      }
    } catch { stop(); } finally { busy = false; }
  }

  function send(add) {
    try {
      chrome.runtime.sendMessage({ type: "add", provider: "gemini", date: dayKey(new Date()), ...add }).catch(stop);
    } catch { stop(); }
  }
  // If the extension was reloaded or removed, this page's counter is orphaned.
  function stop() { observer.disconnect(); clearInterval(tick); }

  let timer = null;
  const observer = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(scan, 700); });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-complete"] });
  const tick = setInterval(scan, 1500);
  scan();
})();
