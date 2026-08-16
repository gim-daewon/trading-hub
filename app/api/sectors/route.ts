import { NextResponse } from 'next/server'
import { SECTORS } from '@/lib/registry'

interface YahooQuote {
  price: number
  prevClose: number
  change: number
  changePct: number
}

async function fetchYahoo(symbol: string): Promise<YahooQuote | null> {
  const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']
  for (const host of hosts) {
    try {
      const res = await fetch(
        `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d&includePrePost=false`,
        { next: { revalidate: 300 } }
      )
      if (!res.ok) continue
      const json = await res.json()
      const meta = json?.chart?.result?.[0]?.meta
      if (!meta) continue
      const price     = meta.regularMarketPrice ?? meta.previousClose
      const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? price
      const change    = price - prevClose
      const changePct = prevClose !== 0 ? (change / prevClose) * 100 : 0
      return { price, prevClose, change, changePct }
    } catch {
      continue
    }
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
    const changePct = q?.changePct ?? 0
    return {
      id:        sector.id,
      label:     sector.label,
      etf:       sector.etf,
      color:     sector.color,
      price:     q?.price ?? null,
      change:    q?.change ?? null,
      changePct,
      rs1d:      spy ? calcRS(changePct, spyChg) : null,
      prevClose: q?.prevClose ?? null,
      ts:        Date.now(),
    }
  })

  sectors.sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0))

  return NextResponse.json({
    sectors,
    spy: spy ? { price: spy.price, changePct: spy.changePct } : null,
    fetchedAt: Date.now(),
  })
}
