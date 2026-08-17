import { NextResponse } from 'next/server'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
}

export interface EarningsData {
  symbol: string
  nextDate: string | null       // 'YYYY-MM-DD'
  epsEstimate: number | null    // consensus EPS for next quarter
  revenueEstimate: number | null
  // last reported quarter
  lastQuarter: string | null    // e.g. '4Q2024'
  lastActual: number | null
  lastEstimate: number | null
}

function fmtDate(ts: number | null): string | null {
  if (!ts) return null
  const d = new Date(ts * 1000)
  return d.toISOString().slice(0, 10)
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const symbol = searchParams.get('symbol')?.toUpperCase()
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })

  const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']

  for (const host of hosts) {
    try {
      const url = `https://${host}/v10/finance/quoteSummary/${symbol}?modules=calendarEvents%2Cearnings`
      const res = await fetch(url, { headers: HEADERS, next: { revalidate: 3600 } })
      if (!res.ok) continue

      const json = await res.json()
      const result = json?.quoteSummary?.result?.[0]
      if (!result) continue

      const cal = result.calendarEvents?.earnings
      const earningsResult = result.earnings

      // next earnings date
      const rawDates: { raw?: number }[] = cal?.earningsDate ?? []
      const nowSec = Date.now() / 1000
      const futureDates = rawDates
        .map(d => d.raw ?? 0)
        .filter(ts => ts > nowSec - 86400) // include today
        .sort((a, b) => a - b)
      const nextDate = fmtDate(futureDates[0] ?? null)

      // estimates from calendarEvents
      const epsEstimate     = cal?.earningsAverage?.raw     ?? null
      const revenueEstimate = cal?.revenueAverage?.raw      ?? null

      // last quarter actuals from earnings.earningsChart.quarterly
      const quarterly: { date?: string; actual?: { raw?: number }; estimate?: { raw?: number } }[] =
        earningsResult?.earningsChart?.quarterly ?? []
      const last = quarterly[quarterly.length - 1] ?? null

      const data: EarningsData = {
        symbol,
        nextDate,
        epsEstimate,
        revenueEstimate,
        lastQuarter:  last?.date ?? null,
        lastActual:   last?.actual?.raw   ?? null,
        lastEstimate: last?.estimate?.raw ?? null,
      }

      return NextResponse.json(data)
    } catch {
      continue
    }
  }

  return NextResponse.json({
    symbol, nextDate: null, epsEstimate: null, revenueEstimate: null,
    lastQuarter: null, lastActual: null, lastEstimate: null,
  })
}
