'use client'
import { useEffect, useState, useCallback } from 'react'
import PageHeader from '../components/PageHeader'

interface Holding {
  symbol: string
  name: string
  pct: number
  price: number | null
  changePct: number | null
}

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

type ViewMode = 'heatmap' | 'table'

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

interface ConstituentFlow {
  symbol: string; name: string; pct: number
  f5: number | null; f20: number | null; f60: number | null
  rvol: number | null; chg20: number | null
}
interface SectorFlow {
  etfFlow: { f20: number | null } | null
  weightedF20: number | null
  megaCapSkew: { symbol: string; pct: number; f20: number; othersAvg: number } | null
  inflow: number
  outflow: number
  constituents: ConstituentFlow[]
}

export default function SectorsPage() {
  const [sectors, setSectors]   = useState<SectorData[]>([])
  const [spy, setSpy]           = useState<SpyData | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<number | null>(null)
  const [view, setView]         = useState<ViewMode>('heatmap')
  const [selected, setSelected]     = useState<SectorData | null>(null)
  const [holdings, setHoldings]     = useState<Holding[]>([])
  const [holdLoading, setHoldLoad]  = useState(false)
  const [holdSource, setHoldSource] = useState<string>('static')
  const [flow, setFlow]             = useState<SectorFlow | null>(null)
  const [flowLoading, setFlowLoad]  = useState(false)

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

  // 섹터 클릭 시 ETF 구성종목 조회
  useEffect(() => {
    if (!selected) { setHoldings([]); return }
    setHoldLoad(true)
    fetch(`/api/etf-holdings?etf=${selected.etf}`)
      .then(r => r.json())
      .then(j => { setHoldings(j.holdings ?? []); setHoldSource(j.source ?? 'static') })
      .catch(() => { setHoldings([]); setHoldSource('static') })
      .finally(() => setHoldLoad(false))
  }, [selected])

  // 구성종목 자금 흐름 (10요청, 약 0.4초)
  useEffect(() => {
    if (!selected) { setFlow(null); return }
    setFlowLoad(true)
    fetch(`/api/sector-flow?etf=${selected.etf}`)
      .then(r => r.json())
      .then(j => setFlow(j.error ? null : j))
      .catch(() => setFlow(null))
      .finally(() => setFlowLoad(false))
  }, [selected])

  const sorted = [...sectors].sort((a, b) => (b.changePct ?? -999) - (a.changePct ?? -999))

  return (
    <>
    <div style={{ padding: '16px', maxWidth: 900, margin: '0 auto' }}>
      <PageHeader
        title="섹터 자금 흐름"
        fetchedAt={fetchedAt}
        onRefresh={load}
        loading={loading}
        sub={spy && (
          <span style={{ color: 'var(--text-secondary)' }}>
            SPY <span className="num" style={{ color: spy.changePct >= 0 ? 'var(--up)' : 'var(--down)' }}>
              {pctLabel(spy.changePct)}
            </span>
          </span>
        )}
      />

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
          gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
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
        @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }
      `}</style>
    </div>

    {/* ── 바텀시트: 섹터 상세 ── */}

    {selected && (
      <>
        {/* 백드롭 */}
        <div
          onClick={() => setSelected(null)}
          style={{
            position: 'fixed', inset: 0, background: '#00000066',
            backdropFilter: 'blur(2px)', zIndex: 200,
          }}
        />

        {/* 패널 */}
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: 'var(--bg-card)', borderTop: '1px solid var(--border)',
          borderRadius: '16px 16px 0 0',
          maxHeight: '70vh', overflowY: 'auto',
          zIndex: 201,
          animation: 'slideUp 220ms cubic-bezier(0.32, 0.72, 0, 1)',
          padding: '0 0 env(safe-area-inset-bottom)',
        }}>
          {/* 핸들 */}
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }} />
          </div>

          <div style={{ padding: '0 16px 24px' }}>
            {/* 헤더 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{selected.etf}</p>
                <h2 style={{ margin: '2px 0 0', fontSize: 20, fontWeight: 800 }}>{selected.label}</h2>
              </div>
              <button onClick={() => setSelected(null)} style={{
                width: 28, height: 28, borderRadius: 6,
                background: 'var(--bg-hover)', border: '1px solid var(--border)',
                color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>✕</button>
            </div>

            {/* 스탯 3개 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
              {[
                { label: '현재가',   v: selected.price ? `$${selected.price.toFixed(2)}` : '—' },
                { label: '1D 등락', v: <PctBadge v={selected.changePct} /> },
                { label: 'vs SPY',  v: <RsBadge v={selected.rs1d} /> },
              ].map(item => (
                <div key={item.label} style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: '10px 12px' }}>
                  <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>{item.label}</p>
                  <p className="num" style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 700 }}>{item.v}</p>
                </div>
              ))}
            </div>

            {/* 구성종목 자금 흐름 — ETF 거래량은 유통시장 손바뀜이라
                어느 종목에 돈이 갔는지 못 본다. 종목별로 내려가야 분화가 보인다. */}
            <div style={{ marginBottom: 16 }}>
              <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                구성종목 자금 흐름 · 20일
              </p>
              {flowLoading ? (
                <div style={{ height: 88, borderRadius: 8, background: 'var(--bg-surface)', opacity: 0.6, animation: 'pulse 1.5s infinite' }} />
              ) : !flow || flow.constituents.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>자금 데이터 없음</p>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 96, background: 'var(--bg-surface)', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>ETF 레벨</div>
                      <div className={`num ${(flow.etfFlow?.f20 ?? 0) >= 0 ? 'up' : 'down'}`} style={{ fontSize: 15, fontWeight: 700 }}>
                        {flow.etfFlow?.f20 == null ? '—' : `${flow.etfFlow.f20 >= 0 ? '+' : ''}${flow.etfFlow.f20.toFixed(0)}%`}
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 96, background: 'var(--bg-surface)', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>비중가중</div>
                      <div className={`num ${(flow.weightedF20 ?? 0) >= 0 ? 'up' : 'down'}`} style={{ fontSize: 15, fontWeight: 700 }}>
                        {flow.weightedF20 == null ? '—' : `${flow.weightedF20 >= 0 ? '+' : ''}${flow.weightedF20.toFixed(0)}%`}
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 96, background: 'var(--bg-surface)', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>유입 / 유출</div>
                      <div className="num" style={{ fontSize: 15, fontWeight: 700 }}>
                        <span className="up">{flow.inflow}</span>
                        <span style={{ color: 'var(--text-muted)' }}> / </span>
                        <span className="down">{flow.outflow}</span>
                      </div>
                    </div>
                  </div>

                  {flow.megaCapSkew && (
                    <div style={{
                      background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.3)',
                      borderRadius: 8, padding: '8px 10px', marginBottom: 8, fontSize: 11, color: 'var(--warn)',
                    }}>
                      대형주 왜곡 — 최대 비중 <b>{flow.megaCapSkew.symbol}</b>({(flow.megaCapSkew.pct * 100).toFixed(1)}%)가{' '}
                      {flow.megaCapSkew.f20 >= 0 ? '+' : ''}{flow.megaCapSkew.f20.toFixed(0)}%로
                      나머지 평균({flow.megaCapSkew.othersAvg >= 0 ? '+' : ''}{flow.megaCapSkew.othersAvg.toFixed(0)}%)과 방향이 반대다.
                      ETF 수치만 보면 가려진다.
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {flow.constituents.map(c => {
                      const w = Math.min(Math.abs(c.f20 ?? 0), 100)
                      const up = (c.f20 ?? 0) >= 0
                      return (
                        <div key={c.symbol} style={{
                          display: 'grid', gridTemplateColumns: '52px 40px 1fr 46px',
                          alignItems: 'center', gap: 8, padding: '5px 10px',
                          borderRadius: 6, background: 'var(--bg-surface)',
                        }}>
                          <span className="num" style={{ fontSize: 12, fontWeight: 700 }}>{c.symbol}</span>
                          <span className="num" style={{ fontSize: 10, color: 'var(--text-muted)' }}>{(c.pct * 100).toFixed(1)}%</span>
                          <span style={{ height: 5, borderRadius: 3, background: 'var(--bg-base)', overflow: 'hidden' }}>
                            <span style={{
                              display: 'block', height: '100%', width: `${w}%`,
                              background: up ? 'var(--up)' : 'var(--down)',
                              marginLeft: up ? 0 : `${100 - w}%`,
                            }} />
                          </span>
                          <span className={`num ${up ? 'up' : 'down'}`} style={{ fontSize: 11, textAlign: 'right' }}>
                            {c.f20 == null ? '—' : `${up ? '+' : ''}${c.f20.toFixed(0)}%`}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>

            {/* 구성종목 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                주요 구성종목 top 10
              </p>
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
                background: holdSource === 'ishares' ? 'rgba(34,197,94,0.15)' : 'rgba(100,116,139,0.15)',
                color:      holdSource === 'ishares' ? '#22c55e' : '#64748b',
              }}>
                {holdSource === 'ishares' ? 'iShares 실시간' : holdSource === 'yahoo' ? 'Yahoo' : '정적 데이터'}
              </span>
            </div>
            {holdLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} style={{ height: 32, borderRadius: 8, background: 'var(--bg-surface)', opacity: 0.6, animation: 'pulse 1.5s infinite' }} />
                ))}
              </div>
            ) : holdings.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>데이터 없음 (휴장일이거나 Yahoo 응답 없음)</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {holdings.slice(0, 10).map(h => {
                  const chgCls = h.changePct === null ? 'flat' : h.changePct > 0 ? 'up' : h.changePct < 0 ? 'down' : 'flat'
                  return (
                    <div key={h.symbol} style={{
                      display: 'grid', gridTemplateColumns: '52px 1fr auto auto auto',
                      alignItems: 'center', gap: 8,
                      padding: '7px 10px', borderRadius: 8, background: 'var(--bg-surface)',
                    }}>
                      <span className="num" style={{ fontSize: 13, fontWeight: 700 }}>{h.symbol}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</span>
                      <span className="num" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {h.price !== null ? `$${h.price.toFixed(h.price >= 100 ? 1 : 2)}` : '—'}
                      </span>
                      <span className={`num ${chgCls}`} style={{ fontSize: 11, minWidth: 52, textAlign: 'right' }}>
                        {h.changePct !== null ? `${h.changePct >= 0 ? '+' : ''}${h.changePct.toFixed(2)}%` : '—'}
                      </span>
                      <span className="num" style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 32, textAlign: 'right' }}>
                        {(h.pct * 100).toFixed(1)}%
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </>
    )}
    </>
  )
}
