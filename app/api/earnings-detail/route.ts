import { NextResponse } from 'next/server'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json,text/plain,*/*',
  'Origin': 'https://www.nasdaq.com',
  'Referer': 'https://www.nasdaq.com/',
}

export interface EarningDetail {
  fiscalQuarterEnding: string | null
  revActual:    string | null
  revEstimate:  string | null
  revSurprise:  string | null
  revSurpPct:   string | null
  epsSurprise:  string | null
  epsSurpPct:   string | null
}

export async function GET(req: Request) {
  const symbol = new URL(req.url).searchParams.get('symbol')?.toUpperCase()
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })

  try {
    const res = await fetch(
      `https://api.nasdaq.com/api/company/${symbol}/earnings`,
      { headers: HEADERS, next: { revalidate: 3600 } }
    )
    if (!res.ok) return NextResponse.json({ error: `nasdaq ${res.status}` }, { status: 502 })

    const json = await res.json()
    const rows = json?.data?.earningsHistory?.rows
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'no data' }, { status: 404 })
    }

    const r = rows[0]
    const detail: EarningDetail = {
      fiscalQuarterEnding: r.fiscalQuarterEnding ?? null,
      revActual:    r.revenue_actual    ?? null,
      revEstimate:  r.revenue_forecast  ?? null,
      revSurprise:  r.revenue_surprise  ?? null,
      revSurpPct:   r.revenue_surprise_pct ?? null,
      epsSurprise:  r.eps_surprise      ?? null,
      epsSurpPct:   r.eps_surprise_pct  ?? null,
    }
    return NextResponse.json(detail)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
