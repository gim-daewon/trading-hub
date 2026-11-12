/**
 * 거래일 판정 — "스냅샷 1개 = 1거래일"이 성립해야 snaps[1]을 '1거래일 전'으로 쓸 수 있다.
 * app/api/tracking/route.ts에서 뺐다(agent-trust-trading-hub.md 할 일 5). 시험: lib/trading-days.test.ts
 */

export interface DaySnap {
  scanned_at: string
  bar_date: string | null
  spy_price: number | null
}

/**
 * 판정은 반드시 bar_date(데이터 기준일)로 한다. scanned_at(스캔 시각)이 아니다.
 * 실제로 토요일 ET에 수동 실행한 스캔이 '주말'로 걸러졌는데,
 * 그 데이터의 기준일은 금요일로 멀쩡한 거래일이었다.
 * bar_date가 없는 옛 스냅샷은 scanned_at의 뉴욕 날짜로 대체한다(en-CA는 YYYY-MM-DD).
 */
export const snapDay = (s: Pick<DaySnap, 'scanned_at' | 'bar_date'>) =>
  s.bar_date ?? new Date(s.scanned_at).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

/** 최신순 스냅샷에서 거래일마다 하나씩만 남긴다(최신순 유지) */
export function tradingDaySnaps<T extends DaySnap>(allSnaps: T[], market: string): T[] {
  const seen = new Set<string>()
  const deduped = allSnaps.filter(s => {
    if (s.spy_price == null) return false
    const d = snapDay(s)
    if (seen.has(d)) return false
    // UTC 정오로 파싱해 시간대 밀림을 막는다
    const dow = new Date(`${d}T12:00:00Z`).getUTCDay()
    // 크립토는 24/7이라 주말도 거래일이다. 이 필터를 그대로 두면
    // 토·일 스냅샷이 버려져 '5거래일'이 실제로는 7일이 된다
    if (market !== 'crypto' && (dow === 0 || dow === 6)) return false
    seen.add(d)
    return true
  })
  // 최신순이므로 뒤쪽이 과거다. spy_price가 같으면 휴장으로 보고 과거 쪽을 버린다
  return deduped.filter((s, i) => i === 0 || s.spy_price !== deduped[i - 1].spy_price)
}
