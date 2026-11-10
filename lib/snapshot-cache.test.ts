/**
 * 스냅샷 id로 묶인 캐시는 길게 — 내용이 변하지 않는 자료를 매일 Supabase에서 다시 받지 않게(2026-11-10).
 * 하루 만료면 추적 화면이 시장마다 스냅샷 최대 90개(약 2,600행씩)를 날마다 다시 받는다 — 무료 전송량(월 5GB)을 넘길 규모였다.
 * 보관 수(scan.mjs KEEP_SNAPSHOTS=90)는 줄이지 않는다: 추적 화면이 60거래일 구간·1일 누적에 90개를 다 쓴다.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SNAPSHOT_CACHE_SECONDS } from './snapshot-cache.ts'

const 읽기 = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

/** unstable_cache(…, ['키'], { revalidate: X }) 에서 키 바로 뒤 revalidate 값 글 */
const 만료글 = (src: string, 키: string) =>
  src.match(new RegExp(`\\['${키}'\\][^\\n]*\\n?\\s*(?://[^\\n]*\\n\\s*)*\\{\\s*revalidate:\\s*([^\\s}]+)`))?.[1]

test('스냅샷 캐시 기간은 30일 이상', () => {
  assert.ok(SNAPSHOT_CACHE_SECONDS >= 30 * 86400)
})

// 2026-11-10 Pro 전환 뒤에도 추적 API가 매번 'Task timed out after 60 seconds'(vercel logs) — 빈 캐시에서 스냅샷 최대 90개를 받는다.
// 한 번 끝까지 돌아야 30일 캐시가 채워진다. Pro 최대 800초, 300초면 넉넉하다
test('추적 API 제한 시간은 300초 이상', () => {
  const m = 읽기('app/api/tracking/route.ts').match(/export const maxDuration = (\d+)/)
  assert.ok(m && Number(m[1]) >= 300, `maxDuration ${m?.[1]}`)
})

for (const [파일, 키] of [
  ['app/api/tracking/route.ts', 'tracking-rows'],
  ['app/api/tracking/route.ts', 'tracking-daily-pair-v2'],
  ['app/api/screener/route.ts', 'screener-rows'],
] as const) {
  test(`${키}: 스냅샷 id로 묶인 캐시가 SNAPSHOT_CACHE_SECONDS를 쓴다`, () => {
    assert.equal(만료글(읽기(파일), 키), 'SNAPSHOT_CACHE_SECONDS', `${파일}의 ['${키}'] 만료가 상수가 아니다`)
  })
}
