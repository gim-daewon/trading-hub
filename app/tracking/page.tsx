'use client'
import { useCallback, useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import { TIERS, CATS, type TierId, type CatKey, type Regime } from '@/lib/screener-shared'

// 스크리너에 뜬 종목이 실제로 올랐는지 사후 확인.
// 백테스트(과거 되짚기)와 달리 생존편향·표본중복이 없다.
// 다만 한 달로는 통계적 결론이 안 난다 — 대참사 조기 발견과 방향 확인용이다.

interface Result {
  n: number; avg: number; med: number
  exAvg: number; exMed: number; hit: number; up: number
}
interface Horizon {
  days: number; from: string; to: string; regime: Regime; spyRet: number
  byCat: Record<CatKey, Record<string, Result | null>>
}
interface Data {
  horizons: Horizon[]
  snapshotCount: number
  latestAt?: string
  note?: string | null
  error?: string
}

const sgn = (v: number, d = 2) => `${v >= 0 ? '+' : ''}${v.toFixed(d)}`
const cls = (v: number) => v > 0 ? 'up' : v < 0 ? 'down' : 'flat'
const dt = (s: string) => new Date(s).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })

function Cell({ r }: { r: Result | null }) {
  if (!r) return <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'flex-end' }}>
      {/* 절대수익 — 실제 손익 감각 */}
      <span className={`num ${cls(r.avg)}`} style={{ fontSize: 13, fontWeight: 700 }}>
        {sgn(r.avg)}%
      </span>
      {/* SPY 대비 — 백테스트와 같은 기준 */}
      <span className={`num ${cls(r.exAvg)}`} style={{ fontSize: 10, opacity: 0.85 }}>
        SPY {sgn(r.exAvg)}%p
      </span>
      <span className="num" style={{ fontSize: 9, color: 'var(--text-muted)' }}>
        상회 {r.hit.toFixed(0)}% · {r.n}종목
      </span>
    </div>
  )
}

export default function TrackingPage() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = useCallback(() => {
    setLoading(true); setErr('')
    fetch('/api/tracking')
      .then(r => r.json())
      .then(j => { setData(j); if (j.error) setErr(j.error) })
      .catch(e => setErr(String(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div style={{ padding: 16, maxWidth: 860, margin: '0 auto' }}>
      <PageHeader
        title="성과 추적"
        onRefresh={load}
        loading={loading}
        showMarketStatus={false}
        sub={data && <span>스냅샷 {data.snapshotCount}개 누적</span>}
      />

      <div className="card" style={{ padding: '11px 13px', marginBottom: 14, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        스크리너에 뜬 종목이 그 뒤 실제로 올랐는지 추적한다. 백테스트와 달리
        <b> 생존편향·표본중복이 없다.</b>
        <br />
        <span style={{ color: 'var(--warn)' }}>
          다만 한 달로는 통계적 결론이 안 난다. 20일 구간이 겹쳐 독립 표본이 하루 1/20개꼴로 쌓인다.
          <b> 대참사 조기 발견과 방향 확인용</b>으로 보라.
        </span>
      </div>

      {err && <div className="card" style={{ padding: 16, color: 'var(--down)', fontSize: 13 }}>{err}</div>}

      {loading && !data && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          불러오는 중…
        </div>
      )}

      {data?.note && (
        <div className="card" style={{ padding: 24, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          {data.note}
        </div>
      )}

      {data?.horizons.map(h => (
        <section key={h.days} style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>{h.days}거래일 경과</h2>
            <span className="num" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {dt(h.from)} → {dt(h.to)} · 당시 {h.regime === 'up' ? '상승' : '하락'} 국면
            </span>
            <span className={`num ${cls(h.spyRet)}`} style={{ fontSize: 11 }}>
              SPY {sgn(h.spyRet)}%
            </span>
          </div>

          <div className="card" style={{ overflow: 'hidden' }}>
            <div className="overflow-x-table">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 520 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 11 }}>
                    <th style={{ textAlign: 'left', padding: '8px 10px' }}>카테고리</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px' }}>전체</th>
                    {TIERS.map(t => (
                      <th key={t.id} style={{ textAlign: 'right', padding: '8px 10px' }}>
                        {t.label.split(' ')[0]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CATS.map(c => (
                    <tr key={c.key} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px', fontWeight: 700 }}>{c.label}</td>
                      <td style={{ padding: '10px', textAlign: 'right' }}>
                        <Cell r={h.byCat[c.key]?.all ?? null} />
                      </td>
                      {TIERS.map(t => (
                        <td key={t.id} style={{ padding: '10px', textAlign: 'right' }}>
                          <Cell r={h.byCat[c.key]?.[t.id as TierId] ?? null} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ))}

      {data && data.horizons.length > 0 && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          <p style={{ margin: '0 0 4px', fontWeight: 700 }}>읽는 법</p>
          <div>· 큰 숫자 = 절대 수익률 (실제 손익)</div>
          <div>· SPY ±%p = 같은 기간 SPY 대비 초과수익 (백테스트와 같은 기준)</div>
          <div>· 상회 % = SPY를 이긴 종목 비율. 10년 구간 실측 기대치는 50~57%로 동전 던지기에 가깝다</div>
          <div>· 스캔은 평일 1회라 스냅샷 1개 = 1거래일이다</div>
        </div>
      )}
    </div>
  )
}
