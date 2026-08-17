'use client'
import { useEffect, useState } from 'react'
import { getEarningsAssets } from '@/lib/registry'
import type { EarningsData } from '@/app/api/earnings/route'

interface EarningsRow extends EarningsData {
  label: string
  daysUntil: number | null
}

function daysFrom(dateStr: string | null): number | null {
  if (!dateStr) return null
  const diff = new Date(dateStr).getTime() - new Date().setHours(0, 0, 0, 0)
  return Math.round(diff / 86400000)
}

function DdayBadge({ days }: { days: number | null }) {
  if (days === null) return <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>
  const isToday  = days === 0
  const isPast   = days < 0
  const isSoon   = days <= 7 && days >= 0
  const bg = isToday ? '#f59e0b' : isPast ? 'var(--bg-base)' : isSoon ? '#ef4444' : 'var(--bg-base)'
  const color = isToday ? '#000' : isPast ? 'var(--text-muted)' : isSoon ? '#fff' : 'var(--text-secondary)'
  const label = isToday ? 'D-DAY' : `D${days > 0 ? '-' : '+'}${Math.abs(days)}`
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      fontSize: 11, fontWeight: 700, fontFamily: 'monospace',
      background: bg, color,
      border: isPast ? '1px solid var(--border)' : 'none',
    }}>{label}</span>
  )
}

function BeatMiss({ actual, estimate }: { actual: number | null; estimate: number | null }) {
  if (actual === null || estimate === null) return null
  const beat = actual >= estimate
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
      background: beat ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
      color: beat ? '#22c55e' : '#ef4444',
    }}>
      {beat ? '▲ BEAT' : '▼ MISS'}
    </span>
  )
}

function fmtRevenue(v: number | null): string {
  if (v === null) return '—'
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(0)}M`
  return `$${v.toFixed(0)}`
}

function fmtDate(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function EarningsCard({ row }: { row: EarningsRow }) {
  const isPast = row.daysUntil !== null && row.daysUntil < 0
  const beatDelta = row.lastActual !== null && row.lastEstimate !== null
    ? row.lastActual - row.lastEstimate : null

  return (
    <div className="card" style={{
      padding: '14px 16px',
      opacity: isPast ? 0.55 : 1,
      borderLeft: row.daysUntil !== null && row.daysUntil <= 7 && row.daysUntil >= 0
        ? '3px solid #ef4444' : '3px solid transparent',
    }}>
      {/* header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 800, fontFamily: 'monospace' }}>{row.symbol}</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.label}</span>
        </div>
        <DdayBadge days={row.daysUntil} />
      </div>

      {/* date + estimates */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
        <div>
          <p style={{ margin: 0, fontSize: 9.5, color: 'var(--text-muted)', marginBottom: 3 }}>실적 발표일</p>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, fontFamily: 'monospace' }}>
            {fmtDate(row.nextDate)}
          </p>
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 9.5, color: 'var(--text-muted)', marginBottom: 3 }}>EPS 예상</p>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, fontFamily: 'monospace' }}>
            {row.epsEstimate !== null ? `$${row.epsEstimate.toFixed(2)}` : '—'}
          </p>
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 9.5, color: 'var(--text-muted)', marginBottom: 3 }}>매출 예상</p>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, fontFamily: 'monospace' }}>
            {fmtRevenue(row.revenueEstimate)}
          </p>
        </div>
      </div>

      {/* previous quarter */}
      {row.lastQuarter && (
        <div style={{
          borderTop: '1px solid var(--border)', paddingTop: 8,
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>전분기 {row.lastQuarter}</span>
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
            실적 <strong style={{ color: 'var(--text-primary)' }}>
              {row.lastActual !== null ? `$${row.lastActual.toFixed(2)}` : '—'}
            </strong>
            {row.lastEstimate !== null && (
              <> / 예상 ${row.lastEstimate.toFixed(2)}</>
            )}
          </span>
          <BeatMiss actual={row.lastActual} estimate={row.lastEstimate} />
          {beatDelta !== null && (
            <span style={{
              fontSize: 10, fontFamily: 'monospace',
              color: beatDelta >= 0 ? '#22c55e' : '#ef4444',
            }}>
              ({beatDelta >= 0 ? '+' : ''}{beatDelta.toFixed(2)})
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function LoadingCard() {
  return (
    <div style={{ height: 110, borderRadius: 12, background: 'var(--bg-card)', animation: 'pulse 1.4s ease infinite' }} />
  )
}

export default function EarningsPage() {
  const [rows, setRows] = useState<EarningsRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const assets = getEarningsAssets()
    Promise.all(
      assets.map(a =>
        fetch(`/api/earnings?symbol=${a.id}`)
          .then(r => r.json())
          .then((d: EarningsData) => ({
            ...d,
            label: a.label,
            daysUntil: daysFrom(d.nextDate),
          }))
          .catch((): EarningsRow => ({
            symbol: a.id, label: a.label,
            nextDate: null, epsEstimate: null, revenueEstimate: null,
            lastQuarter: null, lastActual: null, lastEstimate: null,
            daysUntil: null,
          }))
      )
    ).then(results => {
      // sort: upcoming first (nearest), then past (most recent), then unknown
      const sorted = [...results].sort((a, b) => {
        if (a.daysUntil === null && b.daysUntil === null) return 0
        if (a.daysUntil === null) return 1
        if (b.daysUntil === null) return -1
        const af = a.daysUntil >= 0, bf = b.daysUntil >= 0
        if (af && bf) return a.daysUntil - b.daysUntil   // upcoming: nearest first
        if (!af && !bf) return b.daysUntil - a.daysUntil // past: most recent first
        return af ? -1 : 1                                // upcoming before past
      })
      setRows(sorted)
    }).finally(() => setLoading(false))
  }, [])

  return (
    <div style={{ padding: '16px', maxWidth: 700, margin: '0 auto' }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>실적 캘린더</h1>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
          D-7 이내 빨간 테두리 · 전분기 Beat/Miss 표시
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading
          ? Array.from({ length: 8 }).map((_, i) => <LoadingCard key={i} />)
          : rows.map(r => <EarningsCard key={r.symbol} row={r} />)
        }
      </div>

      <p style={{ marginTop: 12, fontSize: 10, color: 'var(--text-muted)' }}>
        Yahoo Finance · 1시간 캐시 · EPS는 Non-GAAP 기준
      </p>
    </div>
  )
}
