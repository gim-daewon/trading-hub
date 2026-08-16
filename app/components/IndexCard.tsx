'use client'
import { useState } from 'react'
import ChartModal from './ChartModal'

interface Props {
  symbol: string
  label: string
  price: number
  changePct: number
}

export default function IndexCard({ symbol, label, price, changePct }: Props) {
  const [open, setOpen] = useState(false)

  const isUp = changePct > 0
  const cls  = isUp ? 'up' : changePct < 0 ? 'down' : 'flat'

  const fmtPrice = (p: number) =>
    symbol === '^VIX'
      ? p.toFixed(2)
      : p.toLocaleString('en-US', { maximumFractionDigits: 0 })

  return (
    <>
      <div
        className="card card-interactive"
        style={{ padding: '12px 14px' }}
        onClick={() => setOpen(true)}
      >
        <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>{label}</p>
        <p className="num" style={{ margin: '4px 0 2px', fontSize: 20, fontWeight: 700 }}>
          {fmtPrice(price)}
        </p>
        <span className={`num ${cls}`} style={{ fontSize: 13 }}>
          {changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%
        </span>
      </div>

      {open && (
        <ChartModal
          symbol={symbol}
          label={label}
          price={price}
          changePct={changePct}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
