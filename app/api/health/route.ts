import { NextResponse } from 'next/server'
import { ASSETS, SECTORS } from '@/lib/registry'
import { STATIC_HOLDINGS } from '@/lib/etf-holdings-static'
import { isStaleQuote, quoteDate, MAX_QUOTE_AGE_DAYS, type YahooMeta } from '@/lib/yahoo-meta'

// 워치리스트 헬스체크 — 조용히 죽은 티커를 잡는다.
//
// 야후는 상장폐지된 티커도 마지막 시세를 계속 준다. PBS는 2026-07-17 이후
// 일봉이 전부 null인데 regularMarketTime만 2023-08-25로 남아 있었고,
// 등락률이 +0.03%로 계산돼 정상값과 구분되지 않았다. 그 상태로 섹터 화면에서
// "120일 부진 1위"를 차지하고 있었다.
//
// 사람이 눈으로 찾을 수 없는 종류의 고장이라 자동 점검이 필요하다.

export const revalidate = 3600  // 1시간

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

type Status = 'ok' | 'stale' | 'gap' | 'missing'

interface Check {
  symbol: string
  status: Status
  /** 시세 기준일 */
  quoteDate: string | null
  /** 일봉 마지막 유효봉 이후 비어 있는 봉 수 */
  nullTail: number
  /** 어디서 쓰이는지 — 고칠 위치를 바로 알 수 있게 */
  usedBy: string[]
}

async function check(symbol: string): Promise<Omit<Check, 'usedBy'>> {
  for (const host of ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']) {
    try {
      const res = await fetch(
        `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo`,
        { headers: { 'User-Agent': UA }, next: { revalidate: 3600 } }
      )
      if (!res.ok) continue
      const result = (await res.json())?.chart?.result?.[0]
      if (!result) continue

      const meta: YahooMeta = result.meta ?? {}
      const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? []
      let lastValid = -1
      for (let i = closes.length - 1; i >= 0; i--) if (closes[i] != null) { lastValid = i; break }
      const nullTail = lastValid < 0 ? closes.length : closes.length - 1 - lastValid

      // 시세 자체가 오래된 경우와, 시세는 최신인데 일봉이 비는 경우를 나눈다.
      // 후자가 더 교활하다 — 시세만 보면 멀쩡해 보인다.
      const status: Status =
        lastValid < 0 ? 'missing'
        : isStaleQuote(meta) ? 'stale'
        : nullTail > 3 ? 'gap'
        : 'ok'

      return { symbol, status, quoteDate: quoteDate(meta), nullTail }
    } catch { /* 다음 호스트 */ }
  }
  return { symbol, status: 'missing', quoteDate: null, nullTail: -1 }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]) }
  }))
  return out
}

export async function GET() {
  // 점검 대상: 워치리스트 + 섹터 ETF + 정적 보유목록의 구성종목.
  // FRED·매크로는 야후 심볼이 아니므로 제외한다.
  const usedBy = new Map<string, string[]>()
  const add = (sym: string, where: string) => {
    const cur = usedBy.get(sym) ?? []
    if (!cur.includes(where)) cur.push(where)
    usedBy.set(sym, cur)
  }

  for (const a of ASSETS) {
    if (a.source === 'fred' || a.type === 'macro') continue
    add(a.id, '워치리스트')
  }
  for (const s of SECTORS) add(s.etf, `섹터:${s.label}`)
  for (const [etf, rows] of Object.entries(STATIC_HOLDINGS)) {
    for (const h of rows) add(h.symbol, `보유목록:${etf}`)
  }

  const symbols = [...usedBy.keys()]
  const results = await mapLimit(symbols, 12, check)
  const checks: Check[] = results.map(r => ({ ...r, usedBy: usedBy.get(r.symbol) ?? [] }))

  const bad = checks.filter(c => c.status !== 'ok')
  const by = (s: Status) => bad.filter(c => c.status === s)

  return NextResponse.json({
    checkedAt: Date.now(),
    total: checks.length,
    okCount: checks.length - bad.length,
    // 심각도 순: 데이터 없음 > 시세만 살아있고 봉이 빔 > 시세 자체가 오래됨
    problems: [...by('missing'), ...by('gap'), ...by('stale')]
      .sort((a, b) => b.usedBy.length - a.usedBy.length),
    thresholds: {
      staleQuoteDays: MAX_QUOTE_AGE_DAYS,
      maxNullTailBars: 3,
    },
    note: bad.length === 0
      ? '전부 정상'
      : `${bad.length}개 티커에 문제가 있다. gap = 시세는 최신인데 일봉이 비는 경우로, 화면상 정상처럼 보여 가장 위험하다.`,
  })
}
