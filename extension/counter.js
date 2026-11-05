// Runs on claude.ai, chatgpt.com and gemini.google.com. Watches the chat for new
// prompts and replies, counts their tokens (about 4 characters each, same as the
// DripStat page), and sends only the counts to the background worker.
//
// Messages already on the page are history (they're in your export), so a
// message only counts when it appears after you send something. Three guards:
//   - armed: new messages count only for a while after you press Enter or a button
//   - baseline: after switching conversations, whatever loads is history
//   - position: messages that load above ones already seen (scrolling up) are history
(() => {
  const SITES = {
    // Newer layout (Nov 2026): [data-testid=assistant-message] with a data-turn-key,
    // in a virtualized transcript that unmounts rows scrolled out of view. Ids are a
    // React prefix plus the message uuid; only the uuid survives a remount.
    "claude.ai": {
      provider: "claude",
      user: '[data-testid="user-message"]',
      assistant: '[data-testid="assistant-message"], .font-claude-response, .font-claude-message',
      conv: p => (p.match(/^\/chat\/([\w-]+)/) || [])[1] || null,
      id: el => el.getAttribute("data-turn-key") || (el.id && el.id.replace(/^_r_\w+?_/, "")) || null,
      skip: '[role="toolbar"], [data-find-omitted], button',
    },
    // Older layout: [data-message-author-role]. Newer one (Nov 2026):
    // <li data-message-role> inside <ol data-conversation-transcript>, with a
    // hidden "You said:" heading and action buttons to leave out of the count.
    // Newest (Nov 5 2026): role is only on a hidden <h4 data-conversation-role>;
    // each message is a [data-chatgpt-search-unit-key] ending in :user or
    // :assistant, with the message uuid in data-chatgpt-search-message-ids.
    "chatgpt.com": {
      provider: "chatgpt",
      user: '[data-message-author-role="user"], li[data-message-role="user"], [data-chatgpt-search-unit-key$=":user"]',
      assistant: '[data-message-author-role="assistant"], li[data-message-role="assistant"], [data-chatgpt-search-unit-key$=":assistant"]',
      conv: p => (p.match(/\/u?c\/([\w-]+)/) || [])[1] || null,
      id: el => el.getAttribute("data-message-id")
        || (el.getAttribute("data-chatgpt-search-message-ids") || "").split(" ")[0]
        || el.id || null,
      skip: "[data-message-attribution], [data-message-actions], h4[data-conversation-role], button",
    },
    "gemini.google.com": {
      provider: "gemini",
      user: "user-query",
      assistant: "model-response",
      conv: p => (p.match(/\/app\/(\w+)/) || [])[1] || null,
      text: el => (el.querySelector(".query-text, message-content") || el).textContent,
    },
  };
  SITES["chat.openai.com"] = SITES["chatgpt.com"];
  const site = SITES[location.hostname];
  if (!site) return;

  const ALL = `${site.user}, ${site.assistant}`;
  const ARM_MS = 3 * 60e3, GROW_MS = 60e3, BASE_MIN = 2500, BASE_QUIET = 1500;
  const tok = s => Math.ceil(s.length / 4);
  const norm = s => (s || "").replace(/\s+/g, " ").trim();
  function getText(el) {
    let t = site.text ? site.text(el) : el.textContent;
    if (site.skip) for (const s of el.querySelectorAll(site.skip)) t = t.replace(s.textContent, "");
    return norm(t);
  }
  const fp = (role, text) => role + ":" + text.slice(0, 120);
  const dayKey = d => { const z = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };

  const byEl = new WeakMap(), byId = new Map(), byFp = new Map();
  let conv = { id: site.conv(location.pathname), hasMessages: false };
  let armedUntil = 0, baselineFrom = Date.now(), lastMutation = Date.now();

  const recordFor = el => byEl.get(el) || (site.id && byId.get(site.id(el))) || null;
  function bind(el, rec) {
    byEl.set(el, rec);
    const id = site.id && site.id(el);
    if (id) byId.set(id, rec);
  }
  function setText(rec, role, text) {
    if (rec.fp) byFp.delete(rec.fp);
    rec.tokens = tok(text); rec.head = text.slice(0, 60); rec.fp = fp(role, text);
    byFp.set(rec.fp, rec);
  }

  function checkConversation() {
    const id = site.conv(location.pathname);
    if (id === conv.id) return;
    // A new chat getting its id when you send is the same conversation. Gemini
    // switches the URL before the prompt even shows, so go by the send, not by
    // whether a message has appeared yet.
    const sameChat = conv.id === null && id !== null && (conv.hasMessages || Date.now() < armedUntil);
    if (!sameChat) { conv = { id, hasMessages: false }; byFp.clear(); baselineFrom = Date.now(); }
    else conv.id = id;
  }

  function scan() {
    checkConversation();
    const now = Date.now();
    const baseline = baselineFrom > 0;
    const armed = now < armedUntil;
    const els = [...document.querySelectorAll(ALL)].filter(el => !el.parentElement || !el.parentElement.closest(ALL));
    let lastKnown = -1;
    els.forEach((el, i) => { if (recordFor(el)) lastKnown = i; });
    const add = { tokensIn: 0, tokensOut: 0, msgs: 0, convs: 0 };

    els.forEach((el, i) => {
      const role = el.matches(site.user) ? "user" : "assistant";
      const text = getText(el);
      if (!text) return;
      let rec = recordFor(el);
      if (!rec) {
        // Re-rendered copy of a message we already have (React remounts, new chat getting its id).
        const prev = byFp.get(fp(role, text));
        if (prev && !(prev.el && prev.el.deref() && prev.el.deref().isConnected)) rec = prev;
      }
      const counting = armed && !baseline;
      if (!rec) {
        rec = {};
        const isNew = counting && i > lastKnown;
        if (isNew) {
          const n = tok(text);
          // A prompt with nothing above it starts a new chat.
          if (role === "user") { add.tokensIn += n; add.msgs++; if (i === 0) add.convs++; }
          else add.tokensOut += n;
        }
        conv.hasMessages = true;
      } else {
        const n = tok(text);
        // Streaming replies grow in place; count the growth. Text that was swapped
        // out entirely is a different message reusing the element: only the newest
        // one (a regenerated reply) counts.
        const grew = text.startsWith(rec.head) && n > rec.tokens;
        const replaced = !text.startsWith(rec.head) && i === els.length - 1;
        if (counting && (grew || replaced)) {
          const d = grew ? n - rec.tokens : n;
          if (role === "user") add.tokensIn += d; else add.tokensOut += d;
        }
        if (grew && armed) armedUntil = Math.max(armedUntil, now + GROW_MS);
      }
      rec.el = new WeakRef(el);
      bind(el, rec);
      setText(rec, role, text);
    });

    if (baseline && now - baselineFrom > BASE_MIN && now - lastMutation > BASE_QUIET) baselineFrom = 0;
    if (add.tokensIn || add.tokensOut) send(add);
  }

  function send(add) {
    // If the extension was reloaded or removed, this page's counter is orphaned.
    const stop = () => { observer.disconnect(); clearInterval(tick); };
    try {
      chrome.runtime.sendMessage({ type: "add", provider: site.provider, date: dayKey(new Date()), ...add }).catch(stop);
    } catch { stop(); }
  }

  // Arm on sending: Enter in the composer, a button in the composer, or a
  // send/retry/regenerate/edit button. Sidebar clicks don't arm, so opening an
  // old chat never counts it (Gemini's sidebar isn't a <nav>).
  const arm = () => { armedUntil = Date.now() + ARM_MS; };
  const SEND = /send|submit|retry|regenerate|redo|try again|save|update/i;
  document.addEventListener("keydown", e => {
    if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
    const t = e.target;
    if (t && (t.tagName === "TEXTAREA" || t.isContentEditable)) arm();
  }, true);
  document.addEventListener("click", e => {
    const b = e.target.closest && e.target.closest("button, [role=button]");
    if (!b) return;
    const box = b.closest("form, fieldset");
    const inComposer = box && box.querySelector("textarea, [contenteditable=true]");
    const label = (b.getAttribute("aria-label") || "") + " " + (b.getAttribute("data-testid") || "") + " " + b.textContent.slice(0, 40);
    if (inComposer || SEND.test(label)) arm();
  }, true);

  let timer = null, firstPending = 0;
  const observer = new MutationObserver(() => {
    lastMutation = Date.now();
    if (!firstPending) firstPending = lastMutation;
    clearTimeout(timer);
    // Debounce, but keep counting every few seconds while a reply streams.
    const wait = Math.max(0, Math.min(700, firstPending + 3000 - lastMutation));
    timer = setTimeout(() => { firstPending = 0; scan(); }, wait);
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  const tick = setInterval(scan, 1000);
  scan();
})();
