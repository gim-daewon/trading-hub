import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nearestLevels, levelsFresh } from './levels.ts'

const bar = (c: number) => ({ c, h: c + 0.5, l: c - 0.5 })
// 100 → 120(고점) → 90(저점) → 110(고점) → 100(지금)
function path(): { c: number; h: number; l: number }[] {
  const pts = [[0, 100], [20, 120], [40, 90], [60, 110], [80, 100]]
  const out = []
  for (let k = 0; k < pts.length - 1; k++) {
    const [i0, p0] = pts[k], [i1, p1] = pts[k + 1]
    for (let i = i0; i < i1; i++) out.push(bar(p0 + (p1 - p0) * (i - i0) / (i1 - i0)))
  }
  out.push(bar(100))
  return out
}

test('위로는 가장 가까운 고점, 아래로는 가장 가까운 저점', () => {
  const lv = nearestLevels(path())
  assert.equal(lv.resistance?.price, 110.5)   // 120.5가 아니라 가까운 110.5
  assert.equal(lv.support?.price, 89.5)
  assert.equal(lv.resistance?.ago, 20)
  assert.ok(Math.abs(lv.resistance!.pct - 10.5) < 1e-9)
  assert.ok(Math.abs(lv.support!.pct - -10.5) < 1e-9)
})

test('오른쪽 봉이 모자라 확정 안 된 꼭짓점은 쓰지 않는다', () => {
  const b = path().slice(0, 63)                 // 110 고점 뒤 3봉뿐
  assert.equal(nearestLevels(b).resistance?.price, 120.5)
})

test('신고가 근처면 위 저항이 없다', () => {
  const b = Array.from({ length: 60 }, (_, i) => bar(100 + i))
  const lv = nearestLevels(b)
  assert.equal(lv.resistance, null)
})

test('봉이 너무 적으면 둘 다 없다', () => {
  const lv = nearestLevels([bar(1), bar(2)])
  assert.equal(lv.support, null)
  assert.equal(lv.resistance, null)
})

test('일봉 날짜가 스냅샷보다 5일 넘게 오래되면 쓰지 않는다', () => {
  assert.equal(levelsFresh('2026-11-02', '2026-11-03'), true)
  assert.equal(levelsFresh('2026-10-30', '2026-11-03'), true)    // 주말 끼면 4일 차이도 정상
  assert.equal(levelsFresh('2026-10-20', '2026-11-03'), false)
  assert.equal(levelsFresh(null, '2026-11-03'), false)
  assert.equal(levelsFresh('2026-11-02', null), true)             // 스냅샷 날짜를 모르면 막지 않는다
})
