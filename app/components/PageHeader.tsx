'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { usMarketStatus, type MarketPhase } from '@/lib/market-status'

const PHASE_COLOR: Record<MarketPhase, string> = {
  regular: 'var(--up)',
  pre:     'var(--warn)',
  after:   'var(--info)',
  closed:  'var(--text-muted)',
}

function MarketStatusPill() {
  // 시각 의존 렌더는 마운트 후에만 (hydration mismatch 방지)
  const [status, setStatus] = useState<ReturnType<typeof usMarketStatus> | null>(null)

  useEffect(() => {
    const tick = () => setStatus(usMarketStatus())
    tick()
    const t = setInterval(tick, 60_000)
    return () => clearInterval(t)
  }, [])

  if (!status) return null
  const color = PHASE_COLOR[status.phase]

  return (
    <span
      title="미 증시 · 공휴일 휴장 미반영"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {status.label}
      {status.until && <span style={{ color: 'var(--text-muted)' }}>{status.until}</span>}
    </span>
  )
}

interface Props {
  title: string
  sub?: ReactNode
  /** ISO 문자열 또는 epoch ms. 데이터 기준 시각 */
  fetchedAt?: string | number | null
  onRefresh?: () => void
  loading?: boolean
  /** 페이지 고유 컨트롤 (주차 네비, 필터 등) */
  right?: ReactNode
  showMarketStatus?: boolean
}

export default function PageHeader({
  title, sub, fetchedAt, onRefresh, loading, right, showMarketStatus = true,
}: Props) {
  const timeStr = fetchedAt
    ? new Date(fetchedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      gap: 12, flexWrap: 'wrap', marginBottom: 16,
    }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>{title}</h1>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          margin: '3px 0 0', fontSize: 12, color: 'var(--text-muted)',
        }}>
          {showMarketStatus && <MarketStatusPill />}
          {sub}
          {timeStr && <span>기준 {timeStr}</span>}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {right}
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={loading}
            aria-label="새로고침"
            style={{
              minHeight: 40, minWidth: 40, padding: '0 14px', borderRadius: 10,
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              color: 'var(--text-secondary)', fontSize: 13,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1,
            }}
          >
            {loading ? '···' : '새로고침'}
          </button>
        )}
      </div>
    </div>
  )
}
