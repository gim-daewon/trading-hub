import { NextResponse } from 'next/server'
import { fetchBars, computeFlow, mapLimit, persistence, type FlowMetrics, type Persistence } from '@/lib/flow'
import {
  TIERS, tierOf, TIER_EVIDENCE, CAVEATS,
  type Regime, type TierId, type CatKey,
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
export const revalidate = 600  // 10분

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

export interface ScreenerRow extends FlowMetrics {
  symbol: string
  name: string
  sector: string
  marketCap: number
  tier: TierId | null
  persistence: Persistence
}

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

/**
 * 시총 구간별로 따로 분류한다.
 * 구간을 섞으면 소형주가 대형주 신호를 지운다 — 실제로 "조용한 매집"이
 * 전체 기준으로는 -0.15%p(근거 없음)였는데, 대형주만 보면 하락장 +1.96%p였다.
 */
function buildCategories(rows: ScreenerRow[]) {
  const out = {} as Record<TierId, Record<CatKey, ScreenerRow[]>>

  for (const tier of TIERS) {
    const inTier = rows.filter(r => r.tier === tier.id)
    const byFlow = [...inTier].sort((a, b) => (b.f20 ?? -999) - (a.f20 ?? -999))
    // 구간별 상위 15% (최소 30) — 구간 크기가 달라 고정 개수는 불공평하다
    const topN = Math.max(30, Math.round(byFlow.length * 0.15))
    const top = byFlow.slice(0, topN)
    // 백테스트는 수급 상위 30% 기준으로 측정했다. 근거와 화면을 일치시킨다
    const flow30 = byFlow.slice(0, Math.max(30, Math.round(byFlow.length * 0.3)))

    out[tier.id] = {
      // 볼린저 하단권 + 수급 상위 30%.
      // 2년 백테스트에서 시총·국면 6개 조합 전부 기준선을 상회한 유일한 조건이다.
      // 20일선 돌파를 추가하면 오히려 상회율이 44%로 떨어져 뺐다.
      //
      // 임계값 0.2를 조이지 말 것. 겹치지 않는 구간으로 잘라 재보면:
      //   %B<=0        54.9% (n=898,  ±3.3%p)
      //   0~0.1        54.4% (n=992,  ±3.1%p)
      //   0.1~0.2      53.8% (n=1697, ±2.4%p)
      //   0.2~0.3      51.5% (n=2459, ±2.0%p)
      //   기준선        48.0%
      // 인접 구간 차이는 z=0.20/0.32/1.47로 전부 노이즈다(오차범위가 차이보다 크다).
      // "하단권이냐 아니냐"는 유의하지만 "얼마나 깊으냐"는 구분되지 않는다.
      // 조이면 정확도는 그대로인데 후보만 줄어 고를 여지가 사라진다.
      pullback: flow30
        .filter(r => r.pctB !== null && r.pctB <= 0.2)
        .sort((a, b) => (a.pctB ?? 9) - (b.pctB ?? 9))
        .slice(0, 25),
      momentum: top.filter(r => (r.chg20 ?? 0) >= 10).slice(0, 25),
      // 밴드로 잡아야 한다 — 상한만 두면 폭락 종목(-52% 등)이 "정체"로 잡힌다
      quiet: top.filter(r => (r.chg20 ?? 99) >= -5 && (r.chg20 ?? 99) < 2).slice(0, 25),
      // 자금전환·지속매집은 6개 조합 중 1개에서만 상회해 삭제했다.
      // 근거는 lib/screener-shared.ts 주석 참고.
    }
  }
  return out
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
    const snapRes = await fetch(
      `${url}/rest/v1/screener_snapshots?select=*&order=scanned_at.desc&limit=1`,
      { headers, next: { revalidate: 600 } }
    )
    if (!snapRes.ok) return null
    const [snap] = await snapRes.json()
    if (!snap) return null

    // 이틀 넘게 묵었으면 신선한 라이브 스캔이 낫다
    if ((Date.now() - new Date(snap.scanned_at).getTime()) / 3.6e6 > 48) return null

    // PostgREST는 한 번에 최대 1,000행만 준다 (limit 파라미터로 안 뚫린다).
    // Range 헤더로 페이지를 넘겨 전부 가져온다.
    const PAGE = 1000
    const raw: unknown[] = []
    for (let from = 0; from < 10000; from += PAGE) {
      const res = await fetch(
        `${url}/rest/v1/screener_rows?select=*&snapshot_id=eq.${snap.id}&order=id.asc`,
        {
          headers: { ...headers, Range: `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items' },
          next: { revalidate: 600 },
        }
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
      persistence: Persistence | null
    }
    const rows: ScreenerRow[] = (raw as DbRow[]).map(r => ({
      symbol: r.symbol,
      name: r.name ?? '',
      sector: r.sector ?? '',
      marketCap: r.market_cap ?? 0,
      tier: tierOf(r.market_cap ?? 0),
      f5: r.f5, f20: r.f20, f60: r.f60,
      rvol: r.rvol, chg20: r.chg20,
      avgDollarVol: null,
      pctB: r.pct_b,
      persistence: r.persistence ?? 'unknown',
    }))

    return {
      rows,
      regime: snap.regime as Regime,
      spyChg20: snap.spy_chg20,
      universeSize: snap.universe_size,
      scannedAt: new Date(snap.scanned_at).getTime(),
    }
  } catch {
    return null
  }
}

function payload(rows: ScreenerRow[], regime: Regime, spyChg20: number | null,
                 universeSize: number, source: 'snapshot' | 'live', fetchedAt: number) {
  const tierCounts = {} as Record<TierId, number>
  for (const t of TIERS) tierCounts[t.id] = rows.filter(r => r.tier === t.id).length

  return {
    regime, spyChg20,
    scanned: rows.length,
    universeSize,
    source,
    tierCounts,
    categories: buildCategories(rows),
    evidence: TIER_EVIDENCE,
    caveats: CAVEATS,
    fetchedAt,
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
      const bars = await fetchBars(u.symbol)
      if (!bars || bars.length < 65) return null
      const m = computeFlow(bars)
      if (m.f20 === null) return null
      return { ...u, tier: tierOf(u.marketCap), ...m, persistence: persistence(m) }
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
