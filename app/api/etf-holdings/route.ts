import { NextResponse } from 'next/server'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const etf = searchParams.get('etf')?.toUpperCase()
  if (!etf) return NextResponse.json({ error: 'etf required' }, { status: 400 })

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

      const holdings = (top.holdings ?? []).map((h: {
        symbol?: string
        holdingName?: string
        holdingPercent?: { raw?: number }
      }) => ({
        symbol: h.symbol ?? '',
        name:   h.holdingName ?? '',
        pct:    h.holdingPercent?.raw ?? 0,
      }))

      return NextResponse.json({ etf, holdings })
    } catch {
      continue
    }
  }

  return NextResponse.json({ etf, holdings: [] })
}
