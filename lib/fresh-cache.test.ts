import { test } from 'node:test'
import assert from 'node:assert/strict'
import { 신선캐시 } from './fresh-cache.ts'

// 2026-10-29: Next 데이터 캐시(revalidate)는 만료 뒤 첫 요청에 옛 값을 준다 — 섹터 화면 첫 방문에 9월 숫자가 떴다.
// 이 캐시는 기한이 지나면 옛 값을 절대 돌려주지 않는다.
test('기한 안에서는 저장값, 기한이 지나면 새로 받는다(옛 값을 주지 않는다)', async () => {
  let 시각 = 0, 부름 = 0
  const c = 신선캐시<number>(1000, () => 시각)
  const 받기 = async () => ++부름
  assert.equal(await c.가져오기('A', 받기), 1)
  시각 = 999
  assert.equal(await c.가져오기('A', 받기), 1)
  시각 = 1000
  assert.equal(await c.가져오기('A', 받기), 2, '기한이 지나면 새 값')
})

test('실패(null)는 저장하지 않는다 — 다음 요청이 다시 시도', async () => {
  let 부름 = 0
  const c = 신선캐시<number>(1000, () => 0)
  assert.equal(await c.가져오기('A', async () => { 부름++; return null }), null)
  assert.equal(await c.가져오기('A', async () => { 부름++; return 7 }), 7)
  assert.equal(부름, 2)
})

test('기호마다 따로 저장한다', async () => {
  const c = 신선캐시<string>(1000, () => 0)
  assert.equal(await c.가져오기('A', async () => 'a'), 'a')
  assert.equal(await c.가져오기('B', async () => 'b'), 'b')
  assert.equal(await c.가져오기('A', async () => 'x'), 'a')
})
