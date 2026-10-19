// AI 신용 모니터 계산 시험 — node --test lib/credit.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { 수익률, 고점대비, 맞추기, 평균상관, 백분위, 단계판정, 기준, 단계제목, 단계행동, 신용한줄 } from './credit.ts'

const 일 = 86400000
const 줄 = (값들: number[], 시작 = 0) => 값들.map((c, i) => ({ t: (시작 + i) * 일, c }))

test('수익률·고점 대비', () => {
  assert.ok(Math.abs(수익률([100, 110, 121], 2)! - 0.21) < 1e-12)
  assert.equal(수익률([100], 5), null)
  assert.ok(Math.abs(고점대비([100, 200, 150], 252)! - -0.25) < 1e-12)
})

test('날짜 맞추기: 모두 있는 날만, 순서 유지', () => {
  const a = 줄([1, 2, 3, 4], 0), b = 줄([10, 20, 30], 1)
  const m = 맞추기([a, b])
  assert.deepEqual(m.날짜, [1 * 일, 2 * 일, 3 * 일])
  assert.deepEqual(m.종가, [[2, 3, 4], [10, 20, 30]])
})

test('평균 상관: 같이 움직이면 1에 가깝고, 반대로 움직이면 음수', () => {
  const 기본 = Array.from({ length: 40 }, (_, i) => 100 * (1 + 0.01 * Math.sin(i)) ** i)
  const 같이 = 기본.map(x => x * 2)
  const 반대 = 기본.map((x, i) => (i ? 10000 / x : 100))
  assert.ok(평균상관([기본, 같이], 30)! > 0.99)
  assert.ok(평균상관([기본, 반대], 30)! < -0.9)
  assert.equal(평균상관([[1, 2], [1, 2]], 30), null)
})

test('백분위: 과거 값 중 이 값 이하의 비율', () => {
  assert.equal(백분위(5, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 0.5)
  assert.equal(백분위(0, [1, 2, 3]), 0)
})

test('단계: 앞 단계가 켜져야 다음 단계 — 칩만 약하면 역류가 아니다', () => {
  const 평온 = { crwv20: 0.05, orclRel20: 0.01, nvdaRel20: 0, avgoRel20: 0, 신용백분위: 0.5 }
  assert.equal(단계판정(평온).단계, 0)
  const 일단계 = { ...평온, crwv20: 기준.코어위브20일 - 0.01 }
  assert.equal(단계판정(일단계).단계, 1)
  const 이단계 = { ...일단계, orclRel20: 기준.오라클상대20일 - 0.01 }
  assert.equal(단계판정(이단계).단계, 2)
  const 삼단계 = { ...이단계, avgoRel20: 기준.칩상대20일 - 0.01 }
  assert.equal(단계판정(삼단계).단계, 3)
  const 사단계 = { ...삼단계, 신용백분위: 기준.신용스트레스백분위 - 0.01 }
  assert.equal(단계판정(사단계).단계, 4)
  // 코어위브는 멀쩡한데 칩만 약하다 — 단계 0, 대신 조건별 표시에는 남는다
  const 칩만 = { ...평온, nvdaRel20: -0.3 }
  const r = 단계판정(칩만)
  assert.equal(r.단계, 0)
  assert.equal(r.조건.find(x => x.단계 === 3)?.켜짐, true)
})

// 2026-10-19 첫 실측: CRWV 20일 -24.5%(기준 -25%), HYG/IEF 하위 11.9%(기준 10%) — 기준 바로 앞인데 '평온'으로 보였다.
// 기준은 바꾸지 않고(결과 보고 기준을 고치면 미리 정한 뜻이 없다) '근접' 표시만 — 단계 판정에는 넣지 않는다
test('근접: 기준의 90% 이상 왔으면 근접 — 단계에는 안 셈', () => {
  const r = 단계판정({ crwv20: -0.245, orclRel20: -0.115, nvdaRel20: -0.02, avgoRel20: -0.065, 신용백분위: 0.119 })
  assert.equal(r.단계, 0)
  const c = (n: number) => r.조건.find(x => x.단계 === n)!
  assert.equal(c(1).근접, true)
  assert.equal(c(2).근접, false) // 이미 켜짐
  assert.equal(c(3).근접, false) // -6.5%는 기준 -10%의 65%
  assert.equal(c(4).근접, true) // 신용은 백분위라 따로: 하위 15% 안이면 근접(기준 10%)
  assert.equal(단계판정({ crwv20: -0.2, orclRel20: 0, nvdaRel20: 0, avgoRel20: 0, 신용백분위: 0.2 }).조건.find(x => x.단계 === 1)!.근접, false) // -20%는 기준의 80%
})

test('단계: 값이 없으면(데이터 실패) 그 단계는 꺼짐으로, 이유에 적는다', () => {
  const r = 단계판정({ crwv20: null, orclRel20: null, nvdaRel20: null, avgoRel20: null, 신용백분위: null })
  assert.equal(r.단계, 0)
  assert.ok(r.조건.every(x => !x.켜짐 && /데이터 없음/.test(x.근거)))
})

const 경계예 = { crwv20: -0.245, orclRel20: -0.115, nvdaRel20: -0.02, avgoRel20: -0.065, 신용백분위: 0.119 }

test('단계 제목: 0단계라도 켜짐·근접이 있으면 평온이라 쓰지 않는다', () => {
  assert.equal(단계제목(단계판정({ crwv20: 0.05, orclRel20: 0.01, nvdaRel20: 0, avgoRel20: 0, 신용백분위: 0.5 })), '평온 — 번진 곳 없음')
  assert.equal(단계제목(단계판정(경계예)), '0단계 · 경계 신호 3개')
})

test('단계 행동: 단계마다 하나, 확정 전 기본값이라는 표시가 붙어 있다', () => {
  assert.equal(단계행동.단계.length, 5)
  assert.ok(단계행동.경계.length > 0)
  assert.match(단계행동.표시, /확정 전 기본값/)
})

test('아침 알림 한 줄: 켜짐·근접만 적고, 단계가 바뀐 날에만 표시', () => {
  const 경계 = 단계판정(경계예)
  const 같음 = 신용한줄(경계, 경계)
  assert.match(같음, /^AI 신용: 0단계 · 경계 신호 3개 \(◐코어위브 ●오라클 ◐신용\)/)
  assert.doesNotMatch(같음, /바뀜/)
  const 이단계 = 단계판정({ ...경계예, crwv20: -0.3 })
  const 바뀜 = 신용한줄(이단계, 경계)
  assert.match(바뀜, /단계 바뀜: 0 → 2/)
  assert.ok(바뀜.includes(단계행동.단계[2]))
  // 어제를 못 구했으면 바뀜 표시를 하지 않는다(모르는 걸 바뀌었다고 하지 않음)
  assert.doesNotMatch(신용한줄(이단계, null), /바뀜/)
})
