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
  },
  kr: {
    id: 'kr', label: '한국', short: '한국', currency: 'KRW', tiers: KR_TIERS,
    ruleValidated: false,
    ruleNote: '아직 한국에서 재지 않았다. 미국 기준선(+0.24%)을 그대로 쓰면 거짓말이 된다.',
    universeNote: '코스피·코스닥 전 종목 (ETF·ETN·거래정지 제외)',
    lowLiquidity: 1e8,   // 1억원. 실측 중앙값 8,800만원이라 절반 가까이 걸린다
    benchmark: { symbol: '^KS11', source: 'yahoo', label: '코스피' },
  },
  crypto: {
    id: 'crypto', label: '암호화폐', short: '크립토', currency: 'USD', tiers: CRYPTO_TIERS,
    ruleValidated: false,
    ruleNote:
      '손절 -3%가 일중 변동폭 중앙값보다 작다 (BTC 3.24% · SOL 5.74%). ' +
      '아무 날에 사도 절반 이상 당일 손절이라 이 규칙으로는 잴 수 없다. ' +
      'ATR 비례 규칙으로 따로 재야 한다.',
    universeNote: '바이낸스 USDT 현물 + 업비트 KRW 마켓 (레버리지·스테이블 제외)',
    lowLiquidity: 1e5,   // $100k
    // 크립토는 BTC가 곧 국면이다. 알트는 BTC가 빠지면 같이 빠진다
    benchmark: { symbol: 'BTCUSDT', source: 'binance', label: 'BTC' },
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
