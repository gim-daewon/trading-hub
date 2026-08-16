import type { Asset, SectorId } from './types'

// ── 섹터 메타 ───────────────────────────────────────────────────────────
export interface SectorMeta {
  id: SectorId
  label: string
  etf: string   // SPDR ETF ticker
  color: string // tailwind bg class for heatmap
}

export const SECTORS: SectorMeta[] = [
  // ── 에너지 ───────────────────────────────────────────────────────────
  { id: 'energy',        label: '에너지 전통',      etf: 'XLE',  color: '#f97316' },
  { id: 'cleanenergy',   label: '신재생에너지',     etf: 'ICLN', color: '#16a34a' },
  { id: 'nuclear',       label: '원자력',           etf: 'URNM', color: '#fbbf24' },
  // ── 소재·자원 ────────────────────────────────────────────────────────
  { id: 'materials',     label: '소재 일반',        etf: 'XLB',  color: '#78716c' },
  { id: 'rareearth',     label: '희토류',           etf: 'REMX', color: '#84cc16' },
  // ── 산업·운송 ────────────────────────────────────────────────────────
  { id: 'industrial',    label: '산업재',           etf: 'XLI',  color: '#64748b' },
  { id: 'defense',       label: '자본재/방산',      etf: 'ITA',  color: '#475569' },
  { id: 'transport',     label: '운송',             etf: 'IYT',  color: '#0891b2' },
  { id: 'automotive',    label: '자동차 & EV',      etf: 'DRIV', color: '#14b8a6' },
  // ── 소비재 ───────────────────────────────────────────────────────────
  { id: 'consumer',      label: '경기소비재',       etf: 'XLY',  color: '#f59e0b' },
  { id: 'leisure',       label: '소비자서비스/레저', etf: 'PEJ',  color: '#fb923c' },
  { id: 'ecommerce',     label: '이커머스/유통',    etf: 'IBUY', color: '#7c3aed' },
  { id: 'staples',       label: '필수소비',         etf: 'XLP',  color: '#65a30d' },
  { id: 'food',          label: '식품·음료·담배',   etf: 'PBJ',  color: '#86efac' },
  // ── 헬스케어 ─────────────────────────────────────────────────────────
  { id: 'health_device', label: '헬스케어 장비',    etf: 'IHI',  color: '#06b6d4' },
  { id: 'biotech',       label: '제약·바이오',      etf: 'XBI',  color: '#d946ef' },
  // ── 금융 ─────────────────────────────────────────────────────────────
  { id: 'banks',         label: '은행',             etf: 'KBE',  color: '#065f46' },
  { id: 'fintech',       label: '핀테크/금융서비스', etf: 'FINX', color: '#0d9488' },
  { id: 'insurance',     label: '보험',             etf: 'KIE',  color: '#155e75' },
  // ── 테크 ─────────────────────────────────────────────────────────────
  { id: 'fabless',       label: '반도체 팹리스/설계', etf: 'SMHX', color: '#4f46e5' },
  { id: 'semiconductor', label: '반도체 장비/제조', etf: 'SMH',  color: '#8b5cf6' },
  { id: 'cloud',         label: 'SW 인프라/클라우드', etf: 'WCLD', color: '#818cf8' },
  { id: 'software',      label: 'SW 앱/SaaS',       etf: 'IGV',  color: '#a78bfa' },
  { id: 'cybersecurity', label: '사이버보안',        etf: 'HACK', color: '#dc2626' },
  // ── 커뮤니케이션 ─────────────────────────────────────────────────────
  { id: 'communication', label: '인터랙티브 미디어', etf: 'XLC',  color: '#3b82f6' },
  { id: 'telecom',       label: '통신 서비스/텔코', etf: 'IYZ',  color: '#0284c7' },
  { id: 'media',         label: '전통 미디어·엔터', etf: 'PBS',  color: '#7dd3fc' },
  // ── 유틸리티·부동산 ──────────────────────────────────────────────────
  { id: 'utilities',     label: '유틸리티 일반',    etf: 'XLU',  color: '#94a3b8' },
  { id: 'dc_utilities',  label: '데이터센터 전력',  etf: 'UTES', color: '#334155' },
  { id: 'realestate',    label: '부동산·리츠',      etf: 'XLRE', color: '#ec4899' },
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

  // ── 섹터 ETF ── (SECTORS와 1:1 대응, 여기 추가 = 워치리스트+헤맵 자동 반영)
  // 에너지
  { id: 'XLE',  label: '에너지 전통',       type: 'etf', source: 'finnhub', sector: 'energy' },
  { id: 'ICLN', label: '신재생에너지',      type: 'etf', source: 'finnhub', sector: 'cleanenergy' },
  { id: 'URNM', label: '원자력',            type: 'etf', source: 'finnhub', sector: 'nuclear' },
  // 소재·자원
  { id: 'XLB',  label: '소재 일반',         type: 'etf', source: 'finnhub', sector: 'materials' },
  { id: 'REMX', label: '희토류',            type: 'etf', source: 'finnhub', sector: 'rareearth' },
  // 산업·운송
  { id: 'XLI',  label: '산업재',            type: 'etf', source: 'finnhub', sector: 'industrial' },
  { id: 'ITA',  label: '자본재/방산',       type: 'etf', source: 'finnhub', sector: 'defense' },
  { id: 'IYT',  label: '운송',              type: 'etf', source: 'finnhub', sector: 'transport' },
  { id: 'DRIV', label: '자동차 & EV',       type: 'etf', source: 'finnhub', sector: 'automotive' },
  // 소비재
  { id: 'XLY',  label: '경기소비재',        type: 'etf', source: 'finnhub', sector: 'consumer' },
  { id: 'PEJ',  label: '소비자서비스/레저', type: 'etf', source: 'finnhub', sector: 'leisure' },
  { id: 'IBUY', label: '이커머스/유통',     type: 'etf', source: 'finnhub', sector: 'ecommerce' },
  { id: 'XLP',  label: '필수소비',          type: 'etf', source: 'finnhub', sector: 'staples' },
  { id: 'PBJ',  label: '식품·음료·담배',    type: 'etf', source: 'finnhub', sector: 'food' },
  // 헬스케어
  { id: 'IHI',  label: '헬스케어 장비',     type: 'etf', source: 'finnhub', sector: 'health_device' },
  { id: 'XBI',  label: '제약·바이오',       type: 'etf', source: 'finnhub', sector: 'biotech' },
  // 금융
  { id: 'KBE',  label: '은행',              type: 'etf', source: 'finnhub', sector: 'banks' },
  { id: 'FINX', label: '핀테크/금융서비스', type: 'etf', source: 'finnhub', sector: 'fintech' },
  { id: 'KIE',  label: '보험',              type: 'etf', source: 'finnhub', sector: 'insurance' },
  // 테크
  { id: 'SMHX', label: '반도체 팹리스',     type: 'etf', source: 'finnhub', sector: 'fabless' },
  { id: 'SMH',  label: '반도체 장비/제조',  type: 'etf', source: 'finnhub', sector: 'semiconductor' },
  { id: 'WCLD', label: 'SW 인프라/클라우드', type: 'etf', source: 'finnhub', sector: 'cloud' },
  { id: 'IGV',  label: 'SW 앱/SaaS',        type: 'etf', source: 'finnhub', sector: 'software' },
  { id: 'HACK', label: '사이버보안',         type: 'etf', source: 'finnhub', sector: 'cybersecurity' },
  // 커뮤니케이션
  { id: 'XLC',  label: '인터랙티브 미디어', type: 'etf', source: 'finnhub', sector: 'communication' },
  { id: 'IYZ',  label: '통신 서비스/텔코',  type: 'etf', source: 'finnhub', sector: 'telecom' },
  { id: 'PBS',  label: '전통 미디어·엔터',  type: 'etf', source: 'finnhub', sector: 'media' },
  // 유틸리티·부동산
  { id: 'XLU',  label: '유틸리티 일반',     type: 'etf', source: 'finnhub', sector: 'utilities' },
  { id: 'UTES', label: '데이터센터 전력',   type: 'etf', source: 'finnhub', sector: 'dc_utilities' },
  { id: 'XLRE', label: '부동산·리츠',       type: 'etf', source: 'finnhub', sector: 'realestate' },

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
