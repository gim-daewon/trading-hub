'use client'
import { useState } from 'react'
import ChartModal from './ChartModal'
import { fmtAssetPrice } from '@/lib/format'

interface Props {
  symbol: string
  label: string
  price: number
  changePct: number
  noChart?: boolean
}

export default function IndexCard({ symbol, label, price, changePct, noChart }: Props) {
  const [open, setOpen] = useState(false)

  const pct  = changePct ?? 0
  const isUp = pct > 0
  const cls  = isUp ? 'up' : pct < 0 ? 'down' : 'flat'

  const fmtPrice = (p: number | null | undefined) => fmtAssetPrice(symbol, p)

  return (
    <>
      <div
        className={`card ${noChart ? '' : 'card-interactive'}`}
        style={{ padding: '12px 14px' }}
        onClick={() => { if (!noChart) setOpen(true) }}
      >
        <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>{label}</p>
        <p className="num" style={{ margin: '4px 0 2px', fontSize: 20, fontWeight: 700 }}>
          {fmtPrice(price)}
        </p>
        <span className={`num ${cls}`} style={{ fontSize: 13 }}>
          {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
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
