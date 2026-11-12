/**
 * 거래일 판정 — 스냅샷 1개 = 1거래일(agent-trust-trading-hub.md 할 일 5, 2026-11-13).
 * 예전에는 app/api/tracking/route.ts 안에 묻혀 시험이 없었다. 날짜 함정 4건(c652e7f a35faee 9e68f27 15f2bf5)이 사례다.
 * 사용: npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { snapDay, tradingDaySnaps } from './trading-days.ts'

const 스냅 = (id: number, scanned_at: string, bar_date: string | null, spy_price: number | null = 100 + id) =>
  ({ id, scanned_at, bar_date, spy_price })

test('토요일 ET에 돌린 수동 스캔도 bar_date가 금요일이면 남는다', () => {
  // 2026-11-07(토) 15:00 ET = 20:00Z, 데이터 기준일은 11-06(금)
  const s = [스냅(1, '2026-11-07T20:00:00Z', '2026-11-06')]
  assert.deepEqual(tradingDaySnaps(s, 'us').map(x => x.id), [1])
})

test('주식은 bar_date가 주말이면 버린다', () => {
  const s = [스냅(1, '2026-11-08T20:00:00Z', '2026-11-08'), 스냅(2, '2026-11-07T20:00:00Z', '2026-11-07')]
  assert.deepEqual(tradingDaySnaps(s, 'us'), [])
  assert.deepEqual(tradingDaySnaps(s, 'kr'), [])
})

test('크립토는 24/7이라 주말 스냅샷도 남는다', () => {
  const s = [스냅(1, '2026-11-08T20:00:00Z', '2026-11-08'), 스냅(2, '2026-11-07T20:00:00Z', '2026-11-07')]
  assert.deepEqual(tradingDaySnaps(s, 'crypto').map(x => x.id), [1, 2])
})

test('같은 bar_date 스냅샷이 3개면 최신(앞) 1개만 남는다', () => {
  const s = [
    스냅(3, '2026-11-06T23:00:00Z', '2026-11-06'),
    스냅(2, '2026-11-06T22:00:00Z', '2026-11-06'),
    스냅(1, '2026-11-06T21:00:00Z', '2026-11-06'),
  ]
  assert.deepEqual(tradingDaySnaps(s, 'us').map(x => x.id), [3])
})

test('bar_date 없는 옛 스냅샷은 scanned_at의 뉴욕 날짜로 본다', () => {
  // 2026-11-07 03:00Z = 11-06(금) 22:00 ET — UTC 날짜(토)로 보면 주말로 잘못 버려진다
  const s = 스냅(1, '2026-11-07T03:00:00Z', null)
  assert.equal(snapDay(s), '2026-11-06')
  assert.deepEqual(tradingDaySnaps([s], 'us').map(x => x.id), [1])
})

test('spy_price가 없으면 버리고, 앞날과 같으면 휴장으로 보고 과거 쪽을 버린다', () => {
  const s = [
    스냅(4, '2026-11-12T21:00:00Z', '2026-11-12', 500),
    스냅(3, '2026-11-11T21:00:00Z', '2026-11-11', 500), // 휴장 — 값이 그대로
    스냅(2, '2026-11-10T21:00:00Z', '2026-11-10', null),
    스냅(1, '2026-11-09T21:00:00Z', '2026-11-09', 490),
  ]
  assert.deepEqual(tradingDaySnaps(s, 'us').map(x => x.id), [4, 1])
})
