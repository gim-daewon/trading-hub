/**
 * 평균·중앙값·손익비 — 숫자가 아니면 0(agent-trust-trading-hub.md 할 일 2, 2026-11-15).
 * NaN·Infinity는 JSON에서 null이 되어 화면을 통째로 죽인다(29d5d64 mean([]) NaN, 1537d73 손실 평균 0 → Infinity).
 * 사용: npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mean, median, rrOf } from './stats.ts'

test('평균: 보통 값', () => {
  assert.equal(mean([1, 2, 3, 6]), 3)
})

test('평균: 빈 배열은 NaN이 아니라 0', () => {
  assert.equal(mean([]), 0)
})

test('평균: Infinity가 섞이면 0', () => {
  assert.equal(mean([1, Infinity]), 0)
})

test('중앙값: 홀수·짝수 개수', () => {
  assert.equal(median([5, 1, 3]), 3)
  assert.equal(median([4, 1, 3, 2]), 2.5)
})

test('중앙값: 입력 배열 순서를 바꾸지 않는다', () => {
  const a = [3, 1, 2]
  median(a)
  assert.deepEqual(a, [3, 1, 2])
})

test('중앙값: 빈 배열은 0', () => {
  assert.equal(median([]), 0)
})

test('손익비: 오른 평균 / |내린 평균|', () => {
  assert.equal(rrOf([4, 2], [-1, -2]), 2)
})

test('손익비: 오른 것이 0개면 0 (29d5d64 재현)', () => {
  assert.equal(rrOf([], [-1]), 0)
})

test('손익비: 손실 평균이 정확히 0이면 Infinity가 아니라 0 (1537d73 재현 — 크립토 revD 10승 1무)', () => {
  assert.equal(rrOf([3, 5], [0]), 0)
})

test('손익비: 내린 것이 0개면 0', () => {
  assert.equal(rrOf([1], []), 0)
})
