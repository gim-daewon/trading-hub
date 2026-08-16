// 자산 유형별 가격 포맷 — 여기에 symbol 추가하면 전체 적용
const FIXED2 = new Set([
  'CL=F', 'SI=F', '^VIX', 'DX=F', 'DX-Y.NYB',
  '^TNX', '^TYX', '^FVX', '^IRX',
  'DGS2',  // FRED 2Y (가상 symbol)
])

const INT = new Set([
  'ES=F', 'YM=F', 'RTY=F', 'NQ=F',
  '^NDX', '^GSPC', '^KS11', '^KQ11',
  'GC=F', 'BTC-USD', 'ETH-USD', 'KRW=X',
  'FGI',  // 공탐지수 (가상)
])

export function fmtAssetPrice(symbol: string, price: number): string {
  if (FIXED2.has(symbol)) return price.toFixed(2)
  if (INT.has(symbol)) return price.toLocaleString('en-US', { maximumFractionDigits: 0 })
  return price.toLocaleString('en-US', { maximumFractionDigits: 2 })
}
