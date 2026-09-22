// 자산 유형별 가격 포맷 — 여기에 symbol 추가하면 전체 적용
const FIXED2 = new Set([
  'CL=F', 'SI=F', '^VIX', 'DX=F', 'DX-Y.NYB',
  '^TNX', '^TYX', '^FVX', '^IRX',
  'DGS2',  // FRED 2Y (가상 symbol)
])

const INT = new Set([
  'ES=F', 'YM=F', 'RTY=F', 'NQ=F',
  '^NDX', '^GSPC', '^KS11', '^KQ11',
  'GC=F', 'BTC-USD', 'ETH-USD', 'BTC=F', 'ETH=F', 'KRW=X',
  'FGI',  // 공탐지수 (가상)
])

export function fmtAssetPrice(symbol: string, price: number | null | undefined): string {
  if (price == null || isNaN(price)) return '—'
  if (FIXED2.has(symbol)) return price.toFixed(2)
  if (INT.has(symbol)) return price.toLocaleString('en-US', { maximumFractionDigits: 0 })
  return price.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

/**
 * 업종 표기 다듬기.
 *
 * 나스닥 업종은 'Biotechnology: Laboratory Analytical Instruments'처럼
 * '큰분류: 세부'로 온다(최대 62자). 화면에서는 세부 쪽이 정보가 많고,
 * 큰분류는 이미 종목 이름에서 짐작되는 경우가 많다. 그래서 콜론 뒤만 쓴다.
 * 한국 업종명('반도체와반도체장비')은 짧아 그대로 나간다.
 */
export function fmtSector(s: string | null | undefined, max = 26): string {
  if (!s) return ''
  const tail = s.includes(': ') ? s.slice(s.indexOf(': ') + 2) : s
  return tail.length > max ? tail.slice(0, max - 1) + '…' : tail
}
