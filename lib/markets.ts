/**
 * 시장별 설정 — 미국 전용이던 구조를 한국·크립토로 넓히면서 분리했다.
 *
 * **TierId는 세 시장 공통으로 고정한다.** 시장마다 다른 id를 쓰면
 * DB 컬럼과 `Record<TierId, ...>` 타입이 갈라져 저장·집계·화면이 전부 나뉜다.
 * 시장마다 다른 건 **임계값과 라벨뿐**이다.
 */
export type Market = 'us' | 'kr' | 'crypto'
/**
 * 'unknown'은 시총을 못 알아낸 종목을 담는다.
 *
 * 없으면 그 종목이 화면에서 통째로 사라진다 — "모든 종목"이 요구사항인데
 * 조용히 빠지는 게 가장 나쁘다. 크립토에서 555개 중 23개가 여기 온다
 * (FTT 같은 사실상 죽은 코인, AMDB·CRCLB 같은 토큰화 주식).
 */
export type TierId = 'large' | 'mid' | 'small' | 'micro' | 'unknown'

export const MARKET_IDS: Market[] = ['us', 'kr', 'crypto']
export const isMarket = (v: unknown): v is Market =>
  typeof v === 'string' && (MARKET_IDS as string[]).includes(v)

export interface Tier {
  id: TierId
  label: string
  /** 이상 (포함) */
  min: number
  /** 미만 (제외) */
  max: number
}

export interface MarketDef {
  id: Market
  label: string
  /** 토글 버튼에 쓰는 짧은 이름 */
  short: string
  currency: 'USD' | 'KRW'
  tiers: Tier[]
  /**
   * 손절 -3% / 익절 +9% 규칙이 이 시장에서 검증됐나.
   *
   * false면 화면에 기댓값·손익비 판정을 띄우지 않는다. 미국에서 잰 숫자를
   * 다른 시장에 붙이면 근거가 거짓말이 된다.
   */
  ruleValidated: boolean
  /** 규칙이 왜 아직 안 맞는지 — 화면에 그대로 띄운다 */
  ruleNote?: string
  universeNote: string
  /**
   * 이 거래대금 미만이면 지표가 노이즈다 — 화면에 경고를 띄운다.
   *
   * 하한으로 걸러내지 않는 이유: "모든 종목"이 요구사항이다.
   * 한국은 거래대금 중앙값이 8,800만원이라 미국 하한($5M ≈ 70억원)을 쓰면
   * 2,552개 중 184개(7%)만 남는다. 거르는 대신 알려준다.
   */
  lowLiquidity: number
  /**
   * 시장 국면을 재는 기준 지수.
   *
   * 미국은 SPY였다. 한국에 SPY를 쓰면 국면이 엉뚱해진다 —
   * 미국이 오르는 날 코스피가 빠지는 일이 흔하다.
   * DB 컬럼 이름은 spy_chg20 그대로 둔다. 이름을 바꾸면 과거 데이터가
   * 끊기는데, 얻는 건 이름뿐이다.
   */
  benchmark: { symbol: string; source: 'yahoo' | 'binance' | 'upbit'; label: string }
  /**
   * 지표를 계산할 봉 간격.
   *
   * 주식은 '1d'뿐이다 — 개장·마감이 봉에 의미를 준다.
   * 크립토는 24/7이라 일봉 경계(UTC 자정)가 임의적이고, 4시간봉을 쓰면
   * 같은 기간에 표본이 6배가 된다.
   *
   * 다만 4시간봉은 다른 신호다. VWMA20이 20일에서 3.3일이 되고
   * ATR도 일봉의 약 1/3(BTC 0.95% vs 3.24%)이라 손절폭이 좁아진다.
   * 손절이 좁으면 같은 수수료가 위험의 더 큰 몫을 먹는다 —
   * 왕복 0.2%면 일봉에서 -0.06R, 4시간봉에서 -0.20R이다.
   * 그래서 비용을 넣고 재보기 전에는 바꾸지 않는다.
   */
  interval: '1d' | '4h'
  /** 스캔 주기(시간). 4시간봉이면 4시간마다 돌아야 신호를 놓치지 않는다 */
  scanEveryHours: number
  /**
   * 왕복 거래비용(%). 진입+청산 합계.
   * 손익비 계산과 성과 판정에서 빼야 좁은 손절이 과대평가되지 않는다.
   */
  roundTripCost: number
  /**
   * 손절·익절 규칙. **시장마다 다르다.**
   *
   * 10년·격자 10개로 12가지를 비교한 결과(R 기댓값 = 위험 1단위 대비 손익):
   *
   * **2026-09-14 아웃오브샘플 검증으로 다시 정했다.**
   *
   * 10년을 앞뒤로 갈라, 앞에서 고른 규칙이 뒤에서도 통하는지 봤다.
   * 좁은 손절이 통째로 무너졌다:
   *
   *              앞절반R   뒤절반R   순위
   *   미국 1.0/9.0  +0.266   +0.034   1위 -> 8위
   *        0.5/6.0  +0.244   -0.025   2위 -> 17위 (마이너스)
   *        1.0/6.0  +0.239   +0.020   3위 -> 12위   <- 직전 앱 규칙
   *        2.0/9.0  +0.233   +0.068   4위 -> 4위
   *        3.0/9.0  +0.203   +0.080   7위 -> 1위
   *   순위 상관 0.426 (약함)
   *
   *   한국 1.0/9.0  +0.234   +0.132   1위 -> 2위
   *        2.0/9.0  +0.191   +0.138   3위 -> 1위
   *   순위 상관 0.858 (강함)
   *
   * **두 시장·두 구간에서 흔들리지 않은 건 2.0/9.0 하나뿐이다.**
   * 인샘플 1위가 아니었기에 과적합의 승자가 아니었고, 그래서 살아남았다.
   *
   * 전체 표본(비용 반영) R 기댓값:
   *   미국 +0.158R / 한국 +0.168R / 크립토 +0.069R(전 격자 플러스)
   *
   * 교훈: 18가지 중 인샘플 최고를 고르면 그게 곧 과적합이다.
   * 좁은 손절이 좋아 보였던 건 앞 구간(2017~2021)의 성질이었다.
   */
  rule: RuleDef
}

export interface RuleDef {
  /** 'pct'는 진입가 대비 %, 'atr'은 ATR(14)의 배수 */
  kind: 'pct' | 'atr'
  stop: number
  target: number
  label: string
  /** 이 시장에서 실측으로 확인된 R 기댓값 (기준선 기준) */
  expR: number | null
  /**
   * 이 거래대금 미만에서는 규칙이 검증되지 않았다.
   *
   * 한국 전 종목에서 ATR 손절이 -9.2R까지 무너진 게 여기서 왔다.
   * 화면에서 이 아래 종목에는 손절가·익절가를 띄우지 않는다 —
   * 검증 안 된 구간에 숫자를 띄우면 그게 근거처럼 읽힌다.
   */
  minVol: number
}

/**
 * 미국은 구간을 바꾸지 않는다. 초소형($500M 미만)도 넣지 않는다.
 *
 * 2026-12-08 판정을 위해 표본을 쌓는 중이고, 유니버스를 넓히면
 * 그 표본의 의미가 달라진다. 한국·크립토를 붙이는 것과 미국 정의를
 * 건드리는 것은 별개다.
 */
const US_TIERS: Tier[] = [
  { id: 'large', label: '대형 $10B+', min: 1e10, max: Infinity },
  { id: 'mid', label: '중형 $2~10B', min: 2e9, max: 1e10 },
  { id: 'small', label: '소형 $0.5~2B', min: 5e8, max: 2e9 },
]

/**
 * 한국은 원 단위. 미국 기준($10B ≈ 14조)을 그대로 쓰면
 * 삼성·SK만 대형이 되고 나머지가 전부 소형 하나에 뭉개진다.
 *
 * 중형 하한을 1조로 잡은 근거: KOSPI200 편입 하한이 대략 이 선이다.
 * 실측으로 전 종목의 40%가 시총 500억 미만이라 **초소형 구간을 뒀다** —
 * 없으면 "모든 종목"이 소형 한 칸에 다 들어간다.
 */
const KR_TIERS: Tier[] = [
  { id: 'large', label: '대형 5조+', min: 5e12, max: Infinity },
  { id: 'mid', label: '중형 1~5조', min: 1e12, max: 5e12 },
  { id: 'small', label: '소형 1천억~1조', min: 1e11, max: 1e12 },
  { id: 'micro', label: '초소형 1천억 미만', min: 0, max: 1e11 },
]

/**
 * 크립토는 코인게코 시총(USD) 기준이다.
 *
 * 처음엔 거래대금으로 나누려 했다 — 바이낸스가 시총을 안 주고, 실제 제약은
 * 시총이 아니라 유동성이기 때문이다. 코인게코가 키 없이 되는 걸 확인해
 * 시총으로 바꿨다: 미국·한국과 같은 축이어야 세 시장을 나란히 볼 수 있다.
 * 유동성은 유니버스 필터와 화면 표시로 남긴다.
 */
const CRYPTO_TIERS: Tier[] = [
  { id: 'large', label: '대형 $10B+', min: 1e10, max: Infinity },
  { id: 'mid', label: '중형 $1~10B', min: 1e9, max: 1e10 },
  { id: 'small', label: '소형 $100M~1B', min: 1e8, max: 1e9 },
  { id: 'micro', label: '초소형 $100M 미만', min: 0, max: 1e8 },
  // min/max로는 절대 매칭되지 않는다. tierOf가 null을 줄 때 호출부가 넣는다
  { id: 'unknown', label: '시총 미상', min: -1, max: -1 },
]

export const MARKETS: Record<Market, MarketDef> = {
  us: {
    id: 'us', label: '미국', short: '미국', currency: 'USD', tiers: US_TIERS,
    ruleValidated: true,
    universeNote: '나스닥 스크리너 · 일 거래대금 $5M+ · 시총 $500M+',
    // 유니버스 필터가 이미 $5M을 걸러서 해당되는 종목이 없다
    lowLiquidity: 5e6,
    benchmark: { symbol: 'SPY', source: 'yahoo', label: 'SPY' },
    interval: '1d', scanEveryHours: 24,
    // 미국 주식 왕복 수수료. 대형 브로커는 무료지만 슬리피지가 남는다
    roundTripCost: 0.05,
    // 유니버스가 이미 $5M로 걸러져 있어 추가 하한이 필요 없다
    rule: { kind: 'atr', stop: 2, target: 9, label: '손절 2×ATR / 익절 9×ATR', expR: 0.158, minVol: 5e6 },
  },
  kr: {
    id: 'kr', label: '한국', short: '한국', currency: 'KRW', tiers: KR_TIERS,
    // 2026-09-09에 측정했다. 규칙(-3%/+9%)이 한국에서도 성립한다 —
    // 기준선 +0.13% · 승률 27% · 손익비 2.90으로 미국과 같은 구조가 나왔다.
    // 다만 기준선 자체는 미국(+0.24%)의 절반이라 잣대를 따로 쓴다.
    ruleValidated: true,
    universeNote: '코스피·코스닥 전 종목 (ETF·ETN·거래정지 제외)',
    lowLiquidity: 1e8,   // 1억원. 실측 중앙값 8,800만원이라 절반 가까이 걸린다
    benchmark: { symbol: '^KS11', source: 'yahoo', label: '코스피' },
    interval: '1d', scanEveryHours: 24,
    // 수수료 왕복 0.02% + 매도 시 거래세 0.18%
    roundTripCost: 0.20,
    // 거래대금 10억원 미만은 ATR 손절이 갭에 뚫린다. 실측으로 확인했다
    rule: { kind: 'atr', stop: 2, target: 9, label: '손절 2×ATR / 익절 9×ATR', expR: 0.168, minVol: 1e9 },
  },
  crypto: {
    id: 'crypto', label: '암호화폐', short: '크립토', currency: 'USD', tiers: CRYPTO_TIERS,
    ruleValidated: false,
    ruleNote:
      '손절 -3%로는 평균 2.2일 만에 잘린다 (일중 변동폭 중앙값 BTC 3.24% · SOL 5.74%). ' +
      '실측으로 규칙을 12가지 바꿔봤는데 넓힐수록 좋아졌고 ATR 3.0/9.0이 최고(+0.84%)였다. ' +
      '다만 그때 보유가 28일이라 측정 창(40일) 안에서 상당수가 시간 만료로 끝난다 — ' +
      '사실상 매수 후 보유에 가까워 "규칙을 찾았다"고 말할 수 없다. 아직 미검증이다.',
    universeNote: '바이낸스 USDT 현물 + 업비트 KRW 마켓 (레버리지·스테이블 제외)',
    lowLiquidity: 1e5,   // $100k
    // 크립토는 BTC가 곧 국면이다. 알트는 BTC가 빠지면 같이 빠진다
    benchmark: { symbol: 'BTCUSDT', source: 'binance', label: 'BTC' },
    // 4시간봉 전환은 비용 반영 측정 결과를 보고 정한다
    interval: '1d', scanEveryHours: 24,
    // 바이낸스 현물 테이커 0.1% x2. 지정가(메이커)면 0.04%까지 내려간다
    roundTripCost: 0.20,
    // 크립토만 다른 규칙이다 — 2.0/6.0은 격자최소가 마이너스였고
    // 1.0/2.0만 전 격자 플러스였다. 다만 기준선 자체가 아직 미검증이다
    // 크립토도 같은 규칙으로 통일했다. 비용을 넣고 재보니 직전 규칙
    // (1.0/2.0)이 -0.048R로 마이너스였다 — 손절도 익절도 좁아 수수료가
    // 양쪽을 다 먹는다. 2.0/9.0은 +0.069R에 전 격자 플러스(+0.009)다.
    // 다만 크립토는 아웃오브샘플 검증을 아직 안 했다
    rule: { kind: 'atr', stop: 2, target: 9, label: '손절 2×ATR / 익절 9×ATR', expR: 0.069, minVol: 1e5 },
  },
}

export const tiersFor = (m: Market): Tier[] => MARKETS[m].tiers

/**
 * 시총 미상(0 이하)은 **초소형으로 떨어뜨리지 않는다.**
 *
 * 크립토 실측에서 코인게코 상위 1,000위 밖 171종목이 시총 0으로 들어와
 * 초소형 414개 중 41%를 채웠다. 모르는 것을 작다고 단정한 것이다.
 * null을 돌려주고 호출부가 '미상'으로 다루게 한다.
 */
export function tierOf(cap: number, m: Market): TierId | null {
  if (!Number.isFinite(cap) || cap <= 0) return null
  return tiersFor(m).find(t => cap >= t.min && cap < t.max)?.id ?? null
}

/**
 * 트레이딩뷰 심볼로 변환.
 *
 * 우리가 봉을 받는 키를 그대로 넘기면 트레이딩뷰가 못 찾는다.
 * 실제로 한국 종목을 누르면 "없는 종목"이 떴다 — 야후 형식(005930.KS)을
 * 그대로 보냈기 때문이다.
 *
 *   미국    AAPL        -> AAPL            (그대로)
 *   한국    005930.KS   -> KRX:005930      (코스피·코스닥 모두 KRX 접두사)
 *   바이낸스 BTCUSDT     -> BINANCE:BTCUSDT
 *   업비트   KRW-BTC     -> UPBIT:BTCKRW    (순서가 뒤집힌다)
 */
export function tvSymbol(symbol: string, market: Market): string {
  if (market === 'kr') {
    // .KS(코스피) / .KQ(코스닥) 모두 트레이딩뷰에서는 KRX다
    const code = symbol.replace(/\.(KS|KQ)$/i, '')
    return `KRX:${code}`
  }
  if (market === 'crypto') {
    // 업비트 마켓은 KRW-BTC 형식이고 트레이딩뷰는 BTCKRW 순서를 쓴다
    const up = /^([A-Z]+)-([A-Z0-9]+)$/.exec(symbol)
    if (up) return `UPBIT:${up[2]}${up[1]}`
    return `BINANCE:${symbol}`
  }
  return symbol
}

/**
 * 진입가 기준 손절가·익절가.
 *
 * 진입가는 **마지막 종가**다. 실제 체결가가 아니라는 걸 화면에도 적어야 한다.
 * ATR 규칙인데 atr 값이 없으면 null — 없는 값을 %로 대체하면
 * 화면에 뜬 가격이 실제 규칙과 달라진다.
 */
export function exitPrices(
  price: number | null | undefined,
  atr14: number | null | undefined,
  market: Market,
  dollarVol?: number | null,
): { stop: number; target: number; stopPct: number; targetPct: number } | null {
  if (price == null || !(price > 0)) return null
  // 검증 안 된 유동성 구간에는 숫자를 띄우지 않는다.
  // 띄우면 그게 근거처럼 읽힌다 — 한국 전 종목에서 -9.2R까지 무너진 구간이다
  if (dollarVol != null && dollarVol < MARKETS[market].rule.minVol) return null
  const r = MARKETS[market].rule
  let stop: number, target: number
  if (r.kind === 'atr') {
    if (atr14 == null || !(atr14 > 0)) return null
    stop = price - r.stop * atr14
    target = price + r.target * atr14
    if (stop <= 0) return null
  } else {
    stop = price * (1 - r.stop / 100)
    target = price * (1 + r.target / 100)
  }
  return {
    stop, target,
    stopPct: ((stop - price) / price) * 100,
    targetPct: ((target - price) / price) * 100,
  }
}

/**
 * 가격 표기 — 정수로 끊는다.
 *
 * 손절·익절가에 소수점이 붙으면 읽는 데 방해만 된다. 어차피 진입가가
 * 마지막 종가라 소수점 둘째 자리가 의미를 갖지 않는다.
 *
 * 예외는 1달러 미만 코인이다. DOGE(0.09)를 정수로 끊으면 '0'이 되어
 * 아예 못 읽는다. 그 구간만 유효숫자를 남긴다.
 */
export function fmtPrice(v: number | null | undefined, market: Market): string {
  if (v == null || !Number.isFinite(v)) return '—'
  if (Math.abs(v) >= 1) return Math.round(v).toLocaleString()
  // 1 미만은 유효숫자 3자리. 0.09005 -> 0.0901
  return v.toPrecision(3)
}

/** 시총 표기 — 원화는 조/억, 달러는 B/M */
export function fmtCap(cap: number | null | undefined, m: Market): string {
  if (cap == null || !Number.isFinite(cap)) return '—'
  if (MARKETS[m].currency === 'KRW') {
    if (cap >= 1e12) return `${(cap / 1e12).toFixed(cap >= 1e13 ? 0 : 1)}조`
    if (cap >= 1e8) return `${Math.round(cap / 1e8).toLocaleString()}억`
    return `${Math.round(cap).toLocaleString()}원`
  }
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(cap >= 1e11 ? 0 : 1)}B`
  if (cap >= 1e6) return `$${Math.round(cap / 1e6)}M`
  return `$${Math.round(cap).toLocaleString()}`
}
