// 트레이딩뷰 차트 연결.
//
// 레이아웃 ID를 저장해두면 본인이 쓰던 차트(지표·그림 그대로)로 열린다.
// 저장 안 하면 트레이딩뷰 기본 차트로 열린다.
// ID는 차트 URL에서 얻는다: tradingview.com/chart/<여기>/?symbol=...

const KEY = 'tv-layout-id'

export function getLayoutId(): string {
  if (typeof window === 'undefined') return ''
  try { return localStorage.getItem(KEY) ?? '' } catch { return '' }
}

export function setLayoutId(id: string): void {
  if (typeof window === 'undefined') return
  try {
    const clean = extractLayoutId(id)
    if (clean) localStorage.setItem(KEY, clean)
    else localStorage.removeItem(KEY)
  } catch { /* 사파리 프라이빗 모드 등 */ }
}

/** URL을 통째로 붙여넣어도 ID만 뽑아낸다 */
export function extractLayoutId(input: string): string {
  const s = input.trim()
  if (!s) return ''
  const m = s.match(/tradingview\.com\/chart\/([A-Za-z0-9]+)/)
  if (m) return m[1]
  return /^[A-Za-z0-9]{6,20}$/.test(s) ? s : ''
}

/**
 * 야후 티커를 트레이딩뷰 심볼로 변환.
 * 지수(^VIX)·선물(ES=F)·환율(KRW=X)은 표기 체계가 달라 매핑이 필요하다.
 */
const SYMBOL_MAP: Record<string, string> = {
  '^VIX': 'CBOE:VIX',
  '^NDX': 'NASDAQ:NDX',
  '^GSPC': 'SP:SPX',
  '^KS11': 'KRX:KOSPI',
  '^KQ11': 'KRX:KOSDAQ',
  '^TNX': 'TVC:TNX',
  'DX-Y.NYB': 'TVC:DXY',
  'KRW=X': 'FX_IDC:USDKRW',
  'ES=F': 'CME_MINI:ES1!',
  'NQ=F': 'CME_MINI:NQ1!',
  'YM=F': 'CBOT_MINI:YM1!',
  'RTY=F': 'CME_MINI:RTY1!',
  'CL=F': 'NYMEX:CL1!',
  'GC=F': 'COMEX:GC1!',
  'SI=F': 'COMEX:SI1!',
  'BTC=F': 'CME:BTC1!',
  'ETH=F': 'CME:ETH1!',
}

export function toTvSymbol(symbol: string): string {
  if (SYMBOL_MAP[symbol]) return SYMBOL_MAP[symbol]
  // 미국 보통주·ETF는 거래소 접두어 없이도 트레이딩뷰가 해석한다
  return symbol.replace(/\..*$/, '')
}

/** 종목 차트 URL. layoutId가 있으면 본인 차트로 연다 */
export function tvUrl(symbol: string, layoutId?: string): string {
  const sym = encodeURIComponent(toTvSymbol(symbol))
  const id = layoutId ?? getLayoutId()
  return id
    ? `https://www.tradingview.com/chart/${id}/?symbol=${sym}`
    : `https://www.tradingview.com/chart/?symbol=${sym}`
}
