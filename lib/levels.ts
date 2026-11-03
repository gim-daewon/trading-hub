/**
 * 가까운 지지·저항 — 정보 표시용(2026-11-03). 신호가 아니다.
 *
 * 근거: 미부기 영상 1년치 판단 근거 1위가 지지·저항 가격대(67%, research/mibugi/tally.md).
 * 백테스트로 거른 것이 아니라 "지금 가격 위아래 어디에 최근 꼭짓점이 있나"를 보여 줄 뿐이다.
 *
 * 정의: 최근 LOOKBACK 봉 안의 확정된 꼭짓점(좌우 K봉보다 높은 고가 / 낮은 저가).
 *   저항 = 지금 종가보다 높은 고점 중 가장 낮은 것, 지지 = 지금 종가보다 낮은 저점 중 가장 높은 것.
 *   오른쪽 K봉이 아직 안 지난 꼭짓점은 확정 전이라 쓰지 않는다.
 */
export interface PriceBar { h: number; l: number; c: number }
export interface Level { price: number; pct: number; ago: number }
export interface Levels { support: Level | null; resistance: Level | null }

export const LEVEL_PIVOT_K = 5       // 기본값: lib/cup-fib.ts와 같은 꼭짓점 폭
export const LEVEL_LOOKBACK = 250    // 기본값: 약 1년(주식 거래일)
/** 일봉 날짜가 스냅샷보다 이만큼(달력일) 넘게 오래되면 숨긴다. 주말·연휴 3일을 넉넉히 덮는 값 */
export const LEVEL_MAX_STALE_DAYS = 5

export function nearestLevels(bars: PriceBar[], K = LEVEL_PIVOT_K, lookback = LEVEL_LOOKBACK): Levels {
  const n = bars.length
  if (n < 2 * K + 2) return { support: null, resistance: null }
  const price = bars[n - 1].c
  let res: Level | null = null, sup: Level | null = null
  for (let i = Math.max(K, n - lookback); i <= n - 1 - K; i++) {
    let hi = true, lo = true
    for (let j = i - K; j <= i + K && (hi || lo); j++) {
      if (j === i) continue
      // 같은 값이 이어지면 왼쪽 것 하나만 꼭짓점으로 본다
      if (j < i ? bars[j].h > bars[i].h : bars[j].h >= bars[i].h) hi = false
      if (j < i ? bars[j].l < bars[i].l : bars[j].l <= bars[i].l) lo = false
    }
    const ago = n - 1 - i
    if (hi && bars[i].h > price && (!res || bars[i].h < res.price)) res = { price: bars[i].h, pct: (bars[i].h / price - 1) * 100, ago }
    if (lo && bars[i].l < price && (!sup || bars[i].l > sup.price)) sup = { price: bars[i].l, pct: (bars[i].l / price - 1) * 100, ago }
  }
  return { support: sup, resistance: res }
}

/** 일봉 마지막 날짜(YYYY-MM-DD)가 스냅샷 기준일보다 너무 오래되지 않았나. 캐시가 옛 봉을 줄 때를 막는다 */
export function levelsFresh(barDate: string | null, snapshotDate: string | null): boolean {
  if (!barDate) return false
  if (!snapshotDate) return true
  const gap = (Date.parse(snapshotDate) - Date.parse(barDate)) / 86400e3
  return gap <= LEVEL_MAX_STALE_DAYS
}
