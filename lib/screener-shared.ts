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
export function buildCategories<T extends ScreenerRow>(rows: T[]): Record<TierId, Record<CatKey, T[]>> {
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
        .slice(0, 25),
      momentum: top.filter(r => (r.chg20 ?? 0) >= 10).slice(0, 25),
      // 밴드로 잡아야 한다 — 상한만 두면 폭락 종목(-52% 등)이 "정체"로 잡힌다
      quiet: top.filter(r => (r.chg20 ?? 99) >= -5 && (r.chg20 ?? 99) < 2).slice(0, 25),
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
