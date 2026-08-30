// 자금 수급 지표 — 섹터 드릴다운과 스크리너가 공유한다.
//
// 주의: 이건 순유입이 아니라 "대리지표"다. 거래대금은 매수·매도가 상쇄된 총량이라
// 실제 순매수가 아니다. 미국은 기관·외국인 순매수를 실시간 공개하지 않는다(13F 분기 지연).
// 그래서 "상승일 거래대금 vs 하락일 거래대금"이 무료로 얻을 수 있는 최선이다.

export interface Bar { c: number; v: number }

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
}

const YAHOO_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

export async function fetchBars(symbol: string, range = '6mo'): Promise<Bar[] | null> {
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

      const bars: Bar[] = []
      const n = (result.timestamp ?? []).length
      for (let i = 0; i < n; i++) {
        if (q.close?.[i] == null || q.volume?.[i] == null) continue
        bars.push({ c: q.close[i], v: q.volume[i] })
      }
      if (bars.length > 0) return bars
    } catch { /* 다음 호스트 */ }
  }
  return null
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

export function computeFlow(bars: Bar[]): FlowMetrics {
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
