// 오늘 후보 '추천' 규칙(lib/today.ts preselect·pickTop) 10년 백테스트 — 2026-11-03 사용자 "1 진행".
//
// 고르는 규칙은 앱 코드를 그대로 부른다(정배열 · 20일선 0~8% · 저항 +2% 안 제외 ·
// 손절 = 지지를 ATR 1~2배로 묶음(최소 1%) · 저항 없으면 목표 2R · 손익비 1:2 미만 제외).
//
// 판정 기준 — 숫자를 보기 전에 정함(2026-11-03, scripts/cup-fib-backtest.mjs와 같은 기준). 결과를 보고 고치지 않는다.
//   단위 R(수수료 뺀 손익 ÷ 진입-손절 거리). 기준선 = 같은 종목 아무 날에 같은 손절%·목표%로 든 매매(독립 난수).
//   맞아  = 건수 ≥ 30 · 평균 R > 0 · 차이 평균 > 0, z ≥ 1.96 · 앞뒤 절반 모두 차이 > 0 · 월 묶음 z ≥ 1.96
//   빼    = 건수 ≥ 30인데 평균 R ≤ 0 또는 차이 ≤ 0
//   애매  = 방향은 맞는데 z 부족 또는 절반 하나가 음수
//   더 봄 = 건수 < 30
//   나눠 보기(신고가권/저항 있음, SPY 200일 위/아래)는 참고다. 좋은 칸을 골라 규칙을 바꾸지 않는다.
//
// 매매: 신호 봉 종가 진입 · 손절/목표 먼저 닿는 쪽 · 40봉 지나면 종가 청산 · 한쪽 수수료 0.05%.
//       같은 종목은 앞 매매가 끝난 뒤에만 다시 든다(겹치지 않게).
// 한계: 지금 살아남은 종목만(생존 편향). 실적 일정 제외는 과거 자료가 없어 못 넣었다.
//       화면은 신호 목록에 걸린 종목만 예선에 넣고 하루 10개로 자르는데, 여기서는 규칙을 통과한 모든 날을 잰다.
//
// 사용: node --import ./scripts/ts-resolve-hook.mjs scripts/today-pick-backtest.mjs
//       받은 봉은 OS 임시 폴더 today-bt-cache에 저장해 두 번째부터는 네트워크를 안 쓴다.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { preselect, pickTop } from '../lib/today.ts'
import { nearestLevels } from '../lib/levels.ts'
import { simulate } from '../lib/cup-fib.ts'
import { vwma, atr } from '../lib/flow.ts'
import { fetchUniverse } from '../lib/universe.ts'
import { fetchBarsFor } from '../lib/bars.ts'
import { pool } from '../lib/fetch-retry.ts'

const CACHE = join(tmpdir(), 'today-bt-cache')
mkdirSync(CACHE, { recursive: true })
const 최소건수 = 30, Z기준 = 1.96          // 출처: 2026-10-19 신호 판정 기준(cup-fib-backtest.mjs와 같음)
const 보유 = 40, 수수료 = 0.0005, 시작봉 = 300  // 시작봉: 지지·저항 1년(250) + 60일선 여유
const 매매설정 = { useStop: true, maxHold: 보유, feePerSide: 수수료 }

async function 봉(sym, 받기) {
  const f = join(CACHE, sym.replace(/[^\w.-]/g, '_') + '.json')
  if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'))
  const b = await 받기()
  const ok = (b ?? []).filter(x => x.h != null && x.l != null && x.c > 0 && x.v != null).map(({ t, h, l, c, v }) => ({ t, h, l, c, v }))
  writeFileSync(f, JSON.stringify(ok))
  return ok
}

// ── 지표: 매일 다시 계산하면 느려 누적합으로 만든다. 앱(lib/flow.ts)과 표본 대조 후 어긋나면 중단 ──
function 지표(bars) {
  const n = bars.length, w20 = new Float64Array(n).fill(NaN), w60 = new Float64Array(n).fill(NaN), a14 = new Float64Array(n).fill(NaN)
  const roll = (days, out) => {
    let pv = 0, vv = 0
    for (let i = 0; i < n; i++) {
      pv += bars[i].c * bars[i].v; vv += bars[i].v
      if (i >= days) { pv -= bars[i - days].c * bars[i - days].v; vv -= bars[i - days].v }
      if (i >= days - 1 && vv > 0) out[i] = pv / vv
    }
  }
  roll(20, w20); roll(60, w60)
  let s = 0
  const tr = i => Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - bars[i - 1].c), Math.abs(bars[i].l - bars[i - 1].c))
  for (let i = 1; i < n; i++) { s += tr(i); if (i > 14) s -= tr(i - 14); if (i >= 14) a14[i] = s / 14 }
  return { w20, w60, a14 }
}

function 대조(묶음) {
  let bad = 0, n = 0
  for (const { sym, bars, ind } of 묶음.slice(0, 20)) {
    for (const i of [bars.length - 1, bars.length - 200, 시작봉 + 5]) {
      const pre = bars.slice(0, i + 1)
      const near = (x, y) => y != null && Math.abs(x - y) / Math.abs(y || 1) < 1e-6
      n++
      if (!near(ind.w20[i], vwma(pre, 20)) || !near(ind.w60[i], vwma(pre, 60)) || !near(ind.a14[i], atr(pre, 14))) {
        bad++; console.error(`  불일치 ${sym} i=${i}: w20 ${ind.w20[i]} vs ${vwma(pre, 20)} · atr ${ind.a14[i]} vs ${atr(pre, 14)}`)
      }
    }
  }
  console.error(`앱 지표와 대조 ${n}건 중 불일치 ${bad}건`)
  if (bad) { console.error('지표 계산이 앱과 다르다. 중단한다.'); process.exit(1) }
}

function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }

function 기준선R(bars, entry, stop, target, rand) {
  const lo = 시작봉, hi = bars.length - 보유 - 2
  if (hi <= lo) return null
  const e = lo + Math.floor(rand() * (hi - lo)), px = bars[e].c
  return simulate(bars, e, px, px * stop / entry, px * target / entry, 매매설정).r
}

/** i일에 규칙을 통과하면 {stop, target, 신고가}. 앱 코드로 판정한다 */
function 규칙(sym, tier, bars, ind, i) {
  const price = bars[i].c, v20 = ind.w20[i], v60 = ind.w60[i]
  if (!(v20 > 0) || !(v60 > 0) || !(ind.a14[i] > 0)) return null
  const row = { symbol: sym, name: '', sector: '', marketCap: 0, tier, price, vwma20: v20, vwma60: v60,
    wClose: null, wVwma20: null, f20: null, chg20: null, pctB: null, atr14: ind.a14[i] }
  const item = { row, tags: [], checks: [], earnings: null }
  if (!preselect([item]).length) return null
  const lv = nearestLevels(bars.slice(Math.max(0, i - 270), i + 1))   // 270봉이면 1년(250)+꼭짓점 폭을 덮는다
  const p = pickTop([item], { [sym]: lv })[0]
  return p ? { stop: p.stop, target: p.target, 신고가: !lv.resistance } : null
}

// 기준 자산 전날 종가가 200일 평균 위인가 — cup-fib-backtest.mjs 국면판정과 같은 방식
function 국면판정(bench) {
  const 일 = bench.map(b => ({ d: Math.floor(b.t / 86400), c: b.c })), 위 = []
  let s = 0
  일.forEach((x, i) => { s += x.c; if (i >= 200) s -= 일[i - 200].c; 위.push(i >= 199 ? x.c > s / 200 : null) })
  return t => {
    const d = Math.floor(t / 86400)
    let lo = 0, hi = 일.length - 1, k = -1
    while (lo <= hi) { const m = (lo + hi) >> 1; if (일[m].d < d) { k = m; lo = m + 1 } else hi = m - 1 }
    return k < 0 ? null : 위[k]
  }
}

const avg = a => a.reduce((s, x) => s + x, 0) / a.length
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN }
const zOf = a => a.length > 1 ? avg(a) / Math.sqrt(a.reduce((s, x) => s + (x - avg(a)) ** 2, 0) / (a.length - 1) / a.length) : 0
function 월z(rows) {
  const 묶 = {}
  for (const x of rows) (묶[new Date(x.t * 1000).toISOString().slice(0, 7)] ??= []).push(x.d)
  const mv = Object.values(묶).map(avg)
  return { 달: mv.length, z: zOf(mv) }
}
function 판정(rows) {
  if (rows.length < 최소건수) return '더 봄'
  const d = rows.map(x => x.d)
  if (avg(rows.map(x => x.r)) <= 0 || avg(d) <= 0) return '빼'
  const t = [...rows].sort((a, b) => a.t - b.t), half = t.length >> 1
  const 앞 = avg(t.slice(0, half).map(x => x.d)), 뒤 = avg(t.slice(half).map(x => x.d))
  return zOf(d) >= Z기준 && 앞 > 0 && 뒤 > 0 && 월z(rows).z >= Z기준 ? '맞아' : '애매'
}
function 한줄(이름, rows) {
  if (!rows.length) return `  ${이름.padEnd(16)} 0건`
  const r = rows.map(x => x.r), d = rows.map(x => x.d)
  const 승 = rows.filter(x => x.r > 0).length / rows.length * 100
  const t = [...rows].sort((a, b) => a.t - b.t), half = t.length >> 1
  const 앞 = avg(t.slice(0, half).map(x => x.d)), 뒤 = avg(t.slice(half).map(x => x.d))
  const m = 월z(rows)
  return `  ${이름.padEnd(16)} ${String(rows.length).padStart(6)}건  이긴 ${승.toFixed(0).padStart(3)}%  평균R ${avg(r).toFixed(3).padStart(7)}  중앙R ${med(r).toFixed(2).padStart(6)}  기준선R ${avg(rows.map(x => x.b)).toFixed(3).padStart(7)}  차이 ${avg(d).toFixed(3).padStart(7)} z ${zOf(d).toFixed(2).padStart(6)}  앞/뒤 ${앞.toFixed(2)}/${뒤.toFixed(2)}  월z ${m.z.toFixed(2)}(${m.달})  → ${판정(rows)}`
}

const uni = await fetchUniverse('us')
if (uni.length < 1000) throw new Error(`미국 종목 목록이 너무 적다: ${uni.length}`)
console.error(`미국 ${uni.length}종목 10년 일봉 받기(캐시 ${CACHE})...`)
const 받음 = await pool(uni, async u => ({ sym: u.symbol, tier: u.tier, bars: await 봉(`us_${u.symbol}`, () => fetchBarsFor(u, '10y')) }), 8)
const 묶음 = 받음.filter(x => x.bars.length > 시작봉 + 보유).map(x => ({ ...x, ind: 지표(x.bars) }))
console.error(`봉 있는 종목 ${묶음.length}`)
대조(묶음)
const spy = await 봉('us_SPY', () => fetchBarsFor({ symbol: 'SPY', source: 'yahoo' }, '10y'))
if (spy.length < 400) throw new Error(`SPY 봉이 부족하다: ${spy.length}`)
const 위인가 = 국면판정(spy)

const rand = rng(20261103), 모음 = {}
const 넣기 = (k, x) => (모음[k] ??= []).push(x)
for (const { sym, tier, bars, ind } of 묶음) {
  for (let i = 시작봉; i < bars.length - 1; i++) {
    const s = 규칙(sym, tier, bars, ind, i)
    if (!s) continue
    const tr = simulate(bars, i, bars[i].c, s.stop, s.target, 매매설정)
    if (tr.exit === 'open' || !Number.isFinite(tr.r)) break
    const b = 기준선R(bars, bars[i].c, s.stop, s.target, rand)
    if (b != null && Number.isFinite(b)) {
      const x = { r: tr.r, b, d: tr.r - b, t: bars[i].t }, g = 위인가(bars[i].t)
      넣기('전체', x)
      넣기(s.신고가 ? '신고가권' : '저항 있음', x)
      if (tier) 넣기(`구간 ${tier}`, x)
      if (g != null) 넣기(g ? 'SPY 200일 위' : 'SPY 200일 아래', x)
    }
    i = tr.exitIndex   // 앞 매매가 끝난 뒤에만 다시 든다
  }
}

console.log(`\n==== 오늘 후보 추천 규칙 — 미국 ${묶음.length}종목 10년 (보유 최대 ${보유}봉, 수수료 한쪽 ${수수료 * 100}%)`)
for (const k of ['전체', '신고가권', '저항 있음', 'SPY 200일 위', 'SPY 200일 아래', ...Object.keys(모음).filter(k => k.startsWith('구간')).sort()]) {
  if (모음[k]) console.log(한줄(k, 모음[k]))
}
