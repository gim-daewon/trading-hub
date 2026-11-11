/**
 * 스냅샷 행 읽기 — 다 못 읽으면 던진다(agent-trust-trading-hub.md 할 일 3 '조용한 실패', 2026-11-11).
 * 예전 두 복사본(tracking·screener route)은 오류 응답을 만나면 break로 멈추고 받은 데까지만 돌려줬다.
 * 그 결과가 스냅샷 id로 30일 캐시에 들어가므로(lib/snapshot-cache.ts) 반쪽이 한 달 굳는다.
 * 사용: npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fetchSnapshotRows, skipUnreadableLatest, POSTGREST_PAGE } from './snapshot-rows.ts'

const 머리 = { apikey: 'k' }
const 답 = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

/** 가짜 Supabase: 적힌 수(scanned_count)와 실제로 들어 있는 행 수를 따로 정한다 */
function 가짜(적힌수: number | null, 실제: number, 깨질오프셋 = -1) {
  const 부른주소: string[] = []
  const f = (async (input: RequestInfo | URL) => {
    const u = String(input)
    부른주소.push(u)
    if (u.includes('/screener_snapshots?')) return 답([{ scanned_count: 적힌수 }])
    const from = Number(new URL(u).searchParams.get('offset'))
    if (from === 깨질오프셋) return 답({ message: 'rate limit' }, 429)
    const n = Math.max(0, Math.min(POSTGREST_PAGE, 실제 - from))
    return 답(Array.from({ length: n }, (_, i) => ({ symbol: `S${from + i}` })))
  }) as typeof fetch
  return { f, 부른주소 }
}

test('여러 쪽을 끝까지 읽는다(1000 + 1000 + 124)', async () => {
  const { f, 부른주소 } = 가짜(2124, 2124)
  const rows = await fetchSnapshotRows<{ symbol: string }>('https://x', 머리, 7, 'symbol', f)
  assert.equal(rows.length, 2124)
  assert.equal(new Set(rows.map(r => r.symbol)).size, 2124, '같은 쪽이 되풀이됐다')
  assert.ok(부른주소.some(u => u.includes('snapshot_id=eq.7') && u.includes('select=symbol')))
})

test('둘째 쪽이 오류면 던진다 — 첫 쪽만 돌려주지 않는다', async () => {
  const { f } = 가짜(2124, 2124, 1000)
  await assert.rejects(fetchSnapshotRows('https://x', 머리, 7, 'symbol', f), /429/)
})

test('스캔이 행을 넣는 중이면(적힌 수보다 적으면) 던진다', async () => {
  const { f } = 가짜(2600, 1500)
  await assert.rejects(fetchSnapshotRows('https://x', 머리, 7, 'symbol', f), /1500.*2600/)
})

test('응답이 한 쪽 상한에 잘려도(1,000행) 던진다', async () => {
  const { f } = 가짜(2600, 1000)
  await assert.rejects(fetchSnapshotRows('https://x', 머리, 7, 'symbol', f), /1000.*2600/)
})

test('적힌 수가 없는 옛 스냅샷은 받은 대로 돌려준다', async () => {
  const { f } = 가짜(null, 300)
  assert.equal((await fetchSnapshotRows('https://x', 머리, 7, 'symbol', f)).length, 300)
})

test('스냅샷이 없으면 던진다', async () => {
  const f = (async () => 답([])) as typeof fetch
  await assert.rejects(fetchSnapshotRows('https://x', 머리, 7, 'symbol', f), /스냅샷 7/)
})

test('오류 글에 주소·열쇠가 실리지 않는다', async () => {
  const { f } = 가짜(2124, 2124, 0)
  await assert.rejects(fetchSnapshotRows('https://secret.example', { apikey: 'KEY123' }, 7, 'symbol', f),
    (e: Error) => !e.message.includes('secret.example') && !e.message.includes('KEY123'))
})

// 스캔이 행을 넣는 몇 초 동안 최신 스냅샷은 읽기가 던진다 — 그 사이에는 직전 스냅샷으로 답한다(2026-11-11 사용자 결정)
test('최신을 읽을 수 있으면 그대로 쓴다', async () => {
  const r = await skipUnreadableLatest([3, 2, 1], async () => {})
  assert.deepEqual(r, { snaps: [3, 2, 1], skipped: null })
})

test('최신을 못 읽으면 직전부터 쓰고 까닭을 돌려준다', async () => {
  const r = await skipUnreadableLatest([3, 2, 1], async id => { if (id === 3) throw new Error('행 수 불일치: 받은 500 / 적힌 2600') })
  assert.deepEqual(r.snaps, [2, 1])
  assert.match(r.skipped ?? '', /500.*2600/)
})

test('하나뿐인 스냅샷을 못 읽으면 던진다 — 빈 목록으로 조용히 넘어가지 않는다', async () => {
  await assert.rejects(skipUnreadableLatest([3], async () => { throw new Error('HTTP 500') }), /HTTP 500/)
})

test('추적 route가 최신 건너뛰기를 쓰고, 건너뛴 까닭을 응답에 싣는다', () => {
  const src = readFileSync(new URL('../app/api/tracking/route.ts', import.meta.url), 'utf8')
  assert.ok(src.includes('await skipUnreadableLatest('), 'skipUnreadableLatest를 안 쓴다')
  assert.ok(/note:[^\n]*skipped/.test(src), '건너뛴 까닭이 note에 안 실린다')
})

// 복사본이 다시 생기지 않게: 두 route는 행을 직접 받지 않고 이 함수를 쓴다
for (const 파일 of ['app/api/tracking/route.ts', 'app/api/screener/route.ts']) {
  test(`${파일}: 스냅샷 행은 fetchSnapshotRows로만 읽는다`, () => {
    const src = readFileSync(new URL(`../${파일}`, import.meta.url), 'utf8')
    assert.ok(src.includes('await fetchSnapshotRows<'), 'fetchSnapshotRows를 안 쓴다')
    assert.ok(!src.includes('rest/v1/screener_rows'), 'screener_rows를 직접 받는 줄이 남았다')
  })
}
