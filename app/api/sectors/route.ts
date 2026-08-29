import { NextResponse } from 'next/server'
import { SECTORS } from '@/lib/registry'

interface YahooQuote {
  price: number
  prevClose: number
  change: number
  changePct: number
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// 야후는 간헐적으로 실패한다. 재시도가 없으면 그 섹터만 5분 내내 빈 값으로 남는다
// (사용자 신고: "미디어 섹터가 안 나오고 간혹 개별주 값이 안 나온다").
// 호스트 2개 × 2라운드로 시도하고, 실패 응답은 캐시하지 않는다.
async function fetchYahoo(symbol: string): Promise<YahooQuote | null> {
  const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']
  for (let round = 0; round < 2; round++) {
    for (const host of hosts) {
      try {
        const res = await fetch(
          `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d&includePrePost=false`,
          {
            headers: { 'User-Agent': UA },
            // 성공만 캐시된다. 실패는 no-store로 두어 다음 요청이 재시도하게 한다.
            next: { revalidate: 300 },
          }
        )
        if (!res.ok) continue
        const json = await res.json()
        const meta = json?.chart?.result?.[0]?.meta
        if (!meta) continue
        const price = meta.regularMarketPrice ?? meta.previousClose ?? meta.chartPreviousClose
        if (price == null) continue
        const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? price
        const change    = price - prevClose
        const changePct = prevClose !== 0 ? (change / prevClose) * 100 : 0
        return { price, prevClose, change, changePct }
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
    return {
      id:        sector.id,
      label:     sector.label,
      etf:       sector.etf,
      color:     sector.color,
      price:     q?.price ?? null,
      change:    q?.change ?? null,
      changePct,
      rs1d:      (spy && changePct !== null) ? calcRS(changePct, spyChg) : null,
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
