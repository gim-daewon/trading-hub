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
      // 볼린저 하단권 + 수급 상위 30%. 6개 조합 중 5개에서 기준선 상회.
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
  '생존 편향: 유니버스를 오늘 기준 시총·거래대금으로 뽑아 상장폐지 종목이 빠져 있다.',
  '표본 중복: 20일 구간을 5일 간격으로 사용해 독립 표본은 실질 1/4 수준이다.',
  '2년치 83개 리밸런스뿐이라 통계적 결론을 내릴 수 없다.',
  '평균은 소수 극단값에 끌려간다. 중앙값과 상회율을 같이 봐야 한다.',
]
