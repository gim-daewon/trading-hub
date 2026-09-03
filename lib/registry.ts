import type { Asset, SectorId } from './types'

// ── 섹터 메타 ───────────────────────────────────────────────────────────
export interface SectorMeta {
  id: SectorId
  label: string
  etf: string   // SPDR ETF ticker
  color: string // tailwind bg class for heatmap
}

// 라벨은 ETF의 실제 보유종목과 일치해야 한다.
// 2026-09-04에 33개 전부를 Yahoo topHoldings로 대조해 11개를 고쳤다.
// 새 ETF를 넣을 때는 이름만 보지 말고 상위 10종목을 반드시 확인할 것 —
// "Next Gen Media"를 '전통 미디어'로, 우라늄 채굴기업을 '원자력'으로 부르고 있었다.
export const SECTORS: SectorMeta[] = [
  // ── 광의 섹터 (GICS 대분류) ──────────────────────────────────────────
  { id: 'tech',          label: '테크',      etf: 'XLK',  color: '#6366f1' },
  { id: 'financial',     label: '금융',      etf: 'XLF',  color: '#059669' },
  { id: 'healthcare',    label: '헬스케어',  etf: 'XLV',  color: '#0ea5e9' },
  // ── 에너지 ───────────────────────────────────────────────────────────
  { id: 'energy',        label: '에너지',    etf: 'XLE',  color: '#f97316' },
  { id: 'cleanenergy',   label: '신재생(글로벌)', etf: 'ICLN', color: '#16a34a' },
  // URNM = Sprott Uranium Miners. 카메코·물리적우라늄·NexGen이고 발전사는 없다
  { id: 'nuclear',       label: '우라늄 채굴', etf: 'URNM', color: '#fbbf24' },
  // URA는 채굴에 더해 OKLO(SMR) 5.5%, LEU(농축) 3.5%를 담아 URNM과 성격이 다르다
  { id: 'nuclear_power', label: '원자력(SMR·농축)', etf: 'URA', color: '#eab308' },
  // GRID는 슈나이더·ABB·E.ON 등 유럽 비중이 40%대다. 미국 전력망 펀드가 아니다
  { id: 'grid',          label: '전력망·전력장비(글로벌)', etf: 'GRID', color: '#a16207' },
  // ── 소재·자원 ────────────────────────────────────────────────────────
  { id: 'materials',     label: '소재',      etf: 'XLB',  color: '#78716c' },
  // REMX 상위에 리튬(ALB·SQM·필바라)이 크다. 희토류만이 아니다
  { id: 'rareearth',     label: '희토류·전략금속', etf: 'REMX', color: '#84cc16' },
  // XME 최대 비중이 LEU(우라늄 농축) 5.1%다. 철강·금은·우라늄이 섞인 혼합 펀드다
  { id: 'metals',        label: '금속·채굴(철강·금은)', etf: 'XME', color: '#a8a29e' },
  // GDX는 캐나다 상장(AEM·ABX·WPM·FNV)이 30% 넘는다
  { id: 'goldminer',     label: '금광',      etf: 'GDX',  color: '#ca8a04' },
  // ── 산업·운송 ────────────────────────────────────────────────────────
  { id: 'industrial',    label: '산업재',    etf: 'XLI',  color: '#64748b' },
  // ITA = U.S. Aerospace & Defense. GE(항공엔진)가 22%로 최대 비중이다
  { id: 'defense',       label: '항공우주·방산', etf: 'ITA',  color: '#475569' },
  // UFO는 위성 사업자·지상장비까지 포함하는 '우주경제'다. ITA와 겹치지 않는다
  { id: 'space',         label: '위성·우주', etf: 'UFO',  color: '#1e293b' },
  { id: 'transport',     label: '운송',      etf: 'IYT',  color: '#0891b2' },
  { id: 'airlines',      label: '항공사',    etf: 'JETS', color: '#0e7490' },
  // PAVE는 철도(CSX·UNP·NSC)가 10% 넘어 IYT 운송과 일부 겹친다
  { id: 'infrastructure', label: '미국 인프라', etf: 'PAVE', color: '#57534e' },
  // BOTZ는 키엔스 10.6%·ABB 9.3%·화낙 9.1%로 일본·유럽이 중심이다
  { id: 'robotics',      label: '로보틱스(일본·유럽)', etf: 'BOTZ', color: '#7c2d12' },
  // DRIV는 테크 37% > 소비재 28%다. 완성차 펀드가 아니라 자율주행 테마다
  { id: 'automotive',    label: '자율주행·EV', etf: 'DRIV', color: '#14b8a6' },
  // ── 소비재 ───────────────────────────────────────────────────────────
  { id: 'consumer',      label: '경기소비재', etf: 'XLY',  color: '#f59e0b' },
  { id: 'leisure',       label: '레저·여행', etf: 'PEJ',  color: '#fb923c' },
  { id: 'ecommerce',     label: '이커머스',  etf: 'IBUY', color: '#7c3aed' },
  { id: 'staples',       label: '필수소비',  etf: 'XLP',  color: '#65a30d' },
  { id: 'food',          label: '식품·음료', etf: 'PBJ',  color: '#86efac' },
  // ── 헬스케어 ─────────────────────────────────────────────────────────
  { id: 'health_device', label: '의료기기',  etf: 'IHI',  color: '#06b6d4' },
  { id: 'biotech',       label: '바이오',    etf: 'XBI',  color: '#d946ef' },
  // ── 테마 ─────────────────────────────────────────────────────────────
  // QTUM 최대 비중이 ARQQ 1.6%다. 순수 양자기업 비중은 낮고 대부분 일반 테크다
  { id: 'quantum',       label: '양자·차세대컴퓨팅', etf: 'QTUM', color: '#e879f9' },
  { id: 'bitcoin_etf',   label: '비트코인ETF', etf: 'IBIT', color: '#f7931a' },
  // CLOU에는 네오클라우드가 하나도 없었다(SNOW·DDOG·NET = SaaS).
  // 실제 네오클라우드(IREN·CIFR·HUT)는 채굴기업의 AI 데이터센터 전환 쪽에 있다
  { id: 'neo_cloud',     label: '채굴·AI데이터센터', etf: 'WGMI', color: '#6d28d9' },
  // ── 금융 ─────────────────────────────────────────────────────────────
  { id: 'banks',         label: '은행',      etf: 'KBE',  color: '#065f46' },
  // KRE 급락은 신용 스트레스 신호다. SVB(2023-03) 때 SPY +2.2%인데 KRE -27.2%였다.
  // 반대로 2022 금리 약세장에선 KRE가 SPY를 +5.9%p 이겼다 — 금리와 신용을 구분해준다
  { id: 'regional_banks', label: '지역은행',  etf: 'KRE',  color: '#047857' },
  { id: 'fintech',       label: '핀테크',    etf: 'FINX', color: '#0d9488' },
  { id: 'insurance',     label: '보험',      etf: 'KIE',  color: '#155e75' },
  // ── 테크 ─────────────────────────────────────────────────────────────
  // AIQ 최대 비중이 SK하이닉스 6.3%, 삼성전자 4.8%로 한국이 11%다
  { id: 'ai',            label: 'AI(하이닉스·삼성 포함)', etf: 'AIQ', color: '#312e81' },
  { id: 'fabless',       label: '팹리스',    etf: 'SMHX', color: '#4f46e5' },
  // SMH 최대 비중이 NVDA 20.8%다. 장비 전용이 아니라 반도체 종합이다
  { id: 'semiconductor', label: '반도체 종합', etf: 'SMH',  color: '#8b5cf6' },
  { id: 'cloud',         label: '클라우드SW(동일가중)', etf: 'WCLD', color: '#818cf8' },
  { id: 'software',      label: '소프트웨어 대형', etf: 'IGV',  color: '#a78bfa' },
  { id: 'cybersecurity', label: '사이버보안',etf: 'HACK', color: '#dc2626' },
  // ── 커뮤니케이션 ─────────────────────────────────────────────────────
  // XLC에는 T·VZ·TMUS가 14% 들어 있다. '플랫폼'이 아니라 GICS 커뮤니케이션이다
  { id: 'communication', label: '커뮤니케이션', etf: 'XLC',  color: '#3b82f6' },
  // IYZ는 CSCO 23% + ANET 12%로 테크가 52%다. 통신서비스가 아니라 통신장비다
  { id: 'telecom',       label: '통신장비',  etf: 'IYZ',  color: '#0284c7' },
  // PBS = Invesco Next Gen Media and Gaming. META·NFLX·SPOT이고 '전통'이 아니다
  { id: 'media',         label: '미디어·게이밍', etf: 'PBS',  color: '#7dd3fc' },
  // ── 유틸리티·부동산 ──────────────────────────────────────────────────
  { id: 'utilities',     label: '유틸리티',  etf: 'XLU',  color: '#94a3b8' },
  // UTES는 CEG·TLN·VST가 32%로 DC 노출이 가장 큰 유틸 ETF이긴 하나
  // 나머지 2/3는 일반 규제 유틸리티다. 'DC전력'은 과장이었다
  { id: 'dc_utilities',  label: '전력(액티브)', etf: 'UTES', color: '#334155' },
  { id: 'realestate',    label: '리츠',      etf: 'XLRE', color: '#ec4899' },
  // ITB는 DHI 16.4% + PHM 10.5%로 상위 편중이 크다. 금리 민감도가 가장 높은 섹터다
  { id: 'homebuilder',   label: '주택건설',  etf: 'ITB',  color: '#be185d' },
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
  // 라벨은 실제 보유종목 기준이다. 아래 주석의 종목이 그 근거다
  // 광의 섹터
  { id: 'XLK',  label: '테크 (NVDA·AAPL·MSFT)', type: 'etf', source: 'finnhub', sector: 'tech' },
  { id: 'XLF',  label: '금융 (JPM·BRK·V)',   type: 'etf', source: 'finnhub', sector: 'financial' },
  { id: 'XLV',  label: '헬스케어 (LLY·JNJ)', type: 'etf', source: 'finnhub', sector: 'healthcare' },
  // 에너지
  { id: 'XLE',  label: '에너지 (XOM·CVX)',   type: 'etf', source: 'finnhub', sector: 'energy' },
  { id: 'ICLN', label: '신재생 글로벌',      type: 'etf', source: 'finnhub', sector: 'cleanenergy' },
  { id: 'URNM', label: '우라늄 채굴 (카메코)', type: 'etf', source: 'finnhub', sector: 'nuclear' },
  // 소재·자원
  { id: 'XLB',  label: '소재 일반',         type: 'etf', source: 'finnhub', sector: 'materials' },
  { id: 'REMX', label: '희토류·리튬',       type: 'etf', source: 'finnhub', sector: 'rareearth' },
  // 산업·운송
  { id: 'XLI',  label: '산업재',            type: 'etf', source: 'finnhub', sector: 'industrial' },
  { id: 'ITA',  label: '항공우주·방산 (GE·RTX)', type: 'etf', source: 'finnhub', sector: 'defense' },
  { id: 'UFO',  label: '위성·우주 (ASTS·RKLB)', type: 'etf', source: 'finnhub', sector: 'space' },
  { id: 'IYT',  label: '운송',              type: 'etf', source: 'finnhub', sector: 'transport' },
  { id: 'DRIV', label: '자율주행·EV',       type: 'etf', source: 'finnhub', sector: 'automotive' },
  // 소비재
  { id: 'XLY',  label: '경기소비재',        type: 'etf', source: 'finnhub', sector: 'consumer' },
  { id: 'PEJ',  label: '레저·여행',         type: 'etf', source: 'finnhub', sector: 'leisure' },
  { id: 'IBUY', label: '이커머스/유통',     type: 'etf', source: 'finnhub', sector: 'ecommerce' },
  { id: 'XLP',  label: '필수소비',          type: 'etf', source: 'finnhub', sector: 'staples' },
  { id: 'PBJ',  label: '식품·음료',         type: 'etf', source: 'finnhub', sector: 'food' },
  // 헬스케어
  { id: 'IHI',  label: '의료기기',          type: 'etf', source: 'finnhub', sector: 'health_device' },
  { id: 'XBI',  label: '바이오 (동일가중)', type: 'etf', source: 'finnhub', sector: 'biotech' },
  { id: 'QTUM', label: '양자·차세대컴퓨팅', type: 'etf', source: 'finnhub', sector: 'quantum' },
  { id: 'IBIT', label: '비트코인 현물 ETF', type: 'etf', source: 'finnhub', sector: 'bitcoin_etf' },
  { id: 'WGMI', label: '채굴·AI데이터센터 (IREN·CIFR)', type: 'etf', source: 'finnhub', sector: 'neo_cloud' },
  // 금융
  { id: 'KBE',  label: '은행 (동일가중)',   type: 'etf', source: 'finnhub', sector: 'banks' },
  { id: 'FINX', label: '핀테크/금융서비스', type: 'etf', source: 'finnhub', sector: 'fintech' },
  { id: 'KIE',  label: '보험',              type: 'etf', source: 'finnhub', sector: 'insurance' },
  // 테크
  { id: 'SMHX', label: '반도체 팹리스',     type: 'etf', source: 'finnhub', sector: 'fabless' },
  { id: 'SMH',  label: '반도체 종합 (NVDA·TSM)', type: 'etf', source: 'finnhub', sector: 'semiconductor' },
  { id: 'WCLD', label: '클라우드SW 동일가중', type: 'etf', source: 'finnhub', sector: 'cloud' },
  { id: 'IGV',  label: '소프트웨어 대형 (MSFT·PANW)', type: 'etf', source: 'finnhub', sector: 'software' },
  { id: 'HACK', label: '사이버보안',         type: 'etf', source: 'finnhub', sector: 'cybersecurity' },
  // 커뮤니케이션
  { id: 'XLC',  label: '커뮤니케이션 (META·GOOGL)', type: 'etf', source: 'finnhub', sector: 'communication' },
  { id: 'IYZ',  label: '통신장비 (CSCO·ANET)', type: 'etf', source: 'finnhub', sector: 'telecom' },
  { id: 'PBS',  label: '미디어·게이밍',     type: 'etf', source: 'finnhub', sector: 'media' },
  // 유틸리티·부동산
  { id: 'XLU',  label: '유틸리티 일반',     type: 'etf', source: 'finnhub', sector: 'utilities' },
  { id: 'UTES', label: '전력 액티브 (CEG·VST)', type: 'etf', source: 'finnhub', sector: 'dc_utilities' },
  { id: 'XLRE', label: '부동산·리츠',       type: 'etf', source: 'finnhub', sector: 'realestate' },
  { id: 'ITB',  label: '주택건설 (DHI·PHM)', type: 'etf', source: 'finnhub', sector: 'homebuilder' },
  // 전력·원자력
  { id: 'URA',  label: '원자력 SMR·농축 (OKLO·LEU)', type: 'etf', source: 'finnhub', sector: 'nuclear_power' },
  { id: 'GRID', label: '전력망 글로벌 (슈나이더·ABB)', type: 'etf', source: 'finnhub', sector: 'grid' },
  // 자원
  { id: 'XME',  label: '금속·채굴 (LEU·NUE·NEM)', type: 'etf', source: 'finnhub', sector: 'metals' },
  { id: 'GDX',  label: '금광 (NEM·AEM·ABX)', type: 'etf', source: 'finnhub', sector: 'goldminer' },
  // 산업 추가
  { id: 'JETS', label: '항공사 (UAL·AAL·DAL)', type: 'etf', source: 'finnhub', sector: 'airlines' },
  { id: 'PAVE', label: '미국 인프라 (PWR·CSX)', type: 'etf', source: 'finnhub', sector: 'infrastructure' },
  { id: 'BOTZ', label: '로보틱스 (키엔스·ABB·화낙)', type: 'etf', source: 'finnhub', sector: 'robotics' },
  // 금융 추가
  { id: 'KRE',  label: '지역은행 (신용스트레스)', type: 'etf', source: 'finnhub', sector: 'regional_banks' },
  // 테크 추가
  { id: 'AIQ',  label: 'AI (하이닉스·삼성 11%)', type: 'etf', source: 'finnhub', sector: 'ai' },

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
  soon?: boolean  // 아직 구현 안 된 스텁 페이지
}

export const NAV_SECTIONS: NavSection[] = [
  { id: 'home',     label: '홈',           href: '/',         icon: '⌂' },
  { id: 'picks',    label: '눌림목',       href: '/picks',    icon: '⭐' },
  { id: 'sectors',  label: '섹터',         href: '/sectors',  icon: '🔥' },
  { id: 'screener', label: '수급',         href: '/screener', icon: '💧' },
  { id: 'tracking', label: '성과추적',     href: '/tracking', icon: '📊' },
  { id: 'market',   label: '시장',         href: '/market',   icon: '📈' },
  { id: 'earnings', label: '실적',         href: '/earnings', icon: '📅' },
  { id: 'calendar', label: '캘린더',       href: '/calendar', icon: '📆' },
  { id: 'journal',  label: '매매일지',     href: '/journal',  icon: '📒', soon: true },
  { id: 'credit',   label: 'AI크레딧',     href: '/credit',   icon: '⚠',  soon: true },
  { id: 'desk',     label: '데스크',       href: '/desk',     icon: '💼', soon: true },
]

// 모바일 하단 네비 = primary 4개 + 더보기. 나머지는 더보기 시트로.
export const PRIMARY_NAV = NAV_SECTIONS.slice(0, 4)
export const SECONDARY_NAV = NAV_SECTIONS.slice(4)

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
