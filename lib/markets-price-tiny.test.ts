import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fmtPrice } from './markets.ts'

test('가격 표기: 1e-6 미만 코인(BTTC 등)도 지수 표기(6.20e-7) 없이 소수로 보인다', () => {
  assert.equal(fmtPrice(6.2e-7, 'crypto'), '0.000000620')
  assert.equal(fmtPrice(1.234e-8, 'crypto'), '0.0000000123')
  // 1e-6 이상은 원래 그대로
  assert.equal(fmtPrice(0.00001234, 'crypto'), '0.0000123')
})
