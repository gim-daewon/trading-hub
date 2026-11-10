// 매크로 캘린더(/calendar) 빈 칸 문구.
// /api/econ-calendar는 Nasdaq 응답을 못 받은 날을 failed로 돌려준다.
// 못 받은 날을 "일정 없음"으로 보이면 CPI·FOMC가 있는 날도 조용한 날로 읽힌다.

export const CALENDAR_FAILED_TEXT = '일정을 불러오지 못했다 — 새로고침해 다시 받아 보라.'

/** day: 고른 날(주 전체를 못 받았으면 undefined), failed: 응답을 못 받은 날들 */
export function emptyDayText(day: string | undefined, failed: string[] | undefined, filter: 'all' | 'high'): string {
  if (!day || failed?.includes(day)) return CALENDAR_FAILED_TEXT
  return filter === 'high' ? '이날 주요 이벤트 없음' : '예정된 이벤트 없음'
}
