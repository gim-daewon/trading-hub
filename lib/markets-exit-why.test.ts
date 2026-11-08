import { test } from 'node:test'
import assert from 'node:assert/strict'
import { exitMissingWhy } from './markets.ts'

test('손절가 없음 이유: ATR이 있는데 가격의 절반 이상이면 "ATR 미저장"이 아니다', () => {
  // 가격 10, ATR 6 → 손절 10 - 2×6 = -2. ATR은 저장돼 있다
  const why = exitMissingWhy(10, 6, 'us', 1e7)
  assert.ok(why)
  assert.doesNotMatch(why, /미저장/)
  assert.match(why, /변동성/)
})

test('손절가 없음 이유: ATR이 없으면 미저장, 유동성 부족이면 유동성, 가격이 없으면 null', () => {
  assert.match(exitMissingWhy(10, null, 'us', 1e7) ?? '', /ATR 미저장/)
  assert.match(exitMissingWhy(10, 1, 'us', 1) ?? '', /유동성 부족/)
  assert.equal(exitMissingWhy(null, 1, 'us', 1e7), null)
})
