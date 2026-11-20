/**
 * 낙폭 반등 화면이 목록이 비었을 때 까닭을 맞게 알리는지(2026-11-21 밤작업).
 * 예전에는 '1일 낙폭' 탭이 비면 늘 "chg1 컬럼이 아직 없다"고 떴다. d7cd0b4로 chg1이 실리면서
 * 컬럼은 있는데 조건(전일 대비 하락 + 유동성)에 맞는 종목이 없어 비는 날이 생겼다 — 그날도
 * "SQL 실행 + 다음 스캔"을 하라고 틀리게 안내했다. 스크리너 API의 hasVwma와 같은 구분이다.
 * 사용: npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { reboundColumns, reboundEmptyNote, REBOUND_EMPTY } from './rebound-empty.ts'

test('컬럼이 채워진 행이 하나라도 있으면 그 탭은 컬럼이 있다', () => {
  const has = reboundColumns([{ low: null, chg1: null }, { low: 10, chg1: -1 }])
  assert.deepEqual(has, { wick: true, drop1: true })
})

test('chg1이 한 행도 없으면 1일 낙폭만 컬럼 없음', () => {
  const has = reboundColumns([{ low: 10 }, { low: 9, chg1: null }])
  assert.deepEqual(has, { wick: true, drop1: false })
})

test('행이 없으면 둘 다 컬럼 없음', () => {
  assert.deepEqual(reboundColumns([]), { wick: false, drop1: false })
})

test('컬럼이 있는데 비면 "조건에 맞는 종목이 없다" — SQL·스캔 안내를 하지 않는다', () => {
  const note = reboundEmptyNote('drop1', true)
  assert.equal(note, REBOUND_EMPTY.noMatch.drop1)
  assert.doesNotMatch(note, /SQL|컬럼/)
})

test('컬럼이 없으면 예전 안내 그대로', () => {
  assert.equal(reboundEmptyNote('drop1', false), REBOUND_EMPTY.noColumn.drop1)
  assert.equal(reboundEmptyNote('wick', false), REBOUND_EMPTY.noColumn.wick)
})

test('API가 구분 값을 안 주면(옛 응답) 컬럼 없음 안내로 둔다', () => {
  assert.equal(reboundEmptyNote('wick', undefined), REBOUND_EMPTY.noColumn.wick)
})

test('스크리너 API가 reboundHas를 싣고, 화면이 그것으로 문구를 고른다', () => {
  const route = readFileSync(new URL('../app/api/screener/route.ts', import.meta.url), 'utf8')
  const page = readFileSync(new URL('../app/rebound/page.tsx', import.meta.url), 'utf8')
  assert.match(route, /reboundHas:\s*reboundColumns\(rows\)/)
  assert.match(page, /reboundEmptyNote\(tab,\s*data\.reboundHas\?\.\[tab\]\)/)
  assert.doesNotMatch(page, /컬럼이 아직 없다/)
})
