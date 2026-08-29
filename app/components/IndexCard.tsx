'use client'
import { useState } from 'react'
import ChartModal from './ChartModal'
import { TvLink } from './TvLink'
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>{label}</p>
          {/* 카드 본문은 내장 차트를 열고, 이 아이콘은 트레이딩뷰로 보낸다 */}
          <TvLink symbol={symbol} style={{ border: 'none', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1 }}>
            <span aria-label="트레이딩뷰에서 열기">↗</span>
          </TvLink>
        </div>
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
          changePct={pct}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
