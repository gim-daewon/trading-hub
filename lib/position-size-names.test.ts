import { test } from 'node:test'
import assert from 'node:assert/strict'
import { 포지션계산 } from './position-size.ts'

const 기본 = { 시드: 10000, 위험퍼: 1, 진입: 100, 손절: 99, 수수료퍼: 0, 목표R: 3 }

test('숫자가 아닌 칸은 화면에 보이는 이름으로 알린다(속 이름 위험퍼·수수료퍼를 내보이지 않는다)', () => {
  assert.throws(() => 포지션계산({ ...기본, 위험퍼: NaN }), /^Error: 1R = 시드의 %에 숫자가 아닌 값/)
  assert.throws(() => 포지션계산({ ...기본, 수수료퍼: NaN }), /^Error: 수수료\(한쪽 %\)에 숫자가 아닌 값/)
  assert.throws(() => 포지션계산({ ...기본, 목표R: NaN }), /^Error: 목표\(R\)에 숫자가 아닌 값/)
})
