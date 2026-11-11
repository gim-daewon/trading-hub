/**
 * 스냅샷 한 개의 행을 끝까지 읽는다 — 다 못 읽으면 던진다(2026-11-11).
 *
 * 예전에는 tracking·screener route가 같은 읽기를 따로 들고 있었고, 둘 다 오류 응답을 만나면
 * break로 멈춰 받은 데까지만 돌려줬다. 그 결과는 스냅샷 id로 30일 캐시된다(lib/snapshot-cache.ts) —
 * Supabase가 한 번 흔들리거나, 스캔이 행을 넣는 몇 초 사이에 요청이 오면 반쪽이 한 달 굳는다
 * (scan.mjs는 스냅샷을 먼저 넣고 행을 500개씩 나눠 넣는다).
 * 던지면 unstable_cache가 저장하지 않으므로 다음 요청이 다시 읽는다.
 *
 * 대조 기준은 스냅샷의 scanned_count다(scan.mjs가 넣을 행 수를 적는다).
 * 2026-11-11 운영 대조: 스냅샷 177개 중 176개 일치, 나머지 하나는 행 0개인 한국 id 19
 * (같은 날 더 늦은 스냅샷에 밀려 화면이 읽지 않는다).
 */

/**
 * 한 번에 받는 행 수. Supabase PostgREST 응답 상한(1,000)과 같다.
 * 실측(route 주석): offset 0/1000/2000 + limit 1000 → 1000 + 1000 + 124
 */
export const POSTGREST_PAGE = 1000
/** 스냅샷 하나의 행 상한 — 예전 두 route의 반복 상한 그대로. 지금 최대는 미국 약 2,700 */
const MAX_ROWS = 10_000

/**
 * 최신 스냅샷을 못 읽으면 직전 스냅샷부터 쓴다(2026-11-11 사용자 결정).
 *
 * 스캔이 행을 넣는 몇 초 동안 최신 스냅샷은 fetchSnapshotRows가 던진다. 그 사이 화면이 오류 대신
 * 어제까지의 성적을 보이게 한다. 건너뛴 까닭(skipped)은 부르는 쪽이 응답에 실어야 한다 —
 * 말없이 옛 자료를 내면 그것이 또 조용한 실패다.
 * snaps는 최신이 맨 앞. 하나뿐이면 물러설 곳이 없으므로 그대로 던진다.
 */
export async function skipUnreadableLatest<S>(
  snaps: S[],
  read: (latest: S) => Promise<unknown>,
): Promise<{ snaps: S[]; skipped: string | null }> {
  try {
    await read(snaps[0])
    return { snaps, skipped: null }
  } catch (e) {
    if (snaps.length < 2) throw e
    return { snaps: snaps.slice(1), skipped: e instanceof Error ? e.message : String(e) }
  }
}

export async function fetchSnapshotRows<T>(
  url: string,
  headers: Record<string, string>,
  snapshotId: number,
  select: string,
  fetchImpl: typeof fetch = fetch,
): Promise<T[]> {
  // 오류 글에는 상태 코드와 위치만 싣는다. 주소·열쇠는 싣지 않는다 — route가 이 글을 응답에 그대로 담는다
  const metaRes = await fetchImpl(
    `${url}/rest/v1/screener_snapshots?select=scanned_count&id=eq.${snapshotId}`,
    { headers, cache: 'no-store' },
  )
  if (!metaRes.ok) throw new Error(`스냅샷 ${snapshotId} 조회 실패: HTTP ${metaRes.status}`)
  const meta: unknown = await metaRes.json()
  if (!Array.isArray(meta) || meta.length === 0) throw new Error(`스냅샷 ${snapshotId}이 없다`)
  const expected: number | null = meta[0].scanned_count ?? null

  // PostgREST 페이징: offset+limit 쿼리 파라미터만 쓴다.
  //
  // Range 헤더는 쓰지 않는다. 두 가지 문제가 겹친다:
  //  1) offset과 같이 주면 결과가 깨진다 (offset=1000 + Range 0-999 -> 4행)
  //  2) Next의 fetch 캐시는 URL로만 중복 제거해서, 헤더만 다른 요청이
  //     같은 응답으로 합쳐진다 -> 1페이지가 반복돼 중복 행이 쌓인다
  const rows: T[] = []
  for (let from = 0; from < MAX_ROWS; from += POSTGREST_PAGE) {
    const res = await fetchImpl(
      `${url}/rest/v1/screener_rows?select=${select}&snapshot_id=eq.${snapshotId}` +
      `&order=id.asc&offset=${from}&limit=${POSTGREST_PAGE}`,
      // 부르는 쪽의 unstable_cache가 결과를 잡는다. 이중 캐시는 무효화만 헷갈린다
      { headers, cache: 'no-store' },
    )
    if (!res.ok) throw new Error(`스냅샷 ${snapshotId} 행 읽기 실패: HTTP ${res.status} (offset ${from})`)
    const page: unknown = await res.json()
    if (!Array.isArray(page)) throw new Error(`스냅샷 ${snapshotId} 행 읽기 실패: 배열이 아닌 응답 (offset ${from})`)
    rows.push(...page)
    if (page.length < POSTGREST_PAGE) break
  }
  if (expected != null && rows.length !== expected) {
    throw new Error(`스냅샷 ${snapshotId} 행 수 불일치: 받은 ${rows.length} / 적힌 ${expected}`)
  }
  return rows
}
