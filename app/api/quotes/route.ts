import { NextRequest, NextResponse } from 'next/server'
import { isStaleQuote } from '@/lib/yahoo-meta'

const FINNHUB_KEY = process.env.FINNHUB_API_KEY ?? ''
const YAHOO_BASE  = 'https://query1.finance.yahoo.com/v8/finance/chart'

// Finnhub로 단일 종목 시세 가져오기
async function fetchFinnhub(symbol: string) {
  const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_KEY}`
  const res = await fetch(url, { next: { revalidate: 300 } }) // 5분 캐시
  if (!res.ok) throw new Error(`Finnhub ${symbol}: ${res.status}`)
  const d = await res.json()
  return {
    id: symbol,
    price: d.c,
    change: d.d,
    changePct: d.dp,
    high52w: d.h,
    low52w: d.l,
    ts: d.t * 1000,
  }
}

// Yahoo Finance로 지수/VIX 등 가져오기
async function fetchYahoo(symbol: string) {
  const encoded = encodeURIComponent(symbol)
  const url = `${YAHOO_BASE}/${encoded}?interval=1d&range=1d`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    next: { revalidate: 300 },
  })
  if (!res.ok) throw new Error(`Yahoo ${symbol}: ${res.status}`)
  const json = await res.json()
  const meta = json.chart?.result?.[0]?.meta
  if (!meta) throw new Error(`Yahoo ${symbol}: no data`)
  // 상장폐지 티커는 몇 년 전 시세를 정상값처럼 계속 준다
  if (isStaleQuote(meta)) throw new Error(`Yahoo ${symbol}: 시세가 오래됨 (상장폐지 의심)`)
  const price     = meta.regularMarketPrice ?? 0
  const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? price
  const change    = price - prevClose
  const changePct = prevClose ? (change / prevClose) * 100 : 0
  return {
    id: symbol,
    price,
    change,
    changePct,
    ts: Date.now(),
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const symbols = (searchParams.get('symbols') ?? '').split(',').filter(Boolean)
  const source  = searchParams.get('source') ?? 'finnhub'

  if (symbols.length === 0) {
    return NextResponse.json({ error: 'symbols required' }, { status: 400 })
  }

  const results = await Promise.allSettled(
    symbols.map(s =>
      source === 'yahoo' ? fetchYahoo(s) : fetchFinnhub(s)
    )
  )

  const data: Record<string, unknown> = {}
  const errors: string[] = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') data[symbols[i]] = r.value
    else errors.push(`${symbols[i]}: ${r.reason?.message}`)
  })

  return NextResponse.json({ data, errors, fetchedAt: Date.now() })
}
