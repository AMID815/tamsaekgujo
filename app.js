"use strict";
const REFRESH_MS = 60000;
const STALE_MIN = 5;
const MAX_STOCKS = 4;   // 테마당 표시 종목 수 (등락률 상위)

function dataUrl() {
  const h = location.hostname;
  if (h.endsWith(".github.io")) {
    const user = h.split(".")[0];
    const repo = location.pathname.split("/").filter(Boolean)[0];
    return `https://raw.githubusercontent.com/${user}/${repo}/data/data.json`;
  }
  return "./data.json"; // 로컬 테스트
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
// 억 단위 값 표기: 1조(=10000억) 이상은 'N.N조'로 축약(가독성). 단위 포함 반환.
const fmtEok = (v) => {
  if (v == null) return "-";
  if (v >= 10000) return (v / 10000).toFixed(1).replace(/\.0$/, "") + "조";
  return Math.round(v).toLocaleString("ko-KR") + "억";
};
const fmtPrice = (v) => v == null ? "-" : v.toLocaleString("ko-KR");
const sign = (v) => (v > 0 ? "+" : "");
const cls = (v) => (v > 0 ? "up" : v < 0 ? "down" : "flat");
// 상한가: 빨강 채움 SVG 상승화살표 (이모지 폰트가 색을 무시하는 문제 회피)
const CAP = '<svg class="cap-mark" viewBox="0 0 12 12" width="11" height="11" aria-label="상한"><path d="M6 1 10 6 7.6 6 7.6 11 4.4 11 4.4 6 2 6Z" fill="#e5342b"/></svg>';
// 대대장: 사용자 제공 왕관 엠블럼 (파일 참조)
const LEAD = '<img class="lead" src="daedaejang.svg?v=15" alt="대대장">';
// 네이버 주도주: SVG 배지 (글자 렌더 대신 벡터 → 모든 배지 N 위치 동일)
const NB = '<svg class="nver" viewBox="0 0 20 20" width="15" height="15" aria-label="네이버"><circle cx="10" cy="10" r="10" fill="#03c75a"/><text x="10" y="15.3" text-anchor="middle" fill="#fff" font-size="13.5" font-weight="800" font-family="Arial,Helvetica,sans-serif">N</text></svg>';

// 일봉 표시(최초 그림): 중앙 검정 세로줄 기준 등락률 막대 — 오른쪽 빨강=양봉, 왼쪽 파랑=음봉 (±30% 만점)
// 가는 선 = 오늘 고가~저가 범위(같은 % 눈금, 상승/하락 색) — 굵은 막대 밖으로 나온 부분이 윗/아랫꼬리
function changeBar(s) {
  const clamp30 = (v) => Math.max(-30, Math.min(30, v));
  const X = (p) => 50 + (p / 30) * 50;   // 등락률% → 트랙 위치%
  const rate = s.rate || 0;
  const pct = clamp30(rate);
  const w = (Math.abs(pct) / 30) * 50;   // 0~50%
  const pos = pct >= 0 ? `left:50%;width:${w}%` : `right:50%;width:${w}%`;
  let range = "";
  if (s.high != null && s.low != null && s.prevClose) {
    const hx = X(clamp30((s.high / s.prevClose - 1) * 100));
    const lx = X(clamp30((s.low / s.prevClose - 1) * 100));
    range = `<span class="range ${cls(rate)}" style="left:${lx}%;width:${Math.max(0.5, hx - lx)}%"></span>`;
  }
  const tip = (s.high != null && s.low != null)
    ? ` title="${s.open != null ? `시 ${fmtPrice(s.open)} / ` : ""}고 ${fmtPrice(s.high)} / 저 ${fmtPrice(s.low)} / 현재 ${fmtPrice(s.price)}"`
    : "";
  return `<div class="bar"${tip}>${range}<span class="bar-fill ${cls(rate)}" style="${pos}"></span></div>`;
}

// NXT 시세 줄 (네이버 over 데이터 = NXT 전용, 실측 2026-07-10) — 보라 NXT 스티커
function extLine(nxt) {
  if (!nxt) return "";
  return `<div class="stk-nxt"><span class="nxt-tag">NXT</span> ${fmtPrice(nxt.price)} <span class="${cls(nxt.rate)}">${sign(nxt.rate)}${(nxt.rate || 0).toFixed(2)}%</span></div>`;
}

// 시간외단일가 줄 (다음 금융, 16~18시) — 주황 시간외 스티커. 등락 기준은 정규장 종가 대비.
function otLine(ot) {
  if (!ot) return "";
  return `<div class="stk-nxt"><span class="ot-tag">시간외</span> ${fmtPrice(ot.price)} <span class="${cls(ot.rate)}">${sign(ot.rate)}${(ot.rate || 0).toFixed(2)}%</span></div>`;
}

function stockRow(s, judeokSet, naverSet) {
  const marks =
    (judeokSet.has(s.code) ? LEAD : "") +
    (naverSet.has(s.code) ? NB : "") +
    (s.isCap ? CAP : "");
  const url = `https://m.stock.naver.com/domestic/stock/${esc(s.code)}/total`;
  return `
    <li class="stk${s.isCap ? " cap" : ""}">
      <div class="stk-top">
        <a class="stk-name" href="${url}" target="_blank" rel="noopener">${esc(s.name)}</a>
        <span class="marks">${marks}</span>
        <span class="stk-rate ${cls(s.rate)}">${sign(s.rate)}${(s.rate || 0).toFixed(2)}%</span>
      </div>
      <div class="stk-sub">
        <span>${fmtPrice(s.price)}</span>
        <span>${fmtEok(s.tvEok)}</span>
      </div>
      ${extLine(s.nxt)}${otLine(s.ot)}
      ${changeBar(s)}
    </li>`;
}

// 크로스테마 주도주는 헤더 티커로 표시 (카드는 2026-07-11 사용자 요청으로 삭제)
// 테마명 괄호 부연 제거("NFT(대체불가토큰)"→"NFT"). 단 제거 후 표시 목록 안에서
// 이름이 겹치면(예: 2차전지 / 2차전지(장비)) 괄호를 유지해 구분.
function shortThemes(themes) {
  const bases = themes.map((t) => t.replace(/\s*\([^)]*\)/g, "").trim() || t);
  return themes.map((t, i) =>
    bases.some((b, j) => j !== i && b === bases[i]) ? t : bases[i]);
}

// 티커 항목 몸통 — 카드 행과 동일 배치(이름줄/테마줄/NXT·시간외 시세줄)
function crossRowBody(c) {
  const url = `https://m.stock.naver.com/domestic/stock/${esc(c.code)}/total`;
  const rate = c.rate != null
    ? `<span class="xrate ${cls(c.rate)}">${sign(c.rate)}${c.rate.toFixed(2)}%</span>` : "";
  const themes = shortThemes(c.themes.slice(0, 3)).join(", ") + (c.count > 3 ? " 외" : "");
  return `<div class="stk-top">
        <a class="stk-name" href="${url}" target="_blank" rel="noopener">${esc(c.name)}</a>
        <span class="xcnt">×${c.count}</span>
        ${rate}
      </div>
      <div class="xthemes">${esc(themes)}</div>`;
}

function card(t, i) {
  const judeokSet = new Set((t.judeokLeaders || []).map((l) => l.code));
  const naverSet = new Set((t.naverLeaders || []).map((l) => l.code));
  const top = (t.stocks || []).slice(0, MAX_STOCKS);
  const streak = t.streakDays >= 2 ? ` · 🔥${t.streakDays}일` : "";
  const aliases = t.aliases || [];
  const aliasBadge = aliases.length
    ? `<span class="alias" title="같은 대장주 테마 병합: ${esc(aliases.join(", "))}">+${aliases.length}</span>`
    : "";
  return `
    <section class="card">
      <header class="card-h">
        <div class="card-title">
          <span class="rank">${i + 1}</span>
          <span class="tname">${esc(t.name)}${t.capCount ? ` ${CAP}<span class="capx">×${t.capCount}</span>` : ""}</span>
          ${t.nepconDays ? `<span class="npd" title="특징테마 등장 ${t.nepconDays}일째">D+${t.nepconDays}</span>` : ""}
          ${aliasBadge}
        </div>
        <span class="tval">${fmtEok(t.tradingValueEok)}</span>
      </header>
      <div class="card-stat">
        <span class="score">${t.score.toFixed(1)}점</span>
        <span class="chg ${cls(t.changeRate)}">${sign(t.changeRate)}${t.changeRate.toFixed(1)}%</span>
        <span class="breadth">▲${t.rise} ▬${t.steady} ▼${t.fall}${streak}</span>
        ${(t.supplyCount || 0) > 0 ? `<span class="supply" title="외국인+기관 동반 순매수 종목 수(최근 확인 기준)">🏦${t.supplyCount}</span>` : ""}
      </div>
      <ul class="stk-list">${top.map((s) => stockRow(s, judeokSet, naverSet)).join("")}</ul>
    </section>`;
}

const pad2 = (n) => String(n).padStart(2, "0");

function kstNow() {
  return new Date(Date.now() + (new Date().getTimezoneOffset() + 540) * 60000);
}
function inWindowKST(fromMin, toMin) {
  const kst = kstNow();
  const day = kst.getDay();                          // 0=일 6=토
  const hm = kst.getHours() * 60 + kst.getMinutes();
  return day >= 1 && day <= 5 && hm >= fromMin && hm <= toMin;
}
// 장중(평일 09:00~15:35 KST)에만 스테일 경고 대상 — 장 마감 후 데이터 정지는 정상
const isMarketHoursKST = () => inWindowKST(540, 935);
// NXT 거래시간대(평일 08:00~20:05) — 이 밖이면 extOpen 데이터가 남아있어도 CLOSE 표기
const isNxtHoursKST = () => inWindowKST(480, 1205);

// 헤더 티커: 크로스테마 주도주 전광판 — 카드 행과 동일한 3줄 블록이 왼쪽으로 흐름.
// 내용이 실제로 바뀔 때만 재구성(60초 갱신 시 애니메이션 튐 방지). 속도는 픽셀 기준 일정.
let tkSig = "";
// 무테마 급등주 이력 항목: 급등 중인데 화면에 없는 종목의 과거 특징테마 라벨
function histRowBody(r) {
  const url = `https://m.stock.naver.com/domestic/stock/${esc(r.code)}/total`;
  const d = String(r.lastDate || "");
  const md = d.length === 8 ? `${+d.slice(4, 6)}/${+d.slice(6, 8)}` : "";
  return `<div class="stk-top">
        <a class="stk-name" href="${url}" target="_blank" rel="noopener">${esc(r.name)}</a>
        <span class="xcnt">이력</span>
        <span class="xrate ${cls(r.rate)}">${sign(r.rate)}${(r.rate || 0).toFixed(2)}%</span>
      </div>
      <div class="xthemes">과거 ${esc(r.theme)}${md ? ` (${md})` : ""} 테마로 등장</div>`;
}

// 개별 급등: (a) 저유동 카드에서 살린 강한 종목, (b) 뉴스로 혼자 뛴 개별이슈(촉매 표시)
function indivRowBody(r) {
  const url = `https://m.stock.naver.com/domestic/stock/${esc(r.code)}/total`;
  const label = (r.catalyst
    ? `뉴스 급등: ${esc(r.catalyst)}`
    : `${r.theme ? esc(r.theme) + " · " : ""}개별 급등`)
    + (r.supplyWeak ? ` · <b class="supdn">수급↓</b>` : "");
  const badge = r.catalyst ? "⚡뉴스" : "개별";
  return `<div class="stk-top">
        <a class="stk-name" href="${url}" target="_blank" rel="noopener">${esc(r.name)}</a>
        <span class="xcnt">${badge}</span>
        <span class="xrate ${cls(r.rate)}">${sign(r.rate)}${(r.rate || 0).toFixed(2)}%</span>
      </div>
      <div class="xthemes">${label}</div>`;
}

function renderTicker(d) {
  const box = document.getElementById("xticker");
  if (!box) return;
  const items = d.crossLeaders || [];
  const hist = d.nepconRisers || [];
  const indiv = d.individualRisers || [];
  if (!items.length && !hist.length && !indiv.length) { box.classList.add("hidden"); tkSig = ""; return; }
  const sig = items.map((c) => `${c.code}:${c.rate}:${c.count}`).join("|")
    + "#" + hist.map((r) => `${r.code}:${r.rate}`).join("|")
    + "#" + indiv.map((r) => `${r.code}:${r.rate}`).join("|");
  if (sig === tkSig) { box.classList.remove("hidden"); return; }
  tkSig = sig;
  const one = items.map((c) => `<span class="tk-item">${crossRowBody(c)}</span>`).join("")
    + indiv.map((r) => `<span class="tk-item tk-hist${r.catalyst ? " tk-news" : ""}">${indivRowBody(r)}</span>`).join("")
    + hist.map((r) => `<span class="tk-item tk-hist">${histRowBody(r)}</span>`).join("");
  const track = document.getElementById("tkTrack");
  track.innerHTML = `<span class="tk-copy">${one}</span><span class="tk-copy">${one}</span>`;
  box.classList.remove("hidden");
  const half = track.scrollWidth / 2;               // 한 벌 길이(px)
  track.style.animationDuration = `${Math.max(30, Math.round(half / 75))}s`;
}

function render(d) {
  const meta = document.getElementById("meta");
  const upd = new Date(d.updatedAt);
  const ageMin = Math.floor((Date.now() - upd.getTime()) / 60000);
  const stale = (ageMin > STALE_MIN && isMarketHoursKST())
    ? ` <span class="syspaused">⚠ SYSTEM PAUSED</span>` : "";
  const errs = d.status && !d.status.ok
    ? ` <span class="stale">⚠ 수집 오류 ${d.status.errors.length}건</span>` : "";
  const hhmmss = `${pad2(upd.getHours())}:${pad2(upd.getMinutes())}:${pad2(upd.getSeconds())}`;
  const statusText = d.marketStatus === "OPEN" ? "OPEN"
    : (d.extOpen && isNxtHoursKST() ? "NXT OPEN" : "CLOSE");
  meta.innerHTML = `${hhmmss} 기준 · ${esc(statusText)}${stale}${errs}`;
  document.getElementById("cards").innerHTML =
    d.themes.map((t, i) => card(t, i)).join("");
  renderTicker(d);
}

async function load() {
  const err = document.getElementById("err");
  try {
    const r = await fetch(`${dataUrl()}?ts=${Date.now()}`, {cache: "no-store"});
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    render(await r.json());
    err.classList.add("hidden");
  } catch (e) {
    err.textContent = `데이터 로드 실패: ${e.message}`;
    err.classList.remove("hidden");
  }
}

load();
setInterval(load, REFRESH_MS);
