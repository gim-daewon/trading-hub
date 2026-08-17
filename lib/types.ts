export type AssetType = 'index' | 'etf' | 'stock' | 'macro' | 'bond'
export type DataSource = 'finnhub' | 'yahoo' | 'fred' | 'manual'
export type SectorId =
  // 에너지
  | 'energy' | 'cleanenergy' | 'nuclear'
  // 소재·자원
  | 'materials' | 'rareearth'
  // 산업·운송
  | 'industrial' | 'defense' | 'transport' | 'automotive'
  // 소비재
  | 'consumer' | 'leisure' | 'ecommerce' | 'staples' | 'food'
  // 헬스케어
  | 'health_device' | 'biotech'
  // 금융
  | 'banks' | 'fintech' | 'insurance'
  // 테크
  | 'fabless' | 'semiconductor' | 'cloud' | 'software' | 'cybersecurity'
  // 커뮤니케이션
  | 'communication' | 'telecom' | 'media'
  // 유틸리티·부동산
  | 'utilities' | 'dc_utilities' | 'realestate'
  // 테마
  | 'quantum' | 'bitcoin_etf'
  // 레거시 (개별 주식 태깅용, ETF 없음)
  | 'tech' | 'health' | 'finance' | 'space' | 'ep_energy'
  | 'all'

export interface Asset {
  id: string           // ticker or FRED series id
  label: string
  type: AssetType
  source: DataSource
  sector?: SectorId
  earnings?: boolean   // include in earnings calendar
  creditMonitor?: boolean // include in AI credit risk section
}

export interface Quote {
  id: string
  price: number
  change: number       // absolute
  changePct: number    // percent
  high52w?: number
  low52w?: number
  ts: number           // unix ms
}

export interface SectorQuote extends Quote {
  sectorId: SectorId
  rs1d?: number        // relative strength vs SPY 1d
  rs1w?: number
  rs1m?: number
  rs3m?: number
  flow5d?: number      // 5-day cumulative RS (money flow proxy)
}

export interface EarningsEvent {
  symbol: string
  name?: string
  date: string         // YYYY-MM-DD
  hour: 'bmo' | 'amc' | 'dmh' | 'unknown'
  epsEstimate?: number
  epsActual?: number
  revenueEstimate?: number
  revenueActual?: number
  sector?: SectorId
}

export interface MacroEvent {
  id: string
  title: string
  date: string
  importance: 'high' | 'medium' | 'low'
  previous?: string
  forecast?: string
  actual?: string
}

export interface Trade {
  id: string
  ticker: string
  side: 'buy' | 'sell'
  price: number
  qty: number
  date: string
  type: 'earnings' | 'technical' | 'momentum' | 'news' | 'hedge' | 'other'
  reason?: string
  note?: string
  linkedTradeId?: string  // sell links back to buy
  createdAt: string
}

export interface Observation {
  id: string
  metricId: string
  value: number
  ts: string
  source: 'manual' | 'auto'
  citation?: string
  note?: string
}
