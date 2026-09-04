// 자금 수급 지표 — 섹터 드릴다운과 스크리너가 공유한다.
//
// 주의: 이건 순유입이 아니라 "대리지표"다. 거래대금은 매수·매도가 상쇄된 총량이라
// 실제 순매수가 아니다. 미국은 기관·외국인 순매수를 실시간 공개하지 않는다(13F 분기 지연).
// 그래서 "상승일 거래대금 vs 하락일 거래대금"이 무료로 얻을 수 있는 최선이다.

export interface Bar { c: number; v: number }

/** 일봉에 주 구분을 붙인 형태. 주봉 파생에 쓴다 */
export interface DatedBar extends Bar { t: number }

export interface FlowMetrics {
  /** 순자금 비율 5/20/60일 — 상승일 거래대금 대비 (-100 ~ +100) */
  f5: number | null
  f20: number | null
  f60: number | null
  /** 당일 거래대금 / 20일 평균 */
  rvol: number | null
  /** 최근 20일 가격 등락률 */
  chg20: number | null
  /** 20일 평균 일 거래대금 (USD) */
  avgDollarVol: number | null
  /** 볼린저 %B (20,2) — 0=하단밴드, 0.5=중심선, 1=상단밴드 */
  pctB: number | null
  /** VWMA(20) — 거래량 가중 이동평균. 트레이딩뷰 VWMA 기본설정과 같다 */
  vwma20: number | null
  /** VWMA(60). vwma20과의 상하 관계가 정배열/역배열을 가른다 */
  vwma60: number | null
  /** 주봉 — 마지막 '완료된' 주 기준. 진행 중인 주를 쓰면 룩어헤드가 된다 */
  wClose: number | null
  wVwma20: number | null
  wVwma60: number | null
  /**
   * 오늘까지 연속으로 종가가 VWMA20 위에 있은 일수.
   *   0 = VWMA 아래
   *   1 = 오늘 종가로 상향 돌파 (전일은 아래였다)
   *   N = N일째 위 유지
   * 돌파와 유지를 이 한 값으로 다 표현할 수 있어 컬럼을 하나만 늘린다.
   */
  aboveRun: number | null
}

/** VWMA(N) = sum(종가 x 거래량) / sum(거래량) */
export function vwma(bars: Bar[], days: number, endIdx = bars.length - 1): number | null {
  if (endIdx < days - 1) return null
  let pv = 0, vv = 0
  for (let i = endIdx - days + 1; i <= endIdx; i++) { pv += bars[i].c * bars[i].v; vv += bars[i].v }
  return vv > 0 ? pv / vv : null
}

/**
 * 종가가 VWMA(days) 위에 연속으로 머문 일수.
 *
 * 주의: 이 지표는 성과 근거가 없다. 10년 격자 10개로 검증한 결과
 * 돌파 당일 51% · 재돌파 49% · 2~3일 유지 53%로 전부 기준선(55%) 아래였고
 * 유지일수에 단조성도 없었다. 화면에는 관찰용으로만 쓴다.
 */
export function aboveVwmaRun(bars: Bar[], days: number, maxLookback = 260): number | null {
  if (bars.length < days) return null
  let run = 0
  const start = Math.max(days - 1, bars.length - maxLookback)
  for (let i = start; i < bars.length; i++) {
    const v = vwma(bars, days, i)
    if (v == null) { run = 0; continue }
    run = bars[i].c > v ? run + 1 : 0
  }
  return run
}

const YAHOO_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

/** 마지막 유효봉이 이보다 오래되면 죽은 티커로 본다 (휴장·데이터 지연은 봐준다) */
const MAX_STALE_BARS = 3

/**
 * 일봉을 가져온다. 최근 봉이 비어 있는 티커는 null을 준다.
 *
 * null을 그냥 걸러내면 조용히 과거 데이터로 계산이 돌아간다. 실제로 PBS가
 * 2026-07-17 이후 34거래일 전부 null이었는데, 그 사실이 어디에도 드러나지 않아
 * 섹터 화면에 "-46.6%"가 정상 값처럼 표시됐다. 수급·볼린저도 같은 문제를 겪는다 —
 * 3개월 전 데이터로 계산한 %B를 오늘 값으로 쓰면 조용히 틀린다.
 */
/** 날짜까지 필요한 곳(주봉 파생)에서 쓴다. fetchBars는 이걸 감싼다 */
export async function fetchDatedBars(symbol: string, range = '6mo'): Promise<DatedBar[] | null> {
  for (const host of YAHOO_HOSTS) {
    try {
      const res = await fetch(
        `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`,
        { headers: { 'User-Agent': UA }, next: { revalidate: 43200 } }
      )
      if (!res.ok) continue
      const json = await res.json()
      const result = json?.chart?.result?.[0]
      const q = result?.indicators?.quote?.[0]
      if (!result || !q) continue

      const n = (result.timestamp ?? []).length
      // 끝에서부터 유효봉을 찾는다. 너무 오래됐으면 계산하지 않는다
      let lastValid = -1
      for (let i = n - 1; i >= 0; i--) {
        if (q.close?.[i] != null && q.volume?.[i] != null) { lastValid = i; break }
      }
      if (lastValid < 0 || n - 1 - lastValid > MAX_STALE_BARS) continue

      const ts: number[] = result.timestamp ?? []
      const bars: DatedBar[] = []
      for (let i = 0; i <= lastValid; i++) {
        if (q.close?.[i] == null || q.volume?.[i] == null) continue
        bars.push({ t: ts[i], c: q.close[i], v: q.volume[i] })
      }
      if (bars.length > 0) return bars
    } catch { /* 다음 호스트 */ }
  }
  return null
}

export async function fetchBars(symbol: string, range = '6mo'): Promise<Bar[] | null> {
  return fetchDatedBars(symbol, range)
}

/**
 * 순자금 비율: (상승일 거래대금 − 하락일 거래대금) / 총 거래대금 × 100
 * +면 오른 날에 돈이 더 몰림(매집), −면 내린 날에 더 몰림(분산)
 */
export function netFlow(bars: Bar[], days: number): number | null {
  if (bars.length < days + 1) return null
  const s = bars.slice(-(days + 1))
  let up = 0, down = 0
  for (let i = 1; i < s.length; i++) {
    const dv = s[i].c * s[i].v
    if (s[i].c > s[i - 1].c) up += dv
    else if (s[i].c < s[i - 1].c) down += dv
  }
  const total = up + down
  return total === 0 ? null : ((up - down) / total) * 100
}

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length

/**
 * 볼린저 %B (기간 20, 표준편차 2배).
 * 표준편차는 모집단 기준(n으로 나눔) — 트레이딩뷰와 동일해야 차트와 대조된다.
 */
export function pctB(bars: Bar[], n = 20, k = 2): number | null {
  if (bars.length < n) return null
  const w = bars.slice(-n).map(b => b.c)
  const m = mean(w)
  const sd = Math.sqrt(mean(w.map(v => (v - m) ** 2)))
  if (sd === 0) return null
  return (bars[bars.length - 1].c - (m - k * sd)) / (2 * k * sd)
}

export function computeFlow(bars: Bar[] | DatedBar[]): FlowMetrics {
  const dollarVols = bars.map(b => b.c * b.v)
  const recent = dollarVols.slice(-21, -1)
  const avg20 = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : null

  const last = dollarVols[dollarVols.length - 1]
  const c0 = bars.length > 20 ? bars[bars.length - 21].c : null
  const cN = bars[bars.length - 1]?.c ?? null

  return {
    f5:  netFlow(bars, 5),
    f20: netFlow(bars, 20),
    f60: netFlow(bars, 60),
    rvol: avg20 && last ? last / avg20 : null,
    chg20: c0 && cN ? ((cN - c0) / c0) * 100 : null,
    avgDollarVol: avg20,
    pctB: pctB(bars),
    vwma20: vwma(bars, 20),
    vwma60: vwma(bars, 60),
    aboveRun: aboveVwmaRun(bars, 20),
    // 날짜가 있는 경우에만 주봉을 계산한다 (fetchDatedBars로 받은 경우)
    ...weeklyVwma(bars, (bars as DatedBar[])[0]?.t != null ? (bars as DatedBar[]).map(b => b.t) : undefined),
  }
}

/**
 * 일봉을 주봉으로 묶어 VWMA를 계산한다.
 *
 * 마지막 원소는 '진행 중인 주'라 아직 종가가 확정되지 않았다.
 * 그걸 쓰면 룩어헤드가 되므로 하나 앞(마지막 완료 주)을 쓴다.
 * 주봉 VWMA60에는 60주 ≈ 14개월치 일봉이 필요하다 — 스캔 range가 2y인 이유.
 */
export function weeklyVwma(bars: Bar[], dates?: number[]): {
  wClose: number | null; wVwma20: number | null; wVwma60: number | null
} {
  const none = { wClose: null, wVwma20: null, wVwma60: null }
  if (!dates || dates.length !== bars.length) return none

  const wk: Bar[] = []
  let cur: number | null = null
  for (let i = 0; i < bars.length; i++) {
    const d = new Date(dates[i] * 1000)
    // ISO 주차 — 목요일이 속한 해/주로 묶는다
    const u = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    u.setUTCDate(u.getUTCDate() + 4 - (u.getUTCDay() || 7))
    const key = u.getUTCFullYear() * 100 +
      Math.ceil(((+u - Date.UTC(u.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7)
    if (key !== cur) { wk.push({ c: bars[i].c, v: bars[i].v }); cur = key }
    else { const l = wk[wk.length - 1]; l.c = bars[i].c; l.v += bars[i].v }
  }
  // 마지막(진행 중) 주를 버린다
  const done = wk.slice(0, -1)
  if (done.length < 20) return none
  return {
    wClose: done[done.length - 1].c,
    wVwma20: vwma(done, 20),
    wVwma60: vwma(done, 60),
  }
}

/** 3개 기간의 방향이 일치하는지 — "며칠짜리 수급인가"에 대한 답 */
export type Persistence = 'sustained' | 'turning' | 'onceoff' | 'unknown'

export function persistence(m: FlowMetrics): Persistence {
  const { f5, f20, f60 } = m
  if (f5 == null || f20 == null || f60 == null) return 'unknown'
  const sign = (v: number) => (v > 5 ? 1 : v < -5 ? -1 : 0)
  const [a, b, c] = [sign(f5), sign(f20), sign(f60)]
  if (a !== 0 && a === b && b === c) return 'sustained'
  if (c !== 0 && b !== 0 && c !== b) return 'turning'
  if (a !== 0 && b === 0 && c === 0) return 'onceoff'
  return 'unknown'
}

export const PERSISTENCE_LABEL: Record<Persistence, string> = {
  sustained: '지속',
  turning:   '전환',
  onceoff:   '단발',
  unknown:   '—',
}

/** 동시 실행 수를 제한한 병렬 매핑 (야후 레이트리밋 회피) */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R | null>
): Promise<R[]> {
  const out: R[] = []
  const queue = [...items]
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (queue.length) {
        const item = queue.shift()!
        const r = await fn(item)
        if (r !== null) out.push(r)
      }
    })
  )
  return out
}
