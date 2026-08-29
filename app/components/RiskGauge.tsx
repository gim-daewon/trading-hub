'use client'
import { useEffect, useState } from 'react'

type Level = 'ok' | 'warn' | 'alert'
interface Signal { id: string; label: string; level: Level; value: string; detail: string }
interface RiskData {
  signals: Signal[]
  alerts: number; warns: number; total: number
  headline: string
  fetchedAt: number
}

const DOT: Record<Level, string> = {
  ok:    'var(--flat)',
  warn:  'var(--warn)',
  alert: 'var(--down)',
}

export default function RiskGauge({ compact = false }: { compact?: boolean }) {
  const [d, setD] = useState<RiskData | null>(null)
  const [open, setOpen] = useState(!compact)

  useEffect(() => {
    fetch('/api/risk').then(r => r.json()).then(j => { if (!j.error) setD(j) }).catch(() => {})
  }, [])

  if (!d) return <div style={{ height: compact ? 56 : 120, borderRadius: 12, background: 'var(--bg-card)' }} />

  const lit = d.alerts * 2 + d.warns
  const max = d.total * 2
  const tone = d.alerts >= 2 ? 'var(--down)' : d.alerts >= 1 || d.warns >= 3 ? 'var(--warn)' : 'var(--flat)'

  return (
    <div className="card" style={{ padding: '12px 14px' }}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          color: 'inherit', textAlign: 'left', minHeight: 32,
        }}
      >
        <div style={{ display: 'flex', gap: 3 }}>
          {d.signals.map(s => (
            <span key={s.id} title={s.label} style={{
              width: 9, height: 9, borderRadius: '50%', background: DOT[s.level],
              opacity: s.level === 'ok' ? 0.35 : 1,
            }} />
          ))}
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: tone }}>{d.headline}</span>
        <span className="num" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          경보 {d.alerts} · 주의 {d.warns} / {d.total}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {d.signals.map(s => (
            <div key={s.id} style={{
              display: 'grid', gridTemplateColumns: '10px 1fr auto',
              alignItems: 'center', gap: 9,
              padding: '7px 9px', borderRadius: 8, background: 'var(--bg-surface)',
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%', background: DOT[s.level],
                opacity: s.level === 'ok' ? 0.35 : 1,
              }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{s.label}</div>
                {s.detail && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.detail}
                  </div>
                )}
              </div>
              <span className="num" style={{
                fontSize: 12, fontWeight: 700,
                color: s.level === 'ok' ? 'var(--text-secondary)' : DOT[s.level],
              }}>{s.value}</span>
            </div>
          ))}
          <p style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            현재 상태를 보여줄 뿐 매수·매도 판단은 하지 않는다. 2026-08-28처럼 지수는 −0.25%인데
            개별종목 20%가 −3% 이하로 빠지는 날은 지수만 봐서는 안 보인다.
          </p>
        </div>
      )}
    </div>
  )
}
