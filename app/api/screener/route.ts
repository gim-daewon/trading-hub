import { NextResponse } from 'next/server'
import { fetchBars, fetchDatedBars, computeFlow, mapLimit } from '@/lib/flow'
import {
  TIERS, tierOf, TIER_EVIDENCE, CAVEATS, buildCategories,
  buildBreakouts, BREAKOUT_EVIDENCE,
  type Regime, type TierId, type CatKey, type ScreenerRow,
} from '@/lib/screener-shared'

// 수급 스크리너.
//
// 중요: 이건 "추천"이 아니다. 자체 백테스트(2년, 룩어헤드 배제) 결과
// 순자금 지표의 예측력은 국면·시총 구간에 따라 정반대로 갈렸다.
// 그래서 단일 랭킹 대신 신호 카테고리 × 시총 구간으로 나누고,
// 각 조합에 실제 측정된 성과를 그대로 붙여 내보낸다. UI가 이를 표시한다.

// 스냅샷 읽기는 1~2초라 오래 캐시할 이유가 없다. 12시간으로 잡았더니
// 스캔이 끝나도 최대 12시간 동안 옛 응답이 나갔다.
// 라이브 스캔 폴백(7초)은 스냅샷이 없을 때만 도는 예외 경로다.
/**
 * 라우트를 동적으로 둔다.
 *
 * 스냅샷 메타를 캐시하면 새 스캔이 돌아도 앱이 옛 id를 물고 있어
 * 갱신이 영영 안 온다(실측: 스캔 40분 뒤에도 이전 스냅샷 표시).
 * 그래서 메타는 no-store로 매번 확인하고,
 * 무거운 행 조회는 URL에 snapshot_id가 들어가 있어 12시간 캐시해도 안전하다 —
 * 스냅샷이 바뀌면 URL이 바뀌어 자동으로 새로 받는다.
 */
export const dynamic = 'force-dynamic'

const NASDAQ_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Origin': 'https://www.nasdaq.com',
  'Referer': 'https://www.nasdaq.com/',
}

// 라이브 스캔은 Vercel 10초 제한 안에 들어와야 한다 (실측 705종목 ≈ 6.7초).
// 넓은 유니버스(2,700종목)는 GitHub Actions 스냅샷이 담당한다.
const LIVE_MIN_DOLLAR_VOL = 1e8
const LIVE_MIN_MARKET_CAP = 1e10

const toNum = (s: unknown) => parseFloat(String(s).replace(/[$,%]/g, '')) || 0

async function universe() {
  const res = await fetch(
    'https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=25&offset=0&download=true',
    { headers: NASDAQ_HEADERS, next: { revalidate: 43200 } }
  )
  if (!res.ok) throw new Error(`nasdaq screener ${res.status}`)
  const rows = (await res.json())?.data?.rows ?? []

  type Row = { symbol: string; name: string; sector: string; lastsale: string; volume: string; marketCap: string }
  return (rows as Row[])
    .map(r => ({
      symbol: r.symbol,
      name: r.name,
      sector: r.sector || '',
      marketCap: toNum(r.marketCap),
      dollarVol: toNum(r.lastsale) * toNum(r.volume),
    }))
    // 우선주·워런트·유닛(. ^ 포함)을 제외한 보통주만
    .filter(r => /^[A-Z]{1,5}$/.test(r.symbol) && r.dollarVol >= LIVE_MIN_DOLLAR_VOL && r.marketCap >= LIVE_MIN_MARKET_CAP)
    .map(({ symbol, name, sector, marketCap }) => ({ symbol, name, sector, marketCap }))
}

/** SPY 20일 등락으로 시장 국면 판정 */
async function marketRegime(): Promise<{ regime: Regime; spyChg20: number | null }> {
  const bars = await fetchBars('SPY')
  if (!bars || bars.length < 21) return { regime: 'up', spyChg20: null }
  const c0 = bars[bars.length - 21].c
  const cN = bars[bars.length - 1].c
  const chg = ((cN - c0) / c0) * 100
  return { regime: chg >= 0 ? 'up' : 'down', spyChg20: chg }
}

/** GitHub Actions가 저장한 스냅샷. 없으면 null → 호출부가 라이브 스캔으로 폴백 */
async function fromSupabase() {
  // 대시보드가 REST 엔드포인트(.../rest/v1/)만 보여주는 경우가 있어 정규화한다
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
    .replace(/\/+$/, '').replace(/\/rest\/v1$/, '')
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim()
  if (!url || !key) return null

  try {
    const headers = { apikey: key, Authorization: `Bearer ${key}` }
    // 스냅샷 메타 조회는 캐시하지 않는다.
    //
    // 이걸 캐시하면 새 스캔이 돌아도 앱이 옛 스냅샷 id를 계속 들고 있어
    // 갱신이 영영 안 온다. 실제로 스캔 후 40분이 지나도 화면이 안 바뀌었다.
    // 행(rows) 조회는 URL에 snapshot_id가 들어가므로, 스냅샷이 바뀌면
    // URL이 바뀌어 자동으로 새로 받는다 — 캐시를 그대로 둬도 안전하다.
    // 비용은 요청당 1행 조회 하나뿐이다.
    const snapRes = await fetch(
      `${url}/rest/v1/screener_snapshots?select=*&order=scanned_at.desc&limit=1`,
      { headers, cache: 'no-store' }
    )
    if (!snapRes.ok) return null
    const [snap] = await snapRes.json()
    if (!snap) return null

    // 이틀 넘게 묵었으면 신선한 라이브 스캔이 낫다
    if ((Date.now() - new Date(snap.scanned_at).getTime()) / 3.6e6 > 48) return null

    // PostgREST는 한 번에 최대 1,000행만 준다 (limit 파라미터로 안 뚫린다).
    // Range 헤더로 페이지를 넘겨 전부 가져온다.
    // PostgREST 페이징: offset+limit 쿼리 파라미터만 쓴다.
    //
    // Range 헤더는 쓰지 않는다. 두 가지 문제가 겹친다:
    //  1) offset과 같이 주면 결과가 깨진다 (offset=1000 + Range 0-999 -> 4행)
    //  2) Next의 fetch 캐시는 URL로만 중복 제거해서, 헤더만 다른 요청이
    //     같은 응답으로 합쳐진다 -> 1페이지가 반복돼 중복 행이 쌓인다
    // 실측: offset=0/1000/2000 + limit=1000 -> 1000 + 1000 + 124 = 2124행 (정확)
    const PAGE = 1000
    const raw: unknown[] = []
    for (let from = 0; from < 10000; from += PAGE) {
      const res = await fetch(
        `${url}/rest/v1/screener_rows?select=*&snapshot_id=eq.${snap.id}` +
        `&order=id.asc&offset=${from}&limit=${PAGE}`,
        // 특정 스냅샷의 행은 절대 변하지 않는다. 길게 캐시해도 된다
        { headers, next: { revalidate: 43200 } }
      )
      if (!res.ok) break
      const page = await res.json()
      if (!Array.isArray(page) || page.length === 0) break
      raw.push(...page)
      if (page.length < PAGE) break
    }
    if (raw.length === 0) return null

    type DbRow = {
      symbol: string; name: string | null; sector: string | null; market_cap: number | null
      f5: number | null; f20: number | null; f60: number | null
      rvol: number | null; chg20: number | null; pct_b: number | null
      vwma20: number | null; vwma60: number | null; above_run: number | null
      w_close: number | null; w_vwma20: number | null; w_vwma60: number | null
      w_above_run: number | null; prev_run: number | null; w_prev_run: number | null
      price: number | null
    }
    const rows: ScreenerRow[] = (raw as DbRow[]).map(r => ({
      symbol: r.symbol,
      name: r.name ?? '',
      sector: r.sector ?? '',
      marketCap: r.market_cap ?? 0,
      tier: tierOf(r.market_cap ?? 0),
      f5: r.f5, f20: r.f20, f60: r.f60,
      rvol: r.rvol, chg20: r.chg20,
      pctB: r.pct_b,
      vwma20: r.vwma20,
      vwma60: r.vwma60,
      aboveRun: r.above_run,
      wClose: r.w_close,
      wVwma20: r.w_vwma20,
      wVwma60: r.w_vwma60,
      wAboveRun: r.w_above_run,
      prevRun: r.prev_run,
      wPrevRun: r.w_prev_run,
      price: r.price,
    }))

    return {
      rows,
      regime: snap.regime as Regime,
      spyChg20: snap.spy_chg20,
      universeSize: snap.universe_size,
      scannedAt: new Date(snap.scanned_at).getTime(),
    }
  } catch (e) {
    // 조용히 삼키면 원인을 못 찾는다. 실제로 이것 때문에
    // "왜 라이브로 떨어지지"를 코드만 보고는 알 수 없었다.
    console.error('[screener] 스냅샷 조회 실패 — 라이브로 폴백:', e)
    return null
  }
}

/**
 * scannedAt과 fetchedAt은 다른 값이다.
 *   scannedAt  = 스캔이 돌아 이 목록이 만들어진 시각 (하루 1회, 평일)
 *   fetchedAt  = 이 응답을 만든 시각 (캐시 10분)
 * 화면에는 scannedAt을 보여줘야 한다. "언제 기준 목록인가"가 사용자에게 필요한 정보다.
 */
function payload(rows: ScreenerRow[], regime: Regime, spyChg20: number | null,
                 universeSize: number, source: 'snapshot' | 'live', scannedAt: number) {
  const tierCounts = {} as Record<TierId, number>
  for (const t of TIERS) tierCounts[t.id] = rows.filter(r => r.tier === t.id).length

  return {
    regime, spyChg20,
    scanned: rows.length,
    universeSize,
    source,
    tierCounts,
    categories: buildCategories(rows),
    breakouts: buildBreakouts(rows),
    breakoutEvidence: BREAKOUT_EVIDENCE,
    // "조건에 맞는 종목이 없다"와 "아직 지표가 안 채워졌다"를 구분한다.
    // 둘 다 목록이 비어 보이지만 사용자가 할 일이 완전히 다르다.
    hasVwma: rows.some(r => r.aboveRun != null),
    evidence: TIER_EVIDENCE,
    caveats: CAVEATS,
    scannedAt,
    fetchedAt: Date.now(),
  }
}

export async function GET() {
  try {
    // 1순위: GitHub Actions 스냅샷 (넓은 유니버스, 즉시 응답)
    const snap = await fromSupabase()
    if (snap) {
      return NextResponse.json(
        payload(snap.rows, snap.regime, snap.spyChg20, snap.universeSize, 'snapshot', snap.scannedAt)
      )
    }

    // 2순위: 라이브 스캔 (705종목, Vercel 10초 제한)
    const [list, regimeInfo] = await Promise.all([universe(), marketRegime()])
    const rows = await mapLimit(list, 20, async (u): Promise<ScreenerRow | null> => {
      // 주봉 VWMA60에 60주치가 필요하다. 라이브 폴백은 종목 수가 적어 감당된다
      const bars = await fetchDatedBars(u.symbol, '2y')
      if (!bars || bars.length < 65) return null
      const m = computeFlow(bars)
      if (m.f20 === null) return null
      return {
        ...u, tier: tierOf(u.marketCap),
        f5: m.f5, f20: m.f20, f60: m.f60, rvol: m.rvol, chg20: m.chg20, pctB: m.pctB,
        vwma20: m.vwma20, vwma60: m.vwma60, aboveRun: m.aboveRun,
        wClose: m.wClose, wVwma20: m.wVwma20, wVwma60: m.wVwma60, wAboveRun: m.wAboveRun,
        prevRun: m.prevRun, wPrevRun: m.wPrevRun,
        price: bars[bars.length - 1].c,
      }
    })

    return NextResponse.json(
      payload(rows, regimeInfo.regime, regimeInfo.spyChg20, list.length, 'live', Date.now())
    )
  } catch (e) {
    // 500이면 ISR이 실패 응답을 12시간 물고 있을 수 있다
    const empty = {} as Record<TierId, Record<CatKey, ScreenerRow[]>>
    for (const t of TIERS) empty[t.id] = { pullback: [], momentum: [], quiet: [] }
    return NextResponse.json({
      error: String(e),
      regime: 'up' as Regime, spyChg20: null, scanned: 0, universeSize: 0,
      source: 'live', tierCounts: { large: 0, mid: 0, small: 0 },
      categories: empty, evidence: TIER_EVIDENCE, caveats: CAVEATS,
      fetchedAt: Date.now(),
    })
  }
}
