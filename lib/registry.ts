import type { Asset, SectorId } from './types'

// ── 섹터 메타 ───────────────────────────────────────────────────────────
export interface SectorMeta {
  id: SectorId
  label: string
  etf: string   // SPDR ETF ticker
  color: string // tailwind bg class for heatmap
}

export const SECTORS: SectorMeta[] = [
  { id: 'tech',          label: '기술',      etf: 'XLK',  color: '#6366f1' },
  { id: 'semiconductor', label: '반도체',    etf: 'SMH',  color: '#8b5cf6' },
  { id: 'ai',            label: 'AI ETF',    etf: 'XLK',  color: '#a78bfa' },
  { id: 'communication', label: '커뮤니케이션', etf: 'XLC', color: '#3b82f6' },
  { id: 'finance',       label: '금융',      etf: 'XLF',  color: '#10b981' },
  { id: 'health',        label: '헬스케어',  etf: 'XLV',  color: '#06b6d4' },
  { id: 'consumer',      label: '소비재',    etf: 'XLY',  color: '#f59e0b' },
  { id: 'staples',       label: '필수소비',  etf: 'XLP',  color: '#84cc16' },
  { id: 'industrial',    label: '산업재',    etf: 'XLI',  color: '#64748b' },
  { id: 'energy',        label: '에너지',    etf: 'XLE',  color: '#f97316' },
  { id: 'materials',     label: '소재',      etf: 'XLB',  color: '#78716c' },
  { id: 'utilities',     label: '유틸리티',  etf: 'XLU',  color: '#94a3b8' },
  { id: 'realestate',    label: '부동산',    etf: 'XLRE', color: '#ec4899' },
]

// ── 워치리스트 (여기에 한 줄 추가 = 앱 전체 자동 반영) ─────────────────
export const ASSETS: Asset[] = [
  // 미국 지수
  { id: 'SPY',   label: 'S&P 500',    type: 'etf',   source: 'finnhub' },
  { id: 'QQQ',   label: 'NASDAQ 100', type: 'etf',   source: 'finnhub' },
  { id: 'DIA',   label: 'Dow Jones',  type: 'etf',   source: 'finnhub' },
  { id: 'IWM',   label: 'Russell 2000', type: 'etf', source: 'finnhub' },

  // 한국 지수
  { id: '^KS11', label: 'KOSPI',   type: 'index', source: 'yahoo' },
  { id: '^KQ11', label: 'KOSDAQ',  type: 'index', source: 'yahoo' },

  // 섹터 ETF (SPDR 11개 + 특수)
  { id: 'XLK',  label: '기술 ETF',      type: 'etf', source: 'finnhub', sector: 'tech' },
  { id: 'SMH',  label: '반도체 ETF',    type: 'etf', source: 'finnhub', sector: 'semiconductor' },
  { id: 'XLC',  label: '커뮤니케이션',  type: 'etf', source: 'finnhub', sector: 'communication' },
  { id: 'XLF',  label: '금융 ETF',      type: 'etf', source: 'finnhub', sector: 'finance' },
  { id: 'XLV',  label: '헬스케어 ETF',  type: 'etf', source: 'finnhub', sector: 'health' },
  { id: 'XLY',  label: '소비재 ETF',    type: 'etf', source: 'finnhub', sector: 'consumer' },
  { id: 'XLP',  label: '필수소비 ETF',  type: 'etf', source: 'finnhub', sector: 'staples' },
  { id: 'XLI',  label: '산업재 ETF',    type: 'etf', source: 'finnhub', sector: 'industrial' },
  { id: 'XLE',  label: '에너지 ETF',    type: 'etf', source: 'finnhub', sector: 'energy' },
  { id: 'XLB',  label: '소재 ETF',      type: 'etf', source: 'finnhub', sector: 'materials' },
  { id: 'XLU',  label: '유틸리티 ETF',  type: 'etf', source: 'finnhub', sector: 'utilities' },
  { id: 'XLRE', label: '부동산 ETF',    type: 'etf', source: 'finnhub', sector: 'realestate' },

  // 매크로
  { id: '^VIX',  label: '공포지수 VIX',    type: 'macro', source: 'yahoo' },
  { id: 'GLD',   label: '금',              type: 'etf',   source: 'finnhub' },
  { id: 'USO',   label: '유가 (WTI)',       type: 'etf',   source: 'finnhub' },
  { id: 'UUP',   label: '달러 인덱스',     type: 'etf',   source: 'finnhub' },
  { id: 'COPPER',label: '구리 (경기선행)', type: 'macro', source: 'yahoo' },

  // FRED (국채/신용)
  { id: 'DGS5',           label: '미국채 5Y',    type: 'bond', source: 'fred' },
  { id: 'DGS10',          label: '미국채 10Y',   type: 'bond', source: 'fred' },
  { id: 'T10Y2Y',         label: '장단기 금리차', type: 'bond', source: 'fred' },
  { id: 'BAMLC0A4CBBB',   label: 'BBB OAS',      type: 'bond', source: 'fred' },
  { id: 'BAMLH0A0HYM2',   label: 'HY OAS',       type: 'bond', source: 'fred' },

  // AI 크레딧 바스켓
  { id: 'NVDA', label: 'NVIDIA',    type: 'stock', source: 'finnhub', sector: 'semiconductor', earnings: true, creditMonitor: true },
  { id: 'ORCL', label: 'Oracle',    type: 'stock', source: 'finnhub', earnings: true, creditMonitor: true },
  { id: 'AVGO', label: 'Broadcom',  type: 'stock', source: 'finnhub', sector: 'semiconductor', earnings: true, creditMonitor: true },
  { id: 'MRVL', label: 'Marvell',   type: 'stock', source: 'finnhub', sector: 'semiconductor', earnings: true, creditMonitor: true },
  { id: 'CRWV', label: 'CoreWeave', type: 'stock', source: 'finnhub', creditMonitor: true },

  // 주요 빅테크
  { id: 'AAPL', label: 'Apple',     type: 'stock', source: 'finnhub', sector: 'tech', earnings: true },
  { id: 'MSFT', label: 'Microsoft', type: 'stock', source: 'finnhub', sector: 'tech', earnings: true },
  { id: 'GOOGL',label: 'Alphabet',  type: 'stock', source: 'finnhub', sector: 'tech', earnings: true },
  { id: 'META', label: 'Meta',      type: 'stock', source: 'finnhub', sector: 'communication', earnings: true },
  { id: 'AMZN', label: 'Amazon',    type: 'stock', source: 'finnhub', sector: 'consumer', earnings: true },
  { id: 'TSLA', label: 'Tesla',     type: 'stock', source: 'finnhub', sector: 'consumer', earnings: true },
]

// ── 네비게이션 (여기에 한 줄 추가 = 탭 자동 생성) ──────────────────────
export interface NavSection {
  id: string
  label: string
  href: string
  icon: string  // emoji
}

export const NAV_SECTIONS: NavSection[] = [
  { id: 'home',     label: '홈',           href: '/',         icon: '⌂' },
  { id: 'market',   label: '시장',         href: '/market',   icon: '📈' },
  { id: 'sectors',  label: '섹터',         href: '/sectors',  icon: '🔥' },
  { id: 'earnings', label: '실적',         href: '/earnings', icon: '📅' },
  { id: 'journal',  label: '매매일지',     href: '/journal',  icon: '📒' },
  { id: 'credit',   label: 'AI크레딧',     href: '/credit',   icon: '⚠' },
  { id: 'desk',     label: '데스크',       href: '/desk',     icon: '💼' },
]

// 헬퍼
export const getSectorMeta = (id: SectorId) =>
  SECTORS.find(s => s.id === id)

export const getSectorAssets = (sectorId: SectorId) =>
  ASSETS.filter(a => a.sector === sectorId)

export const getCreditAssets = () =>
  ASSETS.filter(a => a.creditMonitor)

export const getEarningsAssets = () =>
  ASSETS.filter(a => a.earnings)

export const getSectorEtfs = () =>
  SECTORS.map(s => ASSETS.find(a => a.id === s.etf)).filter(Boolean) as Asset[]
