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

// 등락률 → 중앙 기준 막대 (고저 없을 때 fallback)
function changeBar(rate) {
  const pct = Math.max(-30, Math.min(30, rate || 0));
  const w = (Math.abs(pct) / 30) * 50;   // 0~50%
  const pos = pct >= 0 ? `left:50%;width:${w}%` : `right:50%;width:${w}%`;
  return `<div class="bar"><span class="bar-fill ${cls(rate)}" style="${pos}"></span></div>`;
}

// 캔들 막대: 가는 줄 = 오늘 고가~저가(윗꼬리/아랫꼬리), 굵은 몸통 = 전일종가→현재가
function candleBar(s) {
  const low = s.low, high = s.high, prev = s.prevClose, cur = s.price;
  if (low == null || high == null || prev == null || high <= low) return changeBar(s.rate);
  const lo = Math.min(low, prev), hi = Math.max(high, prev);
  const span = (hi - lo) || 1;
  const P = (x) => ((x - lo) / span) * 100;
  const k = cur >= prev ? "up" : "down";
  const wl = P(low), ww = P(high) - P(low);
  const a = P(prev), b = P(cur);
  const bl = Math.min(a, b), bw = Math.max(1.2, Math.abs(b - a));
  return `<div class="cbar" title="고 ${fmtPrice(high)} / 저 ${fmtPrice(low)} / 전일 ${fmtPrice(prev)}">
      <span class="wick" style="left:${wl}%;width:${ww}%"></span>
      <span class="cbody ${k}" style="left:${bl}%;width:${bw}%"></span>
    </div>`;
}

function stockRow(s, judeokSet, naverSet) {
  const marks =
    (judeokSet.has(s.code) ? "👑" : "") +
    (naverSet.has(s.code) ? '<span class="nver">N</span>' : "") +
    (s.isCap ? "🔴" : "") +
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
      ${candleBar(s)}
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
          <span class="tname">${esc(t.name)}${t.capCount ? ` 🔴×${t.capCount}` : ""}</span>
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

function render(d) {
  const meta = document.getElementById("meta");
  const upd = new Date(d.updatedAt);
  const ageMin = Math.floor((Date.now() - upd.getTime()) / 60000);
  const stale = ageMin > STALE_MIN ? ` <span class="stale">⚠ ${ageMin}분 전 데이터</span>` : "";
  const errs = d.status && !d.status.ok
    ? ` <span class="stale">⚠ 수집 오류 ${d.status.errors.length}건</span>` : "";
  meta.innerHTML = `${upd.toLocaleTimeString("ko-KR")} 기준 · ${esc(d.marketStatus)}${stale}${errs}`;
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
