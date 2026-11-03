// 컵 + 돌파 실패 + Fib 되돌림(2026-11-03 참고 영상) 백테스트. 판정 코드는 lib/cup-fib.ts.
//
// 판정 기준 — 숫자를 보기 전에 정함(2026-11-03). 결과를 보고 고치지 않는다.
//   단위는 R(수수료 뺀 손익 ÷ 진입-손절 거리). 비교 기준선 = 같은 종목·같은 손절%·목표%로
//   아무 날에나 들어간 매매(독립 난수). 차이 = 전략 R - 기준선 R(매매마다 짝).
//   맞아  = 건수 ≥ 30 · 평균 R > 0 · 차이 평균 > 0이고 z ≥ 1.96 · 앞뒤 절반 기간 모두 차이 > 0
//   빼    = 건수 ≥ 30인데 평균 R ≤ 0 또는 차이 ≤ 0
//   애매  = 방향은 맞는데 z < 1.96 또는 절반 하나가 음수
//   더 봄 = 건수 < 30
//   pivotK 3·8은 민감도 확인용이다. 좋은 쪽을 고르지 않는다.
//
// 추가(2026-11-03, 첫 결과 뒤 · 이 실행의 숫자는 보기 전) --국면:
//   국면 = 기준 자산(크립토 BTCUSDT · 미국 SPY) 전날 종가가 200일 평균 위/아래. 홈 위험 신호등은
//   과거 값이 없어 대신 쓴다. 영상 그대로 B·C만. 위 '맞아'에 더해 월 묶음 z ≥ 1.96이어야 맞아.
//
// 한계: 지금 살아남은 종목만 쓴다(생존 편향). 기준선이 같은 종목이라 일부만 상쇄된다.
//       크립토는 현물 봉(펀딩비 없음). 진입은 신호 봉 종가(다음 봉 시가가 자료에 없다).
//
// 사용: node --import ./scripts/ts-resolve-hook.mjs scripts/cup-fib-backtest.mjs [--시장=us|crypto|all]
//       받은 봉은 OS 임시 폴더 cup-fib-cache에 저장해 두 번째부터는 네트워크를 안 쓴다.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanCupFib, simulate, CUP_FIB } from '../lib/cup-fib.ts'
import { fetchUniverse } from '../lib/universe.ts'
import { fetchBarsFor, looksPegged } from '../lib/bars.ts'
import { binanceJson } from '../lib/binance.ts'
import { pool } from '../lib/fetch-retry.ts'

const 시장 = process.argv.find(a => a.startsWith('--시장='))?.split('=')[1] ?? 'all'
const CACHE = join(tmpdir(), 'cup-fib-cache')
mkdirSync(CACHE, { recursive: true })
const 최소건수 = 30, Z기준 = 1.96          // 출처: 2026-10-19 신호 판정 기준과 같은 숫자
const 크립토수 = 100

const 변형 = [
  ['영상 그대로', {}, ['A', 'B', 'C']],
  ['C 얕은 되돌림 0.236 · 손절 0.5', { touch: 0.236, stopAt: 0.5 }, ['C']],
  ['C 손절 없음', { useStop: false }, ['C']],
  ['C pivotK 3 (민감도)', { pivotK: 3 }, ['C']],
  ['C pivotK 8 (민감도)', { pivotK: 8 }, ['C']],
]

async function 봉(키, 받기) {
  const f = join(CACHE, 키.replace(/[^\w.-]/g, '_') + '.json')
  if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'))
  const b = await 받기()
  // 고가·저가 없는 봉은 패턴을 못 본다. 빼고 저장(빈 배열도 저장해 다시 안 받는다)
  const ok = (b ?? []).filter(x => x.h != null && x.l != null && x.c > 0).map(({ t, h, l, c }) => ({ t, h, l, c }))
  writeFileSync(f, JSON.stringify(ok))
  return ok
}

async function 미국() {
  const rows = await fetchUniverse('us')
  if (rows.length < 1000) throw new Error(`미국 종목 목록이 너무 적다: ${rows.length}`)
  const 결과 = await pool(rows, async r => ({ sym: r.symbol, tier: r.tier, bars: await 봉(`us_${r.symbol}`, () => fetchBarsFor(r, '10y')) }), 8)
  return { 이름: '미국 일봉 10년', fee: 0.0005, 묶음: 결과.filter(x => x.bars.length > 300) }
}

async function 크립토(interval) {
  const tick = await binanceJson('/api/v3/ticker/24hr')
  if (!Array.isArray(tick)) throw new Error('바이낸스 24시간 시세를 못 받았다')
  const 후보 = tick.filter(x => /USDT$/.test(x.symbol) && !/(UP|DOWN|BULL|BEAR)USDT$/.test(x.symbol))
    .sort((a, b) => Number(b.quoteVolume) - Number(a.quoteVolume)).slice(0, 크립토수 + 30)
  const 결과 = await pool(후보, async x => ({ sym: x.symbol, tier: 'crypto', bars: await 봉(`bn_${interval}_${x.symbol}`, () => fetchBarsFor({ symbol: x.symbol, source: 'binance' }, interval === '4h' ? '3y' : '10y', interval)) }), 4)
  // 스테이블코인(USDC, FDUSD 등)은 가격이 안 움직인다 — 기존 판정 재사용
  const 묶음 = 결과.filter(x => x.bars.length > 300 && !looksPegged(x.bars)).slice(0, 크립토수)
  return { 이름: `바이낸스 상위 ${묶음.length}코인 ${interval}`, fee: 0.001, 묶음 }
}

function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }

// 같은 종목 아무 날에 같은 손절%·목표%로 들어간 매매 R
function 기준선R(bars, tr, p, rand) {
  const lo = 50, hi = bars.length - p.maxHold - 2
  if (hi <= lo) return null
  const e = lo + Math.floor(rand() * (hi - lo)), px = bars[e].c
  return simulate(bars, e, px, px * tr.stop / tr.entryPrice, px * tr.target / tr.entryPrice, p).r
}

const avg = a => a.reduce((s, x) => s + x, 0) / a.length
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN }
const zOf = a => a.length > 1 ? avg(a) / Math.sqrt(a.reduce((s, x) => s + (x - avg(a)) ** 2, 0) / (a.length - 1) / a.length) : 0

function 판정(rows) {
  if (rows.length < 최소건수) return '더 봄'
  const r = rows.map(x => x.r), d = rows.map(x => x.d)
  if (avg(r) <= 0 || avg(d) <= 0) return '빼'
  const t = [...rows].sort((a, b) => a.t - b.t), half = t.length >> 1
  const 앞 = avg(t.slice(0, half).map(x => x.d)), 뒤 = avg(t.slice(half).map(x => x.d))
  return zOf(d) >= Z기준 && 앞 > 0 && 뒤 > 0 ? '맞아' : '애매'
}

function 한줄(이름, rows) {
  if (!rows.length) return `  ${이름.padEnd(14)} 0건`
  const r = rows.map(x => x.r), d = rows.map(x => x.d)
  const 승 = rows.filter(x => x.r > 0).length / rows.length * 100
  const t = [...rows].sort((a, b) => a.t - b.t), half = t.length >> 1
  const 앞 = avg(t.slice(0, half).map(x => x.d)), 뒤 = avg(t.slice(half).map(x => x.d))
  return `  ${이름.padEnd(14)} ${String(rows.length).padStart(5)}건  이긴 ${승.toFixed(0).padStart(3)}%  평균R ${avg(r).toFixed(3).padStart(7)}  중앙R ${med(r).toFixed(2).padStart(6)}  기준선R ${avg(rows.map(x => x.b)).toFixed(3).padStart(7)}  차이 ${avg(d).toFixed(3).padStart(7)} z ${zOf(d).toFixed(2).padStart(6)}  앞/뒤 ${앞.toFixed(2)}/${뒤.toFixed(2)}  → ${판정(rows)}`
}

// 전날까지의 기준 자산 일봉으로 '200일 평균 위' 여부. 반환: 시각(초) → true/false/null
function 국면판정(bench) {
  const 일 = bench.map(b => ({ d: Math.floor(b.t / 86400), c: b.c }))
  const 위 = []
  let s = 0
  일.forEach((x, i) => { s += x.c; if (i >= 200) s -= 일[i - 200].c; 위.push(i >= 199 ? x.c > s / 200 : null) })
  return t => {
    const d = Math.floor(t / 86400)
    let lo = 0, hi = 일.length - 1, k = -1
    while (lo <= hi) { const m = (lo + hi) >> 1; if (일[m].d < d) { k = m; lo = m + 1 } else hi = m - 1 }
    return k < 0 ? null : 위[k]
  }
}

function 월z(rows) {
  const 묶 = {}
  for (const x of rows) (묶[new Date(x.t * 1000).toISOString().slice(0, 7)] ??= []).push(x.d)
  const mv = Object.values(묶).map(avg)
  return { 달: mv.length, z: zOf(mv) }
}

function 국면돌리기({ 이름, fee, 묶음, bench }) {
  const 위인가 = 국면판정(bench)
  const p = { ...CUP_FIB, feePerSide: fee }
  const rand = rng(20261103), 모음 = {}
  for (const { bars } of 묶음) for (const tr of scanCupFib(bars, p)) {
    if (tr.exit === 'open' || tr.strategy === 'A') continue
    const b = 기준선R(bars, tr, p, rand), t = bars[tr.entryIndex].t, g = 위인가(t)
    if (b == null || g == null || !Number.isFinite(tr.r)) continue
    ;(모음[`${tr.strategy} ${g ? '200일 위' : '200일 아래'}`] ??= []).push({ r: tr.r, b, d: tr.r - b, t })
  }
  console.log(`\n==== ${이름} — 국면 조건부 (기준 자산 전날 종가 vs 200일 평균)`)
  for (const k of Object.keys(모음).sort()) {
    const { 달, z } = 월z(모음[k]), 기존 = 판정(모음[k])
    const 최종 = 기존 === '맞아' && z < Z기준 ? '애매(월 묶음)' : 기존
    console.log(`${한줄(k, 모음[k]).replace(/ → .*$/, '')}  월 ${달}개 월z ${z.toFixed(2)}  → ${최종}`)
  }
}

function 돌리기({ 이름, fee, 묶음 }) {
  console.log(`\n==== ${이름} (${묶음.length}종목)`)
  for (const [변형이름, 바꿈, 전략들] of 변형) {
    const p = { ...CUP_FIB, feePerSide: fee, ...바꿈 }
    const rand = rng(20261103)
    const 모음 = {}
    for (const { sym, tier, bars } of 묶음) {
      for (const tr of scanCupFib(bars, p)) {
        if (tr.exit === 'open' || !전략들.includes(tr.strategy)) continue
        const b = 기준선R(bars, tr, p, rand)
        if (b == null || !Number.isFinite(tr.r)) continue
        const row = { r: tr.r, b, d: tr.r - b, t: bars[tr.entryIndex].t, sym };
        (모음[tr.strategy] ??= []).push(row);
        (모음[`${tr.strategy} ${tier}`] ??= []).push(row)
      }
    }
    console.log(`-- ${변형이름}`)
    for (const k of Object.keys(모음).sort()) if (전략들.includes(k) || 묶음[0].tier !== 'crypto') console.log(한줄(k, 모음[k]))
  }
}

const 할일 = []
if (시장 === 'us' || 시장 === 'all') 할일.push(미국)
if (시장 === 'crypto' || 시장 === 'all') 할일.push(() => 크립토('1d'), () => 크립토('4h'))
const 국면모드 = process.argv.includes('--국면')
for (const f of 할일) {
  const m = await f()
  if (!국면모드) { 돌리기(m); continue }
  const 크립토여부 = m.묶음[0]?.tier === 'crypto'
  m.bench = 크립토여부
    ? await 봉('bn_1d_BTCUSDT', () => fetchBarsFor({ symbol: 'BTCUSDT', source: 'binance' }, '10y', '1d'))
    : await 봉('us_SPY', () => fetchBarsFor({ symbol: 'SPY', source: 'yahoo' }, '10y'))
  if (m.bench.length < 400) throw new Error(`기준 자산 봉이 부족하다: ${m.bench.length}`)
  국면돌리기(m)
}
