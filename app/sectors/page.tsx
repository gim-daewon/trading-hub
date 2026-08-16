'use client'
import { useEffect, useState, useCallback } from 'react'

interface SectorData {
  id: string
  label: string
  etf: string
  color: string
  price: number | null
  change: number | null
  changePct: number | null
  rs1d: number | null
  ts: number
}

interface SpyData { price: number; changePct: number }

type SortKey = 'changePct' | 'rs1d' | 'label'
type ViewMode = 'heatmap' | 'table'
type Period   = '1D' | '1W' | '1M'

function heatColor(pct: number | null): string {
  if (pct === null) return '#1e293b'
  if (pct >  3)  return '#14532d'
  if (pct >  1.5) return '#166534'
  if (pct >  0.5) return '#15803d'
  if (pct >  0)   return '#1a3d2b'
  if (pct > -0.5) return '#2d1a1a'
  if (pct > -1.5) return '#7f1d1d'
  if (pct > -3)   return '#991b1b'
  return '#6b0000'
}

function pctLabel(v: number | null, decimals = 2): string {
  if (v === null) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(decimals)}%`
}

function PctBadge({ v }: { v: number | null }) {
  if (v === null) return <span className="flat">—</span>
  const cls = v > 0 ? 'up' : v < 0 ? 'down' : 'flat'
  return <span className={`num ${cls}`}>{pctLabel(v)}</span>
}

function RsBadge({ v }: { v: number | null }) {
  if (v === null) return <span className="flat">—</span>
  const cls = v > 0 ? 'up' : v < 0 ? 'down' : 'flat'
  const sign = v >= 0 ? '+' : ''
  return <span className={`num ${cls}`}>{sign}{v.toFixed(2)}pp</span>
}

export default function SectorsPage() {
  const [sectors, setSectors]   = useState<SectorData[]>([])
  const [spy, setSpy]           = useState<SpyData | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<number | null>(null)
  const [view, setView]         = useState<ViewMode>('heatmap')
  const [sort, setSort]         = useState<SortKey>('changePct')
  const [period, setPeriod]     = useState<Period>('1D')
  const [selected, setSelected] = useState<SectorData | null>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/sectors')
      if (!res.ok) throw new Error('API 오류')
      const json = await res.json()
      setSectors(json.sectors ?? [])
      setSpy(json.spy ?? null)
      setFetchedAt(json.fetchedAt)
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오기 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // 5분 자동 새로고침
  useEffect(() => {
    const t = setInterval(load, 300_000)
    return () => clearInterval(t)
  }, [load])

  const sorted = [...sectors].sort((a, b) => {
    if (sort === 'label') return a.label.localeCompare(b.label, 'ko')
    const aVal = sort === 'rs1d' ? (a.rs1d ?? -999) : (a.changePct ?? -999)
    const bVal = sort === 'rs1d' ? (b.rs1d ?? -999) : (b.changePct ?? -999)
    return bVal - aVal
  })

  const timeStr = fetchedAt
    ? new Date(fetchedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div style={{ padding: '16px', maxWidth: 900, margin: '0 auto' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>섹터 자금 흐름</h1>
          {spy && (
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
              SPY <span className="num" style={{ color: spy.changePct >= 0 ? 'var(--up)' : 'var(--down)' }}>
                {pctLabel(spy.changePct)}
              </span>
              {timeStr && <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>기준 {timeStr}</span>}
            </p>
          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            color: 'var(--text-secondary)', borderRadius: 8, padding: '6px 12px',
            fontSize: 12, cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? '로딩...' : '새로고침'}
        </button>
      </div>

      {/* 뷰/정렬 토글 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {(['heatmap', 'table'] as ViewMode[]).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              padding: '4px 14px', borderRadius: 20, fontSize: 12, border: '1px solid var(--border)',
              background: view === v ? 'var(--info)' : 'var(--bg-card)',
              color: view === v ? '#fff' : 'var(--text-secondary)', cursor: 'pointer',
            }}
          >
            {v === 'heatmap' ? '히트맵' : '테이블'}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {(['changePct', 'rs1d', 'label'] as SortKey[]).map(k => (
          <button
            key={k}
            onClick={() => setSort(k)}
            style={{
              padding: '4px 12px', borderRadius: 20, fontSize: 11, border: '1px solid var(--border)',
              background: sort === k ? 'var(--bg-hover)' : 'var(--bg-card)',
              color: sort === k ? 'var(--text-primary)' : 'var(--text-muted)', cursor: 'pointer',
            }}
          >
            {k === 'changePct' ? '등락률' : k === 'rs1d' ? 'vs SPY' : '이름'}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ background: '#7f1d1d22', border: '1px solid #dc2626', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: 'var(--down)', fontSize: 13 }}>
          {error} — <button onClick={load} style={{ color: 'var(--info)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>재시도</button>
        </div>
      )}

      {/* ── 히트맵 뷰 ── */}
      {view === 'heatmap' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: 8,
        }}>
          {loading
            ? Array.from({ length: 30 }).map((_, i) => (
                <div key={i} style={{ height: 100, borderRadius: 8, background: 'var(--bg-card)', animation: 'pulse 1.5s infinite' }} />
              ))
            : sorted.map(s => (
                <div
                  key={s.id}
                  className="heat-cell"
                  style={{ background: heatColor(s.changePct), minHeight: 100 }}
                  onClick={() => setSelected(selected?.id === s.id ? null : s)}
                >
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', letterSpacing: '0.02em' }}>
                    {s.etf}
                  </span>
                  <span style={{ fontSize: 12, color: '#ffffffbb' }}>{s.label}</span>
                  <span className="num" style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginTop: 4 }}>
                    {pctLabel(s.changePct, 1)}
                  </span>
                  {s.rs1d !== null && (
                    <span style={{ fontSize: 11, color: '#ffffff88' }}>
                      vs SPY {s.rs1d >= 0 ? '+' : ''}{s.rs1d.toFixed(1)}pp
                    </span>
                  )}
                </div>
              ))
          }
        </div>
      )}

      {/* ── 테이블 뷰 ── */}
      {view === 'table' && (
        <div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 12 }}>
                <th style={{ textAlign: 'left',  padding: '6px 8px' }}>섹터</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>ETF</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>가격</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>1D</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 30 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      {Array.from({ length: 4 }).map((_, j) => (
                        <td key={j} style={{ padding: '10px 8px' }}>
                          <div style={{ height: 14, borderRadius: 4, background: 'var(--bg-card)' }} />
                        </td>
                      ))}
                    </tr>
                  ))
                : sorted.map(s => (
                    <tr
                      key={s.id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: selected?.id === s.id ? 'var(--bg-hover)' : 'transparent',
                        cursor: 'pointer',
                      }}
                      onClick={() => setSelected(selected?.id === s.id ? null : s)}
                    >
                      <td style={{ padding: '10px 8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                          {s.label}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', padding: '10px 8px', color: 'var(--text-secondary)' }} className="num">
                        {s.etf}
                      </td>
                      <td style={{ textAlign: 'right', padding: '10px 8px' }} className="num">
                        {s.price ? `$${s.price.toFixed(2)}` : '—'}
                      </td>
                      <td style={{ textAlign: 'right', padding: '10px 8px' }}>
                        <PctBadge v={s.changePct} />
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
      )}

      {/* ── 선택된 섹터 상세 ── */}
      {selected && (
        <div className="card" style={{ marginTop: 16, padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>{selected.etf}</p>
              <h2 style={{ margin: '2px 0 8px', fontSize: 18, fontWeight: 700 }}>{selected.label}</h2>
            </div>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {[
              { label: '현재가',    v: selected.price ? `$${selected.price.toFixed(2)}` : '—' },
              { label: '1D 등락',  v: <PctBadge v={selected.changePct} /> },
              { label: 'vs SPY',   v: <RsBadge v={selected.rs1d} /> },
            ].map(item => (
              <div key={item.label} style={{ background: 'var(--bg-surface)', borderRadius: 8, padding: '10px 12px' }}>
                <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)' }}>{item.label}</p>
                <p className="num" style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 700 }}>{item.v}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 범례 */}
      {view === 'heatmap' && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>강도:</span>
          {[
            { label: '+3%↑', bg: '#14532d' },
            { label: '+1%',  bg: '#15803d' },
            { label: '보합', bg: '#1a3d2b' },
            { label: '-1%',  bg: '#7f1d1d' },
            { label: '-3%↓', bg: '#6b0000' },
          ].map(c => (
            <span key={c.label} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 10, color: 'var(--text-muted)',
            }}>
              <span style={{ width: 12, height: 12, borderRadius: 2, background: c.bg, display: 'inline-block' }} />
              {c.label}
            </span>
          ))}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1 }
          50% { opacity: 0.4 }
        }
      `}</style>
    </div>
  )
}
