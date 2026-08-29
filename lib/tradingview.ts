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
  'HG=F': 'COMEX:HG1!',
  'NG=F': 'NYMEX:NG1!',
  'BTC=F': 'CME:BTC1!',
  'ETH=F': 'CME:ETH1!',
  // 글로벌 지수 (market 페이지)
  '^N225': 'TVC:NI225',
  '^HSI': 'TVC:HSI',
  '^STOXX50E': 'TVC:SX5E',
  '^DJI': 'TVC:DJI',
  '^RUT': 'TVC:RUT',
  // 변동성 파생
  '^VVIX': 'CBOE:VVIX',
  '^SKEW': 'CBOE:SKEW',
  // 환율
  'JPY=X': 'FX_IDC:USDJPY',
  'EURUSD=X': 'FX:EURUSD',
  'CNY=X': 'FX_IDC:USDCNY',
}

/** 매핑되지 않았고 야후 전용 표기(^ 또는 =)면 트레이딩뷰가 못 읽는다 */
export function isMappable(symbol: string): boolean {
  return !!SYMBOL_MAP[symbol] || !/[\^=]/.test(symbol)
}

export function toTvSymbol(symbol: string): string {
  if (SYMBOL_MAP[symbol]) return SYMBOL_MAP[symbol]
  // 미국 보통주·ETF는 거래소 접두어 없이도 트레이딩뷰가 해석한다.
  // BRK.B 같은 클래스 표기는 하이픈이 트레이딩뷰 규칙이다.
  if (!/[\^=]/.test(symbol)) return symbol.replace(/\./g, '.')
  // 미매핑 야후 표기는 최선의 추정만 한다 (^ 제거)
  return symbol.replace(/^\^/, '').replace(/=.*$/, '')
}

/** 종목 차트 URL. layoutId가 있으면 본인 차트로 연다 */
export function tvUrl(symbol: string, layoutId?: string): string {
  const sym = encodeURIComponent(toTvSymbol(symbol))
  const id = layoutId ?? getLayoutId()
  return id
    ? `https://www.tradingview.com/chart/${id}/?symbol=${sym}`
    : `https://www.tradingview.com/chart/?symbol=${sym}`
}

// ── 앱으로 열기 ────────────────────────────────────────────────────────
// tradingview:// 커스텀 스킴은 공식 문서에 없어서 쓰지 않는다. 확실한 두 경로만 쓴다.
//   Android — intent:// + S.browser_fallback_url. 앱이 없으면 브라우저로 자동 폴백된다
//   iOS     — 평범한 https 링크. 단 target="_blank"면 Universal Link가 안 걸리므로 빼야 한다
const APP_KEY = 'tv-open-in-app'
const MODE_KEY = 'tv-link-mode'
const ANDROID_PACKAGE = 'com.tradingview.tradingviewapp'

// 안드로이드 앱은 차트를 Android System WebView로 렌더한다. 그래서 /chart/ 링크는
// 앱 안에서 웹 차트를 통째로 불러오느라 느리다. /symbols/ 는 종목 개요 페이지라
// 더 가볍다. 어느 쪽이 빠른지는 기기·네트워크마다 달라 사용자가 고르게 한다.
export type LinkMode = 'chart' | 'symbol'

export function getLinkMode(): LinkMode {
  if (typeof window === 'undefined') return 'chart'
  try { return localStorage.getItem(MODE_KEY) === 'symbol' ? 'symbol' : 'chart' } catch { return 'chart' }
}

export function setLinkMode(m: LinkMode): void {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(MODE_KEY, m) } catch { /* 프라이빗 모드 */ }
}

/** 종목 개요 페이지. 차트보다 가볍다 (거래소:티커 -> 거래소-티커) */
export function tvSymbolUrl(symbol: string): string {
  return `https://www.tradingview.com/symbols/${encodeURIComponent(toTvSymbol(symbol).replace(':', '-'))}/`
}

export function getOpenInApp(): boolean {
  if (typeof window === 'undefined') return true
  try { return localStorage.getItem(APP_KEY) !== '0' } catch { return true }
}

export function setOpenInApp(on: boolean): void {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(APP_KEY, on ? '1' : '0') } catch { /* 프라이빗 모드 */ }
}

export type Platform = 'android' | 'ios' | 'other'

export function platform(): Platform {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent
  if (/Android/i.test(ua)) return 'android'
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  return 'other'
}

/**
 * 앵커에 넣을 href/target을 만든다.
 * target을 비워야 하는 경우가 있어(iOS Universal Link) 둘을 같이 반환한다.
 */
export function tvAnchor(symbol: string, layoutId?: string, openInApp = true, mode?: LinkMode):
  { href: string; target?: string } {
  // 심볼 개요 모드에서는 레이아웃 ID가 의미 없다 (저장 차트를 안 연다)
  const web = (mode ?? getLinkMode()) === 'symbol' ? tvSymbolUrl(symbol) : tvUrl(symbol, layoutId)
  if (!openInApp) return { href: web, target: '_blank' }

  switch (platform()) {
    case 'android':
      return {
        href: `intent://${web.replace(/^https:\/\//, '')}` +
              `#Intent;scheme=https;package=${ANDROID_PACKAGE};` +
              `S.browser_fallback_url=${encodeURIComponent(web)};end`,
      }
    case 'ios':
      // target="_blank"를 붙이면 새 탭이 열리며 앱 전환이 막힌다
      return { href: web }
    default:
      return { href: web, target: '_blank' }
  }
}
