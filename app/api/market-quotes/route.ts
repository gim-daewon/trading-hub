import { NextResponse } from 'next/server'
import { isStaleQuote } from '@/lib/yahoo-meta'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
}

const SYMBOLS = [
  'DX-Y.NYB', 'JPY=X', 'KRW=X', 'EURUSD=X', 'CNY=X',   // FX
  'HG=F', 'CL=F', 'GC=F', 'NG=F',                         // Commodities
  '^N225', '^HSI', '^STOXX50E', 'EEM',                     // Global (skipping 000001.SS — unreliable)
  '^VIX', '^VVIX', '^SKEW',                                // Sentiment
]

async function fetchQuote(symbol: string): Promise<{ price: number | null; changePct: number | null }> {
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
      if (isStaleQuote(meta)) return { price: null, changePct: null }
      const price = meta.regularMarketPrice ?? meta.previousClose ?? null
      if (price === null) continue
      const prev = meta.previousClose ?? meta.chartPreviousClose ?? price
      const changePct = prev !== 0 ? ((price - prev) / prev) * 100 : null
      return { price, changePct }
    } catch { continue }
  }
  return { price: null, changePct: null }
}

export async function GET() {
  const results = await Promise.all(SYMBOLS.map(s => fetchQuote(s).then(r => [s, r] as const)))
  return NextResponse.json(Object.fromEntries(results))
}
