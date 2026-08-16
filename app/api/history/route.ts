import { NextRequest, NextResponse } from 'next/server'

interface Candle { date: string; open: number; high: number; low: number; close: number }

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Referer': 'https://finance.yahoo.com/',
}

async function fetchYahoo(symbol: string, range: string): Promise<Candle[] | null> {
  const encoded = encodeURIComponent(symbol)
  const bases = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com']

  for (const base of bases) {
    try {
      const url = `${base}/v8/finance/chart/${encoded}?interval=1d&range=${range}&includePrePost=false`
      const res = await fetch(url, { headers: HEADERS, cache: 'no-store' })
      if (!res.ok) continue

      const json = await res.json()
      const result = json.chart?.result?.[0]
      if (!result) continue

      const timestamps: number[] = result.timestamp ?? []
      const q = result.indicators?.quote?.[0] ?? {}
      const opens:  (number | null)[] = q.open  ?? []
      const highs:  (number | null)[] = q.high  ?? []
      const lows:   (number | null)[] = q.low   ?? []
      const closes: (number | null)[] = q.close ?? []

      const candles = timestamps
        .map((ts, i) => ({
          date:  new Date(ts * 1000).toISOString().slice(0, 10),
          open:  opens[i],
          high:  highs[i],
          low:   lows[i],
          close: closes[i],
        }))
        .filter((c): c is Candle =>
          c.open != null && c.high != null && c.low != null && c.close != null
        )

      if (candles.length > 0) return candles
    } catch { /* try next */ }
  }
  return null
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol') ?? ''
  const range  = req.nextUrl.searchParams.get('range')  ?? '3mo'

  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })

  const candles = await fetchYahoo(symbol, range)
  if (!candles) return NextResponse.json({ error: '데이터를 불러올 수 없습니다', candles: [] })

  return NextResponse.json({ symbol, candles })
}
