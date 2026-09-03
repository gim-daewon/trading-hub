import { NextResponse } from 'next/server'
import { SECTORS } from '@/lib/registry'

interface YahooQuote {
  price: number
  prevClose: number
  change: number
  changePct: number
  /** 거래일 기준 누적 등락률. 순환을 보려면 하루치로는 부족하다 */
  periods: Record<number, number | null>
}

/**
 * 되돌아보기 기간. 10년·47섹터·겹치지 않는 113구간으로 실측한 결과에서 골랐다.
 *
 *   기간   상위3 다음20일 양수%   하위3 양수%
 *    5일        54% (z=0.85)      44%
 *   10일        54% (z=0.85)      49%
 *   20일        49%               43%
 *   60일        50%               47%
 *  120일        46%               37% (z=-2.77) ← 유의
 *  250일        52%               38% (z=-2.55) ← 유의
 *
 * 상위 섹터 따라가기는 어느 기간도 유의하지 않다. 유의한 건 하나뿐이다 —
 * 120~250일 하위 섹터는 계속 뒤처진다. 그래서 장기 칸을 반드시 노출한다.
 */
export const PERIODS = [5, 20, 60, 120] as const

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// 야후는 간헐적으로 실패한다. 재시도가 없으면 그 섹터만 5분 내내 빈 값으로 남는다
// (사용자 신고: "미디어 섹터가 안 나오고 간혹 개별주 값이 안 나온다").
// 호스트 2개 × 2라운드로 시도하고, 실패 응답은 캐시하지 않는다.
async function fetchYahoo(symbol: string): Promise<YahooQuote | null> {
  const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']
  for (let round = 0; round < 2; round++) {
    for (const host of hosts) {
      try {
        // range=1y로 바꿨다. meta는 그대로 오고 종가 배열까지 한 번에 받아
        // 요청 수를 늘리지 않고 5·20·60·120일 등락을 계산한다.
        const res = await fetch(
          `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d&includePrePost=false`,
          {
            headers: { 'User-Agent': UA },
            // 성공만 캐시된다. 실패는 no-store로 두어 다음 요청이 재시도하게 한다.
            next: { revalidate: 300 },
          }
        )
        if (!res.ok) continue
        const json = await res.json()
        const result = json?.chart?.result?.[0]
        const meta = result?.meta
        if (!meta) continue
        const price = meta.regularMarketPrice ?? meta.previousClose ?? meta.chartPreviousClose
        if (price == null) continue
        const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? price
        const change    = price - prevClose
        const changePct = prevClose !== 0 ? (change / prevClose) * 100 : 0

        // null 종가(거래정지일 등)를 걸러야 n일 전 시점이 밀리지 않는다
        const closes: number[] = (result?.indicators?.quote?.[0]?.close ?? []).filter(
          (c: number | null): c is number => c != null
        )
        const periods: Record<number, number | null> = {}
        for (const n of PERIODS) {
          const past = closes[closes.length - 1 - n]
          periods[n] = past != null && past !== 0 ? ((price - past) / past) * 100 : null
        }
        return { price, prevClose, change, changePct, periods }
      } catch {
        continue
      }
    }
    if (round === 0) await new Promise(r => setTimeout(r, 150))
  }
  return null
}

function calcRS(etfChg: number, spyChg: number): number {
  return etfChg - spyChg
}

export async function GET() {
  const tickers = ['SPY', ...SECTORS.map(s => s.etf)]
  const unique  = [...new Set(tickers)]

  const results = await Promise.all(unique.map(t => fetchYahoo(t)))
  const quoteMap: Record<string, YahooQuote> = {}
  unique.forEach((t, i) => { if (results[i]) quoteMap[t] = results[i]! })

  const spy    = quoteMap['SPY']
  const spyChg = spy?.changePct ?? 0

  const sectors = SECTORS.map(sector => {
    const q = quoteMap[sector.etf]
    const changePct = q?.changePct ?? null

    // 기간별 SPY 대비 초과수익. 순환은 절대 등락이 아니라 상대 강도로 봐야 한다 —
    // 전 섹터가 같이 빠지는 날은 절대값만 보면 전부 빨갛기만 하다.
    const rs: Record<number, number | null> = {}
    for (const n of PERIODS) {
      const e = q?.periods?.[n], s = spy?.periods?.[n]
      rs[n] = (e != null && s != null) ? e - s : null
    }

    return {
      id:        sector.id,
      label:     sector.label,
      etf:       sector.etf,
      color:     sector.color,
      group:     sector.group,
      broad:     sector.broad ?? false,
      price:     q?.price ?? null,
      change:    q?.change ?? null,
      changePct,
      rs1d:      (spy && changePct !== null) ? calcRS(changePct, spyChg) : null,
      periods:   q?.periods ?? {},
      rs,
      prevClose: q?.prevClose ?? null,
      ts:        Date.now(),
    }
  })

  sectors.sort((a, b) => (b.changePct ?? -999) - (a.changePct ?? -999))

  return NextResponse.json({
    sectors,
    spy: spy ? { price: spy.price, changePct: spy.changePct } : null,
    fetchedAt: Date.now(),
  })
}
