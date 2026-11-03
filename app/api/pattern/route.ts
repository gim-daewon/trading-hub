import { NextResponse } from 'next/server'
import { isMarket, type Market } from '@/lib/markets'
import type { CupNow } from '@/lib/cup-fib'

/**
 * 컵 패턴 메뉴(/pattern) — 마지막 스캔에서 cup 칸이 채워진 종목만.
 *
 * 스캔(scripts/scan.mjs)이 종목마다 lib/cup-fib.ts의 cupFibNow를 계산해 저장한다.
 * cup 칸이 아직 없으면(supabase/add_cup.sql 미실행) needsColumn으로 알린다 — 빈 목록과 구분해야 한다.
 */
export const dynamic = 'force-dynamic'

export interface PatternRow {
  symbol: string; display: string; name: string; sector: string | null
  marketCap: number | null; price: number | null; cup: CupNow
}

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get('market') ?? 'us'
  const market: Market = isMarket(raw) ? raw : 'us'
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '')
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim()
  if (!url || !key) return NextResponse.json({ error: 'Supabase 설정이 없다' }, { status: 500 })
  const headers = { apikey: key, Authorization: `Bearer ${key}` }

  try {
    const snapRes = await fetch(
      `${url}/rest/v1/screener_snapshots?select=id,bar_date,scanned_at&market=eq.${market}&order=scanned_at.desc&limit=1`,
      { headers, cache: 'no-store' })
    if (!snapRes.ok) throw new Error(`스냅샷 조회 ${snapRes.status}`)
    const [snap] = await snapRes.json()
    if (!snap) return NextResponse.json({ rows: [], barDate: null })

    const res = await fetch(
      `${url}/rest/v1/screener_rows?select=symbol,display,name,sector,market_cap,price,cup` +
      `&snapshot_id=eq.${snap.id}&cup=not.is.null&limit=1000`,
      { headers, cache: 'no-store' })
    if (!res.ok) {
      const text = await res.text()
      // 칸이 없을 때 PostgREST는 42703(column does not exist)을 준다
      if (text.includes('42703') || /column .*cup/i.test(text)) {
        return NextResponse.json({ rows: [], barDate: snap.bar_date, needsColumn: true })
      }
      throw new Error(`행 조회 ${res.status}: ${text.slice(0, 120)}`)
    }
    type DbRow = { symbol: string; display: string | null; name: string | null; sector: string | null; market_cap: number | null; price: number | null; cup: CupNow | null }
    const rows: PatternRow[] = ((await res.json()) as DbRow[])
      // 저장된 jsonb는 바깥 값이다. 숫자가 비면 화면 계산이 NaN이 되므로 여기서 거른다
      .filter(r => r.cup && (r.cup.stage === 'entry' || r.cup.stage === 'watch')
        && [r.cup.entry, r.cup.stop, r.cup.target].every(Number.isFinite))
      .map(r => ({ symbol: r.symbol, display: r.display ?? r.symbol, name: r.name ?? '', sector: r.sector,
        marketCap: r.market_cap, price: r.price, cup: r.cup as CupNow }))
    return NextResponse.json({ rows, barDate: snap.bar_date, scannedAt: snap.scanned_at })
  } catch (e) {
    console.error('[pattern]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }
}
