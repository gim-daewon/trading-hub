import { tierOf, type Market } from './markets'
import type { ScreenerRow } from './screener-shared'

/**
 * 스냅샷 행(screener_rows) → ScreenerRow. tracking·screener route가 같이 쓴다.
 *
 * 예전에는 두 route가 따로 필드를 골랐다. tracking 쪽은 VWMA를 빠뜨려 신호를 하나도
 * 못 잡았고(c8993b4), screener 쪽은 chg1을 빠뜨려 낙폭 반등 '1일 낙폭'이 늘 비었다.
 * 시험: lib/screener-row.test.ts
 *
 * route마다 받는 열이 다르다(tracking은 캐시 2MB 한도 때문에 일부만). 그래서 모든 열이 선택이고,
 * 받지 않은 열은 undefined로 둔다 — JSON 캐시에서 키가 빠져 크기가 늘지 않는다.
 */
export interface DbScreenerRow {
  symbol: string
  name?: string | null; sector?: string | null
  market_cap: number | null; cap_known?: boolean | null
  f5?: number | null; f20?: number | null; f60?: number | null
  rvol?: number | null; chg20?: number | null; pct_b?: number | null; price: number | null
  vwma20?: number | null; vwma60?: number | null; above_run?: number | null; prev_run?: number | null
  w_close?: number | null; w_vwma20?: number | null; w_vwma60?: number | null
  w_above_run?: number | null; w_prev_run?: number | null
  low?: number | null; w_low?: number | null; high?: number | null; chg1?: number | null
  atr14?: number | null; dollar_vol?: number | null
  display?: string | null; premium?: number | null
}

export function mapScreenerRow(r: DbScreenerRow, market: Market): ScreenerRow {
  return {
    symbol: r.symbol,
    name: r.name ?? '',
    sector: r.sector ?? '',
    marketCap: r.market_cap ?? 0,
    // 시총을 못 알아낸 종목은 초소형이 아니라 '미상'이다. 모르는 걸 작다고 단정하면 구간 통계가 오염된다.
    // 컬럼 추가 전 스냅샷은 undefined라 시총으로 판정한다
    tier: r.cap_known === false ? 'unknown' : tierOf(r.market_cap ?? 0, market),
    display: r.display === undefined ? undefined : (r.display ?? r.symbol),
    capKnown: r.cap_known === undefined ? undefined : (r.cap_known ?? true),
    premium: r.premium,
    f5: r.f5 ?? null, f20: r.f20 ?? null, f60: r.f60 ?? null,
    rvol: r.rvol ?? null, chg20: r.chg20 ?? null, pctB: r.pct_b ?? null,
    vwma20: r.vwma20, vwma60: r.vwma60, aboveRun: r.above_run,
    wClose: r.w_close, wVwma20: r.w_vwma20, wVwma60: r.w_vwma60,
    wAboveRun: r.w_above_run, prevRun: r.prev_run, wPrevRun: r.w_prev_run,
    low: r.low, wLow: r.w_low, high: r.high, chg1: r.chg1,
    atr14: r.atr14, dollarVol: r.dollar_vol,
    price: r.price,
  }
}
