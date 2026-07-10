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
const fmtEok = (v) => v == null ? "-" : Math.round(v).toLocaleString("ko-KR");
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

function stockRow(s, judeokSet, naverSet) {
  const marks =
    (judeokSet.has(s.code) ? LEAD : "") +
    (naverSet.has(s.code) ? NB : "") +
    (s.isCap ? CAP : "") +
    ((s.tvEok || 0) >= 1000 ? "💰" : "");
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
        <span>${fmtEok(s.tvEok)}억</span>
      </div>
      ${s.nxt ? `<div class="stk-nxt"><span class="nxt-tag">NXT</span> ${fmtPrice(s.nxt.price)} <span class="${cls(s.nxt.rate)}">${sign(s.nxt.rate)}${(s.nxt.rate || 0).toFixed(2)}%</span></div>` : ""}
      ${changeBar(s)}
    </li>`;
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
          ${aliasBadge}
        </div>
        <span class="tval">${fmtEok(t.tradingValueEok)}억</span>
      </header>
      <div class="card-stat">
        <span class="score">${t.score.toFixed(1)}점</span>
        <span class="chg ${cls(t.changeRate)}">${sign(t.changeRate)}${t.changeRate.toFixed(1)}%</span>
        <span class="breadth">▲${t.rise} ▬${t.steady} ▼${t.fall}${streak}</span>
      </div>
      <ul class="stk-list">${top.map((s) => stockRow(s, judeokSet, naverSet)).join("")}</ul>
    </section>`;
}

const pad2 = (n) => String(n).padStart(2, "0");

// 장중(평일 09:00~15:35 KST)에만 스테일 경고 대상 — 장 마감 후 데이터 정지는 정상
function isMarketHoursKST() {
  const kst = new Date(Date.now() + (new Date().getTimezoneOffset() + 540) * 60000);
  const day = kst.getDay();                          // 0=일 6=토
  const hm = kst.getHours() * 60 + kst.getMinutes();
  return day >= 1 && day <= 5 && hm >= 540 && hm <= 935;   // 09:00~15:35
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
  meta.innerHTML = `${hhmmss} 기준 · ${esc(d.marketStatus)}${stale}${errs}`;
  document.getElementById("cards").innerHTML = d.themes.map((t, i) => card(t, i)).join("");
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
