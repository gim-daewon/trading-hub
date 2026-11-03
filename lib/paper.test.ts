import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runAccount, pullbackOrder, dailyOrders, type PaperOrder, type DayBar } from './paper.ts'

test('하루 주문: A는 기법 통과(지지·저항 필요), B는 20일선 눌림 신호, 각각 최대 10개', () => {
  const r = (symbol: string, o = {}) => ({ symbol, name: symbol, sector: '', marketCap: 1e10, tier: 'large',
    price: 100, vwma20: 99.5, vwma60: 90, wClose: 100, wVwma20: 96, f20: 10, chg20: 1, pctB: 0.5, atr14: 2, ...o })
  const built = {
    categories: { large: { pullback: [r('A1')], momentum: [r('A1')], quiet: [] } },
    breakouts: { large: { nearD: Array.from({ length: 12 }, (_, i) => r(`B${i}`)), today: [] } },
    rebound: {},
  }
  const labels = { cats: [{ key: 'pullback', label: '눌림목' }, { key: 'momentum', label: '모멘텀' }], breakouts: [{ key: 'nearD', label: '접근' }, { key: 'today', label: '돌파' }], rebounds: [] }
  const lv = { support: { price: 97, pct: -3 }, resistance: null }
  const o = dailyOrders(built, ['large'], labels, () => lv, '2026-11-03')
  assert.ok(o.A.some(x => x.symbol === 'A1'))
  assert.equal(o.B.length, 10)
  assert.equal(o.B[0].date, '2026-11-03')
  assert.equal(o.B[0].stop, 97.5)
})

test('하루 주문 B도 우선주·묶음 증권은 뺀다', () => {
  const r = (symbol: string, name: string) => ({ symbol, name, sector: '', marketCap: 1e10, tier: 'large',
    price: 100, vwma20: 99.5, vwma60: 90, f20: 1, chg20: 1, pctB: 0.5, atr14: 2 })
  const built = { breakouts: { large: { nearD: [r('MCHPP', 'Microchip Depositary Shares Mandatory Convertible Preferred'), r('MCHP', 'Microchip Technology')] } } }
  const o = dailyOrders(built, ['large'], { cats: [], breakouts: [], rebounds: [] }, () => null, '2026-11-03')
  assert.deepEqual(o.B.map(x => x.symbol), ['MCHP'])
})

test('규칙 B: 손절은 20일선에서 ATR만큼 아래, 목표는 손절폭 2배', () => {
  const o = pullbackOrder({ price: 100, vwma20: 99.5, atr14: 2 })!
  assert.equal(o.stop, 97.5)
  assert.equal(o.target, 105)
})

test('규칙 B: 손절폭은 최소 1%, 값이 없으면 주문 없음', () => {
  assert.equal(pullbackOrder({ price: 100, vwma20: 100.2, atr14: 0.1 })!.stop, 99)
  assert.equal(pullbackOrder({ price: 100, vwma20: null, atr14: 2 }), null)
})

const cfg = { seed: 10_000, riskPct: 1, maxOpen: 10, feePct: 0, maxHold: 40, fractional: false }
const bar = (d: string, h: number, l: number, c: number): DayBar => ({ d, h, l, c })
const order = (o: Partial<PaperOrder>): PaperOrder => ({ date: '2026-11-03', symbol: 'A', entry: 100, stop: 95, target: 110, ...o })

test('위험 1%로 수량을 정하고, 목표에 닿으면 목표가에 판다', () => {
  const r = runAccount([order({})], { A: [bar('2026-11-03', 101, 99, 100), bar('2026-11-04', 111, 100, 109)] }, cfg)
  assert.equal(r.closed.length, 1)
  assert.equal(r.closed[0].qty, 20)                 // 10,000 × 1% = 100 ÷ 손절폭 5
  assert.equal(r.closed[0].exit, 'target')
  assert.equal(r.closed[0].pnl, 200)                // (110-100) × 20
  assert.equal(r.closed[0].r, 2)
  assert.equal(r.equity.at(-1)!.equity, 10_200)
})

test('같은 날 손절과 목표가 둘 다 닿으면 손절로 본다(보수적)', () => {
  const r = runAccount([order({})], { A: [bar('2026-11-03', 101, 99, 100), bar('2026-11-04', 111, 90, 100)] }, cfg)
  assert.equal(r.closed[0].exit, 'stop')
  assert.equal(r.closed[0].pnl, -100)
})

test('갭 하락으로 봉 전체가 손절 아래면 그 봉 고가에 나간다', () => {
  const r = runAccount([order({})], { A: [bar('2026-11-03', 101, 99, 100), bar('2026-11-04', 92, 88, 90)] }, cfg)
  assert.equal(r.closed[0].price, 92)
  assert.equal(r.closed[0].pnl, -160)
})

test('산 날에는 판정하지 않는다 — 종가에 샀으니 다음 날부터', () => {
  const r = runAccount([order({})], { A: [bar('2026-11-03', 120, 80, 100)] }, cfg)
  assert.equal(r.closed.length, 0)
  assert.equal(r.open.length, 1)
})

test('보유 기간이 maxHold를 넘으면 그날 종가에 판다', () => {
  const bars = [bar('2026-11-03', 101, 99, 100), bar('2026-11-04', 102, 98, 101), bar('2026-11-05', 103, 99, 102)]
  const r = runAccount([order({})], { A: bars }, { ...cfg, maxHold: 2 })
  assert.equal(r.closed[0].exit, 'time')
  assert.equal(r.closed[0].price, 102)
})

test('현금이 모자라면 살 수 있는 만큼만, 같은 종목은 다시 안 산다, 자리가 차면 안 산다', () => {
  // 손절폭 1이면 위험 기준 100주 = 10,000원어치 → 현금 한도 안에서 100주
  const big = runAccount([order({ stop: 99 }), order({ symbol: 'B', stop: 99 })],
    { A: [bar('2026-11-03', 101, 99.5, 100)], B: [bar('2026-11-03', 101, 99.5, 100)] }, cfg)
  assert.equal(big.open.length, 1)                  // B는 현금이 없어 못 삼
  const dup = runAccount([order({}), order({ date: '2026-11-04' })],
    { A: [bar('2026-11-03', 101, 99, 100), bar('2026-11-04', 101, 99, 100)] }, cfg)
  assert.equal(dup.open.length, 1)
  const full = runAccount([order({}), order({ symbol: 'B' })],
    { A: [bar('2026-11-03', 101, 99, 100)], B: [bar('2026-11-03', 101, 99, 100)] }, { ...cfg, maxOpen: 1 })
  assert.equal(full.open.length, 1)
})

test('수수료는 사고팔 때 둘 다 뗀다', () => {
  const r = runAccount([order({})], { A: [bar('2026-11-03', 101, 99, 100), bar('2026-11-04', 111, 100, 109)] }, { ...cfg, feePct: 0.1 })
  // 매수 20주 × 100 × 0.1% = 2, 매도 20 × 110 × 0.1% = 2.2
  assert.equal(Math.round(r.closed[0].pnl * 10) / 10, 195.8)
})

test('자산 = 현금 + 보유 종목 종가 평가', () => {
  const r = runAccount([order({})], { A: [bar('2026-11-03', 101, 99, 100), bar('2026-11-04', 104, 99, 103)] }, cfg)
  assert.equal(r.equity.at(-1)!.equity, 10_060)     // 20주 × 3 이익
  assert.equal(r.open[0].last, 103)
})

test('봉 날짜가 없는 날 주문은 건너뛰지 않고 그 종목 봉이 오는 날 평가한다', () => {
  const r = runAccount([order({ date: '2026-11-03' })], { A: [bar('2026-11-05', 111, 100, 109)] }, cfg)
  assert.equal(r.closed[0].exit, 'target')
})
