import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol') ?? ''
  const range  = req.nextUrl.searchParams.get('range')  ?? '3mo'

  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 900 },
    })
    if (!res.ok) throw new Error(`Yahoo ${res.status}`)

    const json = await res.json()
    const result = json.chart?.result?.[0]
    if (!result) return NextResponse.json({ error: 'no data' }, { status: 404 })

    const timestamps: number[] = result.timestamp ?? []
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? []

    const candles = timestamps
      .map((ts, i) => ({ date: new Date(ts * 1000).toISOString().slice(0, 10), close: closes[i] }))
      .filter((c): c is { date: string; close: number } => c.close != null)

    return NextResponse.json({ symbol, candles })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
