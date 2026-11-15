/**
 * 스냅샷 행 → ScreenerRow 매핑 하나(agent-trust-trading-hub.md 할 일 3 '행 매핑 하나로', 2026-11-16).
 * 예전 두 복사본(tracking·screener route)이 따로 필드를 골랐다. tracking은 VWMA를 빠뜨렸고(c8993b4),
 * screener는 chg1을 빠뜨려 낙폭 반등 '1일 낙폭' 탭이 늘 비고 "컬럼이 아직 없다"고 떴다.
 * 사용: npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mapScreenerRow, type DbScreenerRow } from './screener-row.ts'

/** select=*로 받은 행 — 모든 컬럼이 채워져 있다 */
const 전부: DbScreenerRow = {
  symbol: 'AAPL', name: 'Apple', sector: 'Tech', market_cap: 3e12, cap_known: true,
  f5: 1, f20: 2, f60: 3, rvol: 1.2, chg20: 4, pct_b: 0.5, price: 200,
  vwma20: 190, vwma60: 180, above_run: 3, prev_run: 5,
  w_close: 199, w_vwma20: 185, w_vwma60: 170, w_above_run: 2, w_prev_run: 7,
  low: 195, w_low: 180, high: 205, chg1: -2.5, atr14: 4, dollar_vol: 1e9,
  display: 'AAPL', premium: null,
}

test('모든 컬럼이 ScreenerRow로 넘어간다 — chg1·high·VWMA를 빠뜨리지 않는다', () => {
  const r = mapScreenerRow(전부, 'us')
  assert.equal(r.chg1, -2.5)
  assert.equal(r.high, 205)
  assert.equal(r.vwma20, 190)
  assert.equal(r.wVwma60, 170)
  assert.equal(r.wPrevRun, 7)
  assert.equal(r.wLow, 180)
  assert.equal(r.atr14, 4)
  assert.equal(r.dollarVol, 1e9)
  assert.equal(r.pctB, 0.5)
  assert.equal(r.tier, 'large')
  assert.equal(r.name, 'Apple')
  assert.equal(r.display, 'AAPL')
  assert.equal(r.capKnown, true)
})

test('시총 미상(cap_known=false)은 초소형이 아니라 unknown', () => {
  assert.equal(mapScreenerRow({ ...전부, market_cap: 0, cap_known: false }, 'us').tier, 'unknown')
})

test('필요한 컬럼만 받은 행(추적): 없는 값은 빈 문자열·null로, 없는 열을 지어내지 않는다', () => {
  const r = mapScreenerRow({ symbol: 'X', market_cap: null, price: 10, vwma20: 9 }, 'us')
  assert.equal(r.name, '')
  assert.equal(r.sector, '')
  assert.equal(r.marketCap, 0)
  assert.equal(r.f5, null)
  assert.equal(r.rvol, null)
  assert.equal(r.vwma20, 9)
  // 30일 캐시 크기(항목당 2MB)를 늘리지 않게, 받지 않은 열은 키가 비어 있다
  assert.equal(r.display, undefined)
  assert.equal(r.capKnown, undefined)
  assert.equal(r.chg1, undefined)
})

test('display가 null이면 심볼로', () => {
  assert.equal(mapScreenerRow({ ...전부, display: null }, 'us').display, 'AAPL')
})

// 복사본이 다시 생기지 않게: 두 route는 행을 직접 고르지 않고 이 함수를 쓴다
for (const 파일 of ['app/api/tracking/route.ts', 'app/api/screener/route.ts']) {
  test(`${파일}: 스냅샷 행 매핑은 mapScreenerRow로만 한다`, () => {
    const src = readFileSync(new URL(`../${파일}`, import.meta.url), 'utf8')
    assert.ok(src.includes('mapScreenerRow('), 'mapScreenerRow를 안 쓴다')
    assert.ok(!/wVwma20:\s*r\.w_vwma20/.test(src), '행 매핑 복사본이 남았다')
  })
}
