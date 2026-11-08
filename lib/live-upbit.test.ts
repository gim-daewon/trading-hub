import { test } from 'node:test'
import assert from 'node:assert/strict'
import { upbitQuote } from './live.ts'

test('업비트 시세: 등락률이 빠지면 0%로 채우지 않는다 — "변동 없음"과 "값 없음"이 섞인다', () => {
  assert.equal(upbitQuote({ market: 'KRW-BTC', trade_price: 100 }), null)
  assert.equal(upbitQuote({ market: 'KRW-BTC', trade_price: 100, signed_change_rate: null }), null)
})

test('업비트 시세: 정상 값은 %로 바꾸고, 가격이 없으면 null', () => {
  assert.deepEqual(upbitQuote({ market: 'KRW-BTC', trade_price: 100, signed_change_rate: -0.5 }), { price: 100, pct: -50 })
  assert.deepEqual(upbitQuote({ market: 'KRW-BTC', trade_price: 100, signed_change_rate: 0 }), { price: 100, pct: 0 })
  assert.equal(upbitQuote({ market: 'KRW-BTC', signed_change_rate: 0.01 }), null)
})
