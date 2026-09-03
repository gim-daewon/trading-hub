// 야후 시세 메타의 신선도 판정.
//
// 상장폐지·청산된 티커도 야후는 조용히 마지막 시세를 계속 준다.
// PBS(Invesco Next Gen Media and Gaming) 실측:
//   price 33.0626 · chartPreviousClose 33.0525 · regularMarketTime 2023-08-25
// 등락률이 +0.03%로 계산돼 정상 시세와 구분이 안 된다.
//
// 유일한 단서가 regularMarketTime이다. 반드시 확인해야 한다.

export interface YahooMeta {
  regularMarketTime?: number
  regularMarketPrice?: number
  previousClose?: number
  chartPreviousClose?: number
}

/** 이 일수보다 오래된 시세는 죽은 것으로 본다. 3일 연휴 + 데이터 지연을 감안 */
export const MAX_QUOTE_AGE_DAYS = 5

/** 시세가 오래됐는가. regularMarketTime이 없으면 판단할 수 없으므로 통과시킨다 */
export function isStaleQuote(meta: YahooMeta | null | undefined, maxDays = MAX_QUOTE_AGE_DAYS): boolean {
  const t = meta?.regularMarketTime
  if (!t) return false
  return (Date.now() / 1000 - t) > maxDays * 86400
}

/** 시세 기준일 (YYYY-MM-DD). 없으면 null */
export function quoteDate(meta: YahooMeta | null | undefined): string | null {
  const t = meta?.regularMarketTime
  return t ? new Date(t * 1000).toISOString().slice(0, 10) : null
}
