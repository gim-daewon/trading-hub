import { NextResponse } from 'next/server'
import { fetchBars, computeFlow, mapLimit, type FlowMetrics } from '@/lib/flow'

// 섹터 ETF 구성종목의 개별 자금 수급.
// ETF 거래량은 유통시장 손바뀜이라 "어느 종목에 돈이 갔는지"를 못 본다.
// 실측 예: XLE는 ETF 레벨 +4%(중립)인데 비중 22.5%인 XOM이 -28%로 빠지고
// MPC(+34%)·SLB(+33%)로 자금이 이동 중이었다. ETF만 보면 안 보인다.

export interface ConstituentFlow extends FlowMetrics {
  symbol: string
  name: string
  pct: number
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const etf = searchParams.get('etf')?.toUpperCase()
  if (!etf) return NextResponse.json({ error: 'etf required' }, { status: 400 })

  // 보유종목은 기존 엔드포인트를 그대로 재사용한다 (iShares 실시간 + 정적 폴백)
  const origin = new URL(req.url).origin
  let holdings: { symbol: string; name: string; pct: number }[] = []
  try {
    const res = await fetch(`${origin}/api/etf-holdings?etf=${etf}`, { next: { revalidate: 43200 } })
    if (res.ok) holdings = (await res.json()).holdings ?? []
  } catch { /* 아래에서 빈 배열 처리 */ }

  if (holdings.length === 0) {
    return NextResponse.json({ etf, etfFlow: null, constituents: [], error: 'no holdings' })
  }

  const [etfBars, constituents] = await Promise.all([
    fetchBars(etf),
    mapLimit(holdings, 10, async (h): Promise<ConstituentFlow | null> => {
      const bars = await fetchBars(h.symbol)
      if (!bars || bars.length < 25) return null
      return { symbol: h.symbol, name: h.name, pct: h.pct, ...computeFlow(bars) }
    }),
  ])

  constituents.sort((a, b) => (b.f20 ?? -999) - (a.f20 ?? -999))

  // 비중가중 평균 — ETF 레벨 수치와 비교하면 대형주 왜곡이 드러난다
  const weighted = (() => {
    const valid = constituents.filter(c => c.f20 !== null && c.pct > 0)
    if (!valid.length) return null
    const wsum = valid.reduce((a, c) => a + c.pct, 0)
    return valid.reduce((a, c) => a + c.f20! * c.pct, 0) / wsum
  })()

  // 최대 비중 종목이 나머지와 반대 방향이면 "대형주 왜곡"
  const top = constituents.slice().sort((a, b) => b.pct - a.pct)[0]
  const others = constituents.filter(c => c.symbol !== top?.symbol && c.f20 !== null)
  const othersAvg = others.length ? others.reduce((a, c) => a + c.f20!, 0) / others.length : null
  const megaCapSkew =
    top?.f20 != null && othersAvg != null && Math.sign(top.f20) !== Math.sign(othersAvg)
      ? { symbol: top.symbol, pct: top.pct, f20: top.f20, othersAvg }
      : null

  return NextResponse.json({
    etf,
    etfFlow: etfBars ? computeFlow(etfBars) : null,
    weightedF20: weighted,
    megaCapSkew,
    inflow:  constituents.filter(c => (c.f20 ?? 0) > 0).length,
    outflow: constituents.filter(c => (c.f20 ?? 0) < 0).length,
    constituents,
    fetchedAt: Date.now(),
  })
}
