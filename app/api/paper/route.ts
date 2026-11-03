import { NextResponse } from 'next/server'
import { isMarket, MARKETS, type Market } from '@/lib/markets'
import { fetchBarsFor } from '@/lib/bars'
import { pool } from '@/lib/fetch-retry'
import { runAccount, PAPER_ACCOUNTS, PAPER_RULES, type DayBar, type PaperOrder } from '@/lib/paper'

/**
 * 모의투자 계좌(2026-11-03). paper_orders(스캔이 매일 넣는 주문)와 일봉으로 계좌를 처음부터 다시 계산한다.
 * 표(supabase/add_paper.sql)가 아직 없으면 needsTable — 화면이 '준비 중'을 띄운다.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** 크립토는 업비트(KRW-BTC)와 바이낸스(BTCUSDT) 기호가 섞여 있다 — app/api/levels/route.ts와 같은 규칙 */
const sourceOf = (market: Market, symbol: string) =>
  market !== 'crypto' ? 'yahoo' as const : symbol.startsWith('KRW-') ? 'upbit' as const : 'binance' as const

const day = (t: number) => new Date(t * 1000).toISOString().slice(0, 10)   // scan.mjs 데이터 기준일과 같은 방식

async function dayBars(market: Market, symbol: string, source = sourceOf(market, symbol)): Promise<DayBar[]> {
  const bars = await fetchBarsFor({ symbol, source }, '1y')
  return (bars ?? []).filter(b => b.h != null && b.l != null)
    .map(b => ({ d: day(b.t), h: b.h as number, l: b.l as number, c: b.c }))
}

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get('market') ?? 'us'
  const market: Market = isMarket(raw) ? raw : 'us'
  const U = process.env.NEXT_PUBLIC_SUPABASE_URL, K = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!U || !K) return NextResponse.json({ error: 'Supabase 설정이 없다' }, { status: 500 })

  const res = await fetch(`${U}/rest/v1/paper_orders?select=rule,date,symbol,name,entry,stop,target&market=eq.${market}&order=date.asc&limit=5000`,
    { headers: { apikey: K, Authorization: `Bearer ${K}` }, cache: 'no-store' })
  if (!res.ok) {
    const body = await res.text()
    // 표가 없을 때 PostgREST는 404 또는 42P01/PGRST205를 준다
    if (res.status === 404 || /42P01|PGRST205|does not exist|Could not find the table/.test(body)) {
      return NextResponse.json({ market, needsTable: true, rules: PAPER_RULES })
    }
    console.error('[paper] orders', res.status, body.slice(0, 200))
    return NextResponse.json({ error: `주문을 못 읽었다(${res.status})` }, { status: 502 })
  }
  const rows = (await res.json()) as (PaperOrder & { rule: 'A' | 'B' })[]
  const orders = rows.map(r => ({ ...r, entry: Number(r.entry), stop: Number(r.stop), target: Number(r.target) }))
  const cfg = PAPER_ACCOUNTS[market]
  if (!orders.length) return NextResponse.json({ market, rules: PAPER_RULES, seed: cfg.seed, accounts: null })

  const symbols = [...new Set(orders.map(o => o.symbol))]
  const bars: Record<string, DayBar[]> = {}
  let failed = 0
  await pool(symbols, async s => {
    try { bars[s] = await dayBars(market, s) } catch (e) { failed++; console.error('[paper] bars', s, e) }
  }, 8)

  const since = orders[0].date
  const bench = MARKETS[market].benchmark
  const bb = (await dayBars(market, bench.symbol, bench.source).catch(() => [])).filter(b => b.d >= since)
  const benchPct = bb.length >= 2 ? (bb.at(-1)!.c / bb[0].c - 1) * 100 : null

  const accounts = Object.fromEntries((['A', 'B'] as const).map(rule => {
    const r = runAccount(orders.filter(o => o.rule === rule), bars, cfg)
    const last = r.equity.at(-1)?.equity ?? cfg.seed
    const wins = r.closed.filter(t => t.pnl > 0).length
    return [rule, {
      ...r,
      orders: orders.filter(o => o.rule === rule).length,
      summary: {
        equity: last, pct: (last / cfg.seed - 1) * 100,
        realized: r.closed.reduce((s, t) => s + t.pnl, 0),
        trades: r.closed.length, winPct: r.closed.length ? wins / r.closed.length * 100 : null,
        avgR: r.closed.length ? r.closed.reduce((s, t) => s + t.r, 0) / r.closed.length : null,
      },
    }]
  }))
  return NextResponse.json({ market, rules: PAPER_RULES, seed: cfg.seed, since, benchPct, benchLabel: bench.label, failed, accounts })
}
