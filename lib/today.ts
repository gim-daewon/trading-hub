/**
 * 오늘 후보(/today) — 흩어진 신호 화면을 종목 카드 하나로 모은다(2026-11-03).
 *
 * 사용자: "시장 상황, 낙폭, 60일선·20일선 위치 등 넣은 기준을 전부 적용해서 종합적으로 보고 싶다."
 * 기준을 전부 AND로 걸지 않는다. %B ≤ 0.2(최근 떨어짐)와 수급 상위(최근 오름)처럼
 * 서로 싸우는 기준이 있어(lib/rejected.ts flow-filter-on-categories) 걸면 후보가 망가진다.
 * 그래서 신호가 후보를 고르고, 나머지 기준은 체크 칸으로 보여 주기만 한다. 가중치 점수는 없다.
 *
 * 이 파일은 node --test로 바로 돌도록 다른 lib를 런타임에 불러오지 않는다.
 * 신호 이름표는 화면이 lib/screener-shared.ts(CATS·BREAKOUTS·REBOUNDS)에서 넘긴다.
 */

export interface TodayRow {
  symbol: string; name: string; sector: string; marketCap: number; tier: string | null
  price: number | null
  vwma20?: number | null; vwma60?: number | null
  wClose?: number | null; wVwma20?: number | null
  f20: number | null; chg20: number | null; pctB: number | null
  display?: string | null; atr14?: number | null; dollarVol?: number | null
}

type Lists = Record<string, Record<string, TodayRow[]> | undefined>
export interface ScreenerPayload {
  categories?: Lists
  breakouts?: Lists
  rebound?: Record<string, Record<string, TodayRow[]> | undefined>
}
export interface SignalLabels {
  cats: { key: string; label: string }[]
  breakouts: { key: string; label: string }[]
  rebounds: { key: string; label: string }[]
}

/**
 * 후보로 쓰지 않는 돌파 신호.
 * touchW: 10년 격자 20개 전부 마이너스(lib/screener-shared.ts BREAKOUTS 주석).
 * brokeD: 숏 전용 — 사는 후보 목록에 섞으면 방향이 반대다.
 */
export const EXCLUDED_BREAKOUTS = ['touchW', 'brokeD']

/** 신호가 붙는 순서. 눌림목이 원래 추천 화면(/picks)이라 맨 앞 */
const CAT_ORDER = ['pullback', 'momentum', 'quiet']

/**
 * 실적 경고 기간 — 달력일 7일 ≈ 5거래일.
 * 출처: prompts/trading-hub.md '실적 발표 5일 안 경고'(2026-10-18 1순위 후보).
 */
export const EARNINGS_WARN_DAYS = 7

export interface Check { label: string; ok: boolean | null }
export interface TodayItem { row: TodayRow; tags: string[]; checks: Check[]; earnings: string | null }

/** 여러 신호 목록을 종목 하나에 모은다. 고른 시총 구간만 */
export function gather(p: ScreenerPayload, tiers: string[], labels: SignalLabels): { row: TodayRow; tags: string[] }[] {
  const by = new Map<string, { row: TodayRow; tags: string[] }>()
  const add = (r: TodayRow, tag: string) => {
    const cur = by.get(r.symbol)
    if (!cur) by.set(r.symbol, { row: r, tags: [tag] })
    else if (!cur.tags.includes(tag)) cur.tags.push(tag)
  }
  const label = (list: { key: string; label: string }[], key: string) => list.find(x => x.key === key)?.label ?? key

  for (const t of tiers) {
    for (const k of CAT_ORDER) for (const r of p.categories?.[t]?.[k] ?? []) add(r, label(labels.cats, k))
    for (const b of labels.breakouts) {
      if (EXCLUDED_BREAKOUTS.includes(b.key)) continue
      for (const r of p.breakouts?.[t]?.[b.key] ?? []) add(r, b.label)
    }
    for (const rb of labels.rebounds) {
      for (const r of p.rebound?.[rb.key]?.[t] ?? []) add(r, `낙폭 반등(${rb.label})`)
    }
  }
  return [...by.values()]
}

const above = (a: number | null | undefined, b: number | null | undefined) =>
  a == null || b == null ? null : a > b

/** 사용자가 넣은 추세·수급 기준. 값이 없으면 null — 통과도 실패도 아니다 */
export function checksFor(r: TodayRow): Check[] {
  return [
    { label: '20일선 위', ok: above(r.price, r.vwma20) },
    { label: '60일선 위', ok: above(r.price, r.vwma60) },
    { label: '정배열', ok: above(r.vwma20, r.vwma60) },
    { label: '주봉 20선 위', ok: above(r.wClose, r.wVwma20) },
    { label: '20일 수급 +', ok: r.f20 == null ? null : r.f20 > 0 },
  ]
}

/** 오늘(YYYY-MM-DD)부터 EARNINGS_WARN_DAYS 안에 실적이 있으면 그 날짜 */
export function earningsSoon(symbol: string, calendar: Record<string, string>, today: string): string | null {
  const d = calendar[symbol]
  if (!d) return null
  const days = (Date.parse(d) - Date.parse(today)) / 86_400_000
  return days >= 0 && days <= EARNINGS_WARN_DAYS ? d : null
}

const passed = (i: TodayItem) => i.checks.filter(c => c.ok === true).length

/**
 * 기본으로 보여 줄 최소 겹친 신호 수.
 * 11-03 미국 735종목 중 610개가 신호 하나뿐이었고, 대부분이 '2~5일 유지'(218)·'오늘 돌파'(131) —
 * 구간마다 최대 100개씩 담는 넓은 신호다. 2개 이상이면 125개(사용자 "후보가 왜 이렇게 많아")
 */
export const MIN_SIGNALS = 2

export function withSignals(items: TodayItem[], min: number): TodayItem[] {
  return items.filter(i => i.tags.length >= min)
}

/** 실적 임박은 뒤로(빼지는 않는다), 그다음 겹친 신호 수, 그다음 체크 통과 수 */
export function rank(items: TodayItem[]): TodayItem[] {
  return [...items].sort((a, b) =>
    Number(!!a.earnings) - Number(!!b.earnings)
    || b.tags.length - a.tags.length
    || passed(b) - passed(a))
}

// ── 추천 10 (2026-11-03, 사용자 "트레이딩 기준을 찾아 기법을 적용해서 10개만 이유와 함께") ──
//
// 기법: 정배열 추세 안의 20일선 눌림 + 지지·저항으로 손절·목표.
//   - 추세: 정배열(VWMA20 > VWMA60)이고 종가가 20일선 위. 10년 구간 검증에서 모멘텀이
//     가장 견고했다(PERIOD_EVIDENCE momentum 양수 57.5%, 그래도 z 1.64로 유의 아님).
//   - 위치: 지지·저항 — 미부기 1년치 판단 근거 1위(67%, research/mibugi/tally.md).
// 아래 숫자는 Claude가 정한 기본값이고 백테스트하지 않았다. 바꿀 때 근거를 같이 적는다.
export const PICK = {
  count: 10,
  /** 20일선보다 이만큼(%) 넘게 위면 추격으로 보고 뺀다 */
  maxAbove20: 8,
  /** 20일선에서 이만큼(%) 안이면 "바로 위로 눌린 자리"라고 적는다 */
  nearEntry: 3,
  /** 위 저항이 이만큼(%) 안이면 오를 자리가 없다고 보고 뺀다 */
  minRoomToResist: 2,
  /**
   * 손익비(목표까지 / 손절까지) 최소. 1:2 — 승률 40%만 돼도 본전을 넘는 흔한 기준.
   * 2026-11-03 첫 결과에 1:0.2~0.9가 4개 섞여 넣었다(사용자 원칙 '승률 말고 손익비도')
   */
  minRR: 2,
  /** 같은 업종은 이만큼까지. 한 업종이 꺾이면 10개가 같이 꺾이는 것을 막는다 */
  perSector: 2,
  /** 지지·저항을 받아 올 예선 통과 수 = /api/levels 한 번 한도(80). 40개였을 때 11-03 손익비 통과 1개뿐 */
  prefetch: 80,
  /** 손절이 이만큼(%) 넘게 멀면 "수량을 줄일 것"이라고 적는다 */
  wideStop: 5,
  /** 손절폭 최소(%). 11-03 SAFT가 ATR이 작게 잡혀 −0.4% 손절이 나왔다 — 호가 한두 칸에 걸린다 */
  minStopPct: 1,
}

/** 일반 주식이 아닌 묶음 증권. 첫 결과에 BTSGU(Tangible Equity Unit)가 섞였다. LP의 'Common Units'는 주식처럼 거래돼 남긴다 */
const NOT_STOCK = /tangible equity unit|warrant|\brights?\b/i

interface Lv { price: number; pct: number }
export interface LevelPair { support: Lv | null; resistance: Lv | null }
export interface Pick { item: TodayItem; reasons: string[]; stop: number | null; target: number | null; rr: number | null }

const dist20 = (r: TodayRow) => r.price != null && r.vwma20 ? (r.price / r.vwma20 - 1) * 100 : null
const f1 = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`

/** 예선 — 지지·저항 없이 정할 수 있는 조건만. 정렬: 체크 통과 수 → 신호 수 → 20일선에 가까운 순 */
export function preselect(items: TodayItem[]): TodayItem[] {
  return items
    .filter(i => {
      const d = dist20(i.row)
      return !i.earnings && !NOT_STOCK.test(i.row.name) && d != null && d >= 0 && d <= PICK.maxAbove20
        && i.row.vwma60 != null && i.row.vwma20 != null && i.row.vwma20 > i.row.vwma60
    })
    .sort((a, b) => passed(b) - passed(a) || b.tags.length - a.tags.length
      || (dist20(a.row) ?? 99) - (dist20(b.row) ?? 99))
}

/**
 * 손절 = 아래 지지를 ATR14 1~2배 사이로 묶은 값.
 *   지지가 ATR 1배보다 가까우면 하루 흔들림에 걸리므로 1배 아래(near).
 *   지지가 ATR 2배보다 멀거나 없으면 2배(far) — 11-03 지지 그대로 쓰자 MA·BOX 손절이 −14~−22%였다.
 * ATR이 없으면 손절폭을 정할 근거가 없어 null.
 */
type StopKind = 'support' | 'near' | 'far'
function stopFor(r: TodayRow, lv: LevelPair): { stop: number; kind: StopKind } | null {
  if (r.price == null || !r.atr14) return null
  const near = Math.min(r.price - r.atr14, r.price * (1 - PICK.minStopPct / 100))
  const far = Math.min(r.price - 2 * r.atr14, near)
  const s = lv.support?.price
  if (s != null && s > near) return { stop: near, kind: 'near' }
  if (s == null || s < far) return { stop: far, kind: 'far' }
  return { stop: s, kind: 'support' }
}

/** 본선 — 저항이 코앞이거나 손익비가 낮으면 빼고, 업종 몫을 지키며 PICK.count개까지. 순서는 예선 그대로 */
export function pickTop(pre: TodayItem[], levels: Record<string, LevelPair | undefined>): Pick[] {
  const out: Pick[] = []
  const perSector = new Map<string, number>()
  for (const it of pre) {
    if (out.length >= PICK.count) break
    const lv = levels[it.row.symbol]
    if (!lv) continue
    if (lv.resistance && lv.resistance.pct < PICK.minRoomToResist) continue
    const p = explain(it, lv)
    if (!p || p.rr == null || p.rr < PICK.minRR) continue
    const sec = it.row.sector
    if (sec && (perSector.get(sec) ?? 0) >= PICK.perSector) continue
    if (sec) perSector.set(sec, (perSector.get(sec) ?? 0) + 1)
    out.push(p)
  }
  return out
}

function explain(it: TodayItem, lv: LevelPair): Pick | null {
  const r = it.row
  const s = stopFor(r, lv)
  if (!s || r.price == null || r.price <= s.stop) return null
  const price = r.price, stop = s.stop
  // 위 저항이 없으면(신고가권) 목표는 손절폭의 2배
  const target = lv.resistance?.price ?? price + PICK.minRR * (price - stop)
  const rr = Math.round((target - price) / (price - stop) * 10) / 10
  const stopPct = (stop / price - 1) * 100
  const d = dist20(r) ?? 0

  const reasons = [d <= PICK.nearEntry
    ? `정배열(20일선 > 60일선) 추세 안에서 20일선 바로 위(${f1(d)}%)로 눌린 자리`
    : `정배열(20일선 > 60일선) 추세 안, 20일선 ${f1(d)}% — 조금 올라 있다`]
  const why: Record<StopKind, string> = {
    support: '바로 아래 지지가 깨지면 나온다',
    near: `지지(${f1(lv.support?.pct ?? 0)}%)가 하루 변동폭보다 가까워 변동폭만큼 아래로`,
    far: lv.support ? `지지(${f1(lv.support.pct)}%)가 멀어 하루 변동폭 2배로` : '아래 지지가 없어 하루 변동폭 2배로',
  }
  reasons.push(`손절 ${f1(stopPct)}% — ${why[s.kind]}` + (Math.abs(stopPct) > PICK.wideStop ? ', 폭이 넓어 수량을 줄일 것' : ''))
  reasons.push(lv.resistance
    ? `목표 ${f1(lv.resistance.pct)}%(위 저항), 손익비 1:${rr}`
    : `1년 안 위쪽 저항 없음(신고가권) — 목표는 손절폭 2배(${f1((target / price - 1) * 100)}%)`)
  if (r.f20 != null && r.f20 > 0) reasons.push(`20일 수급 +${r.f20.toFixed(0)} — 오른 날 거래대금이 더 많다`)
  if (r.wClose != null && r.wVwma20 != null && r.wClose > r.wVwma20) reasons.push('주봉도 20선 위 — 큰 추세도 같은 방향')
  reasons.push(`걸린 신호: ${it.tags.join(' · ')}`)
  return { item: it, reasons, stop, target, rr }
}
