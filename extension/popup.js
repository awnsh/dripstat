const NAMES = { claude: "Claude", chatgpt: "ChatGPT", gemini: "Gemini" };
const dayKey = d => { const z = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };
function fmtTok(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 1 : 2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + "k";
  return String(n);
}

async function render() {
  const { live = {} } = await chrome.storage.local.get("live");
  const today = dayKey(new Date());
  document.getElementById("rows").innerHTML = Object.entries(NAMES).map(([id, name]) => {
    const days = (live[id] && live[id].days) || {};
    const sum = d => d ? d.in + d.out : 0;
    const total = Object.values(days).reduce((a, d) => a + sum(d), 0);
    return `<tr><td>${name}</td><td>${fmtTok(sum(days[today]))} tok</td><td>${fmtTok(total)} tok</td></tr>`;
  }).join("");
}

const clear = document.getElementById("clear");
clear.onclick = async () => {
  if (!clear.dataset.confirm) { clear.dataset.confirm = "1"; clear.textContent = "Click again to clear"; return; }
  await chrome.runtime.sendMessage({ type: "clear" });
  delete clear.dataset.confirm; clear.textContent = "Clear counts";
};
chrome.storage.onChanged.addListener((c, area) => { if (area === "local" && c.live) render(); });
render();
