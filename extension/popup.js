const SERVICES = [
  { id: "claude", name: "Claude", color: "var(--s-claude)" },
  { id: "chatgpt", name: "ChatGPT", color: "var(--s-chatgpt)" },
  { id: "gemini", name: "Gemini", note: "incl. Google Search AI", color: "var(--s-gemini)" },
];
// Same as DripStat's recommended "Cooling + power plants" method:
// 0.4 Wh per 1k tokens × (1.1 L/kWh on site + 1.1 PUE × 3.1 L/kWh at the power plant).
const ML_PER_TOKEN = 0.4 / 1000 * (1.1 + 1.1 * 3.1);
const RANGES = {
  today: { label: "Water used today", days: 1 },
  week: { label: "Water used in the last 7 days", days: 7 },
  all: { label: "Water used since installed", days: Infinity },
};
const $ = id => document.getElementById(id);
const dayKey = d => { const z = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };
const lastDays = n => Array.from({ length: n }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (n - 1 - i)); return d; });
const tokOf = d => d ? d.in + d.out : 0;

function fmtTok(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 1 : 2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + "k";
  return String(n);
}
function fmtWater(ml) {
  if (ml >= 1e6) return { v: (ml / 1e6).toFixed(2), u: "m³" };
  if (ml >= 1000) return { v: (ml / 1000).toFixed(ml >= 1e5 ? 0 : ml >= 1e4 ? 1 : 2), u: "L" };
  return { v: ml.toFixed(ml >= 100 ? 0 : ml >= 10 ? 1 : 2), u: "mL" };
}
const wStr = ml => { const w = fmtWater(ml); return `${w.v} ${w.u}`; };
function ago(iso) {
  if (!iso) return "not seen yet";
  const m = Math.round((Date.now() - new Date(iso)) / 60e3);
  if (m < 1) return "active just now";
  if (m < 60) return `active ${m} min ago`;
  if (m < 60 * 24) return `active ${Math.round(m / 60)} h ago`;
  return "active " + new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

let range = "today";
try { range = localStorage.getItem("range") || "today"; } catch {}
if (!RANGES[range]) range = "today";

function tokensIn(p, days) {
  const all = (p && p.days) || {};
  if (days === Infinity) return Object.values(all).reduce((a, d) => a + tokOf(d), 0);
  return lastDays(days).reduce((a, d) => a + tokOf(all[dayKey(d)]), 0);
}

function renderTank(ml) {
  const marks = [[50, "a shot glass"], [250, "a glass"], [500, "a bottle"], [2000, "a jug"], [10000, "a bucket"], [65000, "a shower"], [150000, "a bathtub"], [1e6, "a 1,000 L tank"]];
  const target = marks.find(m => ml <= m[0]) || marks[marks.length - 1];
  const frac = ml ? Math.max(0.04, Math.min(1, ml / target[0])) : 0;
  const top = 6 + 74 * (1 - frac);
  const wave = y => { let d = `M0 ${y}`; for (let x = 0; x <= 120; x += 30) d += ` Q${x + 15} ${y - 3} ${x + 30} ${y} T${x + 60} ${y}`; return d + " V82 H0 Z"; };
  $("tank").innerHTML = `
    <svg viewBox="0 0 64 82">
      <defs><clipPath id="tc"><rect x="4" y="6" width="56" height="74" rx="10"/></clipPath></defs>
      <rect x="4" y="6" width="56" height="74" rx="10" fill="var(--accent-soft)"/>
      ${frac ? `<g clip-path="url(#tc)">
        <path class="wave" style="animation-duration:9s" d="${wave(top + 2)}" fill="var(--accent)" opacity="0.35"/>
        <path class="wave" d="${wave(top)}" fill="var(--accent)" opacity="0.85"/>
      </g>` : ""}
      <rect x="4" y="6" width="56" height="74" rx="10" fill="none" stroke="var(--line)" stroke-width="1.5"/>
    </svg>`;
  return { frac, target: target[1] };
}

function render(live) {
  const r = RANGES[range];
  document.querySelectorAll(".seg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.range === range)));

  const rows = SERVICES.map(s => ({ ...s, p: live[s.id], tokens: tokensIn(live[s.id], r.days) }));
  const tokens = rows.reduce((a, x) => a + x.tokens, 0);
  const ml = tokens * ML_PER_TOKEN;
  const w = fmtWater(ml);
  $("heroLabel").textContent = r.label;
  $("total").innerHTML = `${w.v}<small>${w.u}</small>`;
  const tank = renderTank(ml);
  $("equiv").innerHTML = tokens
    ? `<b class="num">${fmtTok(tokens)}</b> tokens · ${Math.round(tank.frac * 100)}% of ${tank.target}`
    : "Send a prompt in Claude, ChatGPT or Gemini to start.";

  const max = Math.max(1, ...rows.map(x => x.tokens));
  $("services").innerHTML = `<span class="label">By service</span>` + rows.map(x => `
    <div class="svc-row">
      <span class="svc-name"><span class="dot" style="background:${x.color}"></span>${x.name}${x.note ? `<span class="note">${x.note}</span>` : ""}</span>
      <span class="svc-val"><span class="num">${wStr(x.tokens * ML_PER_TOKEN)}</span></span>
      <div class="bar"><span style="width:${(x.tokens / max) * 100}%;background:${x.color}"></span></div>
      <div class="svc-sub"><span>${ago(x.p && x.p.updatedAt)}</span><span class="num">${fmtTok(x.tokens)} tok</span></div>
    </div>`).join("");

  // Stacked bars for the last 7 days.
  const days = lastDays(7);
  const perDay = days.map(d => SERVICES.map(s => tokOf(((live[s.id] || {}).days || {})[dayKey(d)])));
  const dayMax = Math.max(1, ...perDay.map(v => v.reduce((a, b) => a + b, 0)));
  const W = 312, H = 74, slot = W / 7, bw = 26;
  let bars = "";
  perDay.forEach((vals, i) => {
    const x = i * slot + (slot - bw) / 2;
    let y = H;
    bars += `<rect x="${x}" y="0" width="${bw}" height="${H}" rx="5" fill="var(--accent-soft)" opacity="0.6"/>`;
    vals.forEach((v, j) => {
      if (!v) return;
      const h = Math.max(2, (v / dayMax) * (H - 4));
      y -= h;
      bars += `<rect x="${x}" y="${y}" width="${bw}" height="${h}" fill="${SERVICES[j].color}"><title>${SERVICES[j].name}: ${wStr(v * ML_PER_TOKEN)}</title></rect>`;
    });
  });
  $("chart").innerHTML = bars;
  $("days").innerHTML = days.map((d, i) => `<span class="${i === 6 ? "today" : ""}">${i === 6 ? "Today" : d.toLocaleDateString(undefined, { weekday: "short" })}</span>`).join("");
  const weekTok = perDay.flat().reduce((a, b) => a + b, 0);
  $("weekTotal").textContent = weekTok ? wStr(weekTok * ML_PER_TOKEN) : "";

  const lastAt = Math.max(0, ...rows.map(x => x.p && x.p.updatedAt ? +new Date(x.p.updatedAt) : 0));
  $("status").lastChild.textContent = lastAt && Date.now() - lastAt < 10 * 60e3 ? "Counting now" : "Counting";
}

async function load() {
  const { live = {} } = await chrome.storage.local.get("live");
  render(live);
}

document.querySelectorAll(".seg button").forEach(b => b.addEventListener("click", () => {
  range = b.dataset.range;
  try { localStorage.setItem("range", range); } catch {}
  load();
}));

const clear = $("clear");
clear.onclick = async () => {
  if (!clear.dataset.confirm) {
    clear.dataset.confirm = "1"; clear.textContent = "Clear all?";
    setTimeout(() => { delete clear.dataset.confirm; clear.textContent = "Clear"; }, 3000);
    return;
  }
  await chrome.runtime.sendMessage({ type: "clear" });
  delete clear.dataset.confirm; clear.textContent = "Clear";
};
chrome.storage.onChanged.addListener((c, area) => { if (area === "local" && c.live) load(); });
load();
