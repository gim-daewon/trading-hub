import { NextResponse } from 'next/server'
import { STATIC_HOLDINGS } from '@/lib/etf-holdings-static'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
}

type PriceResult = { price: number | null; changePct: number | null }

async function fetchPrice(symbol: string): Promise<PriceResult> {
  if (!symbol || symbol === 'BTC-USD') return { price: null, changePct: null }
  const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']
  for (const host of hosts) {
    try {
      const res = await fetch(
        `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d&includePrePost=false`,
        { headers: HEADERS, next: { revalidate: 300 } }
      )
      if (!res.ok) continue
      const json = await res.json()
      const meta = json?.chart?.result?.[0]?.meta
      if (!meta) continue
      const price     = meta.regularMarketPrice ?? meta.previousClose ?? null
      if (price === null) continue
      const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? price
      const changePct = prevClose !== 0 ? ((price - prevClose) / prevClose) * 100 : null
      return { price, changePct }
    } catch {
      continue
    }
  }
  return { price: null, changePct: null }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const etf = searchParams.get('etf')?.toUpperCase()
  if (!etf) return NextResponse.json({ error: 'etf required' }, { status: 400 })

  const staticData = STATIC_HOLDINGS[etf]

  if (staticData) {
    const prices = await Promise.all(staticData.map(h => fetchPrice(h.symbol)))
    const holdings = staticData.map((h, i) => ({
      ...h,
      price:     prices[i].price,
      changePct: prices[i].changePct,
    }))
    return NextResponse.json({ etf, holdings })
  }

  // fallback: Yahoo Finance quoteSummary (may be blocked from Vercel IPs)
  const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']
  for (const host of hosts) {
    try {
      const res = await fetch(
        `https://${host}/v10/finance/quoteSummary/${etf}?modules=topHoldings`,
        { headers: HEADERS, next: { revalidate: 3600 } }
      )
      if (!res.ok) continue
      const json = await res.json()
      const top = json?.quoteSummary?.result?.[0]?.topHoldings
      if (!top) continue

      type RawH = { symbol?: string; holdingName?: string; holdingPercent?: { raw?: number } }
      const rawHoldings = ((top.holdings ?? []) as RawH[]).slice(0, 10).map(h => ({
        symbol: h.symbol ?? '',
        name:   h.holdingName ?? '',
        pct:    h.holdingPercent?.raw ?? 0,
      }))

      const prices = await Promise.all(
        rawHoldings.map(h => h.symbol ? fetchPrice(h.symbol) : Promise.resolve<PriceResult>({ price: null, changePct: null }))
      )

      const holdings = rawHoldings.map((h, i) => ({ ...h, price: prices[i].price, changePct: prices[i].changePct }))
      return NextResponse.json({ etf, holdings })
    } catch {
      continue
    }
  }

  return NextResponse.json({ etf, holdings: [] })
}
