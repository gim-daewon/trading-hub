import { NextResponse } from 'next/server'
import { fetchBars, computeFlow, mapLimit, persistence, type FlowMetrics, type Persistence } from '@/lib/flow'

// 수급 스크리너.
//
// 중요: 이건 "추천"이 아니다. 자체 백테스트(2년, 룩어헤드 배제) 결과
// 순자금 지표의 예측력은 국면 의존적이고 통계적으로 약했다.
// 그래서 단일 랭킹 대신 국면별 카테고리로 나누고, 각 카테고리에
// 실제 측정된 성과와 표본 수를 그대로 붙여 내보낸다. UI가 이를 표시한다.

export const revalidate = 43200  // 12시간 — 스캔 비용이 커서 자주 못 돈다

const NASDAQ_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Origin': 'https://www.nasdaq.com',
  'Referer': 'https://www.nasdaq.com/',
}

// Vercel Hobby 10초 제한 안에 들어오는 크기. 실측 705종목 ≈ 6.7초.
// 전체 1,900종목(~19초)은 GitHub Actions + Supabase 사전계산으로 이관 예정.
const MIN_DOLLAR_VOL = 1e8   // $100M
const MIN_MARKET_CAP = 1e10  // $10B

export type Regime = 'up' | 'down'

export interface ScreenerRow extends FlowMetrics {
  symbol: string
  name: string
  sector: string
  marketCap: number
  persistence: Persistence
}

const toNum = (s: unknown) => parseFloat(String(s).replace(/[$,%]/g, '')) || 0

async function universe(): Promise<{ symbol: string; name: string; sector: string; marketCap: number }[]> {
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
    .filter(r => /^[A-Z]{1,5}$/.test(r.symbol) && r.dollarVol >= MIN_DOLLAR_VOL && r.marketCap >= MIN_MARKET_CAP)
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

// 자체 백테스트에서 실제로 측정된 값. UI에 그대로 노출한다.
// 방법: 2년치 / 이 API와 동일한 유니버스(705종목) / 시점 t까지의 데이터로만 순자금 계산
//       → t~t+20일 SPY 대비 초과수익. 룩어헤드 없음.
// 평균은 극단값에 쉽게 끌려가므로 중앙값(md)과 상회율(hit)을 같이 본다.
export const EVIDENCE = {
  baseline: {
    up:   { avg: 0.59, md: -0.58, hit: 47, n: 37959 },
    down: { avg: 0.65, md: 0.43, hit: 52, n: 19305 },
    note: '유니버스 전체 평균. 어떤 카테고리든 이 값을 못 넘으면 의미가 없다.',
  },
  momentum: {
    up:   { avg: 2.47, md: 0.45, hit: 52, n: 4009 },
    down: { avg: 0.84, md: 0.60, hit: 52, n: 2084 },
    verdict: '두 국면 모두 기준선 상회',
    note: '유일하게 양 국면에서 기준선을 넘었다. 다만 이건 순자금 신호가 아니라 모멘텀 효과일 가능성이 크다 — 가격 조건을 뺀 순자금 단독으로는 우위가 사라진다.',
  },
  turning: {
    up:   { avg: 0.45, md: -0.58, hit: 47, n: 1695 },
    down: { avg: 1.01, md: 0.95, hit: 54, n: 708 },
    verdict: '하락장에서만 상회',
    note: '하락 구간에서 유일하게 상회율 54%, 중앙값도 +0.95%p로 양수. 표본 708개. 넷 중 가장 견고해 보이지만 여전히 약하다.',
  },
  sustained: {
    up:   { avg: 0.78, md: -0.65, hit: 47, n: 8116 },
    down: { avg: 0.61, md: 0.47, hit: 52, n: 4807 },
    verdict: '기준선과 사실상 동일',
    note: '평균은 기준선보다 약간 높지만 중앙값·상회율이 기준선과 같다. 우위가 없다.',
  },
  quiet: {
    up:   { avg: -0.15, md: -1.06, hit: 45, n: 1114 },
    down: { avg: 0.60, md: 0.00, hit: 50, n: 392 },
    verdict: '기준선 이하 — 근거 없음',
    note: '초기 측정에서 하락장 +4.59%p가 나왔으나, 그건 "가격 정체" 정의가 느슨해 폭락 후 반등 종목을 포함한 탓이었다. 밴드(-5~+2%)로 고치니 우위가 사라졌다.',
  },
  caveats: [
    '생존 편향: 유니버스를 오늘 기준 시총·거래대금으로 뽑아 상장폐지 종목이 빠져 있다.',
    '표본 중복: 20일 구간을 5일 간격으로 사용해 독립 표본은 실질 1/4 수준이다.',
    '2년치 83개 리밸런스뿐이라 통계적 결론을 내릴 수 없다.',
  ],
} as const

/** 스냅샷 경로와 라이브 스캔 경로가 같은 분류 규칙을 쓰도록 공유한다 */
function buildCategories(rows: ScreenerRow[]) {
  const byFlow = [...rows].sort((a, b) => (b.f20 ?? -999) - (a.f20 ?? -999))
  const top150 = byFlow.slice(0, 150)

  return {
    categories: {
      // 20일 순자금 상위 + 이미 상승 → 상승장에서 강했음
      momentum: top150.filter(r => (r.chg20 ?? 0) >= 10).slice(0, 25),
      // 20일 순자금 상위 + 가격 정체.
      // 밴드로 잡아야 한다 — 상한만 두면 폭락 종목(-52% 등)이 "정체"로 잡혀
      // 백테스트 수치까지 왜곡됐다.
      quiet: top150.filter(r => (r.chg20 ?? 99) >= -5 && (r.chg20 ?? 99) < 2).slice(0, 25),
      // 5·20·60일 모두 유입
      sustained: byFlow.filter(r => r.persistence === 'sustained').slice(0, 25),
      // 장기 유출 → 단·중기 유입
      turning: byFlow
        .filter(r => (r.f60 ?? 0) < 0 && (r.f20 ?? 0) > 10 && (r.f5 ?? 0) > 10)
        .slice(0, 25),
    },
  }
}

/**
 * GitHub Actions가 저장한 스냅샷(1,900종목)을 읽는다.
 * 없으면 null을 반환하고 호출부가 라이브 스캔(705종목)으로 폴백한다.
 */
async function fromSupabase(): Promise<{
  rows: ScreenerRow[]; regime: Regime; spyChg20: number | null; universeSize: number; scannedAt: number
} | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null

  try {
    const headers = { apikey: key, Authorization: `Bearer ${key}` }
    const snapRes = await fetch(
      `${url}/rest/v1/screener_snapshots?select=*&order=scanned_at.desc&limit=1`,
      { headers, next: { revalidate: 3600 } }
    )
    if (!snapRes.ok) return null
    const [snap] = await snapRes.json()
    if (!snap) return null

    // 스냅샷이 이틀 넘게 묵었으면 신선한 라이브 스캔이 낫다
    const ageHours = (Date.now() - new Date(snap.scanned_at).getTime()) / 3.6e6
    if (ageHours > 48) return null

    const rowsRes = await fetch(
      `${url}/rest/v1/screener_rows?select=*&snapshot_id=eq.${snap.id}&limit=5000`,
      { headers, next: { revalidate: 3600 } }
    )
    if (!rowsRes.ok) return null
    const raw = await rowsRes.json()
    if (!Array.isArray(raw) || raw.length === 0) return null

    type DbRow = {
      symbol: string; name: string | null; sector: string | null; market_cap: number | null
      f5: number | null; f20: number | null; f60: number | null
      rvol: number | null; chg20: number | null; persistence: Persistence | null
    }
    const rows: ScreenerRow[] = (raw as DbRow[]).map(r => ({
      symbol: r.symbol,
      name: r.name ?? '',
      sector: r.sector ?? '',
      marketCap: r.market_cap ?? 0,
      f5: r.f5, f20: r.f20, f60: r.f60,
      rvol: r.rvol, chg20: r.chg20,
      avgDollarVol: null,
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

export async function GET() {
  try {
    // 1순위: GitHub Actions 스냅샷 (1,900종목, 즉시 응답)
    const snap = await fromSupabase()
    if (snap) {
      return NextResponse.json({
        ...buildCategories(snap.rows),
        regime: snap.regime,
        spyChg20: snap.spyChg20,
        scanned: snap.rows.length,
        universeSize: snap.universeSize,
        source: 'snapshot',
        evidence: EVIDENCE,
        fetchedAt: snap.scannedAt,
      })
    }

    // 2순위: 라이브 스캔 (705종목, Vercel 10초 제한)
    const [list, regimeInfo] = await Promise.all([universe(), marketRegime()])

    const rows = await mapLimit(list, 20, async (u): Promise<ScreenerRow | null> => {
      const bars = await fetchBars(u.symbol)
      if (!bars || bars.length < 65) return null
      const m = computeFlow(bars)
      if (m.f20 === null) return null
      return { ...u, ...m, persistence: persistence(m) }
    })

    return NextResponse.json({
      ...buildCategories(rows),
      regime: regimeInfo.regime,
      spyChg20: regimeInfo.spyChg20,
      scanned: rows.length,
      universeSize: list.length,
      source: 'live',
      evidence: EVIDENCE,
      fetchedAt: Date.now(),
    })
  } catch (e) {
    // 500을 반환하면 ISR이 실패 응답을 12시간 물고 있을 수 있다.
    // 200 + error 필드로 내려 UI가 메시지를 띄우게 한다.
    return NextResponse.json({
      error: String(e),
      regime: 'up', spyChg20: null, scanned: 0, universeSize: 0,
      categories: { momentum: [], quiet: [], sustained: [], turning: [] },
      evidence: EVIDENCE,
      fetchedAt: Date.now(),
    })
  }
}
