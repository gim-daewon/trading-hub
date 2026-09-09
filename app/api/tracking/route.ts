import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import {
  tiersFor, CATS, BREAKOUTS, tierOf, buildCategories, buildBreakouts,
  TIER_EVIDENCE, STOPPING_RULE, changesSince,
  type TierId, type CatKey, type Regime, type ScreenerRow,
} from '@/lib/screener-shared'
import { isMarket, type Market } from '@/lib/markets'

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
  high?: number | null
  symbol: string; name: string | null; sector: string | null; market_cap: number | null
  f5: number | null; f20: number | null; f60: number | null
  rvol: number | null; chg20: number | null; pct_b: number | null; price: number | null
  cap_known?: boolean | null
  vwma20: number | null; vwma60: number | null; above_run: number | null
  w_close: number | null; w_vwma20: number | null; w_vwma60: number | null
  w_above_run: number | null; prev_run: number | null; w_prev_run: number | null
  low: number | null; w_low: number | null
}
interface Snap {
  id: number; scanned_at: string; regime: Regime
  spy_chg20: number | null; spy_price: number | null; bar_date: string | null
}

function sbUrl() {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
    .replace(/\/+$/, '').replace(/\/rest\/v1$/, '')
}

/**
 * 스냅샷 행 읽기 — **스냅샷 id로 캐시한다.**
 *
 * 저장된 행은 절대 변하지 않는다. 그런데 요청마다 6개 스냅샷 x 2,700행을
 * 다시 받아 신호를 다시 계산했다 — 실측 응답이 11.3초였다.
 * id가 키에 들어가므로 새 스캔이 돌면 자동으로 새로 만든다.
 */
const readRows = unstable_cache(
  async (
    url: string, key: string, snapshotId: number, market: Market,
  ): Promise<ScreenerRow[]> => {
  const headers = { apikey: key, Authorization: `Bearer ${key}` }
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
      // 바깥의 unstable_cache가 이미 결과를 잡는다. 이중 캐시는 무효화만 헷갈린다
      { headers, cache: 'no-store' }
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
        // cap_known이 false면 시총 미상이다. 초소형으로 단정하면 통계가 오염된다.
    // 컬럼 추가 전 스냅샷은 undefined라 시총으로 판정한다
    tier: r.cap_known === false ? 'unknown' : tierOf(r.market_cap ?? 0, market),
    f5: r.f5, f20: r.f20, f60: r.f60,
    rvol: r.rvol, chg20: r.chg20, pctB: r.pct_b,
    // VWMA 필드를 빠뜨려서 buildBreakouts가 전부 undefined를 보고
    // 신호를 하나도 못 잡고 있었다. 화면엔 표가 있는데 값이 비었다
    vwma20: r.vwma20, vwma60: r.vwma60, aboveRun: r.above_run,
    wClose: r.w_close, wVwma20: r.w_vwma20, wVwma60: r.w_vwma60,
    wAboveRun: r.w_above_run, prevRun: r.prev_run, wPrevRun: r.w_prev_run,
    low: r.low, wLow: r.w_low,
    high: r.high,
    price: r.price,
  }))
  },
  ['tracking-rows'],
  { revalidate: 86400 },
)

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

/**
 * 손절 -3% / 익절 +9% 규칙을 **실제 경로로** 판정한다.
 *
 * 12월 8일 판정 기준이 "거래당 기댓값(손절 -3%/익절 +9%)"인데
 * 추적은 단순 수익률만 재고 있었다. 이대로면 12월에 판정할 근거가 없다.
 *
 * 두 시점(진입·현재)만으로는 규칙을 못 잰다 — 중간에 손절을 찍고 되돌아왔는지
 * 알 수 없기 때문이다. 그래서 사이의 스냅샷을 하루씩 걸어가며 판정한다.
 *
 * 한계를 분명히 해둔다:
 *  - 스캔이 빠진 날은 경로에 구멍이 생긴다. 그날 찍힌 손절을 놓친다
 *  - 같은 날 손절·익절이 둘 다 닿으면 손절로 본다 (보수적)
 *  - 고가(high)를 저장하기 전 스냅샷은 종가로 익절을 판정한다. 손절은 저가로
 *    정확히 재므로 그 구간은 손실 쪽으로 치우친다 — hasHigh로 표시한다
 */
const RULE_STOP = 3, RULE_TARGET = 9

interface RuleOutcome { ret: number; days: number; hit: 'stop' | 'target' | 'open' }

function judgeRule(
  entry: number,
  path: { high: number | null; low: number | null; close: number }[],
): RuleOutcome {
  const stopPx = entry * (1 - RULE_STOP / 100)
  const tgtPx = entry * (1 + RULE_TARGET / 100)
  for (let k = 0; k < path.length; k++) {
    const b = path[k]
    // 같은 날 둘 다 닿으면 손절 (보수적)
    if ((b.low ?? b.close) <= stopPx) return { ret: -RULE_STOP, days: k + 1, hit: 'stop' }
    if ((b.high ?? b.close) >= tgtPx) return { ret: RULE_TARGET, days: k + 1, hit: 'target' }
  }
  const last = path[path.length - 1]?.close ?? entry
  return { ret: ((last - entry) / entry) * 100, days: path.length, hit: 'open' }
}

interface RuleResult {
  n: number; exp: number; win: number; rr: number
  stopped: number; hitTarget: number; open: number; days: number
  /** 경로에 고가가 있었나. false면 익절 판정이 보수적으로 치우친다 */
  hasHigh: boolean
}

function summarizeRule(outs: RuleOutcome[], hasHigh: boolean): RuleResult | null {
  if (!outs.length) return null
  const rets = outs.map(o => o.ret)
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
  const wins = rets.filter(v => v > 0), losses = rets.filter(v => v <= 0)
  return {
    n: outs.length,
    exp: mean(rets),
    win: (wins.length / rets.length) * 100,
    rr: losses.length && wins.length ? Math.abs(mean(wins) / mean(losses)) : 0,
    stopped: outs.filter(o => o.hit === 'stop').length,
    hitTarget: outs.filter(o => o.hit === 'target').length,
    open: outs.filter(o => o.hit === 'open').length,
    days: mean(outs.map(o => o.days)),
    hasHigh,
  }
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


/**
 * 구간별 성과 계산. 최신 스냅샷 id로 캐시된다.
 *
 * 입력이 전부 스냅샷 id이고 저장된 행은 변하지 않으므로 결과도 변하지 않는다.
 * 새 스캔이 돌면 latest.id가 달라져 캐시 키가 바뀐다.
 */
const buildHorizons = unstable_cache(
  async (url: string, key: string, market: Market, snaps: Snap[]) => {
    const latest = snaps[0]
    const latestRows = await readRows(url, key, latest.id, market)
    const nowPrice = new Map(latestRows.filter(r => r.price).map(r => [r.symbol, r.price!]))
    if (nowPrice.size === 0) return []
    // 규칙 판정에 쓸 경로. snaps[0]이 최신이므로 뒤에서 앞으로가 시간순이다.
    // readRows가 스냅샷 id로 캐시되니 같은 스냅샷을 여러 구간이 재사용해도 싸다
    const maxH = Math.max(...HORIZONS.filter(h => snaps[h]))
    const pathSnaps: Map<string, { high: number | null; low: number | null; close: number }>[] = []
    for (let i = Math.min(maxH, snaps.length - 1); i >= 0; i--) {
      const rs = await readRows(url, key, snaps[i].id, market)
      pathSnaps.push(new Map(rs.filter(r => r.price != null)
        .map(r => [r.symbol, { high: r.high ?? null, low: r.low ?? null, close: r.price! }])))
    }
    // pathSnaps[0]이 가장 과거다. 구간 h의 경로는 진입 다음 날부터 오늘까지
    const pathIndexOf = (h: number) => pathSnaps.length - h   // 진입일 바로 다음 인덱스

    const out = []
    for (const h of HORIZONS) {
      // snaps는 거래일 1개씩으로 정리돼 있으므로 인덱스가 곧 거래일 수다
      const past = snaps[h]
      if (!past || past.spy_price == null || latest.spy_price == null) continue

      const rows = await readRows(url, key, past.id, market)
      if (!rows.length) continue
      const spyRet = ((latest.spy_price - past.spy_price) / past.spy_price) * 100
      const cats = buildCategories(rows, market, SHOWN_LIMIT)
      const catsExt = buildCategories(rows, market, EXTENDED_LIMIT)

      // 진입가와 현재가를 심볼로 이어 수익률 쌍을 만든다
      const toPairs = (list: ScreenerRow[]) => list
        .filter(r => r.price && nowPrice.has(r.symbol))
        .map(r => {
          const ret = ((nowPrice.get(r.symbol)! - r.price!) / r.price!) * 100
          return { ret, ex: ret - spyRet }
        })

      // 손절 -3% / 익절 +9% 규칙 판정. 12월 8일 판정 기준이 이것이다
      const start = pathIndexOf(h)
      const hasHigh = pathSnaps.slice(start).every(m => [...m.values()].some(v => v.high != null))
      const toRule = (list: ScreenerRow[]) => list
        .filter(r => r.price != null)
        .map(r => {
          const path = pathSnaps.slice(start)
            .map(m => m.get(r.symbol))
            .filter((v): v is { high: number | null; low: number | null; close: number } => !!v)
          return path.length ? judgeRule(r.price!, path) : null
        })
        .filter((o): o is RuleOutcome => !!o)

      const byCatRule: Record<string, RuleResult | null> = {}
      const byBreakoutRule: Record<string, RuleResult | null> = {}

      const byCat: Record<string, Record<string, Result | null>> = {}
      // 확장 표본(50개)은 따로 담는다. 화면에 안 뜬 종목이 섞이므로
      // "내가 본 것의 성적"과 절대 합치면 안 된다
      const byCatExt: Record<string, Result | null> = {}

      for (const c of CATS) {
        byCat[c.key] = {}
        for (const t of tiersFor(market)) {
          byCat[c.key][t.id] = summarize(toPairs(cats[t.id][c.key]))
        }
        byCat[c.key].all = summarize(toPairs(tiersFor(market).flatMap(t => cats[t.id][c.key])))
        byCatExt[c.key] = summarize(toPairs(tiersFor(market).flatMap(t => catsExt[t.id][c.key])))
        byCatRule[c.key] = summarizeRule(toRule(tiersFor(market).flatMap(t => cats[t.id][c.key])), hasHigh)
      }

      // VWMA 신호도 같이 추적한다. 화면에 띄우면서 성적을 안 재고 있었다
      const bo = buildBreakouts(rows, market, SHOWN_LIMIT)
      const byBreakout: Record<string, Result | null> = {}
      for (const b of BREAKOUTS) {
        const list = tiersFor(market).flatMap(t => bo[t.id][b.key])
        byBreakout[b.key] = summarize(toPairs(list))
        byBreakoutRule[b.key] = summarizeRule(toRule(list), hasHigh)
      }

      out.push({
        days: h,
        // 스캔 시각이 아니라 데이터 기준일을 쓴다. 야후가 당일 봉을 늦게 주면
        // 둘이 하루씩 어긋나 "언제부터 언제까지"가 틀리게 표시된다
        from: past.bar_date ?? past.scanned_at,
        to: latest.bar_date ?? latest.scanned_at,
        // 이 구간이 정의 변경일을 걸치면, 아래 성적은 **그때 화면에 떴던
        // 종목이 아니라** 지금 정의로 다시 묶은 종목의 성적이다
        defChanges: changesSince(past.bar_date ?? past.scanned_at),
        regime: past.regime,
        spyRet,
        byCat,
        byCatExt,
        byBreakout,
        // 12월 8일 판정에 쓸 값. 단순 수익률(byCat)과 다르다 —
        // 이건 손절 -3% / 익절 +9% 규칙을 실제 경로로 적용한 결과다
        byCatRule,
        byBreakoutRule,
        ruleHasHigh: hasHigh,
      })
    }


    return out
  },
  ['tracking-horizons'],
  { revalidate: 86400 },
)

export async function GET(req: Request) {
  const rawMarket = new URL(req.url).searchParams.get('market') ?? 'us'
  const market: Market = isMarket(rawMarket) ? rawMarket : 'us'
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
      `${url}/rest/v1/screener_snapshots` +
      `?select=id,scanned_at,regime,spy_chg20,spy_price,bar_date` +
      `&market=eq.${market}&order=scanned_at.desc&limit=90`,
      { headers, cache: 'no-store' }
    )
    if (!snapRes.ok) throw new Error(`snapshots ${snapRes.status}`)
    const allSnaps: Snap[] = await snapRes.json()

    // "스냅샷 1개 = 1거래일"이 성립해야 snaps[1]을 '1거래일 전'으로 쓸 수 있다.
    //
    // 판정은 반드시 bar_date(데이터 기준일)로 한다. scanned_at(스캔 시각)이 아니다.
    // 실제로 토요일 ET에 수동 실행한 스캔이 '주말'로 걸러졌는데,
    // 그 데이터의 기준일은 금요일로 멀쩡한 거래일이었다.
    // 스캔을 언제 돌렸는지는 아무 상관이 없다 — 어느 날 데이터인지가 전부다.
    //
    // bar_date가 없는 옛 스냅샷은 scanned_at의 ET 날짜로 대체한다.
    const etDate = (s: Snap) =>
      s.bar_date ?? new Date(s.scanned_at).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

    const seen = new Set<string>()
    const deduped = allSnaps.filter(s => {
      if (s.spy_price == null) return false
      const d = etDate(s)
      if (seen.has(d)) return false
      // en-CA는 YYYY-MM-DD를 준다. UTC 정오로 파싱해 시간대 밀림을 막는다
      const dow = new Date(`${d}T12:00:00Z`).getUTCDay()
      if (dow === 0 || dow === 6) return false     // 거래일 데이터가 아니다
      seen.add(d)
      return true
    })

    // 최신순이므로 뒤쪽이 과거다. spy_price가 같으면 휴장으로 보고 과거 쪽을 버린다
    const snaps = deduped.filter((s, i) => i === 0 || s.spy_price !== deduped[i - 1].spy_price)

    if (snaps.length < 2) {
      return NextResponse.json({
        horizons: [], snapshotCount: snaps.length, rawCount: allSnaps.length,
        note: `거래일 기준 스냅샷이 2개 이상 쌓여야 추적이 시작된다 (현재 ${snaps.length}개). 평일 1회 스캔이므로 내일부터 보인다.`,
      })
    }

    // 최신 = 현재가 기준
    const latest = snaps[0]
    const latestRows = await readRows(url, key, latest.id, market)
    const nowPrice = new Map(latestRows.filter(r => r.price).map(r => [r.symbol, r.price!]))
    if (nowPrice.size === 0) {
      return NextResponse.json({
        horizons: [], snapshotCount: snaps.length,
        note: '진입가(price)가 저장된 스냅샷이 없다. 스캔을 한 번 더 돌려야 추적이 시작된다.',
      })
    }


    // 구간 계산 전체를 **최신 스냅샷 id로** 캐시한다.
    //
    // 행 단위 캐시만으로는 부족했다 — 캐시가 적중해도 6개 스냅샷 x 2,700행을
    // 다시 맵으로 만들고 신호를 다시 판정해 6.6초가 걸렸다.
    // 60일 구간이 쌓이면 61개 스냅샷을 읽어야 해서 더 나빠진다.
    //
    // 입력이 전부 스냅샷 id라 결과가 변할 일이 없다. 새 스캔이 돌면
    // latest.id가 바뀌어 키가 바뀐다.
    const out = await buildHorizons(url, key, market, snaps)

    return NextResponse.json({
      market,
      horizons: out,
      snapshotCount: snaps.length,
      rawCount: allSnaps.length,
      // 어느 horizon이 언제부터 보이는지 화면에서 알 수 있게 한다
      tradingDays: snaps.map(etDate),
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
