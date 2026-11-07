import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fmtPrice } from './markets.ts'

test('가격 표기: 10 미만은 유효숫자 3자리 — 정수로 끊으면 손절 2.63과 진입 3.12가 둘 다 "3"이 된다', () => {
  assert.equal(fmtPrice(2.634, 'crypto'), '2.63')
  assert.equal(fmtPrice(3.12, 'us'), '3.12')
  assert.equal(fmtPrice(9.87, 'us'), '9.87')
  assert.notEqual(fmtPrice(2.63, 'crypto'), fmtPrice(3.12, 'crypto'))
})

test('가격 표기: 10 이상은 정수, 1 미만은 그대로 유효숫자 3자리', () => {
  assert.equal(fmtPrice(45.67, 'us'), '46')
  assert.equal(fmtPrice(0.09005, 'crypto'), '0.0901')
  assert.equal(fmtPrice(null, 'us'), '—')
})
