// 크립토 화면 신호 재측정 — 같은 달 표본을 하나로 묶어 다시 잰다(2026-11-03).
//
// 왜: 코인은 같은 시기에 함께 움직이고 20일 보유가 서로 겹친다. DAILY_EVIDENCE(2026-09-18)는
// 날짜 단위 t였지만 이웃한 날끼리도 독립이 아니다. 컵 백테스트에서 매매 단위 z 2.9가
// 월 묶음 z 0 근처로 떨어진 것을 봤다(lib/rejected.ts cup-breakout-fail-fib).
//
// 재는 것: 신호가 뜬 날 종가 → 20봉 뒤 종가 수익률 - 같은 날 전체 코인 평균. R = ÷ (2×ATR14/가격).
// 신호 판정은 화면과 같은 함수(buildBreakouts · buildCategories), 행 계산은 스캔과 같은 computeFlow(2년 창).
//
// 판정 기준 — 숫자를 보기 전에 정함. 결과를 보고 고치지 않는다.
//   유지 = 달 ≥ 24 · 월 묶음 평균 > 0 · 월 묶음 z ≥ 1.96 · 앞뒤 절반 모두 > 0
//   약함 = 월 묶음 평균 > 0인데 위 조건 하나라도 못 채움
//   없음 = 월 묶음 평균 ≤ 0
// 한계: 지금 거래량 상위 코인만(생존 편향, 같은 날 평균과 비교해 일부 상쇄). 시총 구간 없이 한 묶음.
//
// 사용: node --import ./scripts/ts-resolve-hook.mjs scripts/crypto-signal-recheck.mjs
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { computeFlow } from '../lib/flow.ts'
import { fetchBarsFor, looksPegged } from '../lib/bars.ts'
import { binanceJson } from '../lib/binance.ts'
import { pool } from '../lib/fetch-retry.ts'
import { buildBreakouts, buildCategories, hiddenBreakouts, BREAKOUTS, CATS, tiersFor } from '../lib/screener-shared.ts'

const 보유 = 20, 창 = 730, 코인수 = 100, 최소달 = 24, Z기준 = 1.96   // 보유 20봉: DAILY_EVIDENCE d20과 같음
const CACHE = join(tmpdir(), 'cup-fib-cache')
mkdirSync(CACHE, { recursive: true })

async function 봉(sym) {
  const f = join(CACHE, `bnv_1d_${sym}.json`)
  if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'))
  const b = (await fetchBarsFor({ symbol: sym, source: 'binance' }, '10y', '1d')) ?? []
  writeFileSync(f, JSON.stringify(b))
  return b
}

const tick = await binanceJson('/api/v3/ticker/24hr')
if (!Array.isArray(tick)) { console.error('바이낸스 24시간 시세를 못 받았다'); process.exit(1) }
const 후보 = tick.filter(x => /USDT$/.test(x.symbol) && !/(UP|DOWN|BULL|BEAR)USDT$/.test(x.symbol))
  .sort((a, b) => Number(b.quoteVolume) - Number(a.quoteVolume)).slice(0, 코인수 + 30).map(x => x.symbol)
const 받음 = await pool(후보, async s => ({ s, bars: await 봉(s) }), 4)
const 코인 = 받음.filter(x => x.bars.length > 300 && !looksPegged(x.bars)).slice(0, 코인수)
if (코인.length < 50) { console.error(`코인이 너무 적다: ${코인.length}`); process.exit(1) }

// 날짜(UTC 일) → 코인별 봉 위치
const 날짜집합 = new Set()
const 위치 = 코인.map(({ bars }) => { const m = new Map(); bars.forEach((b, i) => { const d = Math.floor(b.t / 86400); m.set(d, i); 날짜집합.add(d) }); return m })
const 날짜 = [...날짜집합].sort((a, b) => a - b)
const tier = tiersFor('crypto')[0].id
const 숨김 = hiddenBreakouts('crypto')
const 키들 = [...BREAKOUTS.map(b => b.key).filter(k => !숨김.has(k)), ...CATS.map(c => c.key)]
const 표본 = Object.fromEntries(키들.map(k => [k, []]))      // { d, ex, exR }

for (const d of 날짜) {
  const rows = [], 앞 = []
  코인.forEach(({ s, bars }, ci) => {
    const i = 위치[ci].get(d)
    if (i == null || i < 400 || i + 보유 >= bars.length) return
    const m = computeFlow(bars.slice(Math.max(0, i + 1 - 창), i + 1))
    if (m.f20 == null) return
    const price = bars[i].c
    rows.push({ symbol: s, name: s, sector: '', marketCap: 0, tier, ...m, price })
    앞.push({ s, ret: bars[i + 보유].c / price - 1, risk: m.atr14 ? 2 * m.atr14 / price : null })
  })
  if (rows.length < 20) continue
  const 평균 = 앞.reduce((a, x) => a + x.ret, 0) / 앞.length
  const 앞맵 = new Map(앞.map(x => [x.s, x]))
  const br = buildBreakouts(rows, 'crypto', 9999)[tier], ca = buildCategories(rows, 'crypto', 9999)[tier]
  for (const k of 키들) for (const r of (br[k] ?? ca[k] ?? [])) {
    const f = 앞맵.get(r.symbol), ex = f.ret - 평균
    표본[k].push({ d, ex, exR: f.risk ? ex / f.risk : null })
  }
}

const avg = a => a.reduce((s, x) => s + x, 0) / a.length
const zOf = a => a.length > 1 ? avg(a) / Math.sqrt(a.reduce((s, x) => s + (x - avg(a)) ** 2, 0) / (a.length - 1) / a.length) : 0
const 달 = d => new Date(d * 86400e3).toISOString().slice(0, 7)

console.log(`코인 ${코인.length}개 · ${new Date(날짜[0] * 86400e3).toISOString().slice(0, 10)} ~ · 보유 ${보유}봉 · 같은 날 평균 대비`)
for (const k of 키들) {
  const xs = 표본[k].filter(x => x.exR != null)
  if (!xs.length) { console.log(`${k.padEnd(9)} 0건`); continue }
  const 묶 = {}; for (const x of xs) (묶[달(x.d)] ??= []).push(x.exR)
  const 달들 = Object.keys(묶).sort(), mv = 달들.map(m => avg(묶[m]))
  const half = mv.length >> 1, 앞 = avg(mv.slice(0, half)), 뒤 = avg(mv.slice(half))
  const 일 = {}; for (const x of xs) (일[x.d] ??= []).push(x.exR)
  const 일z = zOf(Object.values(일).map(avg))
  const 판정 = avg(mv) <= 0 ? '없음' : (mv.length >= 최소달 && zOf(mv) >= Z기준 && 앞 > 0 && 뒤 > 0 ? '유지' : '약함')
  console.log(`${k.padEnd(9)} ${String(xs.length).padStart(6)}건  초과 ${(avg(xs.map(x => x.ex)) * 100).toFixed(2).padStart(6)}%  초과R ${avg(xs.map(x => x.exR)).toFixed(3).padStart(7)}  날짜z ${일z.toFixed(2).padStart(6)} | 달 ${mv.length} 월묶음R ${avg(mv).toFixed(3).padStart(7)} z ${zOf(mv).toFixed(2).padStart(6)} 앞/뒤 ${앞.toFixed(2)}/${뒤.toFixed(2)}  → ${판정}`)
}
