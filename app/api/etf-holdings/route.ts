import { NextResponse } from 'next/server'
import { isStaleQuote } from '@/lib/yahoo-meta'
import { STATIC_HOLDINGS } from '@/lib/etf-holdings-static'

const UA     = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const ACCEPT = 'application/json, text/plain, */*'

type Holding    = { symbol: string; name: string; pct: number }
type PriceResult = { price: number | null; changePct: number | null }

// iShares ETFs in our registry: ticker → { productId, fund-slug }
// Product IDs come from ishares.com/us/products/{id}/{slug}/
const ISHARES: Record<string, { id: string; slug: string }> = {
  ICLN: { id: '239726', slug: 'ishares-global-clean-energy-etf' },
  ITA:  { id: '239502', slug: 'ishares-us-aerospace-defense-etf' },
  IHI:  { id: '239499', slug: 'ishares-us-medical-devices-etf' },
  IYZ:  { id: '239515', slug: 'ishares-us-telecommunications-etf' },
  IGV:  { id: '239520', slug: 'ishares-expanded-tech-software-sector-etf' },
  IYT:  { id: '239510', slug: 'ishares-us-transportation-etf' },
}

async function fetchIShares(ticker: string): Promise<Holding[] | null> {
  const meta = ISHARES[ticker]
  if (!meta) return null

  // iShares public holdings JSON endpoint (no auth required)
  const url =
    `https://www.ishares.com/us/products/${meta.id}/${meta.slug}` +
    `/1467271812596.ajax?fileType=json&fileName=${ticker}_holdings&dataType=fund`

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':   UA,
        'Accept':       ACCEPT,
        'Referer':      `https://www.ishares.com/us/products/${meta.id}/${meta.slug}`,
        'sec-fetch-site': 'same-origin',
        'sec-fetch-mode': 'cors',
      },
      next: { revalidate: 43200 }, // 12h cache — holdings change quarterly
    })
    if (!res.ok) return null

    const json = await res.json()

    // iShares returns DataTables (aaData) format.
    // Row layout: [ticker, name, assetClass, marketValue($), weight(%), notional, shares, ...]
    // weight at index 4 is a string like "22.31" meaning 22.31%
    const rows: unknown[] = Array.isArray(json?.aaData) ? json.aaData : []
    if (!rows.length) return null

    const holdings: Holding[] = rows
      .filter((r): r is string[] =>
        Array.isArray(r) &&
        typeof r[0] === 'string' &&
        r[0].trim() !== '-' &&
        r[0].trim() !== ''
      )
      .slice(0, 10)
      .map(r => ({
        symbol: String(r[0]).trim(),
        name:   String(r[1]).trim(),
        pct:    parseFloat(String(r[4])) / 100,   // "22.31" → 0.2231
      }))
      .filter(h => h.symbol && !isNaN(h.pct) && h.pct > 0)

    return holdings.length > 0 ? holdings : null
  } catch {
    return null
  }
}

async function fetchPrice(symbol: string): Promise<PriceResult> {
  if (!symbol) return { price: null, changePct: null }
  for (const host of ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']) {
    try {
      const res = await fetch(
        `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d&includePrePost=false`,
        { headers: { 'User-Agent': UA, Accept: ACCEPT }, next: { revalidate: 300 } }
      )
      if (!res.ok) continue
      const j = await res.json()
      const m = j?.chart?.result?.[0]?.meta
      if (!m) continue
      if (isStaleQuote(m)) return { price: null, changePct: null }
      const price = m.regularMarketPrice ?? m.previousClose ?? null
      if (price === null) continue
      const prev = m.previousClose ?? m.chartPreviousClose ?? price
      return { price, changePct: prev !== 0 ? ((price - prev) / prev) * 100 : null }
    } catch { continue }
  }
  return { price: null, changePct: null }
}

async function fetchYahoo(etf: string): Promise<Holding[] | null> {
  for (const host of ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']) {
    try {
      const res = await fetch(
        `https://${host}/v10/finance/quoteSummary/${etf}?modules=topHoldings`,
        { headers: { 'User-Agent': UA, Accept: ACCEPT }, next: { revalidate: 3600 } }
      )
      if (!res.ok) continue
      const json = await res.json()
      const top = json?.quoteSummary?.result?.[0]?.topHoldings
      if (!top) continue
      type RH = { symbol?: string; holdingName?: string; holdingPercent?: { raw?: number } }
      const h = ((top.holdings ?? []) as RH[]).slice(0, 10)
        .map(r => ({ symbol: r.symbol ?? '', name: r.holdingName ?? '', pct: r.holdingPercent?.raw ?? 0 }))
        .filter(r => r.symbol && r.pct > 0)
      return h.length > 0 ? h : null
    } catch { continue }
  }
  return null
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const etf = searchParams.get('etf')?.toUpperCase()
  if (!etf) return NextResponse.json({ error: 'etf required' }, { status: 400 })

  let holdings: Holding[] | null = null
  let source = 'none'

  // 1. iShares live API (quarterly rebalancing → 12h cache)
  if (ISHARES[etf]) {
    holdings = await fetchIShares(etf)
    if (holdings) source = 'ishares'
  }

  // 2. Static snapshot (all 33 ETFs covered)
  if (!holdings && STATIC_HOLDINGS[etf]) {
    holdings = [...STATIC_HOLDINGS[etf]]
    source = 'static'
  }

  // 3. Yahoo Finance quoteSummary — usually blocked from Vercel IPs, kept as last resort
  if (!holdings) {
    holdings = await fetchYahoo(etf)
    if (holdings) source = 'yahoo'
  }

  if (!holdings?.length) {
    return NextResponse.json({ etf, holdings: [], source: 'none' })
  }

  const prices = await Promise.all(holdings.map(h => fetchPrice(h.symbol)))
  const result = holdings.map((h, i) => ({
    ...h,
    price:     prices[i].price,
    changePct: prices[i].changePct,
  }))

  return NextResponse.json({ etf, holdings: result, source })
}
