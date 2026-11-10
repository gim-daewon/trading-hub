import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runAccount, type PaperOrder, type DayBar } from './paper.ts'

// 시가(o)가 있는 봉 — 신호 다음 날 시가에 산다(2026-11-10).
// lib/paper.test.ts는 시가 없는 봉으로 예전 종가 진입을 그대로 시험한다.
const cfg = { seed: 10_000, riskPct: 1, maxOpen: 10, feePct: 0, maxHold: 40, fractional: false }
const bar = (d: string, o: number, h: number, l: number, c: number): DayBar => ({ d, o, h, l, c })
const order = (o: Partial<PaperOrder>): PaperOrder => ({ date: '2026-11-03', symbol: 'A', entry: 100, stop: 95, target: 110, ...o })

test('신호 날에는 사지 않고 다음 날 시가에 산다', () => {
  const r = runAccount([order({})], { A: [bar('2026-11-03', 99, 101, 99, 100), bar('2026-11-04', 102, 104, 101, 103)] }, cfg)
  assert.equal(r.equity[0].equity, 10_000)          // 신호 날은 현금 그대로
  assert.equal(r.open.length, 1)
  assert.equal(r.open[0].entry, 102)
  assert.equal(r.open[0].qty, 14)                   // 100 ÷ (102 − 95) = 14.28
  assert.equal(r.open[0].last, 103)
})

test('다음 날 봉이 아직 없으면 사지 않는다', () => {
  const r = runAccount([order({})], { A: [bar('2026-11-03', 99, 101, 99, 100)] }, cfg)
  assert.equal(r.open.length, 0)
  assert.equal(r.cash, 10_000)
})

test('산 날도 시가 뒤 움직임으로 판정한다', () => {
  const r = runAccount([order({})], { A: [bar('2026-11-03', 99, 101, 99, 100), bar('2026-11-04', 101, 111, 99, 109)] }, cfg)
  assert.equal(r.closed[0].exit, 'target')
  assert.equal(r.closed[0].qty, 16)                 // 100 ÷ (101 − 95) = 16.6
  assert.equal(r.closed[0].pnl, 144)                // 16주 × (110 − 101)
})

test('다음 날 시가가 이미 손절가 아래면 사지 않는다', () => {
  const r = runAccount([order({})], { A: [bar('2026-11-03', 99, 101, 99, 100), bar('2026-11-04', 94, 96, 93, 95)] }, cfg)
  assert.equal(r.open.length + r.closed.length, 0)
})

test('시가가 손절가 아래로 갭하락한 날은 시가에 손절한다', () => {
  const bars = [bar('2026-11-03', 99, 101, 99, 100), bar('2026-11-04', 100, 101, 99, 100), bar('2026-11-05', 90, 93, 88, 92)]
  const r = runAccount([order({})], { A: bars }, cfg)
  assert.equal(r.closed[0].exit, 'stop')
  assert.equal(r.closed[0].price, 90)               // 예전 계산은 min(손절 95, 고가 93) = 93
  assert.equal(r.closed[0].pnl, -200)               // 20주 × (90 − 100)
})
