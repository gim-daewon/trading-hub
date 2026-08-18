import { NextResponse } from 'next/server'

// Temporary endpoint — probe which external APIs are accessible from Vercel IPs.
// DELETE after verification is complete.

const UA_BOT    = 'TradingHub/1.0 pos98042@gmail.com'
const UA_BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

async function probe(label: string, url: string, headers: Record<string, string>): Promise<{
  label: string; url: string; status: number | null; ok: boolean; bodySnippet: string; ms: number
}> {
  const t = Date.now()
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) })
    const ms  = Date.now() - t
    let bodySnippet = ''
    try {
      const text = await res.text()
      bodySnippet = text.slice(0, 200).replace(/\s+/g, ' ').trim()
    } catch { /* ignore */ }
    return { label, url, status: res.status, ok: res.ok, bodySnippet, ms }
  } catch (e) {
    return { label, url, status: null, ok: false, bodySnippet: String(e).slice(0, 200), ms: Date.now() - t }
  }
}

export async function GET() {
  const today = new Date().toISOString().slice(0, 10)

  const results = await Promise.all([
    probe(
      'Yahoo Finance v7 options (블록 여부 확인)',
      'https://query1.finance.yahoo.com/v7/finance/options/AAPL',
      { 'User-Agent': UA_BROWSER, 'Accept': 'application/json' }
    ),
    probe(
      'SEC EDGAR ATOM (Bot UA — 공식 권장)',
      'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&company=&dateb=&owner=include&count=10&output=atom',
      { 'User-Agent': UA_BOT, 'Accept': 'application/xml, */*' }
    ),
    probe(
      'SEC EDGAR data.sec.gov submissions (bot UA)',
      'https://data.sec.gov/submissions/CIK0000320193.json',
      { 'User-Agent': UA_BOT, 'Accept': 'application/json' }
    ),
    probe(
      'FINRA CDN 공매도 데이터 (최근 거래일)',
      `https://cdn.finra.org/equity/regsho/daily/CNMSshvol${today.replace(/-/g, '')}.txt`,
      { 'User-Agent': UA_BROWSER }
    ),
    probe(
      'Nasdaq 경제이벤트 캘린더',
      `https://api.nasdaq.com/api/calendar/economicevents?date=${today}`,
      {
        'User-Agent': UA_BROWSER,
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://www.nasdaq.com',
        'Referer': 'https://www.nasdaq.com/',
      }
    ),
    probe(
      'FRED Release Dates (이미 사용 중 — 기준선)',
      `https://api.stlouisfed.org/fred/releases/dates?api_key=${process.env.FRED_API_KEY ?? 'MISSING'}&file_type=json&realtime_start=${today}&limit=5`,
      { 'User-Agent': UA_BROWSER, 'Accept': 'application/json' }
    ),
    probe(
      'Google News RSS',
      'https://news.google.com/rss/search?q=SPY+stock&hl=en-US&gl=US&ceid=US:en',
      { 'User-Agent': UA_BROWSER, 'Accept': 'application/rss+xml, */*' }
    ),
    probe(
      'ApeWisdom (WSB 심리 — 무키)',
      'https://apewisdom.io/api/v1.0/filter/wallstreetbets/page/1',
      { 'User-Agent': UA_BROWSER, 'Accept': 'application/json' }
    ),
    probe(
      'CFTC COT Socrata (무키)',
      'https://publicreporting.cftc.gov/resource/6dca-aqww.json?$limit=3&$order=report_date_as_yyyy_mm_dd DESC',
      { 'User-Agent': UA_BROWSER, 'Accept': 'application/json' }
    ),
    probe(
      'Polygon grouped bars 무료 (키 필요 — 없으면 401)',
      `https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${today}?adjusted=true&apiKey=${process.env.POLYGON_API_KEY ?? 'MISSING'}`,
      { 'User-Agent': UA_BROWSER, 'Accept': 'application/json' }
    ),
  ])

  const summary = results.map(r => ({
    label: r.label,
    status: r.status,
    ok: r.ok,
    ms: r.ms,
    bodySnippet: r.bodySnippet,
  }))

  return NextResponse.json({ probeDate: today, results: summary }, { status: 200 })
}
