import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gather as gatherWith, checksFor, earningsSoon, rank, preselect, pickTop, PICK, type TodayRow, type TodayItem, type SignalLabels } from './today.ts'

// 실제 화면은 lib/screener-shared.ts의 CATS·BREAKOUTS·REBOUNDS를 넘긴다
const LABELS: SignalLabels = {
  cats: [{ key: 'quiet', label: '정체 구간' }, { key: 'pullback', label: '눌림목' }, { key: 'momentum', label: '모멘텀 매집' }],
  breakouts: [{ key: 'today', label: '오늘 돌파' }, { key: 'touchW', label: '강세눌림 밑꼬리 주봉' }, { key: 'brokeD', label: '강세 이탈(숏)' }],
  rebounds: [{ key: 'wick', label: '밑꼬리' }, { key: 'drop1', label: '1일 낙폭' }],
}
const gather = (p: Parameters<typeof gatherWith>[0], tiers: string[]) => gatherWith(p, tiers, LABELS)

const row = (symbol: string, o: Partial<TodayRow> = {}): TodayRow => ({
  symbol, name: symbol, sector: '', marketCap: 1e10, tier: 'large',
  price: 100, vwma20: 95, vwma60: 90, wClose: 100, wVwma20: 96, f20: 10, chg20: -3, pctB: 0.5, atr14: 3,
  ...o,
})

const payload = (o: Record<string, unknown> = {}) => ({
  categories: { large: { pullback: [row('A')], momentum: [row('A'), row('B')], quiet: [] } },
  breakouts: { large: { today: [row('C')], touchW: [row('D')], brokeD: [row('E')] } },
  rebound: { wick: { large: [row('F')] }, drop1: { large: [] } },
  ...o,
})

test('여러 신호 목록을 종목 하나로 모으고 신호 이름을 붙인다', () => {
  const g = gather(payload(), ['large'])
  const a = g.find(x => x.row.symbol === 'A')
  assert.deepEqual(a?.tags, ['눌림목', '모멘텀 매집'])
  assert.ok(g.find(x => x.row.symbol === 'C')?.tags.includes('오늘 돌파'))
  assert.ok(g.find(x => x.row.symbol === 'F')?.tags.includes('낙폭 반등(밑꼬리)'))
})

test('기각·숏 전용 신호(touchW, brokeD)는 후보에 넣지 않는다', () => {
  const g = gather(payload(), ['large'])
  assert.equal(g.find(x => x.row.symbol === 'D'), undefined)
  assert.equal(g.find(x => x.row.symbol === 'E'), undefined)
})

test('고르지 않은 시총 구간은 빠진다', () => {
  const p = payload({ categories: { micro: { pullback: [row('M', { tier: 'micro' })], momentum: [], quiet: [] } } })
  assert.equal(gather(p, ['large']).find(x => x.row.symbol === 'M'), undefined)
})

test('체크: 20일선·60일선 위, 정배열, 주봉 20선 위, 20일 수급 양수', () => {
  const c = checksFor(row('A'))
  assert.deepEqual(c.map(x => x.ok), [true, true, true, true, true])
  const bad = checksFor(row('B', { price: 80, vwma20: 90, vwma60: 95, wClose: 80, wVwma20: 90, f20: -5 }))
  assert.deepEqual(bad.map(x => x.ok), [false, false, false, false, false])
})

test('값이 없으면 통과도 실패도 아닌 null — 0으로 채우지 않는다', () => {
  const c = checksFor(row('A', { vwma60: null, wVwma20: null }))
  assert.equal(c[1].ok, null)
  assert.equal(c[2].ok, null)
  assert.equal(c[3].ok, null)
})

test('실적은 오늘부터 7달력일 안이면 걸린다, 지난 날은 안 걸린다', () => {
  const cal = { AAA: '2026-11-09', BBB: '2026-11-20', CCC: '2026-11-01' }
  assert.equal(earningsSoon('AAA', cal, '2026-11-03'), '2026-11-09')
  assert.equal(earningsSoon('BBB', cal, '2026-11-03'), null)
  assert.equal(earningsSoon('CCC', cal, '2026-11-03'), null)
})

test('정렬: 실적 임박은 맨 뒤, 그다음 신호 수, 그다음 체크 통과 수', () => {
  const items = [
    { row: row('X'), tags: ['눌림목'], checks: checksFor(row('X', { f20: -1 })), earnings: null },
    { row: row('Y'), tags: ['눌림목', '모멘텀 매집'], checks: checksFor(row('Y')), earnings: '2026-11-05' },
    { row: row('Z'), tags: ['눌림목'], checks: checksFor(row('Z')), earnings: null },
    { row: row('W'), tags: ['눌림목', '오늘 돌파'], checks: checksFor(row('W', { f20: -1 })), earnings: null },
  ]
  assert.deepEqual(rank(items).map(i => i.row.symbol), ['W', 'Z', 'X', 'Y'])
})

// ── 추천 10 ─────────────────────────────────────────────
const item = (symbol: string, o: Partial<TodayRow> = {}, extra: Partial<TodayItem> = {}): TodayItem => {
  const r = row(symbol, o)
  return { row: r, tags: ['눌림목'], checks: checksFor(r), earnings: null, ...extra }
}
const lv = (sup: number | null, res: number | null, price = 100) => ({
  support: sup == null ? null : { price: sup, pct: (sup / price - 1) * 100, ago: 10 },
  resistance: res == null ? null : { price: res, pct: (res / price - 1) * 100, ago: 10 },
})

test('예선: 정배열이고 20일선 위, 너무 멀리 가지 않았고, 실적 임박이 아닌 것만', () => {
  const pre = preselect([
    item('OK', { price: 100, vwma20: 98, vwma60: 90 }),
    item('FAR', { price: 120, vwma20: 100, vwma60: 90 }),          // 20일선 +20% — 추격
    item('BELOW', { price: 95, vwma20: 98, vwma60: 90 }),          // 20일선 아래
    item('REV', { price: 100, vwma20: 95, vwma60: 97 }),           // 역배열
    item('EARN', { price: 100, vwma20: 98, vwma60: 90 }, { earnings: '2026-11-05' }),
  ])
  assert.deepEqual(pre.map(i => i.row.symbol), ['OK'])
})

test('예선 정렬: 체크 통과 수 → 신호 수 → 20일선에 가까운 순', () => {
  const pre = preselect([
    item('FAR4', { price: 106, vwma20: 100, vwma60: 90 }),
    item('NEAR4', { price: 101, vwma20: 100, vwma60: 90 }),
    item('LOW3', { price: 101, vwma20: 100, vwma60: 90, f20: -3 }),
  ])
  assert.deepEqual(pre.map(i => i.row.symbol), ['NEAR4', 'FAR4', 'LOW3'])
})

test('본선: 저항이 코앞이면 빼고, 업종은 2개까지, 이유와 손익비를 붙인다', () => {
  const pre = [
    item('A', { sector: 'Tech' }), item('B', { sector: 'Tech' }), item('C', { sector: 'Tech' }),
    item('D', { sector: 'Energy' }), item('E', { sector: 'Energy' }),
  ]
  const levels = { A: lv(95, 115), B: lv(96, null), C: lv(95, 120), D: lv(95, 101), E: lv(97, 112) }
  const picks = pickTop(pre, levels)
  assert.deepEqual(picks.map(p => p.item.row.symbol), ['A', 'B', 'E'])   // C는 업종 3번째, D는 저항 +1%
  const a = picks[0]
  assert.equal(a.stop, 95)
  assert.equal(a.target, 115)
  assert.equal(a.rr, 3)                       // (115-100)/(100-95)
  assert.ok(a.reasons.some(s => s.includes('정배열')))
  assert.ok(picks[1].reasons.some(s => s.includes('신고가권')))
})

test('본선: 지지·저항을 아직 못 받은 종목은 고르지 않는다', () => {
  assert.equal(pickTop([item('A')], {}).length, 0)
})

test(`본선: 최대 ${PICK.count}개`, () => {
  const pre = Array.from({ length: 15 }, (_, i) => item(`S${i}`, { sector: `sec${i}` }))
  const levels = Object.fromEntries(pre.map(p => [p.row.symbol, lv(95, 115)]))
  assert.equal(pickTop(pre, levels).length, PICK.count)
})

test('본선: 손익비가 PICK.minRR보다 낮으면 뺀다, 신고가권(저항 없음)은 남긴다', () => {
  const pre = [item('LOW', { sector: 'a' }), item('HIGH', { sector: 'b' }), item('NEW', { sector: 'c' })]
  const picks = pickTop(pre, { LOW: lv(90, 105), HIGH: lv(95, 115), NEW: lv(95, null) })   // LOW 1:0.5
  assert.deepEqual(picks.map(p => p.item.row.symbol), ['HIGH', 'NEW'])
})

test('본선: 지지가 하루 변동폭(ATR)보다 가까우면 손절은 ATR만큼 아래', () => {
  const p = pickTop([item('T', { atr14: 3 })], { T: lv(99.6, null) })[0]
  assert.equal(p.stop, 97)
})

test('본선: 지지가 ATR 2배보다 멀면 손절은 ATR 2배 — 신고가권 목표는 2R', () => {
  const p = pickTop([item('T', { atr14: 3 })], { T: lv(80, null) })[0]
  assert.equal(p.stop, 94)
  assert.equal(p.target, 112)
  assert.equal(p.rr, 2)
})

test('본선: 손절폭은 최소 PICK.minStopPct — ATR이 아주 작아도 1% 안으로 붙이지 않는다', () => {
  const p = pickTop([item('T', { atr14: 0.3 })], { T: lv(99.6, null) })[0]
  assert.equal(p.stop, 100 - PICK.minStopPct)
})

test('본선: ATR이 없으면 손절폭을 정할 수 없어 고르지 않는다', () => {
  assert.equal(pickTop([item('T', { atr14: null })], { T: lv(95, 120) }).length, 0)
})

test('예선: 묶음 증권(Unit·Warrant·Rights)은 뺀다, LP의 Common Units는 남긴다', () => {
  const pre = preselect([
    item('BTSGU', {}, {}), item('PAA', {}, {}), item('WW', {}, {}),
  ].map((it, i) => ({ ...it, row: { ...it.row, name: ['BrightSpring Tangible Equity Unit', 'Plains All American Common Units representing LP', 'Foo Warrants'][i] } })))
  assert.deepEqual(pre.map(i => i.row.symbol), ['PAA'])
})
