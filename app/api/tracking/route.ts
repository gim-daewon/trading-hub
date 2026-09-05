import { NextResponse } from 'next/server'
import {
  TIERS, CATS, BREAKOUTS, tierOf, buildCategories, buildBreakouts,
  TIER_EVIDENCE, STOPPING_RULE,
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

/**
 * 라우트를 동적으로 둔다.
 *
 * 스냅샷 메타를 캐시하면 새 스캔이 돌아도 앱이 옛 id를 물고 있어
 * 갱신이 영영 안 온다(실측: 스캔 40분 뒤에도 이전 스냅샷 표시).
 * 그래서 메타는 no-store로 매번 확인하고,
 * 무거운 행 조회는 URL에 snapshot_id가 들어가 있어 12시간 캐시해도 안전하다 —
 * 스냅샷이 바뀌면 URL이 바뀌어 자동으로 새로 받는다.
 */
export const dynamic = 'force-dynamic'

// 거래일. 20일은 백테스트 기준이라 필수, 60일은 섹터 검정에서 보유기간별로
// 결과가 갈려서 추가했다. 60거래일치가 쌓이려면 약 3개월 걸린다.
// 1일을 넣는다. 스냅샷이 매일 쌓이므로 다음 거래일이면 바로 결과가 나온다 —
// 5일을 기다릴 이유가 없다. 다만 1일 손익비는 '규칙 손익비'가 아니다.
// 손절 -3%/익절 +9% 규칙의 손익비(2.5~2.9)는 규칙이 만드는 값이고,
// 여기 1일 손익비는 하루 등락의 비대칭(상방이 하방보다 큰가)을 잰다. 다른 지표다.
const HORIZONS = [1, 5, 10, 20, 60]

// 화면에 뜬 개수(25)와, 표본을 늘린 확장 집합(50)을 따로 잰다.
// 확장 표본은 통계적 힘을 위한 참고치일 뿐 "내가 본 것의 성적"이 아니다.
const SHOWN_LIMIT = 25
const EXTENDED_LIMIT = 50

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
  // PostgREST 페이징: offset+limit 쿼리 파라미터만 쓴다.
  //
  // Range 헤더는 쓰지 않는다. 두 가지 문제가 겹친다:
  //  1) offset과 같이 주면 결과가 깨진다 (offset=1000 + Range 0-999 -> 4행)
  //  2) Next의 fetch 캐시는 URL로만 중복 제거해서, 헤더만 다른 요청이
  //   같은 응답으로 합쳐진다 -> 1페이지가 반복돼 중복 행이 쌓인다
  // 실측: offset=0/1000/2000 + limit=1000 -> 1000 + 1000 + 124 = 2124행 (정확)
  const PAGE = 1000
  const raw: DbRow[] = []
  for (let from = 0; from < 10000; from += PAGE) {
    const res = await fetch(
      `${url}/rest/v1/screener_rows?select=*&snapshot_id=eq.${snapshotId}` +
      `&order=id.asc&offset=${from}&limit=${PAGE}`,
      // 특정 스냅샷의 행은 절대 변하지 않는다. 길게 캐시해도 된다
      { headers, next: { revalidate: 43200 } }
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
  /** 절대 기준 상승 비율 = 승률 */
  up: number
  /** 손익비 — 오른 종목 평균 / |내린 종목 평균| */
  rr: number
  /** 거래당 기댓값 = 전체 평균 수익률. 판정은 이걸로 한다 */
  exp: number
}

function summarize(pairs: { ret: number; ex: number }[]): Result | null {
  if (!pairs.length) return null
  const rets = pairs.map(p => p.ret), exs = pairs.map(p => p.ex)
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
  const med = (a: number[]) => {
    const s = [...a].sort((x, y) => x - y), h = s.length >> 1
    return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2
  }
  const wins = rets.filter(v => v > 0), losses = rets.filter(v => v <= 0)
  return {
    n: pairs.length,
    avg: mean(rets), med: med(rets),
    exAvg: mean(exs), exMed: med(exs),
    hit: (exs.filter(v => v > 0).length / exs.length) * 100,
    up: (wins.length / rets.length) * 100,
    rr: losses.length ? mean(wins) / Math.abs(mean(losses)) : 0,
    exp: mean(rets),
  }
}

export async function GET() {
  const url = sbUrl()
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim()
  if (!url || !key) return NextResponse.json({ error: 'supabase 미설정', horizons: [] })

  try {
    const headers = { apikey: key, Authorization: `Bearer ${key}` }
    // 스냅샷 메타 조회는 캐시하지 않는다.
    //
    // 이걸 캐시하면 새 스캔이 돌아도 앱이 옛 스냅샷 id를 계속 들고 있어
    // 갱신이 영영 안 온다. 실제로 스캔 후 40분이 지나도 화면이 안 바뀌었다.
    // 행(rows) 조회는 URL에 snapshot_id가 들어가므로, 스냅샷이 바뀌면
    // URL이 바뀌어 자동으로 새로 받는다 — 캐시를 그대로 둬도 안전하다.
    // 비용은 요청당 1행 조회 하나뿐이다.
    const snapRes = await fetch(
      `${url}/rest/v1/screener_snapshots?select=id,scanned_at,regime,spy_chg20,spy_price&order=scanned_at.desc&limit=90`,
      { headers, cache: 'no-store' }
    )
    if (!snapRes.ok) throw new Error(`snapshots ${snapRes.status}`)
    const allSnaps: Snap[] = await snapRes.json()

    // "스냅샷 1개 = 1거래일"이 성립해야 snaps[5]를 '5거래일 전'으로 쓸 수 있다.
    // 세 가지를 걸러야 그 가정이 유지된다:
    //
    //  1) 같은 날 여러 번 스캔 (스키마 변경 후 수동 실행 등)
    //  2) 주말 수동 실행 — 실제로 있었다(2026-08-29 토, 08-30 일).
    //     그대로 두면 '5거래일 전'이 실제로는 3거래일 전이 된다
    //  3) spy_price가 없는 초기 스냅샷 (컬럼 추가 전)
    //
    // 휴장일은 요일로 못 거른다. 대신 직전 스냅샷과 spy_price가 같으면
    // 그 사이에 거래가 없었다는 뜻이므로 같이 제외한다.
    const seen = new Set<string>()
    const deduped = allSnaps.filter(s => {
      if (s.spy_price == null) return false
      const et = new Date(s.scanned_at).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
      if (seen.has(et)) return false
      // en-CA는 YYYY-MM-DD를 준다. UTC 정오로 파싱해 시간대 밀림을 막는다
      const dow = new Date(`${et}T12:00:00Z`).getUTCDay()
      if (dow === 0 || dow === 6) return false
      seen.add(et)
      return true
    })

    // 최신순 정렬이므로 뒤쪽이 과거다. 값이 같으면 휴장으로 보고 과거 쪽을 버린다
    const snaps = deduped.filter((s, i) => i === 0 || s.spy_price !== deduped[i - 1].spy_price)

    if (snaps.length < 2) {
      return NextResponse.json({
        horizons: [], snapshotCount: snaps.length, rawCount: allSnaps.length,
        note: `거래일 기준 스냅샷이 2개 이상 쌓여야 추적이 시작된다 (현재 ${snaps.length}개). 평일 1회 스캔이므로 내일부터 보인다.`,
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
      // snaps는 거래일 1개씩으로 정리돼 있으므로 인덱스가 곧 거래일 수다
      const past = snaps[h]
      if (!past || past.spy_price == null || latest.spy_price == null) continue

      const rows = await readRows(url, headers, past.id)
      if (!rows.length) continue
      const spyRet = ((latest.spy_price - past.spy_price) / past.spy_price) * 100
      const cats = buildCategories(rows, SHOWN_LIMIT)
      const catsExt = buildCategories(rows, EXTENDED_LIMIT)

      // 진입가와 현재가를 심볼로 이어 수익률 쌍을 만든다
      const toPairs = (list: ScreenerRow[]) => list
        .filter(r => r.price && nowPrice.has(r.symbol))
        .map(r => {
          const ret = ((nowPrice.get(r.symbol)! - r.price!) / r.price!) * 100
          return { ret, ex: ret - spyRet }
        })

      const byCat: Record<string, Record<string, Result | null>> = {}
      // 확장 표본(50개)은 따로 담는다. 화면에 안 뜬 종목이 섞이므로
      // "내가 본 것의 성적"과 절대 합치면 안 된다
      const byCatExt: Record<string, Result | null> = {}

      for (const c of CATS) {
        byCat[c.key] = {}
        for (const t of TIERS) {
          byCat[c.key][t.id] = summarize(toPairs(cats[t.id][c.key]))
        }
        byCat[c.key].all = summarize(toPairs(TIERS.flatMap(t => cats[t.id][c.key])))
        byCatExt[c.key] = summarize(toPairs(TIERS.flatMap(t => catsExt[t.id][c.key])))
      }

      // VWMA 신호도 같이 추적한다. 화면에 띄우면서 성적을 안 재고 있었다
      const bo = buildBreakouts(rows, SHOWN_LIMIT)
      const byBreakout: Record<string, Result | null> = {}
      for (const b of BREAKOUTS) {
        byBreakout[b.key] = summarize(toPairs(TIERS.flatMap(t => bo[t.id][b.key])))
      }

      out.push({
        days: h,
        from: past.scanned_at,
        to: latest.scanned_at,
        regime: past.regime,
        spyRet,
        byCat,
        byCatExt,
        byBreakout,
      })
    }

    return NextResponse.json({
      horizons: out,
      snapshotCount: snaps.length,
      rawCount: allSnaps.length,
      // 어느 horizon이 언제부터 보이는지 화면에서 알 수 있게 한다
      tradingDays: snaps.map(x => new Date(x.scanned_at).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })),
      latestAt: latest.scanned_at,
      evidence: TIER_EVIDENCE,
      // 중단 기준을 응답에 실어 화면에서 "언제 무엇을 근거로 접는지" 보이게 한다
      stoppingRule: STOPPING_RULE,
      limits: { shown: SHOWN_LIMIT, extended: EXTENDED_LIMIT },
      note: out.length === 0
        ? '아직 비교할 과거 스냅샷이 부족하다. 스캔이 쌓이면 5일치부터 보인다.'
        : null,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e), horizons: [] })
  }
}
