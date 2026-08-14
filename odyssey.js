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
// 인덱스는 남이 만든 JSON — '__proto__'·'constructor' 같은 키가 상속 멤버로
// 잡히지 않도록 소유 속성만 본다
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
// 검색 정규화: 대소문자·공백 무시 ('cjcgv'로 'CJ CGV'를 찾을 수 있게)
const searchKey = (s) => String(s).toLowerCase().replace(/\s+/g, "");

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
let LIST = [];    // [{code, name, n, key}] — 자동완성용 (인덱스 내 이름)
let selIdx = -1;  // 자동완성 키보드 선택 위치
let picked = false;  // 검색 확정 상태 — 다시 포커스하면 지우고 새로 입력받는다
                     // (직접 친 미확정 글자는 탭 전환 등으로 포커스가 돌아와도 보존)

// ── 검색/자동완성 ───────────────────────────────────────────────────
// 이름이 겹칠 때 뭘 먼저 보여줄지 — 이력이 많은(= 사용자가 찾을 법한) 종목 우선.
// 이게 없으면 '삼성'+Enter가 가나다 첫 항목인 삼성공조로 간다.
const byRelevance = (a, b) =>
  b.n - a.n || a.name.length - b.name.length || a.name.localeCompare(b.name, "ko");

function candidates(q) {
  const key = searchKey(q || "");
  if (!key) return [];
  // 종목코드는 대부분 6자리 숫자지만 0039P0처럼 영문이 섞인 것도 있다
  if (/^[0-9][0-9a-z]{1,5}$/.test(key)) {
    const hit = LIST.filter((s) => s.code.toLowerCase().startsWith(key));
    if (hit.length) return hit.sort(byRelevance).slice(0, 8);
    // 코드로 안 잡히면 이름 검색으로 폴백 (숫자로 시작하는 종목명 대비)
  }
  const exact = [], starts = [], contains = [];
  for (const s of LIST) {
    if (s.key === key) exact.push(s);
    else if (s.key.startsWith(key)) starts.push(s);
    else if (s.key.includes(key)) contains.push(s);
  }
  for (const bucket of [exact, starts, contains]) bucket.sort(byRelevance);
  return exact.concat(starts, contains).slice(0, 8);
}

function renderSuggest(items, q) {
  const box = document.getElementById("suggest");
  const input = document.getElementById("q");
  selIdx = -1;
  input.removeAttribute("aria-activedescendant");
  if (!items.length) {
    // 친 글자가 있는데 후보가 없으면 침묵하지 않고 이유를 알린다.
    // 단 인덱스를 못 불러온 상태를 '이력 없음'으로 오도하면 안 된다.
    if (q && q.trim()) {
      box.innerHTML = IDX
        ? `<li class="sg-none" role="status">일치하는 종목이 없습니다` +
          `<span class="sg-none-sub">테마 이력이 쌓인 종목만 검색됩니다</span></li>`
        : `<li class="sg-none" role="status">데이터를 불러오지 못했습니다` +
          `<span class="sg-none-sub">잠시 후 새로고침해 주세요</span></li>`;
      box.classList.remove("hidden");
      input.setAttribute("aria-expanded", "true");
    } else {
      box.classList.add("hidden");
      box.innerHTML = "";
      input.setAttribute("aria-expanded", "false");
    }
    return;
  }
  box.innerHTML = items.map((s, i) =>
    `<li id="sg-${i}" role="option" aria-selected="false" data-code="${esc(s.code)}">` +
    `<span class="sg-name">${esc(s.name)}</span>` +
    `<span class="sg-code">${esc(s.code)}</span><span class="sg-n">${s.n}건</span></li>`).join("");
  box.classList.remove("hidden");
  input.setAttribute("aria-expanded", "true");
}

function moveSel(delta) {
  const lis = [...document.querySelectorAll("#suggest li[data-code]")];
  if (!lis.length) return;
  selIdx = (selIdx + delta + lis.length) % lis.length;
  lis.forEach((li, i) => {
    li.classList.toggle("on", i === selIdx);
    li.setAttribute("aria-selected", i === selIdx ? "true" : "false");
  });
  document.getElementById("q").setAttribute("aria-activedescendant", lis[selIdx].id);
}

// ── 타임라인 렌더 ───────────────────────────────────────────────────
function eventRow(e) {
  const src = SRC[e.src] || {label: e.src, badge: ""};
  const dim = e.ind ? " dim" : "";
  let theme = e.theme || "";
  if (e.src === "sector" && theme && !e.ind) theme = "#" + theme;
  if (e.dn) theme += " ↓하락";
  const themeHtml = theme
    ? `<span class="tl-theme${dim}${e.dn ? " down" : ""}">${esc(theme)}</span>` : "";
  // 뉴스 rate는 종가가 아니라 기사 수신 시각 스냅샷 — 같은 날 다른 소스의 종가
  // 등락률과 나란히 놓이므로 출처를 밝혀야 오독하지 않는다
  const note = e.nt
    ? `<span class="tl-note" title="비거래일에 수신된 뉴스 - 등락률 없음">주말</span>`
    : (e.src === "news" && e.rate != null
        ? `<span class="tl-note" title="기사 수신 시각 기준 - 종가 등락률이 아닙니다">기사시점</span>`
        : "");
  const rate = e.rate != null
    ? `<span class="tl-rate ${cls(e.rate)}">${sign(e.rate)}${e.rate.toFixed(2)}%</span>` : "";
  const cat = e.cat ? `<span class="tl-cat">${esc(e.cat)}</span>` : "";
  return `<li><span class="badge ${src.badge}${dim}">${src.label}</span>` +
         `${themeHtml}${rate}${note}${cat}</li>`;
}

// 표기가 흔들린 같은 테마의 대표 이름 — '일부 X'보다 'X'를, 그다음 자주 쓰인 표기를
const pickThemeName = (names) => [...names.entries()].sort((a, b) =>
  (a[0].startsWith("일부") - b[0].startsWith("일부")) || b[1] - a[1] ||
  a[0].length - b[0].length)[0][0];

function topThemes(events) {
  const cnt = new Map();
  for (const e of events) {
    // tk = 빌더가 넣은 정규화 키('일부 화장품'과 '화장품'이 같은 키). 없으면 집계 제외
    if (!e.tk || e.ind) continue;
    const cur = cnt.get(e.tk) || {names: new Map(), days: new Set()};
    cur.days.add(e.d);
    const raw = e.theme || e.tk;
    cur.names.set(raw, (cur.names.get(raw) || 0) + 1);
    cnt.set(e.tk, cur);
  }
  return [...cnt.values()]
    .map((v) => ({name: pickThemeName(v.names), n: v.days.size}))
    .sort((a, b) => b.n - a.n).slice(0, 4);
}

// 검색어에 해당하는 이력이 아예 없을 때 — 왜 없는지와 다음 수를 알려준다
function showNoResult(q) {
  document.getElementById("suggest").classList.add("hidden");
  document.getElementById("result").classList.add("hidden");
  const box = document.getElementById("empty");
  // 내용을 먼저 채운 뒤 스타일을 바꾼다 — 중간에 예외가 나도 안내문이
  // '경고 카드 옷을 입은 소개문'으로 남지 않게
  box.innerHTML =
    `<b>‘${esc(q)}’의 테마 이력을 찾지 못했습니다.</b><br>` +
    `수집 기간(${esc(coverageSpan())}) 동안 특징테마·주도섹터·뉴스·마감 스냅샷 ` +
    `어디에도 오르지 않은 종목이거나, 종목명이 정확하지 않을 수 있습니다.<br>` +
    `이름 일부(예: ‘기가’)나 6자리 코드로도 찾을 수 있습니다.`;
  box.className = "empty warn";
}

function selectStock(code) {
  const st = IDX && has(IDX.stocks, code) ? IDX.stocks[code] : null;
  if (!st || !Array.isArray(st.events) || !st.events.length) {
    showNoResult(code);
    return;
  }
  document.getElementById("suggest").classList.add("hidden");
  document.getElementById("q").setAttribute("aria-expanded", "false");
  document.getElementById("q").value = st.name;
  const box = document.getElementById("empty");
  box.innerHTML = EMPTY_GUIDE;   // 안내문 원복 — 다음 빈손 검색에서 다시 쓰인다
  box.className = "empty hidden";

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
  history.replaceState(null, "", `?q=${encodeURIComponent(code)}`);
}

// ── 초기화 ──────────────────────────────────────────────────────────
// 4개 소스를 통틀어 데이터가 존재하는 전체 구간 (안내문에 쓴다)
function coverageSpan() {
  if (!IDX) return "수집 기간 미상";
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
    const data = await r.json();
    if (!data || typeof data !== "object" || !data.stocks) {
      throw new Error("인덱스 형식이 올바르지 않습니다");
    }
    IDX = data;
    LIST = Object.keys(IDX.stocks).map((code) => {
      const s = IDX.stocks[code];
      return {code, name: s.name || code, n: (s.events || []).length,
              key: searchKey(s.name || code)};
    });
    renderCoverage();
    const q = new URLSearchParams(location.search).get("q");
    if (q) {
      if (has(IDX.stocks, q)) selectStock(q);
      else {
        const c = candidates(q);
        if (c.length) selectStock(c[0].code);
        else { input.value = q; showNoResult(q); }   // 딥링크가 빗나간 경우
      }
    }
  } catch (e) {
    err.textContent = `인덱스 로드 실패: ${e.message} (새로고침해 주세요)`;
    err.classList.remove("hidden");
    document.getElementById("meta").textContent = "데이터를 불러오지 못했습니다";
    input.placeholder = "데이터를 불러오지 못했습니다";
    input.disabled = true;   // 검색해도 아무것도 못 찾는 상태 — 헛수고를 막는다
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
    if (!IDX) return;
    const lis = [...document.querySelectorAll("#suggest li[data-code]")];
    const pick = selIdx >= 0 ? lis[selIdx] : lis[0];
    if (pick) selectStock(pick.dataset.code);
    else if (input.value.trim()) showNoResult(input.value.trim());
  } else if (ev.key === "Escape") {
    document.getElementById("suggest").classList.add("hidden");
    input.setAttribute("aria-expanded", "false");
  }
});
document.getElementById("suggest").addEventListener("click", (ev) => {
  const li = ev.target.closest("li[data-code]");
  if (li) selectStock(li.dataset.code);
});
document.addEventListener("click", (ev) => {
  if (!ev.target.closest(".sbox")) {
    document.getElementById("suggest").classList.add("hidden");
    input.setAttribute("aria-expanded", "false");
  }
});

init();
