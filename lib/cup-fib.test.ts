import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scanCupFib, cupFibNow, cupWatchNear, CUP_FIB, type OHLC } from './cup-fib.ts'

// 꼭짓점 사이를 직선으로 이은 합성 차트. 고가·저가는 종가 ±0.3%
function series(points: [number, number][]): OHLC[] {
  const out: OHLC[] = []
  for (let k = 0; k < points.length - 1; k++) {
    const [i0, p0] = points[k], [i1, p1] = points[k + 1]
    for (let i = i0; i < i1; i++) {
      const c = p0 + (p1 - p0) * (i - i0) / (i1 - i0)
      out.push({ t: i, c, h: c * 1.003, l: c * 0.997 })
    }
  }
  const [iL, pL] = points.at(-1)!
  out.push({ t: iL, c: pL, h: pL * 1.003, l: pL * 0.997 })
  return out
}

// 영상 숫자 그대로: 테두리 1247.9, 바닥 992.5, 돌파 고점 ~1325, 0.5 되돌림(1120.2) 아래까지
const VIDEO: [number, number][] = [
  [0, 1000], [30, 1247.9], [55, 1120], [62, 1160], [80, 992.5], [100, 1120], [108, 1100],
  [130, 1240], [133, 1320], [136, 1300], [140, 1230], [150, 1112], [152, 1118], [154, 1140], [200, 1600],
]

test('영상 모양이면 C(돌파 실패 + Fib 반등) 매매가 하나 나오고 목표에 닿는다', () => {
  const trades = scanCupFib(series(VIDEO), CUP_FIB).filter(t => t.strategy === 'C')
  assert.equal(trades.length, 1)
  const c = trades[0]
  assert.ok(Math.abs(c.rim - 1247.9) < 5, `테두리 ${c.rim}`)
  assert.ok(Math.abs(c.bottom - 992.5 * 0.997) < 5, `바닥 ${c.bottom}`)
  // 손절 = 테두리 - 0.7 × 깊이 (영상 1,070.2)
  assert.ok(Math.abs(c.stop - (c.rim - 0.7 * (c.rim - c.bottom))) < 1e-6)
  assert.ok(c.entryPrice > c.stop && c.entryPrice < c.rim)
  assert.equal(c.exit, 'target')
  assert.ok(c.r > 2, `R ${c.r}`)
})

test('B는 실패 봉에서, A는 테두리 위 종가에서 들어간다', () => {
  const t = scanCupFib(series(VIDEO), CUP_FIB)
  const a = t.find(x => x.strategy === 'A')!, b = t.find(x => x.strategy === 'B')!
  assert.ok(a && b)
  assert.ok(a.entryPrice > a.rim)
  assert.ok(b.entryPrice < b.rim)
  assert.ok(a.entryIndex < b.entryIndex)
})

test('반등 전에 손절선 아래로 내려가면 C는 없다', () => {
  const deep = VIDEO.map(([i, p]) => [i, i === 150 ? 1040 : p] as [number, number])
  assert.equal(scanCupFib(series(deep), CUP_FIB).filter(t => t.strategy === 'C').length, 0)
})

test('되돌림 전에 돌파 고점을 넘으면(진짜 돌파) C는 없다', () => {
  const real: [number, number][] = [...VIDEO.slice(0, 10), [138, 1230], [142, 1400], [200, 1500]]
  assert.equal(scanCupFib(series(real), CUP_FIB).filter(t => t.strategy === 'C').length, 0)
})

test('바닥 없이 오르기만 하면 아무것도 없다', () => {
  assert.equal(scanCupFib(series([[0, 100], [200, 300]]), CUP_FIB).length, 0)
})

test('미래 봉을 보지 않는다: 잘라낸 차트에서도 같은 진입이 같은 값으로 나온다', () => {
  const full = series(VIDEO)
  const all = scanCupFib(full, CUP_FIB)
  for (let n = 100; n < full.length; n += 3) {
    const cut = scanCupFib(full.slice(0, n), CUP_FIB)
    for (const t of all.filter(x => x.entryIndex < n)) {
      const same = cut.find(x => x.strategy === t.strategy && x.entryIndex === t.entryIndex)
      assert.ok(same, `잘라낸 길이 ${n}에서 ${t.strategy} 진입 ${t.entryIndex}가 사라짐`)
      assert.equal(same.entryPrice, t.entryPrice)
      assert.equal(same.stop, t.stop)
    }
  }
})

test('손절 없음 변형은 손절로 나가지 않는다', () => {
  const t = scanCupFib(series(VIDEO), { ...CUP_FIB, useStop: false })
  assert.ok(t.every(x => x.exit !== 'stop'))
})

// ---- 지금 상태(메뉴용)
test('진입 봉 바로 뒤에서 자르면 지금 상태는 진입 신호', () => {
  const full = series(VIDEO)
  const c = scanCupFib(full, CUP_FIB).find(t => t.strategy === 'C')!
  const now = cupFibNow(full.slice(0, c.entryIndex + 2), CUP_FIB)
  assert.equal(now?.stage, 'entry')
  assert.equal(now?.ago, 1)
  assert.equal(now?.entry, c.entryPrice)
  assert.equal(now?.stop, c.stop)
  assert.ok(now!.rr > 2)
})

test('돌파 실패 뒤 되돌림 전이면 진입 준비', () => {
  const full = series(VIDEO)
  const now = cupFibNow(full.slice(0, 143), CUP_FIB)   // 140에 테두리 아래 종가, 150에 0.5 닿음
  assert.equal(now?.stage, 'watch')
  assert.ok(Math.abs(now!.entry - (now!.rim - 0.5 * (now!.rim - now!.bottom))) < 1e-9)
  assert.equal(now?.touched, false)
})

test('진입 뒤 3봉이 넘었거나 매매가 끝났으면 없다', () => {
  const full = series(VIDEO)
  const c = scanCupFib(full, CUP_FIB).find(t => t.strategy === 'C')!
  assert.equal(cupFibNow(full.slice(0, c.entryIndex + 5), CUP_FIB), null)
  assert.equal(cupFibNow(full, CUP_FIB), null)          // 목표 도달로 끝남
})

test('패턴이 없으면 지금 상태도 없다', () => {
  assert.equal(cupFibNow(series([[0, 100], [200, 300]]), CUP_FIB), null)
})

test('진입 준비는 0.5에 닿았거나 5% 안으로 가까운 것만 보여 준다', () => {
  const base = { stage: 'watch' as const, rim: 120, bottom: 80, stop: 92, target: 150, entry: 100, ago: 2, rr: 6 }
  assert.equal(cupWatchNear({ ...base, touched: true }, 130), true)
  assert.equal(cupWatchNear({ ...base, touched: false }, 104.9), true)
  assert.equal(cupWatchNear({ ...base, touched: false }, 106), false)
  assert.equal(cupWatchNear({ ...base, stage: 'entry', touched: true }, 130), false)
})
