import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyDayText } from './econ-calendar.ts'

test('불러오지 못한 날을 "일정 없음"으로 보이지 않는다', () => {
  // 주 전체를 못 받음(네트워크 오류·JSON 아님) — 고를 날 자체가 없다
  assert.ok(emptyDayText(undefined, undefined, 'all').includes('불러오지 못했다'))
  // 그날만 Nasdaq 응답 실패
  assert.ok(emptyDayText('2026-11-10', ['2026-11-10'], 'high').includes('불러오지 못했다'))
  // 받았는데 정말 비었음
  assert.equal(emptyDayText('2026-11-10', [], 'all'), '예정된 이벤트 없음')
  assert.equal(emptyDayText('2026-11-10', undefined, 'high'), '이날 주요 이벤트 없음')
})
