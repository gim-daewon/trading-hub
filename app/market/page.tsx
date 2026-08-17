'use client'
import { useEffect, useState, useCallback } from 'react'

// ─── Types ─────────────────────────────────────────────────────────────────

interface YieldPoint { id: string; label: string; years: number; rate: number | null }
interface CurveData {
  points: YieldPoint[]
  spread_2y10y: number | null
  spread_3mo10y: number | null
}

interface PerfPoint  { date: string; pct: number }
interface PerfLine   { symbol: string; label: string; color: string; pts: PerfPoint[] }
type     PerfRange   = '1mo' | '3mo' | '6mo' | '1y'

interface CreditState {
  hyVal: number | null;   hyChg: number | null
  igVal: number | null;   igChg: number | null
  vix:   number | null;   vixChg: number | null
}

// ─── Yield Curve Chart ─────────────────────────────────────────────────────

function YieldCurveChart({ points }: { points: YieldPoint[] }) {
  const valid = points.filter((p): p is YieldPoint & { rate: number } => p.rate !== null)
  if (valid.length < 2) return (
    <div style={{ height: 164, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
      데이터 없음
    </div>
  )

  const W = 560, H = 164
  const PAD = { top: 16, right: 8, bottom: 28, left: 40 }
  const cW = W - PAD.left - PAD.right
  const cH = H - PAD.top - PAD.bottom

  const rates = valid.map(p => p.rate)
  const minR = Math.min(...rates), maxR = Math.max(...rates)
  const rng  = maxR - minR || 0.1
  const pad  = rng * 0.3
  const yMin = minR - pad, yMax = maxR + pad, yRng = yMax - yMin

  const n   = points.length
  const toX = (i: number) => PAD.left + (i / (n - 1)) * cW
  const toY = (r: number) => PAD.top  + (1 - (r - yMin) / yRng) * cH

  const r2y  = points.find(p => p.id === 'DGS2')?.rate  ?? null
  const r10y = points.find(p => p.id === 'DGS10')?.rate ?? null
  const inverted = r2y !== null && r10y !== null && r2y > r10y
  const lineColor = inverted ? '#ef4444' : '#22c55e'

  // SVG path (skips null points)
  const segs: string[] = []
  let cmd = 'M'
  points.forEach((p, i) => {
    if (p.rate !== null) {
      segs.push(`${cmd} ${toX(i).toFixed(1)},${toY(p.rate).toFixed(1)}`)
      cmd = 'L'
    }
  })
  const d = segs.join(' ')

  // Area fill bounds
  const validIdxs = points.map((p, i) => p.rate !== null ? i : -1).filter(i => i >= 0)
  const fi = validIdxs[0], li = validIdxs[validIdxs.length - 1]
  const areaD = `${d} L ${toX(li).toFixed(1)},${(PAD.top + cH).toFixed(1)} L ${toX(fi).toFixed(1)},${(PAD.top + cH).toFixed(1)} Z`

  // Y-axis ticks (3)
  const yTicks = [yMax, (yMax + yMin) / 2, yMin]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 164, display: 'block' }}>
      {/* grid */}
      {yTicks.map((v, i) => (
        <line key={i} x1={PAD.left} y1={toY(v)} x2={W - PAD.right} y2={toY(v)}
          stroke="#1e293b" strokeWidth="1" />
      ))}
      {/* y labels */}
      {yTicks.map((v, i) => (
        <text key={i} x={PAD.left - 4} y={toY(v) + 3} fontSize="9" fill="#475569"
          textAnchor="end" fontFamily="monospace">{v.toFixed(2)}%</text>
      ))}
      {/* area */}
      <path d={areaD} fill={lineColor} fillOpacity="0.08" />
      {/* curve */}
      <path d={d} fill="none" stroke={lineColor} strokeWidth="2" strokeLinejoin="round" />
      {/* points + x labels */}
      {points.map((p, i) => p.rate === null ? null : (
        <g key={p.id}>
          <circle cx={toX(i)} cy={toY(p.rate)} r="3" fill={lineColor} />
          <text x={toX(i)} y={H - 4} fontSize="9" fill="#475569"
            textAnchor="middle" fontFamily="monospace">{p.label}</text>
        </g>
      ))}
    </svg>
  )
}

// ─── Relative Performance Chart ────────────────────────────────────────────

function RelPerfChart({ series }: { series: PerfLine[] }) {
  const hasPts = series.some(s => s.pts.length > 0)
  if (!hasPts) return (
    <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
      데이터 없음
    </div>
  )

  const W = 560, H = 220
  const PAD = { top: 16, right: 8, bottom: 28, left: 46 }
  const cW = W - PAD.left - PAD.right
  const cH = H - PAD.top - PAD.bottom

  const allPcts = series.flatMap(s => s.pts.map(p => p.pct))
  const rawMin = Math.min(0, ...allPcts), rawMax = Math.max(0, ...allPcts)
  const rng = rawMax - rawMin || 1
  const pad = rng * 0.12
  const yMin = rawMin - pad, yMax = rawMax + pad, yRng = yMax - yMin

  const maxLen = Math.max(...series.map(s => s.pts.length), 1)
  const toX = (i: number, n: number) => PAD.left + (n <= 1 ? 0 : i / (n - 1)) * cW
  const toY = (v: number) => PAD.top + (1 - (v - yMin) / yRng) * cH

  // 5 y-axis ticks
  const yTicks = Array.from({ length: 5 }, (_, i) => yMax - (i / 4) * yRng)
  const zeroY  = toY(0)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 220, display: 'block' }}>
      {/* grid */}
      {yTicks.map((v, i) => (
        <line key={i} x1={PAD.left} y1={toY(v)} x2={W - PAD.right} y2={toY(v)}
          stroke="#1e293b" strokeWidth="1" />
      ))}
      {/* y labels */}
      {yTicks.map((v, i) => (
        <text key={i} x={PAD.left - 4} y={toY(v) + 3} fontSize="9" fill="#475569"
          textAnchor="end" fontFamily="monospace">
          {v >= 0 ? '+' : ''}{v.toFixed(1)}%
        </text>
      ))}
      {/* zero line */}
      {zeroY >= PAD.top && zeroY <= PAD.top + cH && (
        <line x1={PAD.left} y1={zeroY} x2={W - PAD.right} y2={zeroY}
          stroke="#334155" strokeWidth="1.5" strokeDasharray="4 3" />
      )}
      {/* lines */}
      {series.map(s => {
        if (s.pts.length === 0) return null
        const n = s.pts.length
        const d = s.pts.map((p, i) =>
          `${i === 0 ? 'M' : 'L'} ${toX(i, n).toFixed(1)},${toY(p.pct).toFixed(1)}`
        ).join(' ')
        return <path key={s.symbol} d={d} fill="none" stroke={s.color} strokeWidth="1.5" strokeLinejoin="round" />
      })}
      {/* end dots */}
      {series.map(s => {
        if (s.pts.length === 0) return null
        const last = s.pts[s.pts.length - 1]
        const n = s.pts.length
        return <circle key={s.symbol} cx={toX(n - 1, n)} cy={toY(last.pct)} r="3" fill={s.color} />
      })}
      {/* x-axis dates */}
      {(() => {
        const ref = series.find(s => s.pts.length > 0)
        if (!ref) return null
        return (
          <>
            <text x={PAD.left} y={H - 4} fontSize="9" fill="#334155" fontFamily="monospace">
              {ref.pts[0].date}
            </text>
            <text x={W - PAD.right} y={H - 4} fontSize="9" fill="#334155" textAnchor="end" fontFamily="monospace">
              {ref.pts[ref.pts.length - 1].date}
            </text>
          </>
        )
      })()}
    </svg>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────

function SpreadCard({ label, value }: { label: string; value: number | null }) {
  const inverted = value !== null && value < 0
  const cls = value === null ? 'flat' : inverted ? 'down' : 'up'
  return (
    <div className="card" style={{ padding: '12px 16px', flex: 1 }}>
      <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</p>
      <p className={`num ${cls}`} style={{ margin: '4px 0 2px', fontSize: 20, fontWeight: 700 }}>
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
  // invertColor: OAS/VIX — 상승 = 빨간색
  const cls = change === null ? 'flat'
    : invertColor ? (change > 0 ? 'down' : 'up')
    : (change > 0 ? 'up' : 'down')

  return (
    <div className="card" style={{ padding: '12px 14px' }}>
      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>{label}</p>
      <p className="num" style={{ margin: '4px 0 2px', fontSize: 20, fontWeight: 700 }}>
        {value === null ? '—' : `${value.toFixed(unit === 'bp' ? 0 : 2)}${unit}`}
      </p>
      {change !== null && (
        <span className={`num ${cls}`} style={{ fontSize: 12 }}>
          {change >= 0 ? '+' : ''}{change.toFixed(unit === 'bp' ? 0 : 2)}{unit}
        </span>
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

  const [credit,       setCredit]       = useState<CreditState>({
    hyVal: null, hyChg: null, igVal: null, igChg: null, vix: null, vixChg: null,
  })
  const [creditLoading, setCreditLoading] = useState(true)

  // ── Yield curve ─────────────────────────────────────────────────────────
  useEffect(() => {
    setCurveLoading(true)
    fetch('/api/yield-curve')
      .then(r => r.json())
      .then(j => setCurve(j))
      .catch(() => {})
      .finally(() => setCurveLoading(false))
  }, [])

  // ── Relative performance ─────────────────────────────────────────────────
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
      const lines: PerfLine[] = results.map(r => {
        if (r.candles.length === 0) return { symbol: r.symbol, label: r.label, color: r.color, pts: [] }
        const base = r.candles[0].close
        return {
          symbol: r.symbol, label: r.label, color: r.color,
          pts: r.candles.map(c => ({ date: c.date, pct: ((c.close - base) / base) * 100 })),
        }
      })
      setPerfLines(lines)
    } finally {
      setPerfLoading(false)
    }
  }, [])

  useEffect(() => { loadPerf(perfRange) }, [perfRange, loadPerf])

  // ── Credit & Vol ─────────────────────────────────────────────────────────
  useEffect(() => {
    setCreditLoading(true)
    Promise.allSettled([
      fetch('/api/fred?ids=BAMLH0A0HYM2,BAMLC0A4CBBB').then(r => r.json()),
      fetch('/api/quotes?symbols=%5EVIX&source=yahoo').then(r => r.json()),
    ]).then(([fredRes, vixRes]) => {
      let hyVal = null, hyChg = null, igVal = null, igChg = null
      if (fredRes.status === 'fulfilled') {
        const d = fredRes.value.data ?? {}
        if (d.BAMLH0A0HYM2) { hyVal = d.BAMLH0A0HYM2.value; hyChg = d.BAMLH0A0HYM2.change }
        if (d.BAMLC0A4CBBB) { igVal = d.BAMLC0A4CBBB.value; igChg = d.BAMLC0A4CBBB.change }
      }
      let vix = null, vixChg = null
      if (vixRes.status === 'fulfilled') {
        const v = vixRes.value.data?.['^VIX']
        if (v) { vix = v.price; vixChg = v.changePct }
      }
      setCredit({ hyVal, hyChg, igVal, igChg, vix, vixChg })
    }).finally(() => setCreditLoading(false))
  }, [])

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '16px', maxWidth: 700, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>시장</h1>
      </div>

      {/* ── 1. 수익률 곡선 ────────────────────────────────────────────── */}
      <section style={{ marginBottom: 28 }}>
        <SectionHead title="수익률 곡선" sub="미국 국채 만기별 금리 · FRED" />
        <div className="card" style={{ padding: '14px 16px 8px' }}>
          {curveLoading
            ? <div style={{ height: 164, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>로딩 중...</div>
            : curve
              ? <YieldCurveChart points={curve.points} />
              : <div style={{ height: 164, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>FRED API 키 확인 필요</div>
          }
        </div>
        {curve && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <SpreadCard label="2Y – 10Y 스프레드" value={curve.spread_2y10y} />
            <SpreadCard label="3M – 10Y 스프레드" value={curve.spread_3mo10y} />
          </div>
        )}
      </section>

      {/* ── 2. 지수 상대성과 ──────────────────────────────────────────── */}
      <section style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>지수 상대성과</h2>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>기간 첫날 기준 = 0%</p>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['1mo', '3mo', '6mo', '1y'] as PerfRange[]).map(r => (
              <button key={r} onClick={() => setPerfRange(r)} style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 11,
                border: '1px solid var(--border)',
                background: perfRange === r ? 'var(--info)' : 'var(--bg-card)',
                color:      perfRange === r ? '#fff'       : 'var(--text-muted)',
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
        {/* legend */}
        {!perfLoading && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 10 }}>
            {perfLines.map(s => {
              const last = s.pts[s.pts.length - 1]
              const pct  = last?.pct ?? null
              const cls  = pct === null ? 'flat' : pct >= 0 ? 'up' : 'down'
              return (
                <div key={s.symbol} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 14, height: 3, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.label}</span>
                  <span className={`num ${cls}`} style={{ fontSize: 12 }}>
                    {pct === null ? '—' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── 3. 신용 & 변동성 ─────────────────────────────────────────── */}
      <section>
        <SectionHead title="신용 & 변동성" sub="OAS 상승 = 신용 리스크 증가" />
        {creditLoading
          ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={{ height: 84, borderRadius: 12, background: 'var(--bg-card)' }} />
              ))}
            </div>
          )
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              <StatCard label="하이일드 OAS" value={credit.hyVal} change={credit.hyChg} unit="bp" invertColor />
              <StatCard label="BBB OAS"      value={credit.igVal} change={credit.igChg} unit="bp" invertColor />
              <StatCard label="VIX 공포지수" value={credit.vix}   change={credit.vixChg} unit="" invertColor />
            </div>
          )
        }
        <p style={{ margin: '8px 0 0', fontSize: 10, color: 'var(--text-muted)' }}>
          OAS: FRED (12시간 캐시) · VIX: Yahoo Finance (5분 캐시) · bp = basis points
        </p>
      </section>
    </div>
  )
}
