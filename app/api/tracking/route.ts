import { NextResponse } from 'next/server'
import {
  TIERS, CATS, tierOf, buildCategories, TIER_EVIDENCE,
  type TierId, type CatKey, type Regime, type ScreenerRow,
} from '@/lib/screener-shared'

// 스크리너에 뜬 종목이 실제로 올랐는지 사후 확인.
//
// 백테스트는 과거 데이터를 되짚은 것이라 생존편향·표본중복 같은 함정이 있다.
// 이건 실시간으로 쌓이는 기록이라 그런 함정이 없다.
//
// 다만 한 달 추적으로는 통계적 결론이 안 난다. 54% vs 48%를 유의하게 검출하려면
// 독립 표본 1,000건 이상이 필요한데, 20일 창이 겹치므로 하루에 1/20개꼴로 쌓인다.
// 목적은 증명이 아니라 (1) 대참사 조기 발견 (2) 백테스트와 방향이 어긋나는지 확인.
//
// 구현: 과거 스냅샷의 진입가와 최신 스냅샷의 현재가를 심볼로 조인한다.
// 별도 갱신 잡이 필요 없다.

export const revalidate = 600

const HORIZONS = [5, 10, 20]   // 거래일. 백테스트가 20일 기준이라 거기 맞춘다

interface DbRow {
  symbol: string; name: string | null; sector: string | null; market_cap: number | null
  f5: number | null; f20: number | null; f60: number | null
  rvol: number | null; chg20: number | null; pct_b: number | null; price: number | null
}
interface Snap {
  id: number; scanned_at: string; regime: Regime
  spy_chg20: number | null; spy_price: number | null
}

function sbUrl() {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
    .replace(/\/+$/, '').replace(/\/rest\/v1$/, '')
}

async function readRows(url: string, headers: HeadersInit, snapshotId: number): Promise<ScreenerRow[]> {
  // PostgREST는 한 번에 1,000행만 준다
  const PAGE = 1000
  const raw: DbRow[] = []
  for (let from = 0; from < 10000; from += PAGE) {
    const res = await fetch(
      `${url}/rest/v1/screener_rows?select=*&snapshot_id=eq.${snapshotId}&order=id.asc`,
      { headers: { ...headers, Range: `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items' }, next: { revalidate: 600 } }
    )
    if (!res.ok) break
    const page = await res.json()
    if (!Array.isArray(page) || page.length === 0) break
    raw.push(...page)
    if (page.length < PAGE) break
  }
  return raw.map(r => ({
    symbol: r.symbol,
    name: r.name ?? '',
    sector: r.sector ?? '',
    marketCap: r.market_cap ?? 0,
    tier: tierOf(r.market_cap ?? 0),
    f5: r.f5, f20: r.f20, f60: r.f60,
    rvol: r.rvol, chg20: r.chg20, pctB: r.pct_b,
    price: r.price,
  }))
}

interface Result {
  n: number
  /** 절대 수익률 평균 */
  avg: number
  /** 중앙값 — 평균은 극단값에 끌려간다 */
  med: number
  /** SPY 대비 초과수익 평균 */
  exAvg: number
  exMed: number
  /** SPY를 이긴 비율 */
  hit: number
  /** 절대 기준 상승 비율 */
  up: number
}

function summarize(pairs: { ret: number; ex: number }[]): Result | null {
  if (!pairs.length) return null
  const rets = pairs.map(p => p.ret), exs = pairs.map(p => p.ex)
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
  const med = (a: number[]) => {
    const s = [...a].sort((x, y) => x - y), h = s.length >> 1
    return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2
  }
  return {
    n: pairs.length,
    avg: mean(rets), med: med(rets),
    exAvg: mean(exs), exMed: med(exs),
    hit: (exs.filter(v => v > 0).length / exs.length) * 100,
    up: (rets.filter(v => v > 0).length / rets.length) * 100,
  }
}

export async function GET() {
  const url = sbUrl()
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim()
  if (!url || !key) return NextResponse.json({ error: 'supabase 미설정', horizons: [] })

  try {
    const headers = { apikey: key, Authorization: `Bearer ${key}` }
    const snapRes = await fetch(
      `${url}/rest/v1/screener_snapshots?select=id,scanned_at,regime,spy_chg20,spy_price&order=scanned_at.desc&limit=90`,
      { headers, next: { revalidate: 600 } }
    )
    if (!snapRes.ok) throw new Error(`snapshots ${snapRes.status}`)
    const allSnaps: Snap[] = await snapRes.json()

    // 하루에 여러 번 스캔되는 경우가 있다(스키마 변경 후 수동 실행 등).
    // "스냅샷 1개 = 1거래일" 가정이 깨지므로 날짜별 최신 것만 남긴다.
    const seen = new Set<string>()
    const snaps = allSnaps.filter(s => {
      const d = new Date(s.scanned_at).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
      if (seen.has(d)) return false
      seen.add(d)
      return true
    })

    if (snaps.length < 2) {
      return NextResponse.json({
        horizons: [], snapshotCount: snaps.length, rawCount: allSnaps.length,
        note: '거래일 기준 스냅샷이 2개 이상 쌓여야 추적이 시작된다. 평일 1회 스캔이므로 내일부터 보인다.',
      })
    }

    // 최신 = 현재가 기준
    const latest = snaps[0]
    const latestRows = await readRows(url, headers, latest.id)
    const nowPrice = new Map(latestRows.filter(r => r.price).map(r => [r.symbol, r.price!]))
    if (nowPrice.size === 0) {
      return NextResponse.json({
        horizons: [], snapshotCount: snaps.length,
        note: '진입가(price)가 저장된 스냅샷이 없다. 스캔을 한 번 더 돌려야 추적이 시작된다.',
      })
    }

    const out = []
    for (const h of HORIZONS) {
      // h 거래일 전 스냅샷 (날짜 중복 제거 후이므로 인덱스가 곧 거래일 수)
      const past = snaps[h]
      if (!past || past.spy_price == null || latest.spy_price == null) continue

      const rows = await readRows(url, headers, past.id)
      if (!rows.length) continue
      const spyRet = ((latest.spy_price - past.spy_price) / past.spy_price) * 100
      const cats = buildCategories(rows)

      const byCat: Record<string, Record<string, Result | null>> = {}
      for (const c of CATS) {
        byCat[c.key] = {}
        for (const t of TIERS) {
          const pairs = cats[t.id][c.key]
            .filter(r => r.price && nowPrice.has(r.symbol))
            .map(r => {
              const ret = ((nowPrice.get(r.symbol)! - r.price!) / r.price!) * 100
              return { ret, ex: ret - spyRet }
            })
          byCat[c.key][t.id] = summarize(pairs)
        }
        // 구간 합산
        const all = TIERS.flatMap(t => cats[t.id][c.key])
          .filter(r => r.price && nowPrice.has(r.symbol))
          .map(r => {
            const ret = ((nowPrice.get(r.symbol)! - r.price!) / r.price!) * 100
            return { ret, ex: ret - spyRet }
          })
        byCat[c.key].all = summarize(all)
      }

      out.push({
        days: h,
        from: past.scanned_at,
        to: latest.scanned_at,
        regime: past.regime,
        spyRet,
        byCat,
      })
    }

    return NextResponse.json({
      horizons: out,
      snapshotCount: snaps.length,
      rawCount: allSnaps.length,
      latestAt: latest.scanned_at,
      evidence: TIER_EVIDENCE,
      note: out.length === 0
        ? '아직 비교할 과거 스냅샷이 부족하다. 스캔이 쌓이면 5일치부터 보인다.'
        : null,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e), horizons: [] })
  }
}
