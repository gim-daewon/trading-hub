'use client'
import { useEffect, useState, useCallback } from 'react'
import PageHeader from '../components/PageHeader'
import { TvLink } from '../components/TvLink'

// 섹션 점프 바 높이만큼 스크롤 여백을 줘야 제목이 가리지 않는다
const SECTION = { marginBottom: 28, scrollMarginTop: 60 } as const

const JUMP_TARGETS = [
  { id: 'yield',      label: '수익률곡선' },
  { id: 'liquidity',  label: '유동성' },
  { id: 'inflation',  label: '인플레' },
  { id: 'employment', label: '고용' },
  { id: 'fx',         label: '환율' },
  { id: 'commodity',  label: '원자재' },
  { id: 'global',     label: '글로벌' },
  { id: 'relperf',    label: '상대성과' },
  { id: 'credit',     label: '신용' },
  { id: 'stress',     label: '스트레스' },
  { id: 'cycle',      label: '경기' },
]

function SectionJump() {
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 10,
      display: 'flex', gap: 6, overflowX: 'auto',
      margin: '0 -16px 18px', padding: '8px 16px',
      background: 'var(--bg-base)',
      borderBottom: '1px solid var(--border)',
      scrollbarWidth: 'none',
    }}>
      {JUMP_TARGETS.map(t => (
        <button
          key={t.id}
          onClick={() => document.getElementById(t.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          style={{
            flexShrink: 0, minHeight: 36, padding: '0 14px', borderRadius: 18,
            border: '1px solid var(--border)', background: 'var(--bg-card)',
            color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >{t.label}</button>
      ))}
    </div>
  )
}

// ─── Types ─────────────────────────────────────────────────────────────────

interface YieldPoint { id: string; label: string; years: number; rate: number | null }
interface CurveData  { points: YieldPoint[]; spread_2y10y: number | null; spread_3mo10y: number | null }
interface PerfPoint  { date: string; pct: number }
interface PerfLine   { symbol: string; label: string; color: string; pts: PerfPoint[] }
type PerfRange = '1mo' | '3mo' | '6mo' | '1y'

interface MStat { value: number | null; prev: number | null; date: string | null }
interface MacroData {
  inflation:  { cpi: MStat; coreCpi: MStat; corePce: MStat; bei10: MStat; bei5: MStat }
  employment: { unrate: MStat; nfp: MStat; icsa: MStat; jolts: MStat }
  liquidity:  { walcl: MStat; rrpo: MStat; tga: MStat; ffr: MStat; sofr: MStat }
  cycle:      { gdp: MStat; sahm: MStat; retail: MStat; housing: MStat }
  credit:     { hyOas: MStat; igOas: MStat; bbOas: MStat; bOas: MStat }
  risk:       { stlfsi: MStat }
}
type MQ = Record<string, { price: number | null; changePct: number | null }>

// ─── Yield Curve Chart ─────────────────────────────────────────────────────

function YieldCurveChart({ points }: { points: YieldPoint[] }) {
  const valid = points.filter((p): p is YieldPoint & { rate: number } => p.rate !== null)
  if (valid.length < 2) return (
    <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>데이터 없음</div>
  )
  const W = 560, H = 160
  // left/bottom은 확대된 축 라벨(fontSize 15)이 잘리지 않을 만큼 확보
  const PAD = { top: 22, right: 10, bottom: 28, left: 62 }
  const cW = W - PAD.left - PAD.right, cH = H - PAD.top - PAD.bottom
  const rates = valid.map(p => p.rate)
  const minR = Math.min(...rates), maxR = Math.max(...rates), rng = maxR - minR || 0.1
  const pad = rng * 0.3, yMin = minR - pad, yMax = maxR + pad, yRng = yMax - yMin
  const n = points.length
  const toX = (i: number) => PAD.left + (i / (n - 1)) * cW
  const toY = (r: number) => PAD.top  + (1 - (r - yMin) / yRng) * cH
  const r2y = points.find(p => p.id === 'DGS2')?.rate ?? null
  const r10y = points.find(p => p.id === 'DGS10')?.rate ?? null
  const inverted = r2y !== null && r10y !== null && r2y > r10y
  const lineColor = inverted ? '#ef4444' : '#22c55e'
  const segs: string[] = []; let cmd = 'M'
  points.forEach((p, i) => { if (p.rate !== null) { segs.push(`${cmd} ${toX(i).toFixed(1)},${toY(p.rate).toFixed(1)}`); cmd = 'L' } })
  const d = segs.join(' ')
  const validIdxs = points.map((p, i) => p.rate !== null ? i : -1).filter(i => i >= 0)
  const fi = validIdxs[0], li = validIdxs[validIdxs.length - 1]
  const areaD = `${d} L ${toX(li).toFixed(1)},${(PAD.top + cH).toFixed(1)} L ${toX(fi).toFixed(1)},${(PAD.top + cH).toFixed(1)} Z`
  const midY = PAD.top + cH / 2
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 160, display: 'block' }}>
      {[yMax, (yMax + yMin) / 2, yMin].map((v, i) => (
        <g key={i}>
          <line x1={PAD.left} y1={toY(v)} x2={W - PAD.right} y2={toY(v)} stroke="#1e293b" strokeWidth="1" />
          <text x={PAD.left - 6} y={toY(v) + 5} fontSize="15" fill="#64748b" textAnchor="end" fontFamily="monospace">{v.toFixed(2)}%</text>
        </g>
      ))}
      <path d={areaD} fill={lineColor} fillOpacity="0.08" />
      <path d={d} fill="none" stroke={lineColor} strokeWidth="2" strokeLinejoin="round" />
      {points.map((p, i) => {
        if (p.rate === null) return null
        const cx = toX(i), cy = toY(p.rate)
        const above = cy >= midY
        return (
          <g key={p.id}>
            <circle cx={cx} cy={cy} r="3" fill={lineColor} />
            <text x={cx} y={above ? cy - 9 : cy + 19} fontSize="14" fill={lineColor} textAnchor="middle" fontFamily="monospace" fontWeight="600">{p.rate.toFixed(2)}</text>
            <text x={cx} y={H - 5} fontSize="14" fill="#64748b" textAnchor="middle" fontFamily="monospace">{p.label}</text>
          </g>
        )
      })}
    </svg>
  )
}

function YieldRateTable({ points }: { points: YieldPoint[] }) {
  return (
    <div style={{ display: 'flex', gap: 3, marginTop: 10, overflowX: 'auto', paddingBottom: 2 }}>
      {points.map(p => (
        <div key={p.id} style={{ flex: '1 0 0', minWidth: 44, textAlign: 'center', padding: '6px 2px', borderRadius: 6, background: 'var(--bg-base)' }}>
          <div style={{ fontSize: 9.5, color: 'var(--text-muted)', marginBottom: 4 }}>{p.label}</div>
          <div style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 700, color: p.rate !== null ? 'var(--text-primary)' : 'var(--text-muted)' }}>
            {p.rate !== null ? p.rate.toFixed(2) : '—'}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Relative Performance Chart ────────────────────────────────────────────

function RelPerfChart({ series }: { series: PerfLine[] }) {
  const hasPts = series.some(s => s.pts.length > 0)
  if (!hasPts) return (
    <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>데이터 없음</div>
  )
  const W = 560, H = 220
  const PAD = { top: 18, right: 10, bottom: 30, left: 68 }
  const cW = W - PAD.left - PAD.right, cH = H - PAD.top - PAD.bottom
  const allPcts = series.flatMap(s => s.pts.map(p => p.pct))
  const rawMin = Math.min(0, ...allPcts), rawMax = Math.max(0, ...allPcts), rng = rawMax - rawMin || 1
  const pad = rng * 0.12, yMin = rawMin - pad, yMax = rawMax + pad, yRng = yMax - yMin
  const toX = (i: number, n: number) => PAD.left + (n <= 1 ? 0 : i / (n - 1)) * cW
  const toY = (v: number) => PAD.top + (1 - (v - yMin) / yRng) * cH
  const yTicks = Array.from({ length: 5 }, (_, i) => yMax - (i / 4) * yRng)
  const zeroY  = toY(0)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 220, display: 'block' }}>
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={PAD.left} y1={toY(v)} x2={W - PAD.right} y2={toY(v)} stroke="#1e293b" strokeWidth="1" />
          <text x={PAD.left - 6} y={toY(v) + 5} fontSize="15" fill="#64748b" textAnchor="end" fontFamily="monospace">{v >= 0 ? '+' : ''}{v.toFixed(1)}%</text>
        </g>
      ))}
      {zeroY >= PAD.top && zeroY <= PAD.top + cH && (
        <line x1={PAD.left} y1={zeroY} x2={W - PAD.right} y2={zeroY} stroke="#334155" strokeWidth="1.5" strokeDasharray="4 3" />
      )}
      {series.map(s => {
        if (s.pts.length === 0) return null
        const n = s.pts.length
        const d = s.pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i, n).toFixed(1)},${toY(p.pct).toFixed(1)}`).join(' ')
        return <path key={s.symbol} d={d} fill="none" stroke={s.color} strokeWidth="1.5" strokeLinejoin="round" />
      })}
      {series.map(s => {
        if (s.pts.length === 0) return null
        const last = s.pts[s.pts.length - 1]
        return <circle key={s.symbol} cx={toX(s.pts.length - 1, s.pts.length)} cy={toY(last.pct)} r="3" fill={s.color} />
      })}
      {(() => {
        const ref = series.find(s => s.pts.length > 0)
        if (!ref) return null
        return (
          <>
            <text x={PAD.left} y={H - 5} fontSize="14" fill="#475569" fontFamily="monospace">{ref.pts[0].date}</text>
            <text x={W - PAD.right} y={H - 5} fontSize="14" fill="#475569" textAnchor="end" fontFamily="monospace">{ref.pts[ref.pts.length - 1].date}</text>
          </>
        )
      })()}
    </svg>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────

function SpreadCard({ label, value }: { label: string; value: number | null }) {
  const inverted = value !== null && value < 0
  return (
    <div className="card" style={{ padding: '12px 16px', flex: 1 }}>
      <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</p>
      <p className={`num ${value === null ? 'flat' : inverted ? 'down' : 'up'}`} style={{ margin: '4px 0 2px', fontSize: 20, fontWeight: 700 }}>
        {value === null ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}pp`}
      </p>
      {value !== null && (
        <p style={{ margin: 0, fontSize: 11, color: inverted ? 'var(--down)' : 'var(--text-muted)' }}>
          {inverted ? '역전 중 (단기 > 장기)' : '정상 (장기 > 단기)'}
        </p>
      )}
    </div>
  )
}

function StatCard({ label, value, change, unit, invertColor = false }:
  { label: string; value: number | null; change: number | null; unit: string; invertColor?: boolean }) {
  const cls = change === null ? 'flat' : invertColor ? (change > 0 ? 'down' : 'up') : (change > 0 ? 'up' : 'down')
  return (
    <div className="card" style={{ padding: '12px 14px' }}>
      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>{label}</p>
      <p className="num" style={{ margin: '4px 0 2px', fontSize: 20, fontWeight: 700 }}>
        {value === null ? '—' : `${value.toFixed(unit === 'bp' ? 0 : 2)}${unit}`}
      </p>
      {change !== null && (
        <span className={`num ${cls}`} style={{ fontSize: 12 }}>{change >= 0 ? '+' : ''}{change.toFixed(unit === 'bp' ? 0 : 2)}{unit}</span>
      )}
    </div>
  )
}

function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{title}</h2>
      {sub && <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  )
}

// ─── New components ────────────────────────────────────────────────────────

type GL = 'good' | 'warn' | 'bad' | 'neutral'
const DOT: Record<GL, string> = { good: '#22c55e', warn: '#f59e0b', bad: '#ef4444', neutral: '#475569' }

function GuideBox({ g }: { g: [GL, string][] }) {
  return (
    <div style={{ marginTop: 8, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.015)' }}>
      <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 6px' }}>해석 가이드</p>
      {g.map(([l, t], i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 2 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', marginTop: 5.5, flexShrink: 0, background: DOT[l] }} />
          <span style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>{t}</span>
        </div>
      ))}
    </div>
  )
}

function MacroStat({ label, value, prev, unit = '', fmt, alert }: {
  label: string; value: number | null; prev?: number | null; unit?: string; fmt?: (v: number) => string; alert?: boolean
}) {
  const d = value === null ? '—' : fmt ? fmt(value) : `${value.toFixed(2)}${unit}`
  const chg = value !== null && prev != null ? value - prev : null
  const chgStr = chg === null ? null : fmt ? fmt(Math.abs(chg)) : `${Math.abs(chg).toFixed(2)}${unit}`
  return (
    <div style={{ background: 'var(--bg-base)', borderRadius: 8, padding: '10px 12px', border: alert ? '1px solid #ef4444' : undefined, overflow: 'hidden' }}>
      <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '0 0 3px', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</p>
      <p style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', margin: '0 0 1px', color: alert ? '#ef4444' : 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d}</p>
      {chgStr !== null && <p style={{ fontSize: 10, margin: 0, color: chg! > 0 ? '#ef4444' : '#22c55e', whiteSpace: 'nowrap' }}>{chg! > 0 ? '▲' : '▼'} {chgStr}</p>}
    </div>
  )
}

function QuoteCard({ sym, ticker, label, price, pct, pfx = '', dec = 2, note }: {
  sym: string; ticker?: string; label: string; price: number | null; pct: number | null; pfx?: string; dec?: number; note?: string
}) {
  const up = pct !== null && pct >= 0
  return (
    <div style={{ background: 'var(--bg-base)', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 }}>
        <span style={{ fontSize: 11, fontWeight: 800 }}>
          {ticker ? <TvLink symbol={ticker}>{sym}</TvLink> : sym}
          {note && <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 4 }}>{note}</span>}
        </span>
        {pct !== null && <span style={{ fontSize: 11, fontFamily: 'monospace', color: up ? '#22c55e' : '#ef4444' }}>{pct >= 0 ? '+' : ''}{pct.toFixed(2)}%</span>}
      </div>
      <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '0 0 2px' }}>{label}</p>
      <p style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', margin: 0 }}>{price !== null ? `${pfx}${price.toFixed(dec)}` : '—'}</p>
    </div>
  )
}

function Skel({ n, cols, h = 68 }: { n: number; cols: number; h?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8 }}>
      {Array.from({ length: n }).map((_, i) => <div key={i} style={{ height: h, borderRadius: 8, background: 'var(--bg-card)' }} />)}
    </div>
  )
}

// ─── Guide content ─────────────────────────────────────────────────────────

type Guide = [GL, string][]

const YC_G: Guide = [
  ['good', '장기 > 단기 (정상): 경기 확장 기대. 주식 우호적'],
  ['warn', '2Y ≈ 10Y (평탄화): 전환점 주의. 정책 불확실 구간'],
  ['bad',  '2Y > 10Y (역전): 경기침체 선행 신호 — 6개월~2년 선행'],
  ['bad',  '역전 → 정상 재전환: 침체 진입 직전. 가장 위험한 구간'],
]
const RP_G: Guide = [
  ['good',    'IWM(소형주) 선도: 리스크온. 경기 초기 강세장'],
  ['good',    'QQQ 선도: 기술주 선호. 금리 안정 환경'],
  ['neutral', 'DIA 선도: 방어적 성향. 경기 후기'],
  ['bad',     'IWM 크게 언더퍼폼: 유동성 부족 또는 성장 둔화 경고'],
]
const CV_G: Guide = [
  ['good', 'HY OAS < 300bp: 신용 우호. 리스크온'],
  ['warn', 'HY OAS 300~500bp: 주의 구간. 선별적 접근'],
  ['bad',  'HY OAS > 500bp: 시스템 스트레스. 방어 포지션'],
  ['good', 'VIX < 15: 시장 안정 (역설적으로 리스크 축적 구간)'],
  ['warn', 'VIX 15~25: 일반 변동성. VIX 30↑: 공포 — 역발상 매수 탐색'],
]
const INF_G: Guide = [
  ['bad',  'Core PCE > 3%: Fed 인상/동결 압력. 긴축적'],
  ['warn', 'Core PCE 2~3%: 목표 근접. Fed 동향 주시'],
  ['good', 'Core PCE < 2%: 완화 여지. 위험자산 우호'],
  ['bad',  'BEI 상승 + Core PCE 상승: 기대 고착 → 채권 매도 압력'],
]
const EMP_G: Guide = [
  ['good',    'NFP > 150k: 강한 고용. 소비 우호'],
  ['warn',    'NFP 0~150k: 온건 성장'],
  ['bad',     'NFP < 0 (연속): 고용 감소. 침체 신호'],
  ['bad',     'Sahm Rule ≥ 0.5: 경기침체 공식 진입 신호'],
  ['neutral', 'JOLTS 감소 추세: 고용 냉각. Fed 완화 기대 상승'],
]
const LIQ_G: Guide = [
  ['good', '역레포 잔액 안정: 시스템 유동성 충분'],
  ['warn', '역레포 급감 + TGA 고갈: 달러 유동성 축소 주의'],
  ['bad',  'Fed 자산 감소 (QT 진행): 긴축적 유동성 환경'],
  ['good', 'FFR 인하 전환: 완화 사이클. 위험자산 우호'],
]
const FX_G: Guide = [
  ['bad',     'DXY 강세↑: EM 자산 압박. 원자재 약세'],
  ['good',    'DXY 약세↓: EM 강세. 위험자산 우호'],
  ['bad',     '달러/원 1,400↑: 외국인 이탈 압박. 수입 물가↑'],
  ['neutral', '달러/엔 150↑: BOJ 개입 경계 구간'],
]
const COM_G: Guide = [
  ['good', '구리 상승: 경기 선행 긍정. 산업 수요 증가'],
  ['bad',  '구리 급락: 글로벌 성장 둔화 경고'],
  ['bad',  '유가 급등: 인플레이션 압력. 소비 악영향'],
  ['bad',  '금 급등 + VIX 상승: 리스크오프. 대피처 수요'],
]
const GLB_G: Guide = [
  ['good',    'EM(EEM) 선도: 달러 약세 + 리스크온 환경'],
  ['warn',    '일본 급등: 엔화 약세 효과. 지속성 확인 필요'],
  ['bad',     '유럽 언더퍼폼: 에너지 비용 + 지정학 리스크'],
  ['neutral', 'EM 전반 하락 + DXY 강세: 달러 강세 구간. 신중 접근'],
]
const CYC_G: Guide = [
  ['good', 'GDP > 2% QoQ (연율): 강한 성장. 리스크온 지지'],
  ['warn', 'GDP 0~2%: 둔화. 정책 전환 주시'],
  ['bad',  'GDP < 0 (2분기 연속): 기술적 경기침체'],
  ['bad',  'Sahm Rule ≥ 0.5: 경기침체 강력 신호'],
]
const STR_G: Guide = [
  ['good', 'STLFSI < 0: 금융 여건 안정. 평균 이하 스트레스'],
  ['warn', 'STLFSI 0~1: 주의 구간'],
  ['bad',  'STLFSI > 1: 금융 스트레스 상승. 방어적 포지션'],
  ['bad',  'SKEW > 140: 시장이 꼬리 리스크(블랙스완) 헤징 중'],
  ['warn', 'VVIX 급등 + VIX 안정: 변동성 급변 임박 신호'],
]

// ─── Perf series config ────────────────────────────────────────────────────

const PERF_SERIES = [
  { symbol: 'SPY', label: 'S&P 500',    color: '#3b82f6' },
  { symbol: 'QQQ', label: 'NASDAQ 100', color: '#8b5cf6' },
  { symbol: 'IWM', label: 'Russell 2K', color: '#f97316' },
  { symbol: 'DIA', label: 'Dow Jones',  color: '#94a3b8' },
]
const RANGE_LABEL: Record<PerfRange, string> = { '1mo': '1M', '3mo': '3M', '6mo': '6M', '1y': '1Y' }

// ─── Page ──────────────────────────────────────────────────────────────────

export default function MarketPage() {
  const [curve,        setCurve]        = useState<CurveData | null>(null)
  const [curveLoading, setCurveLoading] = useState(true)
  const [perfRange,    setPerfRange]    = useState<PerfRange>('3mo')
  const [perfLines,    setPerfLines]    = useState<PerfLine[]>([])
  const [perfLoading,  setPerfLoading]  = useState(true)
  const [macro,        setMacro]        = useState<MacroData | null>(null)
  const [macroLoading, setMacroLoading] = useState(true)
  const [mktQ,         setMktQ]         = useState<MQ | null>(null)
  const [mktLoading,   setMktLoading]   = useState(true)
  const [fetchedAt,    setFetchedAt]    = useState<number | null>(null)

  const loadPerf = useCallback(async (range: PerfRange) => {
    setPerfLoading(true)
    try {
      const results = await Promise.all(
        PERF_SERIES.map(s =>
          fetch(`/api/history?symbol=${s.symbol}&range=${range}`)
            .then(r => r.json())
            .then(j => ({ ...s, candles: (j.candles ?? []) as { date: string; close: number }[] }))
            .catch(() => ({ ...s, candles: [] as { date: string; close: number }[] }))
        )
      )
      setPerfLines(results.map(r => {
        if (r.candles.length === 0) return { ...r, pts: [] }
        const base = r.candles[0].close
        return { ...r, pts: r.candles.map(c => ({ date: c.date, pct: ((c.close - base) / base) * 100 })) }
      }))
    } finally { setPerfLoading(false) }
  }, [])

  useEffect(() => { loadPerf(perfRange) }, [perfRange, loadPerf])

  // 상대성과(기간 선택 의존)를 제외한 나머지를 한 번에 갱신
  const load = useCallback(() => {
    setCurveLoading(true); setMacroLoading(true); setMktLoading(true)
    Promise.allSettled([
      fetch('/api/yield-curve').then(r => r.json()).then(setCurve).finally(() => setCurveLoading(false)),
      fetch('/api/macro').then(r => r.json()).then(setMacro).finally(() => setMacroLoading(false)),
      fetch('/api/market-quotes').then(r => r.json()).then(setMktQ).finally(() => setMktLoading(false)),
    ]).then(() => setFetchedAt(Date.now()))
  }, [])

  useEffect(() => { load() }, [load])

  const m = macro
  const q = mktQ
  const d = (s?: MStat | null) => (s?.value != null && s?.prev != null) ? s.value - s.prev : null

  const GRID5 = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: 8 } as const
  const GRID4 = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(88px, 1fr))', gap: 8 } as const

  const anyLoading = curveLoading || macroLoading || mktLoading

  return (
    <div style={{ padding: '16px', maxWidth: 900, margin: '0 auto' }}>
      <PageHeader title="시장" fetchedAt={fetchedAt} onRefresh={load} loading={anyLoading} />

      <SectionJump />

      {/* ── 1. 수익률 곡선 ──────────────────────────────────────────── */}
      <section id="yield" style={SECTION}>
        <SectionHead title="수익률 곡선" sub="미국 국채 만기별 금리 · FRED" />
        <div className="card" style={{ padding: '14px 16px 12px' }}>
          {curveLoading
            ? <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>로딩 중...</div>
            : curve
              ? <><YieldCurveChart points={curve.points} /><YieldRateTable points={curve.points} /></>
              : <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>FRED API 키 확인 필요</div>
          }
        </div>
        {curve && <div style={{ display: 'flex', gap: 8, marginTop: 8 }}><SpreadCard label="2Y – 10Y 스프레드" value={curve.spread_2y10y} /><SpreadCard label="3M – 10Y 스프레드" value={curve.spread_3mo10y} /></div>}
        <GuideBox g={YC_G} />
      </section>

      {/* ── 2. 유동성 패널 ──────────────────────────────────────────── */}
      <section id="liquidity" style={SECTION}>
        <SectionHead title="유동성 패널" sub="Fed 자산 · 역레포 · TGA · 기준금리 · FRED 12h" />
        {macroLoading ? <Skel n={5} cols={5} /> : (
          <div style={GRID5}>
            <MacroStat label="Fed 자산" value={m?.liquidity.walcl.value ?? null} prev={m?.liquidity.walcl.prev ?? null} fmt={v => `$${(v/1e6).toFixed(2)}T`} />
            <MacroStat label="역레포 잔액" value={m?.liquidity.rrpo.value ?? null} prev={m?.liquidity.rrpo.prev ?? null} fmt={v => `$${v.toFixed(0)}B`} />
            <MacroStat label="TGA 잔액" value={m?.liquidity.tga.value ?? null} prev={m?.liquidity.tga.prev ?? null} fmt={v => `$${(v/1000).toFixed(0)}B`} />
            <MacroStat label="FFR" value={m?.liquidity.ffr.value ?? null} prev={m?.liquidity.ffr.prev ?? null} unit="%" />
            <MacroStat label="SOFR" value={m?.liquidity.sofr.value ?? null} prev={m?.liquidity.sofr.prev ?? null} unit="%" />
          </div>
        )}
        <GuideBox g={LIQ_G} />
      </section>

      {/* ── 3. 인플레이션 스코어카드 ────────────────────────────────── */}
      <section id="inflation" style={SECTION}>
        <SectionHead title="인플레이션" sub="FRED · YoY% · 12h 캐시" />
        {macroLoading ? <Skel n={5} cols={5} /> : (
          <div style={GRID5}>
            <MacroStat label="CPI YoY" value={m?.inflation.cpi.value ?? null} prev={m?.inflation.cpi.prev ?? null} unit="%" />
            <MacroStat label="Core CPI YoY" value={m?.inflation.coreCpi.value ?? null} prev={m?.inflation.coreCpi.prev ?? null} unit="%" />
            <MacroStat label="Core PCE YoY" value={m?.inflation.corePce.value ?? null} prev={m?.inflation.corePce.prev ?? null} unit="%" alert={(m?.inflation.corePce.value ?? 0) > 2.5} />
            <MacroStat label="10Y 기대인플레" value={m?.inflation.bei10.value ?? null} prev={m?.inflation.bei10.prev ?? null} unit="%" />
            <MacroStat label="5Y 기대인플레" value={m?.inflation.bei5.value ?? null} prev={m?.inflation.bei5.prev ?? null} unit="%" />
          </div>
        )}
        <GuideBox g={INF_G} />
      </section>

      {/* ── 4. 고용 스코어카드 ──────────────────────────────────────── */}
      <section id="employment" style={SECTION}>
        <SectionHead title="고용" sub="FRED · 12h 캐시" />
        {macroLoading ? <Skel n={4} cols={4} /> : (
          <div style={GRID4}>
            <MacroStat label="실업률" value={m?.employment.unrate.value ?? null} prev={m?.employment.unrate.prev ?? null} unit="%" alert={(m?.employment.unrate.value ?? 0) > 5} />
            <MacroStat label="NFP MoM" value={m?.employment.nfp.value ?? null} prev={m?.employment.nfp.prev ?? null} fmt={v => `${v >= 0 ? '+' : ''}${v.toFixed(0)}k`} />
            <MacroStat label="초기 실업급여" value={m?.employment.icsa.value ?? null} prev={m?.employment.icsa.prev ?? null} fmt={v => `${(v/1000).toFixed(0)}k`} />
            <MacroStat label="JOLTS 구인" value={m?.employment.jolts.value ?? null} prev={m?.employment.jolts.prev ?? null} fmt={v => `${(v/1000).toFixed(1)}M`} />
          </div>
        )}
        <GuideBox g={EMP_G} />
      </section>

      {/* ── 5. 달러 & 환율 ──────────────────────────────────────────── */}
      <section id="fx" style={SECTION}>
        <SectionHead title="달러 & 환율" sub="Yahoo Finance · 5분 캐시" />
        {mktLoading ? <Skel n={5} cols={5} /> : (
          <div style={GRID5}>
            <QuoteCard ticker="DX-Y.NYB" sym="DXY" label="달러인덱스" price={q?.['DX-Y.NYB']?.price ?? null} pct={q?.['DX-Y.NYB']?.changePct ?? null} dec={2} />
            <QuoteCard sym="USD/JPY" label="달러/엔" price={q?.['JPY=X']?.price ?? null} pct={q?.['JPY=X']?.changePct ?? null} />
            <QuoteCard sym="USD/KRW" label="달러/원" price={q?.['KRW=X']?.price ?? null} pct={q?.['KRW=X']?.changePct ?? null} dec={1} />
            <QuoteCard sym="EUR/USD" label="유로/달러" price={q?.['EURUSD=X']?.price ?? null} pct={q?.['EURUSD=X']?.changePct ?? null} dec={4} />
            <QuoteCard sym="USD/CNY" label="달러/위안" price={q?.['CNY=X']?.price ?? null} pct={q?.['CNY=X']?.changePct ?? null} />
          </div>
        )}
        <GuideBox g={FX_G} />
      </section>

      {/* ── 6. 원자재 ───────────────────────────────────────────────── */}
      <section id="commodity" style={SECTION}>
        <SectionHead title="원자재" sub="Yahoo Finance · 5분 캐시" />
        {mktLoading ? <Skel n={4} cols={4} /> : (
          <div style={GRID4}>
            <QuoteCard ticker="HG=F" sym="구리" label="HG=F (선물)" price={q?.['HG=F']?.price ?? null} pct={q?.['HG=F']?.changePct ?? null} note="경기선행" />
            <QuoteCard ticker="CL=F" sym="WTI" label="CL=F (선물)" price={q?.['CL=F']?.price ?? null} pct={q?.['CL=F']?.changePct ?? null} pfx="$" />
            <QuoteCard ticker="GC=F" sym="금" label="GC=F (선물)" price={q?.['GC=F']?.price ?? null} pct={q?.['GC=F']?.changePct ?? null} pfx="$" dec={0} />
            <QuoteCard ticker="NG=F" sym="천연가스" label="NG=F (선물)" price={q?.['NG=F']?.price ?? null} pct={q?.['NG=F']?.changePct ?? null} />
          </div>
        )}
        <GuideBox g={COM_G} />
      </section>

      {/* ── 7. 글로벌 증시 ──────────────────────────────────────────── */}
      <section id="global" style={SECTION}>
        <SectionHead title="글로벌 증시" sub="Yahoo Finance · 5분 캐시" />
        {mktLoading ? <Skel n={4} cols={4} /> : (
          <div style={GRID4}>
            <QuoteCard ticker="^N225" sym="닛케이" label="^N225 (일본)" price={q?.['^N225']?.price ?? null} pct={q?.['^N225']?.changePct ?? null} dec={0} />
            <QuoteCard ticker="^HSI" sym="항셍" label="^HSI (홍콩)" price={q?.['^HSI']?.price ?? null} pct={q?.['^HSI']?.changePct ?? null} dec={0} />
            <QuoteCard ticker="^STOXX50E" sym="유로스톡스" label="^STOXX50E (유럽)" price={q?.['^STOXX50E']?.price ?? null} pct={q?.['^STOXX50E']?.changePct ?? null} dec={0} />
            <QuoteCard ticker="EEM" sym="EM ETF" label="EEM (MSCI EM)" price={q?.['EEM']?.price ?? null} pct={q?.['EEM']?.changePct ?? null} pfx="$" />
          </div>
        )}
        <GuideBox g={GLB_G} />
      </section>

      {/* ── 8. 지수 상대성과 ────────────────────────────────────────── */}
      <section id="relperf" style={SECTION}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>지수 상대성과</h2>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>기간 첫날 기준 = 0%</p>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['1mo', '3mo', '6mo', '1y'] as PerfRange[]).map(r => (
              <button key={r} onClick={() => setPerfRange(r)} style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 11, border: '1px solid var(--border)',
                background: perfRange === r ? 'var(--info)' : 'var(--bg-card)',
                color: perfRange === r ? '#fff' : 'var(--text-muted)',
                cursor: 'pointer', transition: 'background 120ms',
              }}>{RANGE_LABEL[r]}</button>
            ))}
          </div>
        </div>
        <div className="card" style={{ padding: '14px 16px 8px' }}>
          {perfLoading
            ? <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>로딩 중...</div>
            : <RelPerfChart series={perfLines} />
          }
        </div>
        {!perfLoading && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 10 }}>
            {perfLines.map(s => {
              const last = s.pts[s.pts.length - 1], pct = last?.pct ?? null
              return (
                <div key={s.symbol} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 14, height: 3, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.label}</span>
                  <span className={`num ${pct === null ? 'flat' : pct >= 0 ? 'up' : 'down'}`} style={{ fontSize: 12 }}>
                    {pct === null ? '—' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`}
                  </span>
                </div>
              )
            })}
          </div>
        )}
        <GuideBox g={RP_G} />
      </section>

      {/* ── 9. 신용 & 변동성 ────────────────────────────────────────── */}
      <section id="credit" style={SECTION}>
        <SectionHead title="신용 & 변동성" sub="OAS 상승 = 신용 리스크 증가 · FRED 12h · Yahoo 5min" />
        {(macroLoading || mktLoading) ? <Skel n={5} cols={5} /> : (
          <div style={GRID5}>
            <StatCard label="하이일드 OAS" value={m?.credit.hyOas.value ?? null} change={d(m?.credit.hyOas)} unit="bp" invertColor />
            <StatCard label="BB OAS"       value={m?.credit.bbOas.value ?? null} change={d(m?.credit.bbOas)} unit="bp" invertColor />
            <StatCard label="B OAS"        value={m?.credit.bOas.value  ?? null} change={d(m?.credit.bOas)}  unit="bp" invertColor />
            <StatCard label="IG OAS"       value={m?.credit.igOas.value ?? null} change={d(m?.credit.igOas)} unit="bp" invertColor />
            <StatCard label="VIX 공포지수" value={q?.['^VIX']?.price    ?? null} change={q?.['^VIX']?.changePct ?? null} unit="" invertColor />
          </div>
        )}
        <GuideBox g={CV_G} />
      </section>

      {/* ── 10. 시장 스트레스 & 심리 ────────────────────────────────── */}
      <section id="stress" style={SECTION}>
        <SectionHead title="시장 스트레스 & 심리" sub="STLFSI · VVIX · SKEW" />
        {(macroLoading || mktLoading) ? <Skel n={3} cols={3} /> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <MacroStat label="St.Louis 금융스트레스" value={m?.risk.stlfsi.value ?? null} prev={m?.risk.stlfsi.prev ?? null} alert={(m?.risk.stlfsi.value ?? -1) > 0.5} />
            <MacroStat label="VVIX (VIX of VIX)" value={q?.['^VVIX']?.price ?? null} prev={null} fmt={v => v.toFixed(1)} />
            <MacroStat label="SKEW 지수" value={q?.['^SKEW']?.price ?? null} prev={null} fmt={v => v.toFixed(1)} alert={(q?.['^SKEW']?.price ?? 0) > 140} />
          </div>
        )}
        <GuideBox g={STR_G} />
      </section>

      {/* ── 11. 경기 사이클 ─────────────────────────────────────────── */}
      <section id="cycle" style={SECTION}>
        <SectionHead title="경기 사이클" sub="GDP · Sahm Rule · 소매판매 · 주택착공 · FRED 12h" />
        {macroLoading ? <Skel n={4} cols={4} /> : (
          <div style={GRID4}>
            <MacroStat label="실질 GDP QoQ" value={m?.cycle.gdp.value ?? null} prev={m?.cycle.gdp.prev ?? null} unit="%" />
            <MacroStat label="Sahm Rule" value={m?.cycle.sahm.value ?? null} prev={m?.cycle.sahm.prev ?? null} alert={(m?.cycle.sahm.value ?? -1) >= 0.5} />
            <MacroStat label="소매판매" value={m?.cycle.retail.value ?? null} prev={m?.cycle.retail.prev ?? null} fmt={v => `$${(v/1000).toFixed(0)}B`} />
            <MacroStat label="주택착공" value={m?.cycle.housing.value ?? null} prev={m?.cycle.housing.prev ?? null} fmt={v => `${v.toFixed(0)}k`} />
          </div>
        )}
        <GuideBox g={CYC_G} />
      </section>
    </div>
  )
}
