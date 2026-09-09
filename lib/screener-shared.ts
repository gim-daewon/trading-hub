import { hasInverse } from './inverse-etf'
import { type Market, type TierId, tiersFor } from './markets'
// 스크리너 공용 정의 — API·스캔 스크립트·UI가 같은 기준을 쓴다.

export type Regime = 'up' | 'down'
export type CatKey = 'pullback' | 'momentum' | 'quiet'

// 구간 정의는 lib/markets.ts 한 곳에만 둔다.
// 여기에도 두면 시장을 넓힐 때 두 정의가 갈라진다 — 신호를 두 번 구현했다가
// 정의 불일치 버그를 네 번 낸 것과 같은 실수다.
export { tiersFor, tierOf, MARKETS, MARKET_IDS, isMarket, fmtCap } from './markets'
export type { Market, TierId, Tier } from './markets'

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
  /** 직전 반대 구간 길이. 돌파 전 며칠(몇 주) 아래에 있었나 */
  prevRun?: number | null
  wPrevRun?: number | null
  /** 저가 — 밑꼬리가 VWMA20을 뚫었는지 판정 */
  low?: number | null
  wLow?: number | null
  price: number | null
  /** 화면에 쓰는 짧은 이름. BTCUSDT -> BTC, 005930.KS -> 005930 */
  display?: string
  /** 일 거래대금. 한국은 원, 미국·크립토는 USD */
  dollarVol?: number | null
  /** 시총을 실제로 알아냈나. false면 '미상'으로 표시한다 */
  capKnown?: boolean
  /** 김치 프리미엄(%). 바이낸스·업비트 동시상장 코인만 */
  premium?: number | null
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
// Partial인 이유: 이 값은 **미국 3구간**의 실측치다.
// 한국·크립토의 초소형(micro)과 시총 미상(unknown)은 아직 잰 적이 없다.
// Record로 두면 없는 구간에 가짜 숫자를 채워 넣어야 한다.
export const TIER_EVIDENCE: Partial<Record<TierId, Record<CatKey | 'base', CatEvidence>>> = {
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


export interface RrPerf {
  /** 승률 — 규칙 매매에선 지표가 아니다. 참고로만 둔다 */
  win: number
  /** 손익비. 규칙(-3%/+9%)이 만드는 값이라 신호별 차이가 거의 없다 */
  rr: number
  /** 거래당 기댓값(%). 이게 유일하게 신호를 가른다 */
  exp: number
  /** 격자 시작점 10개의 최소~최대 */
  lo: number
  hi: number
  /** 평균 보유일 */
  days: number
  /** 연환산 = 기댓값 / 보유일 x 252. 자본 회전을 반영한 상한치 */
  ann: number
}

/**
 * 손절 -3% · 익절 +9% 규칙 기준 실측 (10년, 격자 시작점 10개, 갭 반영).
 *
 * 사용자 지침으로 기준을 바꿨다 — "승률뿐만 아니라 손익비도 중요시해라".
 * 그러자 순위가 뒤집혔다:
 *   모멘텀은 승률 57%로 1위였는데 기댓값 -0.03%로 유일한 마이너스
 *   조용한매집은 승률 47%로 꼴찌였는데 기댓값 +0.46%로 2위
 *
 * 세 가지가 드러났다:
 *  1) 손익비는 전부 2.52~2.89 — 규칙이 만드는 값이지 신호가 만드는 게 아니다
 *  2) 승률도 26~32%로 거의 무차별
 *  3) 차이는 오직 기댓값에서 난다
 *
 * 주의: 10개 격자 전부에서 기준선을 넘은 신호는 하나도 없다.
 * 중앙값이 높아도 일부 구간에서는 기준선에 진다.
 */
export const RR_BASELINE: RrPerf =
  { win: 29, rr: 2.77, exp: 0.24, lo: -0.02, hi: 0.62, days: 8.2, ann: 7.48 }

export const RR_EVIDENCE: Record<string, RrPerf> = {
  // 수급 스크리너 — 2026-09-06 재측정. 눌림목·정체 구간에서 수급 필터를 뺀 정의다
  pullback: { win: 29, rr: 2.81, exp:  0.30, lo: -0.12, hi: 1.38, days:  7.4, ann: 10.34 },
  quiet:    { win: 29, rr: 2.67, exp:  0.28, lo:  0.07, hi: 0.45, days: 10.0, ann:  7.15 },
  momentum: { win: 26, rr: 2.79, exp: -0.01, lo: -0.25, hi: 0.25, days:  6.3, ann: -0.30 },
  // VWMA 돌파 — 2026-09-06 재측정. 앱의 buildBreakouts()로 직접 판정했다
  today:    { win: 29, rr: 2.74, exp:  0.32, lo:  0.01, hi: 0.44, days:  8.2, ann:  9.94 },
  nearW:    { win: 31, rr: 2.54, exp:  0.28, lo: -0.08, hi: 0.58, days: 11.6, ann:  6.10 },
  revD:     { win: 29, rr: 2.75, exp:  0.27, lo: -0.40, hi: 0.65, days:  8.3, ann:  8.31 },
  revW:     { win: 28, rr: 2.77, exp:  0.20, lo: -0.43, hi: 1.20, days:  8.3, ann:  5.96 },
  held:     { win: 28, rr: 2.73, exp:  0.18, lo: -0.09, hi: 0.51, days:  8.4, ann:  5.32 },
  nearD:    { win: 30, rr: 2.46, exp:  0.14, lo: -0.10, hi: 0.36, days: 12.4, ann:  2.92 },
  touchD:   { win: 28, rr: 2.68, exp:  0.12, lo: -0.20, hi: 0.56, days:  9.2, ann:  3.41 },
  // 전 격자 마이너스. 화면에서 뺐다 — /rejected에 근거를 남겼다
  touchW:   { win: 21, rr: 2.58, exp: -0.86, lo: -1.16, hi: -0.49, days:  7.3, ann: -29.87 },
  // 인버스 ETF가 있는 14종목만 대상이라 표본이 좁다. 신호 근거로 쓰지 말 것
  brokeD:   { win: 32, rr: 2.78, exp:  0.66, lo: -0.07, hi: 1.71, days:  5.9, ann: 28.34 },
}

/**
 * 기댓값 기준 판정. 승률이 아니라 이걸로 판단한다.
 *
 * "우위 확인"은 10개 격자 전부에서 기준선을 넘었을 때만 쓴다.
 * 현재 그 조건을 만족하는 신호는 없다.
 */
export function rrVerdict(key: string): { text: string; tone: 'ok' | 'weak' | 'none'; note: string } {
  const p = RR_EVIDENCE[key]
  if (!p) return { text: '미측정', tone: 'weak', note: '' }
  const b = RR_BASELINE.exp
  if (p.exp <= 0) return { text: '기댓값 마이너스', tone: 'none', note: '규칙대로 매매하면 잃는다' }
  if (p.lo > b) return { text: '우위 확인', tone: 'ok', note: '전 격자에서 기준선 상회' }
  if (p.exp > b) return {
    text: '기준선 상회 (불확실)', tone: 'ok',
    note: `중앙값은 기준선의 ${(p.exp / b).toFixed(1)}배지만 일부 구간에선 기준선에 진다`,
  }
  return { text: '기준선 이하', tone: 'weak', note: '' }
}

export const CATS: { key: CatKey; label: string; rule: string }[] = [
  // 승률 순이 아니라 기댓값 순이다 — 모멘텀은 승률 1위였지만
  // 기댓값은 유일한 마이너스(-0.01%)다.
  //
  // 정체 구간을 눌림목보다 앞에 둔다. 기댓값은 사실상 같지만
  // (+0.28 vs +0.30) **격자 20개 전부에서 플러스인 건 정체 구간뿐이다**
  // (격자최소 +0.07 vs -0.12). 눌림목은 한 격자가 +1.38로 튀어 평균을 끌어올린다.
  { key: 'quiet',     label: '정체 구간', rule: '20일 등락 −5~+2% (수급 필터 없음)' },
  { key: 'pullback',  label: '눌림목', rule: '볼린저 %B ≤ 0.2 · 하단권 (수급 필터 없음)' },
  { key: 'momentum',  label: '모멘텀 매집', rule: '20일 순자금 상위 15% + 20일 상승 10% 이상' },
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
  /** 구간 경계가 시장마다 다르다 */
  market: Market = 'us',
  /**
   * 카테고리당 상위 몇 개까지 담을지. 화면은 25개를 보여준다.
   * 성과 추적은 표본을 늘리려고 50개까지 볼 수 있는데, 그 값은
   * "화면에 뜬 것"이 아니므로 반드시 따로 표시해야 한다.
   */
  limit = 25,
): Record<TierId, Record<CatKey, T[]>> {
  const out = {} as Record<TierId, Record<CatKey, T[]>>

  for (const tier of tiersFor(market)) {
    const inTier = rows.filter(r => r.tier === tier.id)
    const byFlow = [...inTier].sort((a, b) => (b.f20 ?? -999) - (a.f20 ?? -999))
    // 구간별 상위 15% (최소 30) — 구간 크기가 달라 고정 개수는 불공평하다
    const top = byFlow.slice(0, Math.max(30, Math.round(byFlow.length * 0.15)))

    out[tier.id] = {
      // 볼린저 하단권. 2026-09-06에 수급 상위 30% 필터를 뺐다.
      //
      // %B <= 0.2는 "최근 떨어졌다", 순자금 상위는 "최근 올랐다"는 뜻이라
      // 두 조건이 서로 싸운다. 실측으로 눌림목 종목 중 수급 상위는 9%뿐이었고
      // (1,491 / 16,144) 그 소수 표본에서 기댓값 부호가 뒤집혔다
      // (앞절반 -0.417% -> 뒤절반 +0.454%). 필터를 빼면 양쪽 모두 플러스다
      // (+0.034% / +0.153%, 표본 10배).
      //
      // 임계값 0.2를 조이지 말 것 — 구간별 차이가 전부 노이즈다(z<1.96).
      pullback: inTier
        .filter(r => r.pctB !== null && r.pctB <= 0.2)
        .sort((a, b) => (a.pctB ?? 9) - (b.pctB ?? 9))
        .slice(0, limit),

      // 모멘텀만 수급 상위를 유지한다. 여기서만 방향이 반대로 나왔다 —
      // 수급 하위 15%는 앞뒤 절반 모두 크게 마이너스였다(-1.09% / -0.61%).
      momentum: top.filter(r => (r.chg20 ?? 0) >= 10).slice(0, limit),

      // 20일 등락 -5~+2% 정체 구간. 여기서도 수급 필터를 뺐다.
      // 앞절반은 하위 > 무필터 > 상위, 뒤절반은 상위 > 하위 > 무필터로
      // 순위가 완전히 뒤집혔다. 어느 방향으로도 근거가 없다.
      //
      // 밴드로 잡아야 한다 — 상한만 두면 폭락 종목(-52% 등)이 "정체"로 잡힌다.
      // 정렬은 0%에 가까운 순. 밴드 한가운데가 가장 전형적인 정체다.
      // (이 정렬 자체는 측정된 바 없다 — 측정은 밴드 전체를 대상으로 했다)
      quiet: inTier
        .filter(r => (r.chg20 ?? 99) >= -5 && (r.chg20 ?? 99) < 2)
        .sort((a, b) => Math.abs(a.chg20 ?? 99) - Math.abs(b.chg20 ?? 99))
        .slice(0, limit),
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
/**
 * 신호 정의를 바꾼 날의 기록.
 *
 * /api/tracking은 저장된 스냅샷에 **지금의** 정의를 다시 적용해 성적을 낸다.
 * 그래서 정의를 바꾸면 과거 기록까지 소급해서 바뀐다 — 어제 화면에 떴던
 * 종목과 오늘 추적이 보고하는 종목이 달라진다.
 *
 * 그 사실을 숨기면 12월 판정 때 "이 성적이 실제로 화면에 떴던 것인가"를
 * 알 수 없게 된다. 바꾼 날과 내용을 남겨 화면에서 표시한다.
 *
 * 스냅샷 자체(종목·가격·지표)는 그대로다. 바뀌는 건 그 종목들을
 * 어느 카테고리로 묶느냐뿐이다.
 */
export interface DefChange { date: string; keys: string[]; what: string }

export const DEFINITION_CHANGES: DefChange[] = [
  { date: '2026-09-06', keys: ['pullback', 'quiet'], what: '수급 상위 필터 제거 — 앞뒤 절반에서 부호가 뒤집혔다' },
  { date: '2026-09-06', keys: ['nearD', 'touchD'], what: '주봉 정배열 전제조건 추가 — nearD 기댓값 +0.07%p' },
  { date: '2026-09-06', keys: ['touchW'], what: '화면에서 제거 — 격자 20개 전부 마이너스' },
]

/** 이 날짜 이후에 있었던 정의 변경 (기록 구간이 변경일을 걸치면 소급 적용됐다는 뜻) */
export function changesSince(from: string): DefChange[] {
  const d = from.slice(0, 10)
  return DEFINITION_CHANGES.filter(c => c.date > d)
}

export const STOPPING_RULE = {
  decideAfter: '2026-12-08',
  /**
   * 판정 대상을 승률에서 거래당 기댓값으로 바꿨다 (2026-09-05).
   *
   * 이유: 손절 -3% 규칙으로 재보니 승률과 기댓값의 순위가 정반대였다.
   *   모멘텀   승률 57%(1위) → 기댓값 -0.01%(꼴찌)
   *   정체 구간  승률 47%(꼴찌) → 기댓값 +0.28%(2위)
   * 손익비는 규칙이 만드는 값이라 신호별 차이가 없다(전부 2.5~2.9).
   * 남는 판별력은 기댓값뿐이다.
   *
   * 기준을 결과 보기 전에 바꾼다. 데이터를 본 뒤 바꾸면 자기합리화가 된다.
   */
  metric: '거래당 기댓값 (손절 -3% / 익절 +9%)',
  /**
   * 2026-09-06: 기준선을 0.18에서 0.24로 올렸다.
   *
   * 결과를 보고 기준을 낮추는 건 자기합리화지만, 이건 반대다 —
   * 격자를 10개에서 20개로 늘리고 앱 코드로 직접 판정하게 하니
   * 같은 규칙의 기준선 자체가 0.24로 올라갔다. 신호를 판정할 잣대가
   * 바뀐 것이므로 잣대를 갱신하지 않으면 전부 실제보다 좋아 보인다.
   */
  /** 백테스트 기준선. 아무 종목이나 같은 규칙으로 사면 이만큼 나온다 */
  baselineExp: 0.24,
  /** 이 아래면 해당 카테고리를 화면에서 내린다 */
  dropBelowExp: 0,
  /** 세 카테고리 모두 기준선 아래면 스크리너를 '필터 전용'으로 격하한다 */
  demoteAllBelowExp: 0.24,
  /** 판단에 필요한 최소 거래 수 (카테고리별 누적) */
  minTrades: 200,
  notes: [
    '기댓값이 0 이하 = 규칙대로 매매하면 잃는다. 그 카테고리는 내린다.',
    '세 카테고리 모두 기준선(+0.24%) 미만 = 신호에 값어치가 없다. 화면은 남기되 종목을 좁히는 필터로만 쓰고 카테고리 구분과 순서를 없앤다.',
    '승률과 손익비는 참고로만 본다. 규칙 매매에서 승률 26~32%, 손익비 2.5~2.9는 신호와 무관하게 나오는 값이다.',
    '자본 회전도 같이 본다. 기댓값이 같아도 보유 3일과 12일은 연환산이 4배 다르다.',
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
  | 'touchD' | 'touchW'       // 강세눌림 밑꼬리 터치 (꼬리는 뚫려도 몸통은 지킴)
  | 'brokeD'                  // 강세눌림 이탈 — 몸통이 20선 아래. 숏 후보

/**
 * 신호 목록. pos는 10년·격자 10개 실측 양수비율이고 기준선은 57%다.
 * 전부 기준선 아래라 화면에 그대로 노출한다.
 */
export const BREAKOUTS: { key: BreakoutKey; label: string; rule: string; pos: number }[] = [
  // 기댓값(RR_EVIDENCE) 순으로 둔다. pos는 참고용 승률이다.
  { key: 'today',  label: '오늘 돌파',     rule: '종가가 VWMA20 상향 돌파 (전일은 아래) + 3% 이내', pos: 53 },
  { key: 'nearW',  label: '강세눌림 접근 주봉', rule: '주봉 정배열 + 2주 이상 위였고 지금 0~1% 위', pos: 48 },
  { key: 'revD',   label: '바닥잡기 일봉',  rule: '역배열 + 5일 이상 아래 있다가 오늘 VWMA20 탈환 + 3% 이내', pos: 50 },
  { key: 'revW',   label: '바닥잡기 주봉',  rule: '주봉 역배열 + 4주 이상 아래 있다가 지난주 탈환 + 3% 이내', pos: 46 },
  { key: 'held',   label: '2~5일 유지',    rule: '돌파 후 2~5일째 VWMA20 위 유지', pos: 53 },
  { key: 'nearD',  label: '강세눌림 접근 일봉', rule: '일봉·주봉 모두 정배열 + 3일 이상 위였고 지금 0~1% 위', pos: 48 },
  { key: 'touchD', label: '강세눌림 밑꼬리 일봉', rule: '일봉·주봉 모두 정배열 + 3일 이상 위였고 저가는 VWMA20을 뚫었으나 종가는 위 (밑꼬리)', pos: 48 },
  // 아래 둘은 /breakout 탭에 노출하지 않는다. 계산은 계속해서 성과 추적에는 남긴다
  //
  // touchW: 기댓값 -0.86%, 격자 20개 전부 마이너스.
  //
  // 진행 중인 주를 쓰는 구조 탓인데, **저가를 보는 조건에서만** 터진다.
  // 주 안 며칠째인지로 쪼개니 단조 관계였다:
  //   1일째 -1.81% → 3일째 -0.77% → 5일째 +0.30%
  // nearW·revW는 주봉 종가를 보므로 하루짜리 봉이어도 의미가 있고
  // 실제로 며칠째든 고르다(nearW +0.23~+0.36%). touchW만 주봉 저가를 보는데
  // 월요일엔 '이번 주 저가'가 곧 '오늘 저가'라 조건이 하루짜리로 무너진다.
  { key: 'touchW', label: '강세눌림 밑꼬리 주봉', rule: '주봉 정배열 + 2주 이상 위였고 주봉 저가는 뚫었으나 종가는 위', pos: 53 },
  // brokeD: 숏 전용. /short에서만 쓴다
  { key: 'brokeD', label: '강세 이탈(숏)', rule: '종가가 VWMA20 아래 (20선 이탈)', pos: 0 },
]

/** 돌파 신호의 근접 허용폭 — 3% */
const NEAR_PCT = 0.03

/**
 * 강세눌림의 근접 허용폭 — 1%.
 *
 * 사용자 관찰: "몸통이 20선을 뚫리면 주가도 계속 떨어진다."
 * 3%는 너무 넓어 이미 무너진 것까지 잡혔다. 선에 실제로 붙은 것만 남긴다.
 */
const PULLBACK_PCT = 0.01

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

/**
 * 바닥잡기에서 "밑에 '있다가'"를 만족하는 최소 기간.
 *
 * 없으면 1~2주만 눌렸다 올라온 종목이 바닥으로 잡힌다.
 * 실측: JEF는 1주 아래였는데 20주 등락이 +16.0%, SNAP은 1주에 +12.7%였다.
 * 오르는 중에 잠깐 이탈했다 복귀한 것이지 바닥이 아니다.
 * 반면 FUBO 41주 · STN 28주 · CRK 21주는 진짜 눌린 종목이다.
 */
const MIN_BELOW_D = 5   // 일봉 5일 이상 아래에 있었다
const MIN_BELOW_W = 4   // 주봉 4주 이상

/**
 * 주봉 정배열 여부 — 강세눌림 **일봉**의 전제조건이다.
 *
 * 사용자 질문: "강세눌림 일봉의 전제조건은 주봉 월봉 모두 정배열일 때 아닌가?"
 * 측정 결과 주봉은 도움이 됐고(+0.10~0.15%p) 월봉은 아니었다.
 * 보유가 9~11일인데 월봉 60선은 5년 추세라 이 시간축과 맞지 않는다.
 *
 * 이후 특징 분석에서 "주봉 정배열 강도"가 앞/뒤 절반 모두에서 살아남아
 * 다른 설계로 한 번 더 확인됐다. 두 번 독립 확인된 유일한 특징이다.
 *
 * 주봉 값이 없으면 통과시킨다 — 스캔 초기 데이터에서 일봉 신호까지
 * 통째로 사라지는 것보다 낫다.
 */
function weeklyAligned(r: ScreenerRow): boolean {
  const { wVwma20: w20, wVwma60: w60 } = r
  return w20 == null || w60 == null || w20 > w60
}

/**
 * 정배열 강도 — (VWMA20 - VWMA60) / VWMA60 × 100.
 *
 * 부호는 배열 방향(양수면 정배열), 크기는 두 선이 벌어진 폭이다.
 * "정배열이냐"만 보면 간신히 붙은 것과 크게 벌어진 것이 같아진다.
 *
 * 특징 분석에서 클수록 기댓값이 높았다(일봉 앞 +0.74 / 뒤 +0.19,
 * 주봉 앞 +0.65 / 뒤 +0.16). 다만 살아남은 특징 수 자체가 우연 수준이라
 * **조건으로 쓰지 않고 화면에 보여주기만 한다.**
 */
export function alignStrength(
  r: Pick<ScreenerRow, 'vwma20' | 'vwma60' | 'wVwma20' | 'wVwma60'>,
  weekly = false,
): number | null {
  const a = weekly ? r.wVwma20 : r.vwma20
  const b = weekly ? r.wVwma60 : r.vwma60
  return a != null && b != null && b !== 0 ? ((a - b) / b) * 100 : null
}

function match<T extends ScreenerRow>(r: T, key: BreakoutKey): boolean {
  const { vwma20: d20, vwma60: d60, price, aboveRun: dRun, prevRun: dPrev } = r
  const { wClose: wc, wVwma20: w20, wVwma60: w60, wAboveRun: wRun, wPrevRun: wPrev } = r
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
                     && (dPrev ?? 0) >= MIN_BELOW_D
                     && (price! - d20!) / d20! <= NEAR_PCT
    case 'revW':   return hasW && w60! > w20! && wRun === 1
                     && (wPrev ?? 0) >= MIN_BELOW_W
                     && (wc! - w20!) / w20! <= NEAR_PCT

    // 강세눌림 접근 — 정배열 + 한동안 위에 있었고 + 지금 선의 0~1% 위.
    // 폭을 3%에서 1%로 좁혔다. 선에 실제로 붙은 것만 본다.
    case 'nearD':  return hasD && d20! > d60! && dRun! >= MIN_ABOVE_D
                     && weeklyAligned(r)
                     && price! >= d20! && (price! - d20!) / d20! <= PULLBACK_PCT
    case 'nearW':  return hasW && w20! > w60! && wRun! >= MIN_ABOVE_W
                     && wc! >= w20! && (wc! - w20!) / w20! <= PULLBACK_PCT

    // 강세눌림 밑꼬리 터치 — 저가는 VWMA20을 뚫었지만 종가(몸통)는 위에서 마감.
    // 지지선을 시험하고 되받아친 모양이다.
    // 종가가 아래로 뚫린 건 여기 안 넣는다 — 그건 계속 떨어지는 쪽이라 숏 후보(brokeD)다.
    case 'touchD': return hasD && d20! > d60! && dRun! >= MIN_ABOVE_D
                     && weeklyAligned(r)
                     && r.low != null && r.low <= d20! && price! >= d20!
    case 'touchW': return hasW && w20! > w60! && wRun! >= MIN_ABOVE_W
                     && r.wLow != null && r.wLow <= w20! && wc! >= w20!

    // 이탈 — 종가가 VWMA20 아래. 숏 후보 목록의 원천이다.
    //
    // 처음엔 "정배열 + 3일 이내 + 3% 이내"로 좁혔는데 후보가 0개가 나왔다.
    // 인버스 ETF가 있는 14종목 중 4개가 20선 아래였지만 전부 11~15일 전에
    // 이탈해 조건 밖이었다. 사용자 의도는 "20선이 깨진 상태" 그 자체다.
    // 얼마나 최근인지·얼마나 깊은지는 화면에서 보여주고 판단은 사용자가 한다.
    case 'brokeD': return hasD && price! < d20!
  }
}

/** VWMA60까지 남은 거리(%). 역배열이면 양수(위로 여력), 정배열이면 음수 */
export function roomToVwma60(
  r: Pick<ScreenerRow, 'price' | 'vwma60' | 'wClose' | 'wVwma60'>,
  weekly = false,
): number | null {
  const px = weekly ? r.wClose : r.price
  const ma = weekly ? r.wVwma60 : r.vwma60
  return px && ma ? ((ma - px) / px) * 100 : null
}

/** 주봉 신호인지 — 여력을 주봉 값으로 재야 한다 */
export const isWeeklyKey = (k: BreakoutKey) => k.endsWith('W')

/**
 * 이 시장에서 화면에 띄우지 않을 신호.
 *
 * brokeD — 숏 전용. /short 메뉴에서만 쓴다 (전 시장 공통)
 * touchW — 기댓값 -0.86%, 격자 20개 전부 마이너스라 기각했다
 *
 * 크립토는 **주봉 신호를 전부 뺀다.** 7일 캘린더 주는 주식의 5거래일 주와
 * 다른 개념이고, 그 차이가 실제로 신호를 망가뜨리는 걸 봤다 — touchW가
 * 진행 중인 주 때문에 무너졌고 주 안 며칠째인지로 쪼개니 -1.81% → +0.30%로
 * 단조 관계였다. 주말이 없는 시장에 같은 구조를 쓰면 검증 없이 같은 함정에 빠진다.
 * 일봉 신호부터 붙이고 주봉은 크립토용으로 따로 설계한다.
 */
export function hiddenBreakouts(market: Market): Set<BreakoutKey> {
  const base: BreakoutKey[] = ['brokeD', 'touchW']
  if (market !== 'crypto') return new Set(base)
  return new Set([...base, ...BREAKOUTS.map(b => b.key).filter(isWeeklyKey)])
}

/**
 * 두 정렬 기준의 상위를 합집합으로 담는다.
 *
 * 수급순으로 자른 뒤 화면에서 여력순으로 재정렬하면 "수급 상위 50개 중
 * 여력이 큰 것"이지 "여력 상위 50개"가 아니다. 두 기준 모두의 상위를
 * 담아야 화면에서 어느 쪽으로 정렬해도 진짜 상위가 나온다.
 *
 * 손절 -3%가 고정이면 여력이 곧 손익비다 — 여력 9%가 3:1이다.
 */
export function buildBreakouts<T extends ScreenerRow>(
  rows: T[], market: Market = 'us', limit = 50,
): Record<TierId, Record<BreakoutKey, T[]>> {
  const out = {} as Record<TierId, Record<BreakoutKey, T[]>>
  for (const tier of tiersFor(market)) {
    const inTier = rows.filter(r => r.tier === tier.id)
    const m = {} as Record<BreakoutKey, T[]>
    for (const b of BREAKOUTS) {
      // brokeD는 숏 전용이라 인버스 ETF가 있는 종목만 남긴다.
      // 안 그러면 20선 아래 대형주 수백 개에 밀려 상위 50 컷에서 잘린다 —
      // 실제로 그래서 숏 후보가 0개로 나왔다.
      let hit = inTier.filter(r => match(r, b.key))
      if (b.key === 'brokeD') hit = hit.filter(r => hasInverse(r.symbol))
      const wk = isWeeklyKey(b.key)
      const byFlow = [...hit].sort((x, y) => (y.f20 ?? -999) - (x.f20 ?? -999)).slice(0, limit)
      const byRoom = [...hit].sort((x, y) =>
        (roomToVwma60(y, wk) ?? -999) - (roomToVwma60(x, wk) ?? -999)).slice(0, limit)
      const seen = new Set<string>()
      m[b.key] = [...byRoom, ...byFlow].filter(r => !seen.has(r.symbol) && seen.add(r.symbol))
    }
    out[tier.id] = m
  }
  return out
}
