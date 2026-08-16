export type AssetType = 'index' | 'etf' | 'stock' | 'macro' | 'bond'
export type DataSource = 'finnhub' | 'yahoo' | 'fred' | 'manual'
export type SectorId =
  | 'tech' | 'finance' | 'energy' | 'health' | 'materials'
  | 'industrial' | 'staples' | 'consumer' | 'utilities' | 'realestate'
  | 'communication' | 'semiconductor' | 'ai' | 'all'

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
