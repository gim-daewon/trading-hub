/**
 * 신호 정의 시험 — 신호 이름이 말하는 뜻을 고정한다(agent-trust-trading-hub.md 할 일 1, 2026-11-11).
 * 사례는 사용자가 화면에서 찾아 신고한 6건의 fix 커밋에서 그대로 가져왔다(lib/screener-shared.ts match의 주석: FUBO·JEF·GAP).
 * 판정 함수 match는 내보내지 않으므로 화면·백테스트가 쓰는 buildBreakouts로 본다.
 * 사용: npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildBreakouts, type BreakoutKey, type ScreenerRow } from './screener-shared.ts'
import { hasInverse } from './inverse-etf.ts'
import { weeklyVwma, type Bar } from './flow.ts'

const 줄 = (symbol: string, o: Partial<ScreenerRow> = {}): ScreenerRow => ({
  symbol, name: symbol, sector: '', marketCap: 2e10, tier: 'large',
  f5: 0, f20: 0, f60: 0, rvol: 1, chg20: 0, pctB: 0.5, price: 100,
  ...o,
})
/** 이 종목이 그 신호 목록에 들었나 */
const 잡힘 = (r: ScreenerRow, key: BreakoutKey) => buildBreakouts([r], 'us').large[key].some(x => x.symbol === r.symbol)

// 주봉 역배열(60선이 20선 위): 20선 100, 60선 120
const 역배열 = { wVwma20: 100, wVwma60: 120 }
// 주봉 정배열: 20선 100, 60선 90
const 정배열 = { wVwma20: 100, wVwma60: 90 }

test('바닥잡기 주봉: 오래 아래 있다가 지난주 탈환한 것만(FUBO형 41주)', () => {
  assert.equal(잡힘(줄('FUBO', { ...역배열, wClose: 102, wAboveRun: 1, wPrevRun: 41 }), 'revW'), true)
})

test('바닥잡기 주봉: 1주만 아래였다 복귀한 것은 바닥이 아니다(JEF형)', () => {
  assert.equal(잡힘(줄('JEF', { ...역배열, wClose: 102, wAboveRun: 1, wPrevRun: 1 }), 'revW'), false)
  // 경계: 4주 이상(MIN_BELOW_W)
  assert.equal(잡힘(줄('B3', { ...역배열, wClose: 102, wAboveRun: 1, wPrevRun: 3 }), 'revW'), false)
  assert.equal(잡힘(줄('B4', { ...역배열, wClose: 102, wAboveRun: 1, wPrevRun: 4 }), 'revW'), true)
})

test('바닥잡기 주봉: 탈환했어도 선에서 3% 넘게 뜬 것은 뺀다(GAP형 +8.5%)', () => {
  assert.equal(잡힘(줄('GAP', { ...역배열, wClose: 108.5, wAboveRun: 1, wPrevRun: 10 }), 'revW'), false)
  assert.equal(잡힘(줄('OK3', { ...역배열, wClose: 103, wAboveRun: 1, wPrevRun: 10 }), 'revW'), true)
})

test('바닥잡기 주봉: 탈환한 지 2주째면 "막 탈환"이 아니다', () => {
  assert.equal(잡힘(줄('OLD', { ...역배열, wClose: 102, wAboveRun: 2, wPrevRun: 41 }), 'revW'), false)
})

test('강세눌림 주봉: 아래서 올라와 선에 닿은 것은 눌림이 아니다', () => {
  const 막돌파 = 줄('UP', { ...정배열, wClose: 100.5, wLow: 99, wAboveRun: 1, wPrevRun: 6 })
  assert.equal(잡힘(막돌파, 'nearW'), false)
  assert.equal(잡힘(막돌파, 'touchW'), false)
})

test('강세눌림 주봉: 위에 있다 내려와 선에 붙은 것은 잡는다(0~1% 위)', () => {
  const 눌림 = 줄('DOWN', { ...정배열, wClose: 100.5, wLow: 99, wAboveRun: 5, wPrevRun: 0 })
  assert.equal(잡힘(눌림, 'nearW'), true)
  assert.equal(잡힘(눌림, 'touchW'), true)
  // 1% 넘게 떠 있으면 접근이 아니고, 종가가 선 아래면 눌림이 아니라 이탈이다
  assert.equal(잡힘(줄('FAR', { ...정배열, wClose: 102, wLow: 101, wAboveRun: 5 }), 'nearW'), false)
  assert.equal(잡힘(줄('LOST', { ...정배열, wClose: 99.5, wLow: 98, wAboveRun: 5 }), 'nearW'), false)
  assert.equal(잡힘(줄('LOST', { ...정배열, wClose: 99.5, wLow: 98, wAboveRun: 5 }), 'touchW'), false)
})

test('강세 이탈(숏): 20선 아래면 며칠째든 잡되, 인버스 ETF가 있는 종목만', () => {
  const 이탈 = { price: 95, vwma20: 100, vwma60: 90, aboveRun: 0, prevRun: 15 }
  const 있는것 = ['NVDA', 'TSLA', 'AAPL', 'MSFT'].find(hasInverse)
  assert.ok(있는것, 'lib/inverse-etf.ts에 시험에 쓸 종목이 하나도 없다')
  assert.equal(잡힘(줄(있는것, 이탈), 'brokeD'), true)
  assert.equal(hasInverse('ZZZZ'), false)
  assert.equal(잡힘(줄('ZZZZ', 이탈), 'brokeD'), false)
  assert.equal(잡힘(줄(있는것, { ...이탈, price: 101 }), 'brokeD'), false)
})

// 주봉 구성: 진행 중인 주를 포함한다 — 그 주의 종가가 곧 현재가(lib/flow.ts weeklyVwma 머리말, 완료 주만 쓰면 신호가 열흘까지 묵었다)
test('주봉은 진행 중인 주를 포함하고 그 종가는 현재가다', () => {
  const 하루 = 86400
  const 월요일 = Date.UTC(2026, 0, 5) / 1000 // 2026-01-05는 월요일
  const bars: Bar[] = []
  const dates: number[] = []
  // 완료된 24주(월~금) + 진행 중인 주의 월·화
  for (let 주 = 0; 주 < 25; 주++) {
    for (let 요일 = 0; 요일 < (주 === 24 ? 2 : 5); 요일++) {
      bars.push({ c: 100 + 주, v: 1000, l: 99 + 주 })
      dates.push(월요일 + (주 * 7 + 요일) * 하루)
    }
  }
  bars[bars.length - 1].c = 777
  const w = weeklyVwma(bars, dates)
  assert.equal(w.wClose, 777)
  // 진행 중인 주의 저가는 그 주 일봉 저가의 최소
  assert.equal(w.wLow, 99 + 24)
})
