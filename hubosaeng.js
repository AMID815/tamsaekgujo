"use strict";
/* 주도주 오디세우스 — 종목 검색 → 테마 소속 이력 타임라인.
   데이터: 공개 repo data 브랜치의 stock_theme_index.json (매일 1회 갱신). */

function indexUrl() {
  const h = location.hostname;
  if (h.endsWith(".github.io")) {
    const user = h.split(".")[0];
    const repo = location.pathname.split("/").filter(Boolean)[0];
    return `https://raw.githubusercontent.com/${user}/${repo}/data/stock_theme_index.json`;
  }
  return "./stock_theme_index.json"; // 로컬 테스트
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
const sign = (v) => (v > 0 ? "+" : "");
const cls = (v) => (v > 0 ? "up" : v < 0 ? "down" : "flat");

const SRC = {
  nepcon: {label: "네프콘", badge: "b-nepcon"},
  sector: {label: "주도섹터", badge: "b-sector"},
  news: {label: "뉴스", badge: "b-news"},
  dash: {label: "대시보드", badge: "b-dash"},
};
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const fmtD = (d) => `${+d.slice(4, 6)}/${+d.slice(6, 8)}`;
function fmtDW(d) {
  const dt = new Date(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8));
  return `${fmtD(d)} (${WD[dt.getDay()]})`;
}

// 기본 안내문(초기 마크업) — 이력 없음 안내를 띄운 뒤 되돌릴 때 쓴다
const EMPTY_GUIDE = document.getElementById("empty").innerHTML;

let IDX = null;   // {built, coverage, stocks}
let LIST = [];    // [{code, name, n}] — 자동완성용 (인덱스 내 이름)
let selIdx = -1;  // 자동완성 키보드 선택 위치
let picked = false;  // 검색 확정 상태 — 다시 포커스하면 지우고 새로 입력받는다
                     // (직접 친 미확정 글자는 탭 전환 등으로 포커스가 돌아와도 보존)

// ── 검색/자동완성 ───────────────────────────────────────────────────
function candidates(q) {
  q = q.trim();
  if (!q) return [];
  const lower = q.toLowerCase();
  if (/^\d{2,6}$/.test(q)) {
    return LIST.filter((s) => s.code.startsWith(q)).slice(0, 8);
  }
  const starts = [], contains = [];
  for (const s of LIST) {
    const n = s.name.toLowerCase();
    if (n.startsWith(lower)) starts.push(s);
    else if (n.includes(lower)) contains.push(s);
  }
  return starts.concat(contains).slice(0, 8);
}

function renderSuggest(items, q) {
  const box = document.getElementById("suggest");
  selIdx = -1;
  if (!items.length) {
    // 친 글자가 있는데 후보가 없으면 침묵하지 않고 이유를 알린다
    if (q && q.trim()) {
      box.innerHTML = `<li class="sg-none">일치하는 종목이 없습니다` +
        `<span class="sg-none-sub">테마 이력이 쌓인 종목만 검색됩니다</span></li>`;
      box.classList.remove("hidden");
    } else {
      box.classList.add("hidden");
      box.innerHTML = "";
    }
    return;
  }
  box.innerHTML = items.map((s) =>
    `<li data-code="${esc(s.code)}"><span class="sg-name">${esc(s.name)}</span>` +
    `<span class="sg-code">${esc(s.code)}</span><span class="sg-n">${s.n}건</span></li>`).join("");
  box.classList.remove("hidden");
}

function moveSel(delta) {
  const lis = [...document.querySelectorAll("#suggest li[data-code]")];
  if (!lis.length) return;
  selIdx = (selIdx + delta + lis.length) % lis.length;
  lis.forEach((li, i) => li.classList.toggle("on", i === selIdx));
}

// ── 타임라인 렌더 ───────────────────────────────────────────────────
function eventRow(e) {
  const src = SRC[e.src] || {label: e.src, badge: ""};
  const dim = e.ind ? " dim" : "";
  let theme = e.theme || "";
  if (e.src === "sector" && theme) theme = "#" + theme;
  if (e.dn) theme += " ↓하락";
  const themeHtml = theme
    ? `<span class="tl-theme${dim}${e.dn ? " down" : ""}">${esc(theme)}</span>` : "";
  const rate = e.rate != null
    ? `<span class="tl-rate ${cls(e.rate)}">${sign(e.rate)}${e.rate.toFixed(2)}%</span>` : "";
  const cat = e.cat ? `<span class="tl-cat">${esc(e.cat)}</span>` : "";
  return `<li><span class="badge ${src.badge}${dim}">${src.label}</span>` +
         `${themeHtml}${rate}${cat}</li>`;
}

function topThemes(events) {
  const cnt = new Map();
  for (const e of events) {
    if (!e.theme || e.ind) continue;
    const key = e.theme.replace(/\s+/g, "");
    const cur = cnt.get(key) || {name: e.theme, days: new Set()};
    cur.days.add(e.d);
    cnt.set(key, cur);
  }
  return [...cnt.values()]
    .map((v) => ({name: v.name, n: v.days.size}))
    .sort((a, b) => b.n - a.n).slice(0, 4);
}

// 검색어에 해당하는 이력이 아예 없을 때 — 왜 없는지와 다음 수를 알려준다
function showNoResult(q) {
  document.getElementById("suggest").classList.add("hidden");
  document.getElementById("result").classList.add("hidden");
  const box = document.getElementById("empty");
  box.className = "empty warn";
  box.innerHTML =
    `<b>‘${esc(q)}’의 테마 이력을 찾지 못했습니다.</b><br>` +
    `수집 기간(${esc(coverageSpan())}) 동안 특징테마·주도섹터·뉴스·마감 스냅샷 ` +
    `어디에도 오르지 않은 종목이거나, 종목명이 정확하지 않을 수 있습니다.<br>` +
    `이름 일부(예: ‘기가’)나 6자리 코드로도 찾을 수 있습니다.`;
  box.classList.remove("hidden");
}

function selectStock(code) {
  const st = IDX.stocks[code];
  if (!st) return;
  document.getElementById("suggest").classList.add("hidden");
  document.getElementById("q").value = st.name;
  const box = document.getElementById("empty");
  box.className = "empty hidden";
  box.innerHTML = EMPTY_GUIDE;   // 안내문 원복 — 다음 빈손 검색에서 다시 쓰인다

  const url = `https://m.stock.naver.com/domestic/stock/${esc(code)}/total`;
  document.getElementById("rname").innerHTML =
    `<a href="${url}" target="_blank" rel="noopener">${esc(st.name)}</a>`;
  const days = new Set(st.events.map((e) => e.d));
  const first = st.events[0].d, last = st.events[st.events.length - 1].d;
  document.getElementById("rmeta").textContent =
    `${code} · ${days.size}일 ${st.events.length}건 · ${fmtD(first)}~${fmtD(last)}`;
  document.getElementById("rchips").innerHTML = topThemes(st.events)
    .map((t) => `<span class="chip">${esc(t.name)} ×${t.n}</span>`).join("");

  // 날짜별 그룹 — 지시서 UX 예시대로 과거→최신 오름차순
  const byDay = new Map();
  for (const e of st.events) {
    if (!byDay.has(e.d)) byDay.set(e.d, []);
    byDay.get(e.d).push(e);
  }
  document.getElementById("timeline").innerHTML = [...byDay.entries()].map(
    ([d, evs]) => `<div class="tl-day"><div class="tl-date">${fmtDW(d)}</div>` +
      `<ul class="tl-ev">${evs.map(eventRow).join("")}</ul></div>`).join("");
  document.getElementById("result").classList.remove("hidden");
  picked = true;
  history.replaceState(null, "", `?q=${code}`);
}

// ── 초기화 ──────────────────────────────────────────────────────────
// 4개 소스를 통틀어 데이터가 존재하는 전체 구간 (안내문에 쓴다)
function coverageSpan() {
  const ds = Object.values(IDX.coverage || {})
    .filter((v) => v && v.n).flatMap((v) => [v.first, v.last]).filter(Boolean);
  if (!ds.length) return "수집 기간 미상";
  return `${fmtD(ds.reduce((a, b) => (a < b ? a : b)))}~` +
         `${fmtD(ds.reduce((a, b) => (a > b ? a : b)))}`;
}

function renderCoverage() {
  const c = IDX.coverage || {};
  const parts = Object.entries(SRC)
    .filter(([k]) => c[k] && c[k].n)
    .map(([k, v]) => `${v.label} ${c[k].n}일(${fmtD(c[k].first)}~${fmtD(c[k].last)})`);
  document.getElementById("cov").textContent =
    `데이터: ${parts.join(" · ")} · 매일 장 마감 후 갱신 · 투자 판단 참고용`;
  document.getElementById("meta").textContent =
    `종목 ${LIST.length.toLocaleString("ko-KR")}개 · ${IDX.built.slice(0, 10)} 빌드`;
}

async function init() {
  const err = document.getElementById("err");
  try {
    const r = await fetch(`${indexUrl()}?ts=${Date.now()}`, {cache: "no-store"});
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    IDX = await r.json();
    LIST = Object.entries(IDX.stocks)
      .map(([code, s]) => ({code, name: s.name, n: s.events.length}))
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
    renderCoverage();
    const q = new URLSearchParams(location.search).get("q");
    if (q) {
      if (IDX.stocks[q]) selectStock(q);
      else {
        const c = candidates(q);
        if (c.length) selectStock(c[0].code);
        else { input.value = q; showNoResult(q); }   // 딥링크가 빗나간 경우
      }
    }
  } catch (e) {
    err.textContent = `인덱스 로드 실패: ${e.message}`;
    err.classList.remove("hidden");
  }
}

const input = document.getElementById("q");
input.addEventListener("input", () => {
  picked = false;
  renderSuggest(candidates(input.value), input.value);
});
// 검색 확정 후 다시 커서를 두면 이전 종목명을 지워 바로 새로 칠 수 있게 한다
// (표시 중인 타임라인은 그대로 둔다)
input.addEventListener("focus", () => {
  if (picked) { input.value = ""; picked = false; }
  renderSuggest(candidates(input.value), input.value);
});
input.addEventListener("keydown", (ev) => {
  if (ev.key === "ArrowDown") { moveSel(1); ev.preventDefault(); }
  else if (ev.key === "ArrowUp") { moveSel(-1); ev.preventDefault(); }
  else if (ev.key === "Enter") {
    const lis = [...document.querySelectorAll("#suggest li[data-code]")];
    const pick = selIdx >= 0 ? lis[selIdx] : lis[0];
    if (pick) selectStock(pick.dataset.code);
    else if (input.value.trim()) showNoResult(input.value.trim());
  } else if (ev.key === "Escape") {
    document.getElementById("suggest").classList.add("hidden");
  }
});
document.getElementById("suggest").addEventListener("click", (ev) => {
  const li = ev.target.closest("li[data-code]");
  if (li) selectStock(li.dataset.code);
});
document.addEventListener("click", (ev) => {
  if (!ev.target.closest(".sbox"))
    document.getElementById("suggest").classList.add("hidden");
});

init();
