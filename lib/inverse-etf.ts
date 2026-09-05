// 개별종목 인버스 ETF 매핑.
//
// 숏 계좌 없이도 하락에 베팅할 수 있는 종목만 추린다.
//
// ── 검증 필수 ───────────────────────────────────────────────────────────
// 티커 이름만 보고 넣으면 안 된다. 2026-09-05 후보 53개를 조회했더니
// 이런 것들이 섞여 있었다:
//   MARZ → TrueShares Structured Outcome (March) ETF  — 인버스 아님
//   CRWS → Crown Crafts, Inc.                          — 그냥 회사
//   INTS → Intensity Therapeutics                      — 그냥 회사
//   ARMS → Aristotle Multi-Sector Income ETF           — 인버스 아님
//   PYPD → PolyPid Ltd.                                — 그냥 회사
//   CONL → GraniteShares 2x LONG COIN                  — 롱이다
//   BABX → GraniteShares 2x LONG BABA                  — 롱이다
//   HOOD → Robinhood 본주                              — 원주 자기 자신
// 아래 목록은 전부 longName에 Bear/Short/Inverse가 있고 시세가 최신인 것만 남겼다.
//
// 새로 추가할 때는 반드시 (1) longName에 Bear/Short/Inverse가 있는지
// (2) regularMarketTime이 최신인지 (3) 거래대금을 확인할 것.

export interface InverseEtf {
  /** 인버스 ETF 티커 */
  etf: string
  /** 배수. 2면 원주가 -1% 움직일 때 +2%를 목표로 한다 */
  leverage: number
  /** 20일 평균 거래대금 (백만 달러, 2026-09-05 실측) */
  dollarVolM: number
  name: string
}

/**
 * 원주 → 인버스 ETF. 원주당 가장 유동성 좋은 하나만 둔다.
 *
 * 레버리지 ETF는 일간 리밸런싱이라 여러 날 들고 있으면
 * 원주 하락률 x 배수와 어긋난다(변동성 손실). 단기 매매 전제로만 쓸 것.
 */
export const INVERSE_ETF: Record<string, InverseEtf> = {
  NVDA:  { etf: 'NVD',  leverage: 2, dollarVolM: 322.3, name: 'GraniteShares 2x Short NVDA' },
  PLTR:  { etf: 'PLTD', leverage: 1, dollarVolM: 152.4, name: 'Direxion Daily PLTR Bear 1X' },
  MSTR:  { etf: 'MSTZ', leverage: 2, dollarVolM: 138.4, name: 'T-Rex 2X Inverse MSTR' },
  TSLA:  { etf: 'TSLQ', leverage: 2, dollarVolM: 112.0, name: 'Tradr 2X Short TSLA' },
  AAPL:  { etf: 'AAPD', leverage: 1, dollarVolM:  99.0, name: 'Direxion Daily AAPL Bear 1X' },
  AVGO:  { etf: 'AVS',  leverage: 1, dollarVolM:  92.1, name: 'Direxion Daily AVGO Bear 1X' },
  AMZN:  { etf: 'AMZD', leverage: 1, dollarVolM:  80.7, name: 'Direxion Daily AMZN Bear 1X' },
  MU:    { etf: 'MUD',  leverage: 1, dollarVolM:  69.3, name: 'Direxion Daily MU Bear 1X' },
  SMCI:  { etf: 'SMCZ', leverage: 2, dollarVolM:  16.5, name: 'Defiance 2X Short SMCI' },
  MSFT:  { etf: 'MSFD', leverage: 1, dollarVolM:  14.6, name: 'Direxion Daily MSFT Bear 1X' },
  COIN:  { etf: 'CONI', leverage: 2, dollarVolM:  10.9, name: 'GraniteShares 2x Short COIN' },
  AMD:   { etf: 'AMDD', leverage: 1, dollarVolM:   9.9, name: 'Direxion Daily AMD Bear 1X' },
  META:  { etf: 'METD', leverage: 1, dollarVolM:   7.1, name: 'Direxion Daily META Bear 1X' },
  GOOGL: { etf: 'GGLS', leverage: 1, dollarVolM:   4.7, name: 'Direxion Daily GOOGL Bear 1X' },
}

export const hasInverse = (symbol: string) => symbol in INVERSE_ETF
