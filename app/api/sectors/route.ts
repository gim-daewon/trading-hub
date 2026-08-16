import { NextResponse } from 'next/server'
import { SECTORS } from '@/lib/registry'

const FINNHUB_KEY = process.env.FINNHUB_API_KEY ?? ''

interface FinnhubQuote {
  c: number   // current
  d: number   // change
  dp: number  // change %
  h: number   // high
  l: number   // low
  pc: number  // prev close
  t: number   // timestamp
}

async function fetchQuote(symbol: string): Promise<FinnhubQuote | null> {
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_KEY}`,
      { next: { revalidate: 300 } }
    )
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

// SPY 기준 상대 강도 계산
function calcRS(etfChg: number, spyChg: number): number {
  if (spyChg === 0) return 0
  // RS > 0 = SPY 대비 아웃퍼폼, < 0 = 언더퍼폼 (bp 단위)
  return etfChg - spyChg
}

export async function GET() {
  const etfTickers = ['SPY', ...SECTORS.map(s => s.etf)]
  const unique = [...new Set(etfTickers)]

  const quotes = await Promise.all(unique.map(t => fetchQuote(t)))
  const quoteMap: Record<string, FinnhubQuote> = {}
  unique.forEach((t, i) => { if (quotes[i]) quoteMap[t] = quotes[i]! })

  const spy = quoteMap['SPY']
  const spyChg = spy?.dp ?? 0

  const sectors = SECTORS.map(sector => {
    const q = quoteMap[sector.etf]
    const changePct = q?.dp ?? 0
    return {
      id:        sector.id,
      label:     sector.label,
      etf:       sector.etf,
      color:     sector.color,
      price:     q?.c ?? null,
      change:    q?.d ?? null,
      changePct,
      rs1d:      spy ? calcRS(changePct, spyChg) : null,
      prevClose: q?.pc ?? null,
      ts:        q ? q.t * 1000 : Date.now(),
    }
  })

  // 1D 기준 내림차순 정렬
  sectors.sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0))

  return NextResponse.json({
    sectors,
    spy: spy ? { price: spy.c, changePct: spy.dp } : null,
    fetchedAt: Date.now(),
  })
}
