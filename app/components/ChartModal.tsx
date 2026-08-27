'use client'
import { Fragment, useEffect, useState } from 'react'
import { fmtAssetPrice } from '@/lib/format'

interface Candle { date: string; open: number; high: number; low: number; close: number }

const RANGES = [
  { label: '1주', value: '5d' },
  { label: '1달', value: '1mo' },
  { label: '3달', value: '3mo' },
  { label: '6달', value: '6mo' },
  { label: '1년', value: '1y' },
]

function CandleChart({ candles }: { candles: Candle[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  if (candles.length === 0) {
    return (
      <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
        데이터 없음
      </div>
    )
  }

  const W = 600, H = 240
  const PAD = { top: 24, right: 16, bottom: 28, left: 8 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const allPrices = candles.flatMap(c => [c.high, c.low])
  const rawMin = Math.min(...allPrices)
  const rawMax = Math.max(...allPrices)
  const pad5pct = (rawMax - rawMin) * 0.05
  const minP = rawMin - pad5pct
  const maxP = rawMax + pad5pct
  const priceRange = maxP - minP || 1

  const toY = (p: number) => PAD.top + (1 - (p - minP) / priceRange) * chartH

  const n = candles.length
  const step = chartW / n
  const bodyW = Math.max(1, step * 0.65)
  const toX = (i: number) => PAD.left + i * step + step / 2

  const fmt = (p: number) => p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const hover = hoverIdx !== null ? candles[hoverIdx] : null
  const hoverX = hoverIdx !== null ? toX(hoverIdx) : 0

  // 마우스·터치 공용. clientX를 viewBox 좌표로 환산해 캔들 인덱스를 역산한다
  const scrub = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    if (rect.width === 0) return
    const vx = ((e.clientX - rect.left) / rect.width) * W
    const i = Math.floor((vx - PAD.left) / step)
    setHoverIdx(i >= 0 && i < n ? i : null)
  }

  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 240, display: 'block', cursor: 'crosshair', touchAction: 'pan-y' }}
        onPointerDown={scrub}
        onPointerMove={e => { if (e.pointerType === 'mouse' || e.buttons > 0) scrub(e) }}
        onPointerLeave={() => setHoverIdx(null)}
        onPointerUp={e => { if (e.pointerType !== 'mouse') setHoverIdx(null) }}
      >
        {/* grid */}
        {[0.25, 0.5, 0.75].map(t => (
          <line key={t}
            x1={PAD.left} y1={PAD.top + t * chartH}
            x2={W - PAD.right} y2={PAD.top + t * chartH}
            stroke="#1e293b" strokeWidth="1"
          />
        ))}

        {/* candles */}
        {candles.map((c, i) => {
          const x = toX(i)
          const isUp = c.close >= c.open
          const color = isUp ? '#22c55e' : '#ef4444'
          const bodyTop = toY(Math.max(c.open, c.close))
          const bodyBot = toY(Math.min(c.open, c.close))
          const bodyH = Math.max(1, bodyBot - bodyTop)

          return (
            <g key={c.date}>
              {/* wick */}
              <line x1={x} y1={toY(c.high)} x2={x} y2={toY(c.low)} stroke={color} strokeWidth="1" />
              {/* body */}
              <rect x={x - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH} fill={color} />
            </g>
          )
        })}

        {/* crosshair */}
        {hover && (
          <line
            x1={hoverX} y1={PAD.top} x2={hoverX} y2={H - PAD.bottom}
            stroke="#ffffff30" strokeWidth="1.5" strokeDasharray="3 3"
          />
        )}

        {/* price axis */}
        <text x={PAD.left + 2} y={PAD.top - 8} fontSize="15" fill="#64748b" fontFamily="monospace">
          {fmt(rawMax)}
        </text>
        <text x={PAD.left + 2} y={H - PAD.bottom + 18} fontSize="15" fill="#64748b" fontFamily="monospace">
          {fmt(rawMin)}
        </text>

        {/* date axis */}
        {candles.length > 1 && (
          <>
            <text x={PAD.left} y={H - 2} fontSize="14" fill="#475569" fontFamily="monospace">
              {candles[0].date}
            </text>
            <text x={W - PAD.right} y={H - 2} fontSize="14" fill="#475569" fontFamily="monospace" textAnchor="end">
              {candles[candles.length - 1].date}
            </text>
          </>
        )}
      </svg>

      {/* OHLC tooltip */}
      {hover && (
        <div style={{
          position: 'absolute', top: 6,
          // 스크럽 위치 반대편에 붙여 손가락에 가리지 않게 한다
          ...(hoverX > W / 2 ? { left: 6 } : { right: 6 }),
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '6px 10px',
          pointerEvents: 'none', fontFamily: 'var(--font-mono)', fontSize: 12,
        }}>
          <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{hover.date}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '1px 10px' }}>
            {[
              { k: 'O', v: hover.open,  color: hover.close >= hover.open ? '#22c55e' : '#ef4444' },
              { k: 'H', v: hover.high,  color: 'var(--text-primary)' },
              { k: 'L', v: hover.low,   color: 'var(--text-primary)' },
              { k: 'C', v: hover.close, color: hover.close >= hover.open ? '#22c55e' : '#ef4444', bold: true },
            ].map(({ k, v, color, bold }) => (
              <Fragment key={k}>
                <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                <span style={{ color, fontWeight: bold ? 700 : 400 }}>{fmt(v)}</span>
              </Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export interface ChartTarget {
  symbol: string
  label: string
  price: number
  changePct: number
}

interface Props extends ChartTarget { onClose: () => void }

export default function ChartModal({ symbol, label, price, changePct, onClose }: Props) {
  const [range, setRange]   = useState('3mo')
  const [candles, setCandles] = useState<Candle[]>([])
  const [loading, setLoading] = useState(true)
  const [errMsg, setErrMsg]   = useState('')

  const isUp = changePct >= 0

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setCandles([])
    setErrMsg('')
    fetch(`/api/history?symbol=${encodeURIComponent(symbol)}&range=${range}`)
      .then(r => r.json())
      .then(j => {
        if (cancelled) return
        if (j.error && !j.candles?.length) setErrMsg(j.error)
        setCandles(j.candles ?? [])
        setLoading(false)
      })
      .catch(e => { if (!cancelled) { setErrMsg(String(e)); setLoading(false) } })
    return () => { cancelled = true }
  }, [symbol, range])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const fmtPrice = (p: number) => fmtAssetPrice(symbol, p)

  return (
    <>
      {/* backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: '#00000088', backdropFilter: 'blur(4px)', zIndex: 100 }} />

      {/* modal — 데스크톱은 중앙, 모바일은 하단 시트 (chart-modal 클래스) */}
      <div className="chart-modal" style={{
        position: 'fixed', zIndex: 101, overflowY: 'auto',
        background: 'var(--bg-card)', border: '1px solid var(--border)',
      }}>
        {/* header */}
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{symbol}</p>
            <p style={{ margin: '2px 0 0', fontSize: 18, fontWeight: 800 }}>{label}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ textAlign: 'right' }}>
              <p className="num" style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{fmtPrice(price)}</p>
              <span className={`num ${isUp ? 'up' : 'down'}`} style={{ fontSize: 13 }}>
                {isUp ? '+' : ''}{changePct.toFixed(2)}%
              </span>
            </div>
            <button onClick={onClose} aria-label="닫기" style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              background: 'var(--bg-hover)', border: '1px solid var(--border)',
              color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>✕</button>
          </div>
        </div>

        {/* range */}
        <div style={{ display: 'flex', gap: 6, padding: '12px 20px 4px' }}>
          {RANGES.map(r => (
            <button key={r.value} onClick={() => setRange(r.value)} style={{
              flex: 1, minHeight: 40, borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13,
              background: range === r.value ? 'var(--info)' : 'var(--bg-hover)',
              color: range === r.value ? '#fff' : 'var(--text-muted)',
              fontWeight: range === r.value ? 600 : 400,
              transition: 'background 120ms',
            }}>{r.label}</button>
          ))}
        </div>

        {/* chart */}
        <div style={{ padding: '4px 20px 20px' }}>
          {loading
            ? <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>로딩 중...</div>
            : errMsg
              ? <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--down)', fontSize: 12 }}>{errMsg}</div>
              : <CandleChart candles={candles} />
          }
        </div>
      </div>
    </>
  )
}
