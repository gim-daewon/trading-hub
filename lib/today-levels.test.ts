import { test } from 'node:test'
import assert from 'node:assert/strict'
import { levelsWait } from './today.ts'

test('지지·저항: 받는 중이면 계산 중, 못 받았으면 멈추지 않고 못 받았다고 알린다', () => {
  assert.equal(levelsWait(0, { done: false, got: 0 }), null)                  // 예선 종목이 없으면 기다릴 것도 없다
  assert.match(levelsWait(5, { done: false, got: 0 }) ?? '', /계산 중/)
  assert.match(levelsWait(5, { done: true, got: 0 }) ?? '', /못 받/)        // 요청 실패·전부 실패 — 예전엔 '계산 중'에 멈췄다
  assert.equal(levelsWait(5, { done: true, got: 3 }), null)
})
