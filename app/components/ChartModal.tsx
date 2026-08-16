'use client'
import { useEffect, useState } from 'react'
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
  const [hover, setHover] = useState<(Candle & { cx: number }) | null>(null)

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

  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 240, display: 'block', cursor: 'crosshair' }}
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
            <g
              key={c.date}
              onMouseEnter={() => setHover({ ...c, cx: x })}
              onMouseLeave={() => setHover(null)}
            >
              {/* wick */}
              <line x1={x} y1={toY(c.high)} x2={x} y2={toY(c.low)} stroke={color} strokeWidth="1" />
              {/* body */}
              <rect x={x - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH} fill={color} />
              {/* hover target */}
              <rect x={x - step / 2} y={PAD.top} width={step} height={chartH} fill="transparent" />
            </g>
          )
        })}

        {/* crosshair */}
        {hover && (
          <line
            x1={hover.cx} y1={PAD.top} x2={hover.cx} y2={H - PAD.bottom}
            stroke="#ffffff18" strokeWidth="1" strokeDasharray="3 3"
          />
        )}

        {/* price axis */}
        <text x={PAD.left + 2} y={PAD.top - 6} fontSize="9" fill="#475569" fontFamily="monospace">
          {fmt(rawMax)}
        </text>
        <text x={PAD.left + 2} y={H - PAD.bottom + 14} fontSize="9" fill="#475569" fontFamily="monospace">
          {fmt(rawMin)}
        </text>

        {/* date axis */}
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

      {/* OHLC tooltip */}
      {hover && (
        <div style={{
          position: 'absolute', top: 6, left: 6,
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '6px 10px',
          pointerEvents: 'none', fontFamily: 'var(--font-mono)', fontSize: 11,
        }}>
          <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{hover.date}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '1px 10px' }}>
            {[
              { k: 'O', v: hover.open,  color: hover.close >= hover.open ? '#22c55e' : '#ef4444' },
              { k: 'H', v: hover.high,  color: 'var(--text-primary)' },
              { k: 'L', v: hover.low,   color: 'var(--text-primary)' },
              { k: 'C', v: hover.close, color: hover.close >= hover.open ? '#22c55e' : '#ef4444', bold: true },
            ].map(({ k, v, color, bold }) => (
              <>
                <span key={k + 'k'} style={{ color: 'var(--text-muted)' }}>{k}</span>
                <span key={k + 'v'} style={{ color, fontWeight: bold ? 700 : 400 }}>{fmt(v)}</span>
              </>
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

      {/* modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(660px, calc(100vw - 32px))',
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 16, zIndex: 101, overflow: 'hidden',
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
            <button onClick={onClose} style={{
              width: 28, height: 28, borderRadius: 6,
              background: 'var(--bg-hover)', border: '1px solid var(--border)',
              color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>✕</button>
          </div>
        </div>

        {/* range */}
        <div style={{ display: 'flex', gap: 4, padding: '12px 20px 4px' }}>
          {RANGES.map(r => (
            <button key={r.value} onClick={() => setRange(r.value)} style={{
              padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12,
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
