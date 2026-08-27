// 미국 시장 상태 — 뉴욕 현지 시각 기준.
// 서머타임은 Intl에 맡긴다 (직접 날짜 계산하지 않음).
// 주의: 공휴일 휴장은 반영하지 않는다. 요일과 시각만으로 판정한다.

export type MarketPhase = 'pre' | 'regular' | 'after' | 'closed'

export interface MarketStatus {
  phase: MarketPhase
  label: string
  /** 개장까지 남은 시간. 정규장 중에는 null */
  until: string | null
}

const PHASE_LABEL: Record<MarketPhase, string> = {
  pre:     '프리마켓',
  regular: '정규장',
  after:   '애프터',
  closed:  '휴장',
}

/** 뉴욕 현지 요일(0=일)과 자정 이후 경과 분 */
function nyParts(now: Date): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now)

  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  // Intl은 24시를 반환할 수 있다 (자정)
  const hour = Number(get('hour')) % 24

  return {
    weekday: WD.indexOf(get('weekday')),
    minutes: hour * 60 + Number(get('minute')),
  }
}

const PRE_OPEN  = 4 * 60          // 04:00 ET
const OPEN      = 9 * 60 + 30     // 09:30 ET
const CLOSE     = 16 * 60         // 16:00 ET
const AFTER_END = 20 * 60         // 20:00 ET

export function usMarketStatus(now: Date = new Date()): MarketStatus {
  const { weekday, minutes } = nyParts(now)
  const isWeekday = weekday >= 1 && weekday <= 5

  if (isWeekday && minutes >= OPEN && minutes < CLOSE) {
    return { phase: 'regular', label: PHASE_LABEL.regular, until: null }
  }
  if (isWeekday && minutes >= PRE_OPEN && minutes < OPEN) {
    return { phase: 'pre', label: PHASE_LABEL.pre, until: fmtGap(OPEN - minutes) }
  }
  if (isWeekday && minutes >= CLOSE && minutes < AFTER_END) {
    return { phase: 'after', label: PHASE_LABEL.after, until: null }
  }

  return { phase: 'closed', label: PHASE_LABEL.closed, until: fmtGap(minutesUntilOpen(weekday, minutes)) }
}

function minutesUntilOpen(weekday: number, minutes: number): number {
  // 오늘 개장이 아직 남았으면 오늘 기준
  if (weekday >= 1 && weekday <= 5 && minutes < OPEN) return OPEN - minutes

  let daysAhead = 1
  let wd = (weekday + 1) % 7
  while (wd === 0 || wd === 6) { daysAhead++; wd = (wd + 1) % 7 }

  return daysAhead * 24 * 60 - minutes + OPEN
}

function fmtGap(total: number): string {
  const h = Math.floor(total / 60)
  const m = total % 60
  return h > 0 ? `${h}시간 ${m}분 후` : `${m}분 후`
}
