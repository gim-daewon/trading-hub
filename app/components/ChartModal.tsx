'use client'
import { useEffect, useRef, useState } from 'react'

interface Candle { date: string; close: number }

const RANGES = [
  { label: '1주', value: '5d' },
  { label: '1달', value: '1mo' },
  { label: '3달', value: '3mo' },
  { label: '6달', value: '6mo' },
  { label: '1년', value: '1y' },
]

function LineChart({ candles, color }: { candles: Candle[]; color: string }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<{ x: number; y: number; price: number; date: string } | null>(null)

  if (candles.length === 0) {
    return (
      <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
        데이터 없음
      </div>
    )
  }

  const W = 600, H = 200
  const PAD = { top: 20, right: 16, bottom: 28, left: 8 }
  const prices = candles.map(c => c.close)
  const minP = Math.min(...prices)
  const maxP = Math.max(...prices)
  const priceRange = maxP - minP || 1

  const toX = (i: number) => PAD.left + (i / Math.max(candles.length - 1, 1)) * (W - PAD.left - PAD.right)
  const toY = (p: number) => PAD.top + (1 - (p - minP) / priceRange) * (H - PAD.top - PAD.bottom)

  const points = candles.map((c, i) => `${toX(i)},${toY(c.close)}`).join(' ')
  const areaPoints = `${toX(0)},${H - PAD.bottom} ${points} ${toX(candles.length - 1)},${H - PAD.bottom}`

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    const idx = Math.round(((px - PAD.left) / (W - PAD.left - PAD.right)) * (candles.length - 1))
    const i = Math.max(0, Math.min(candles.length - 1, idx))
    setHover({ x: toX(i), y: toY(candles[i].close), price: candles[i].close, date: candles[i].date })
  }

  const fmt = (p: number) => p.toLocaleString('en-US', { maximumFractionDigits: 2 })

  return (
    <div style={{ position: 'relative' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 200, cursor: 'crosshair', display: 'block' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* area fill */}
        <polygon points={areaPoints} fill="url(#cg)" />
        {/* line */}
        <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />

        {/* crosshair */}
        {hover && (
          <>
            <line x1={hover.x} y1={PAD.top} x2={hover.x} y2={H - PAD.bottom}
              stroke="#ffffff20" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={hover.x} cy={hover.y} r="3.5" fill={color} />
          </>
        )}

        {/* min / max axis labels */}
        <text x={PAD.left + 2} y={PAD.top - 4} fontSize="9" fill="#475569" fontFamily="monospace">
          {fmt(maxP)}
        </text>
        <text x={PAD.left + 2} y={H - PAD.bottom + 14} fontSize="9" fill="#475569" fontFamily="monospace">
          {fmt(minP)}
        </text>

        {/* first / last date */}
        {candles.length > 1 && (
          <>
            <text x={PAD.left} y={H - 2} fontSize="9" fill="#334155" fontFamily="monospace">
              {candles[0].date}
            </text>
            <text x={W - PAD.right} y={H - 2} fontSize="9" fill="#334155" fontFamily="monospace" textAnchor="end">
              {candles[candles.length - 1].date}
            </text>
          </>
        )}
      </svg>

      {/* hover tooltip */}
      {hover && (
        <div style={{
          position: 'absolute', top: 6, right: 6,
          background: 'var(--bg-hover)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '4px 10px', fontSize: 11,
          pointerEvents: 'none', fontFamily: 'var(--font-mono)',
          display: 'flex', gap: 8,
        }}>
          <span style={{ color: 'var(--text-muted)' }}>{hover.date}</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{fmt(hover.price)}</span>
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

interface Props extends ChartTarget {
  onClose: () => void
}

export default function ChartModal({ symbol, label, price, changePct, onClose }: Props) {
  const [range, setRange] = useState('3mo')
  const [candles, setCandles] = useState<Candle[]>([])
  const [loading, setLoading] = useState(true)

  const isUp = changePct >= 0
  const color = isUp ? '#22c55e' : '#ef4444'

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setCandles([])
    fetch(`/api/history?symbol=${encodeURIComponent(symbol)}&range=${range}`)
      .then(r => r.json())
      .then(j => { if (!cancelled) { setCandles(j.candles ?? []); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [symbol, range])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const fmtPrice = (p: number) =>
    symbol === '^VIX' ? p.toFixed(2) : p.toLocaleString('en-US', { maximumFractionDigits: 0 })

  return (
    <>
      {/* backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: '#00000088', backdropFilter: 'blur(4px)', zIndex: 100 }}
      />

      {/* modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(640px, calc(100vw - 32px))',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        zIndex: 101,
        overflow: 'hidden',
      }}>
        {/* header */}
        <div style={{
          padding: '16px 20px 12px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
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
            <button
              onClick={onClose}
              style={{
                width: 28, height: 28, borderRadius: 6,
                background: 'var(--bg-hover)', border: '1px solid var(--border)',
                color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >✕</button>
          </div>
        </div>

        {/* range buttons */}
        <div style={{ display: 'flex', gap: 4, padding: '12px 20px 4px' }}>
          {RANGES.map(r => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              style={{
                padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12,
                background: range === r.value ? 'var(--info)' : 'var(--bg-hover)',
                color: range === r.value ? '#fff' : 'var(--text-muted)',
                fontWeight: range === r.value ? 600 : 400,
                transition: 'background 120ms',
              }}
            >{r.label}</button>
          ))}
        </div>

        {/* chart */}
        <div style={{ padding: '4px 20px 20px' }}>
          {loading
            ? <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>로딩 중...</div>
            : <LineChart candles={candles} color={color} />
          }
        </div>
      </div>
    </>
  )
}
