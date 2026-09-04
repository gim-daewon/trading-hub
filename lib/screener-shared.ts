// 스크리너 공용 정의 — API·스캔 스크립트·UI가 같은 기준을 쓴다.

export type Regime = 'up' | 'down'
export type TierId = 'large' | 'mid' | 'small'
export type CatKey = 'pullback' | 'momentum' | 'quiet'

export interface Tier { id: TierId; label: string; min: number; max: number }

/** 스크리너 한 종목. 진입가(price)는 사후 성과 추적에 쓴다 */
export interface ScreenerRow {
  symbol: string
  name: string
  sector: string
  marketCap: number
  tier: TierId | null
  f5: number | null
  f20: number | null
  f60: number | null
  rvol: number | null
  chg20: number | null
  pctB: number | null
  /** VWMA(20) 값 */
  vwma20?: number | null
  /** VWMA(60). vwma20과의 상하 관계가 정배열/역배열을 가른다 */
  vwma60?: number | null
  /** VWMA20 위 연속 일수. 1 = 오늘 종가로 상향 돌파 */
  aboveRun?: number | null
  /** 주봉 — 마지막 완료 주 기준 */
  wClose?: number | null
  wVwma20?: number | null
  wVwma60?: number | null
  /** 주봉 VWMA20 위 연속 주수. 1 = 지난주 탈환 */
  wAboveRun?: number | null
  price: number | null
}

// 시총 구간을 나눠야 하는 이유: 같은 지표라도 구간마다 결과가 정반대다.
// 소형주 하락장은 기준선 자체가 -1.11%p, 상회율 43%로 뭘 사도 진다.
export const TIERS: Tier[] = [
  { id: 'large', label: '대형 $10B+',   min: 1e10, max: Infinity },
  { id: 'mid',   label: '중형 $2~10B',  min: 2e9,  max: 1e10 },
  { id: 'small', label: '소형 $0.5~2B', min: 5e8,  max: 2e9 },
]

export function tierOf(marketCap: number): TierId | null {
  return TIERS.find(t => marketCap >= t.min && marketCap < t.max)?.id ?? null
}

export interface Perf { avg: number; md: number; hit: number; n: number }
export type CatEvidence = Record<Regime, Perf>

/**
 * 2년치 백테스트 실측값 (룩어헤드 배제, 시점 t까지의 데이터로만 순자금 계산 →
 * t~t+20일 SPY 대비 초과수익). 시총 구간별로 따로 측정했다 —
 * 전체를 뭉쳐서 보면 소형주가 대형주 신호를 지워버린다.
 *
 * 평균(avg)은 극단값에 쉽게 끌려간다. 중앙값(md)과 상회율(hit)을 같이 봐야 한다.
 * 예: 소형주 quiet 상승장은 평균 +6.68%p인데 중앙값 -1.61%p, 상회율 45%다.
 *
 * ── 중요 ──────────────────────────────────────────────────────────────
 * 이 값은 "개별 거래를 전부 뭉친" 수치다. 20일 창을 5일 간격으로 썼기 때문에
 * 표본이 서로 겹치고, 후보가 많이 나온 시기와 대박 종목이 과대반영된다.
 * 실제 매매는 구간 단위로 이뤄지므로 판정의 근거로는 PERIOD_EVIDENCE를 써야 한다.
 * 여기 값은 "시총 구간·국면별로 어떻게 갈리는가"를 보는 참고용으로만 남긴다.
 */
export const TIER_EVIDENCE: Record<TierId, Record<CatKey | 'base', CatEvidence>> = {
  large: {
    base:      { up: { avg: 0.35, md: -0.62, hit: 47, n: 50435 }, down: { avg: 0.90, md: 0.64, hit: 53, n: 25623 } },
    momentum:  { up: { avg: 1.65, md: 0.05, hit: 50, n: 3968 },   down: { avg: 1.08, md: 0.81, hit: 54, n: 2127 } },
    quiet:     { up: { avg: -0.06, md: -0.48, hit: 47, n: 864 },  down: { avg: 1.96, md: 1.74, hit: 56, n: 266 } },
    pullback:  { up: { avg: 3.00, md: 1.90, hit: 58, n: 856 },    down: { avg: 1.20, md: 0.14, hit: 51, n: 344 } },
  },
  mid: {
    base:      { up: { avg: 1.33, md: -0.44, hit: 48, n: 57318 }, down: { avg: -0.06, md: -0.69, hit: 47, n: 29086 } },
    momentum:  { up: { avg: 2.90, md: -0.21, hit: 49, n: 5362 },  down: { avg: -0.08, md: -1.17, hit: 46, n: 2663 } },
    quiet:     { up: { avg: 0.34, md: -0.78, hit: 46, n: 769 },   down: { avg: 2.71, md: 1.24, hit: 56, n: 400 } },
    pullback:  { up: { avg: 3.50, md: 1.27, hit: 56, n: 943 },    down: { avg: 1.43, md: 0.24, hit: 51, n: 445 } },
  },
  small: {
    base:      { up: { avg: 2.42, md: -0.47, hit: 48, n: 35289 }, down: { avg: -1.11, md: -2.04, hit: 43, n: 17903 } },
    momentum:  { up: { avg: 4.60, md: -0.31, hit: 49, n: 3637 },  down: { avg: -1.53, md: -2.95, hit: 42, n: 1715 } },
    quiet:     { up: { avg: 6.68, md: -1.61, hit: 45, n: 400 },   down: { avg: -0.80, md: -0.48, hit: 47, n: 243 } },
    pullback:  { up: { avg: 3.87, md: 0.72, hit: 53, n: 686 },    down: { avg: 2.01, md: 0.29, hit: 52, n: 313 } },
  },
}

export interface PeriodPerf {
  /** 겹치지 않는 20거래일 구간 수 */
  periods: number
  /** 구간별 초과수익의 평균 */
  avg: number
  /** 중앙값 — 평균보다 이쪽이 실제 감각에 가깝다 */
  med: number
  /** 초과수익이 양수였던 구간 비율(%) */
  pos: number
  /** 상위 2개 구간을 뺀 평균. 극단값 의존 여부를 본다 */
  trimmed: number
  /** 최고 구간 초과수익. 이게 크면 소수 구간이 전체를 만든 것이다 */
  max: number
}

/**
 * 10년치를 겹치지 않는 20거래일 구간으로 잘라 측정한 값. 이게 판정의 근거다.
 *
 * TIER_EVIDENCE(개별 거래 뭉침)와 결론이 갈렸고, 이쪽이 맞다:
 *   - 구간이 겹치지 않아 표본이 독립이다
 *   - 구간마다 균등가중이라 후보가 많은 시기가 과대반영되지 않는다
 *   - 실제 매매 단위(한 번 사서 20일 보유)와 형태가 같다
 *
 * 결과가 앞선 판단을 뒤집었다. 2년 뭉친 기준으로는 눌림목이 6개 조합 중 5개를
 * 넘겨 최고였는데, 구간 단위로 보면 눌림목은 중앙값 +0.10%p에 최고구간이
 * +46.06%p다 — 소수 구간이 전부를 만들었다. 모멘텀이 더 견고하다.
 *
 * 그리고 어느 것도 통계적으로 유의하지 않다. 양수비율이 50%를 유의하게 넘으려면
 * z >= 1.96이 필요한데(z = (p-0.5)/sqrt(0.25/n)), 최고인 모멘텀도 z = 1.64다.
 */
export const PERIOD_EVIDENCE: Record<CatKey | 'flow30', PeriodPerf> = {
  momentum: { periods: 120, avg: 0.73, med:  1.02, pos: 57.5, trimmed:  0.57, max: 10.28 },
  pullback: { periods: 118, avg: 0.76, med:  0.10, pos: 51.7, trimmed:  0.22, max: 46.06 },
  quiet:    { periods: 119, avg: 0.45, med: -0.27, pos: 47.1, trimmed:  0.17, max: 19.70 },
  // 참고: 수급 상위 30%만 걸러낸 넓은 필터. 각 카테고리의 출발점이다
  flow30:   { periods: 120, avg: 0.36, med:  0.14, pos: 52.5, trimmed:  0.22, max:  9.89 },
}

/**
 * 기각한 조건 — 다시 만들지 않도록 근거를 남긴다.
 *
 * 눌림목 + 주봉 추세 필터(주가 > 20주 SMA):
 *   2년 뭉친 기준으로는 상회율 53.5%로 좋아 보였는데, 10년 구간 단위로 재보니
 *   110구간 중 51개(46%)만 양수, 중앙값 -0.44%p, 상위2제외 -0.37%p였다.
 *   표본이 적어서 생긴 착시였다. 구현하지 않는다.
 *
 * 주봉 기준 신호 전체(순자금·볼린저를 주봉으로 계산): 상회율 50%로 무의미.
 * 인트라데이(1h/4h) 신호: 정확히 50%.
 * 볼린저 하단 손절: 진입가가 밴드 위에 있어 86% 확률로 발동한다. 성과를 깎는다.
 *
 * 120일 부진 섹터 회피 필터:
 *   섹터 ETF 수준에서는 유의했다(하위 섹터가 63% 구간에서 계속 뒤처짐, z=-2.77).
 *   그래서 눌림목 후보에서 하위 섹터 종목을 빼봤는데 효과가 없었다 (10년 116구간):
 *     필터 없음    평균 +2.30%p 중앙값 +0.38 양수 52% 상위2제외 +1.01 후보 28
 *     하위3 제외   평균 +2.40%p 중앙값 +0.23 양수 52% 상위2제외 +1.11 후보 23
 *     하위5 제외   평균 +1.58%p 중앙값 +0.15 양수 53% 상위2제외 +0.78 후보 18
 *     역필터(하위3만) 평균 -0.17%p 중앙값 +0.66 양수 56% 후보 8
 *   대조군이 무너뜨렸다 — 회피가 맞다면 역필터가 최악이어야 하는데 양수비율이 최고다.
 *   후보만 28->23개로 줄고 중앙값은 나빠진다. 비용만 있고 효과가 없다.
 *   섹터 ETF를 사는 것과, 그 섹터 안에서 눌림목 조건으로 걸러진 종목을 사는 것은
 *   다른 문제다. 눌림목 조건이 섹터 소속을 덮어쓴다.
 */
const z = (p: PeriodPerf) => (p.pos / 100 - 0.5) / Math.sqrt(0.25 / p.periods)

/**
 * 구간 단위 실측으로 판정한다.
 *
 * "기준선 상회" 같은 단정을 쓰지 않는다. 통계적으로 증명된 게 하나도 없다.
 * 화면에는 무엇이 덜 나쁜지만 표시하고, 판단은 사용자가 한다.
 */
export function periodVerdict(cat: CatKey): { text: string; tone: 'ok' | 'weak' | 'none'; note: string } {
  const p = PERIOD_EVIDENCE[cat]
  const outlier = p.max >= 20      // 최고 구간이 이만큼 크면 소수 구간이 전체를 만든 것이다
  const note = outlier ? `최고 구간 +${p.max.toFixed(1)}%p — 극단값 의존` : ''

  if (Math.abs(z(p)) >= 1.96) return { text: '통계적 우위 확인', tone: 'ok', note }
  if (p.pos > 50 && p.trimmed > 0 && !outlier) return { text: '약한 우위 (유의하지 않음)', tone: 'ok', note }
  if (p.pos > 50) return { text: '우위 불확실', tone: 'weak', note }
  return { text: '우위 없음', tone: 'none', note }
}

/** 평균·중앙값·상회율을 모두 기준선과 비교해 판정한다 (평균만 보면 속는다) */
export function verdictOf(p: Perf, base: Perf): { text: string; strong: boolean } {
  const beatsAvg = p.avg > base.avg
  const beatsMd  = p.md > base.md
  const beatsHit = p.hit >= base.hit
  if (beatsAvg && beatsMd && beatsHit) return { text: '기준선 상회', strong: true }
  if (beatsAvg && !beatsMd) return { text: '평균만 상회 (극단값 영향)', strong: false }
  if (!beatsAvg && !beatsHit) return { text: '기준선 이하', strong: false }
  return { text: '기준선과 유사', strong: false }
}

export const CATS: { key: CatKey; label: string; rule: string }[] = [
  { key: 'pullback',  label: '눌림목 매집', rule: '볼린저 %B ≤ 0.2 (하단권) + 20일 순자금 상위 30%' },
  { key: 'momentum',  label: '모멘텀 매집', rule: '20일 순자금 상위 + 20일 상승 10% 이상' },
  { key: 'quiet',     label: '조용한 매집', rule: '20일 순자금 상위 + 20일 등락 −5~+2%' },
]

/**
 * 삭제한 카테고리 — 근거를 남긴다. "왜 없지?" 하고 다시 만들지 않도록.
 *
 * 주의: 아래 순위는 2년 뭉친 기준이고, 10년 구간 단위(PERIOD_EVIDENCE)에서
 * 눌림목과 모멘텀의 순서가 뒤집혔다. 삭제 판단의 근거로는 여전히 유효하지만
 * (자금전환·지속매집은 어느 기준으로도 1/6이었다) 남은 셋의 서열은 믿지 말 것.
 *
 * 판정 기준: 평균·중앙값·상회율 3개 모두 기준선 초과 = 상회.
 * 시총 3구간 x 국면 2가지 = 6개 조합 중 몇 개를 넘겼는가:
 *
 *   눌림목      5/6  대형상승58 중형상승56 중형하락51 소형상승53 소형하락52
 *   모멘텀      4/6  대형상승50 대형하락54 중형상승49 소형상승49
 *   조용한매집   3/6  대형하락56 중형하락56 소형하락47
 *   ─────────────── 이하 삭제 ───────────────
 *   자금전환    1/6  대형하락56 만 상회. 나머지 5개 조합은 기준선 이하
 *                   (중형하락 43%, 소형하락 42%로 특히 나쁨)
 *   지속매집    1/6  대형하락53 만 상회. 평균은 기준선보다 약간 높지만
 *                   중앙값·상회율이 기준선과 같아 우위가 없다
 *
 * 자금전환의 대형주 하락장 56%는 아까운 수치지만, 6개 중 1개만 통하는 조건을
 * 상시 노출하면 나머지 5개 상황에서 오독을 부른다. 하락장 대비는 조용한매집이
 * 2개 조합(대형·중형 하락장 각 56%)으로 더 넓게 커버한다.
 */

/**
 * 시총 구간별로 따로 분류한다.
 * 구간을 섞으면 소형주가 대형주 신호를 지운다 — "조용한 매집"이 전체 기준으로는
 * -0.15%p(근거 없음)였는데 대형주만 보면 하락장 +1.96%p였다.
 *
 * 스크리너 화면과 성과 추적이 같은 규칙을 써야 비교가 성립하므로 여기 둔다.
 */
export function buildCategories<T extends ScreenerRow>(
  rows: T[],
  /**
   * 카테고리당 상위 몇 개까지 담을지. 화면은 25개를 보여준다.
   * 성과 추적은 표본을 늘리려고 50개까지 볼 수 있는데, 그 값은
   * "화면에 뜬 것"이 아니므로 반드시 따로 표시해야 한다.
   */
  limit = 25,
): Record<TierId, Record<CatKey, T[]>> {
  const out = {} as Record<TierId, Record<CatKey, T[]>>

  for (const tier of TIERS) {
    const inTier = rows.filter(r => r.tier === tier.id)
    const byFlow = [...inTier].sort((a, b) => (b.f20 ?? -999) - (a.f20 ?? -999))
    // 구간별 상위 15% (최소 30) — 구간 크기가 달라 고정 개수는 불공평하다
    const top = byFlow.slice(0, Math.max(30, Math.round(byFlow.length * 0.15)))
    // 백테스트는 수급 상위 30% 기준으로 측정했다. 근거와 화면을 일치시킨다
    const flow30 = byFlow.slice(0, Math.max(30, Math.round(byFlow.length * 0.3)))

    out[tier.id] = {
      // 볼린저 하단권 + 수급 상위 30%. 구간 단위로는 양수 52%로 우위가 불확실하다.
      // 임계값 0.2를 조이지 말 것 — 구간별 차이가 전부 노이즈다(z<1.96).
      pullback: flow30
        .filter(r => r.pctB !== null && r.pctB <= 0.2)
        .sort((a, b) => (a.pctB ?? 9) - (b.pctB ?? 9))
        .slice(0, limit),
      momentum: top.filter(r => (r.chg20 ?? 0) >= 10).slice(0, limit),
      // 밴드로 잡아야 한다 — 상한만 두면 폭락 종목(-52% 등)이 "정체"로 잡힌다
      quiet: top.filter(r => (r.chg20 ?? 99) >= -5 && (r.chg20 ?? 99) < 2).slice(0, limit),
    }
  }
  return out
}

export const CAVEATS = [
  '통계적으로 유의한 조건이 하나도 없다. 10년 120구간에서 가장 나은 모멘텀도 양수 57%, z=1.64로 기준(1.96)에 못 미친다.',
  '생존 편향: 유니버스를 오늘 기준 시총·거래대금으로 뽑아 상장폐지 종목이 빠져 있다. 10년 전 상장폐지 종목이 통째로 없다.',
  '눌림목은 최고 구간 하나가 +46%p다. 그 구간을 빼면 우위가 +0.22%p로 줄어든다.',
  '거래비용·슬리피지를 반영하지 않았다. 20일마다 전량 교체하면 이 정도 차이는 비용에 먹힌다.',
  '순자금은 실제 순매수가 아니라 상승일·하락일 거래대금을 비교한 대리지표다.',
]


/**
 * 중단 기준 (stopping rule).
 *
 * 결과를 본 뒤에 기준을 정하면 자기합리화가 된다. 그래서 먼저 적어둔다.
 * 2026-09-04 작성, 첫 추적 데이터가 쌓이기 전이다.
 *
 * 판단 시점: 추적 시작(2026-09-08) 후 3개월 — 2026-12-08 이후.
 * 그 전에는 표본이 부족하므로 중간 결과로 판단하지 않는다.
 *
 * 판정 대상은 SPY 상회율(hit)이다. 절대 상승률은 시장이 오르면 같이 오르므로
 * 지표의 값어치를 재지 못한다. 백테스트도 전부 SPY 대비였다.
 */
export const STOPPING_RULE = {
  decideAfter: '2026-12-08',
  /** 이 아래면 해당 카테고리를 화면에서 내린다 */
  dropBelowHitPct: 45,
  /** 세 카테고리 모두 이 아래면 스크리너를 '필터 전용'으로 격하한다 */
  demoteAllBelowHitPct: 50,
  /** 판단에 필요한 최소 표본 (카테고리별 누적 종목-관측 수) */
  minSamples: 300,
  notes: [
    '상회율 45% 미만 = 동전 던지기보다 나쁘다. 그 카테고리는 내린다.',
    '세 카테고리 모두 50% 미만 = 지표군 자체에 우위가 없다. 화면은 남기되 "종목을 좁혀주는 필터"로만 쓰고 카테고리 구분과 순서를 없앤다.',
    '한 카테고리라도 55% 이상이면서 표본 300 이상이면 유지한다.',
    '중간 결과로 기준을 바꾸지 않는다. 바꾸려면 왜 바꾸는지를 먼저 적는다.',
  ],
} as const


/**
 * VWMA20 돌파 목록.
 *
 * ── 성과 근거가 없다 ────────────────────────────────────────────────────
 * 10년 · 격자 시작점 10개로 검증한 결과 (기준선 = 전체 종목 균등, 양수 55%):
 *   돌파 당일      51% (45~53)   중앙값 +0.04%p
 *   재돌파(2차)    49% (43~53)   중앙값 -0.05%p
 *   2~3일 유지     53% (47~61)   중앙값 +0.15%p
 *   4~5일 유지     50%           6~10일 50%   11~20일 49%   21일+ 51%
 * 전 구간이 기준선 아래고 유지일수에 단조성도 없다.
 * 즉 "VWMA20 위에 있다"는 것 자체가 약한 마이너스 신호다.
 *
 * 그래도 화면에 두는 이유: 차트를 직접 보고 판단할 때 2,000종목을
 * 100여 개로 좁혀주는 탐색 도구로는 쓸 수 있다. 성과를 주장하지 않는다.
 */
export const BREAKOUT_EVIDENCE = {
  baselinePos: 56,
  buckets: [
    { label: '돌파 당일',   pos: 51, med: 0.04 },
    { label: '2~3일 유지',  pos: 53, med: 0.15 },
    { label: '4~5일 유지',  pos: 50, med: 0.11 },
    { label: '6~10일 유지', pos: 50, med: -0.03 },
    { label: '11~20일 유지', pos: 49, med: -0.08 },
    { label: '21일+ 유지',  pos: 51, med: 0.09 },
  ],
} as const

export type BreakoutKey =
  | 'today' | 'held'          // 단순 돌파 / 유지
  | 'revD'  | 'revW'          // 바닥잡기 (역배열에서 20선 탈환) 일봉/주봉
  | 'nearD' | 'nearW'         // 강세눌림 접근 (정배열, 20선 0~3% 위)
  | 'touchD' | 'touchW'       // 강세눌림 터치 (정배열, 20선 하향 이탈)

/**
 * 신호 목록. pos는 10년·격자 10개 실측 양수비율이고 기준선은 57%다.
 * 전부 기준선 아래라 화면에 그대로 노출한다.
 */
export const BREAKOUTS: { key: BreakoutKey; label: string; rule: string; pos: number | null }[] = [
  { key: 'today',  label: '오늘 돌파',     rule: '종가가 VWMA20 상향 돌파 (전일은 아래) + 3% 이내', pos: 53 },
  { key: 'held',   label: '2~5일 유지',    rule: '돌파 후 2~5일째 VWMA20 위 유지', pos: 53 },
  { key: 'revD',   label: '바닥잡기 일봉',  rule: '역배열(VWMA60>20)에서 오늘 VWMA20 탈환 + 3% 이내', pos: 52 },
  { key: 'revW',   label: '바닥잡기 주봉',  rule: '주봉 역배열에서 지난주 VWMA20 탈환 + 3% 이내', pos: 50 },
  { key: 'nearD',  label: '강세눌림 접근 일봉', rule: '정배열(VWMA20>60) + 3일 이상 위였고 지금 0~3% 위', pos: 48 },
  { key: 'nearW',  label: '강세눌림 접근 주봉', rule: '주봉 정배열 + 2주 이상 위였고 지금 0~3% 위', pos: 48 },
  { key: 'touchD', label: '강세눌림 터치 일봉', rule: '정배열 + 최근 3일 안에 위였고 지금 0~3% 아래', pos: 48 },
  { key: 'touchW', label: '강세눌림 터치 주봉', rule: '주봉 정배열 + 최근 2주 안에 위였고 지금 0~3% 아래', pos: 53 },
]

/** 근접 허용폭 — 3%. 사용자가 지정한 값이고 별도로 최적화하지 않았다 */
const NEAR_PCT = 0.03

/**
 * "위에 있던" 상태를 요구하는 최소 기간.
 *
 * 없으면 아래에서 올라와 선에 닿은 종목까지 눌림으로 잡힌다 — 방향이 정반대다.
 * 값은 성능 최적화가 아니라 "막 돌파한 것과 구분한다"는 의미로 정했다.
 */
const MIN_ABOVE_D = 3   // 일봉: 3일 이상 위에 있었다
const MIN_ABOVE_W = 2   // 주봉: 2주 이상 (주봉은 한 봉이 5거래일이라 짧게 잡는다)
/** 이탈 후 이 기간 안이어야 '닿았다'로 본다. 오래 아래면 그냥 무너진 것이다 */
const MAX_BELOW_D = 3
const MAX_BELOW_W = 2

function match<T extends ScreenerRow>(r: T, key: BreakoutKey): boolean {
  const { vwma20: d20, vwma60: d60, price, aboveRun: dRun } = r
  const { wClose: wc, wVwma20: w20, wVwma60: w60, wAboveRun: wRun } = r
  const hasD = d20 != null && d60 != null && price != null && dRun != null
  const hasW = wc != null && w20 != null && w60 != null && wRun != null

  switch (key) {
    case 'today':  return dRun === 1
    case 'held':   return dRun != null && dRun >= 2 && dRun <= 5

    // 바닥잡기 — 역배열(60이 20 위)에서 20선을 막 탈환.
    // 괴리도 3%로 묶는다. 봉 하나가 크게 뛰면 "막 돌파"인데도 선에서
    // 한참 떨어진 채 잡힌다 (실제로 주봉에서 GAP +8.5%, KT +4.1%가 걸렸다).
    // 다른 신호는 전부 3%로 묶여 있는데 여기만 빠져 있었다.
    case 'revD':   return hasD && d60! > d20! && dRun === 1
                     && (price! - d20!) / d20! <= NEAR_PCT
    case 'revW':   return hasW && w60! > w20! && wRun === 1
                     && (wc! - w20!) / w20! <= NEAR_PCT

    // 강세눌림 접근 — 정배열 + 한동안 위에 있었고 + 지금 선의 0~3% 위
    // dRun >= MIN_ABOVE 가 "위에 있던"을 보장한다
    case 'nearD':  return hasD && d20! > d60! && dRun! >= MIN_ABOVE_D
                     && price! >= d20! && (price! - d20!) / d20! <= NEAR_PCT
    case 'nearW':  return hasW && w20! > w60! && wRun! >= MIN_ABOVE_W
                     && wc! >= w20! && (wc! - w20!) / w20! <= NEAR_PCT

    // 강세눌림 터치 — 정배열 + 최근에 위에 있다가 막 내려옴 + 0~3% 아래
    // dRun 이 -1~-3 이면 "며칠 전까지 위였다"가 보장된다
    case 'touchD': return hasD && d20! > d60! && dRun! <= -1 && dRun! >= -MAX_BELOW_D
                     && (d20! - price!) / d20! <= NEAR_PCT
    case 'touchW': return hasW && w20! > w60! && wRun! <= -1 && wRun! >= -MAX_BELOW_W
                     && (w20! - wc!) / w20! <= NEAR_PCT
  }
}

/** 수급이 실린 것을 위로 올린다. 성과 근거가 아니라 읽는 순서일 뿐이다 */
export function buildBreakouts<T extends ScreenerRow>(
  rows: T[], limit = 50,
): Record<TierId, Record<BreakoutKey, T[]>> {
  const out = {} as Record<TierId, Record<BreakoutKey, T[]>>
  for (const tier of TIERS) {
    const inTier = rows.filter(r => r.tier === tier.id)
    const byFlow = (a: T[]) => [...a].sort((x, y) => (y.f20 ?? -999) - (x.f20 ?? -999)).slice(0, limit)
    const m = {} as Record<BreakoutKey, T[]>
    for (const b of BREAKOUTS) m[b.key] = byFlow(inTier.filter(r => match(r, b.key)))
    out[tier.id] = m
  }
  return out
}
