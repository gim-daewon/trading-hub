import { test } from 'node:test'
import assert from 'node:assert/strict'
import { failedNote } from './paper.ts'

test('시세를 못 받은 종목이 있으면 계좌가 틀릴 수 있다고 알린다', () => {
  assert.equal(failedNote(0), null)
  assert.equal(failedNote(undefined), null)
  const n = failedNote(3)
  assert.ok(n && n.includes('3종목'))
})
