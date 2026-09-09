'use client'
import { useCallback, useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import { TvLink } from '../components/TvLink'
import { tiersFor, type TierId, type BreakoutKey } from '@/lib/screener-shared'
import { INVERSE_ETF } from '@/lib/inverse-etf'

// 숏 후보 — 강세 구조가 깨진 종목 중 인버스 ETF가 있는 것.
//
// 조건: 정배열(VWMA20 > VWMA60)이었는데 종가(몸통)가 VWMA20 아래로 내려갔다.
// 사용자 관찰: "몸통이 20선을 뚫리면 주가도 계속 떨어진다."
// 그래서 밑꼬리만 뚫린 건 매수 후보(강세눌림)로, 몸통이 뚫린 건 여기로 나눴다.
//
// 성과 근거는 없다. 하락 방향은 아직 백테스트하지 않았다 —
// 지금까지 검증은 전부 매수 기준이었다.

interface Row {
  symbol: string; name: string; sector: string; marketCap: number
  f5: number | null; f20: number | null; f60: number | null
  chg20: number | null; pctB: number | null
  vwma20?: number | null; vwma60?: number | null
  aboveRun?: number | null; low?: number | null; price: number | null
}
interface Data {
  scanned: number
  source: 'snapshot' | 'live'
  breakouts?: Record<TierId, Record<BreakoutKey, Row[]>>
  hasVwma?: boolean
  barDate?: string | null
  fetchedAt: number
  error?: string
}

const sgn = (v: number | null, d = 0) => v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(d)}`

export default function ShortPage() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = useCallback(() => {
    setLoading(true); setErr('')
    fetch('/api/screener')
      .then(r => r.json())
      .then(j => { setData(j); if (j.error) setErr(j.error) })
      .catch(e => setErr(String(e)))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  // 이탈 종목 중 인버스 ETF가 있는 것만. 이탈 폭이 큰 순으로 정렬한다
  const rows = data?.breakouts
    ? tiersFor('us').flatMap(t => data.breakouts![t.id]?.brokeD ?? [])
        .filter(r => r.symbol in INVERSE_ETF)
        // 최근에 깨진 것부터. 같은 날이면 깊게 빠진 것부터
        .sort((a, b) => {
          const days = (r: Row) => Math.abs(r.aboveRun ?? 999)
          const depth = (r: Row) => r.price && r.vwma20 ? (r.vwma20 - r.price) / r.vwma20 : -999
          return days(a) - days(b) || depth(b) - depth(a)
        })
    : []

  const awaitingScan = !!data && !loading && data.hasVwma === false

  return (
    <div style={{ padding: 16, maxWidth: 760, margin: '0 auto' }}>
      <PageHeader
        title="숏 후보"
        fetchedAt={data?.fetchedAt}
        onRefresh={load}
        loading={loading}
        sub={data && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span className={`pill ${data.source === 'snapshot' ? 'pill-up' : 'pill-stale'}`}>
              {data.source === 'snapshot' ? `스냅샷 ${data.scanned.toLocaleString()}` : `라이브 ${data.scanned}`}
            </span>
            {data.barDate && (
              <span className="num">{data.barDate.slice(5).replace('-', '/')} 종가 기준</span>
            )}
          </span>
        )}
      />

      <div className="card" style={{
        padding: '11px 13px', marginBottom: 12, fontSize: 11, lineHeight: 1.6,
        borderLeft: '3px solid var(--down)',
      }}>
        <b>강세 구조가 깨진 종목</b> 중 <b>인버스 ETF가 있는 것</b>만 추렸다.
        <br />
        조건: <b>종가가 VWMA20 아래</b>. 얼마나 최근에 깨졌는지(이탈 일수)와
        얼마나 깊은지(20선 대비)를 같이 보여준다 — 판단은 직접 하는 것이다.
        <br />
        <span style={{ color: 'var(--warn)' }}>
          <b>성과 근거가 없다.</b> 지금까지 검증은 전부 매수 기준이었고
          하락 방향은 아직 백테스트하지 않았다. 숏은 손실이 무제한이라
          매수보다 규칙이 더 엄격해야 한다.
        </span>
        <div style={{
          marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)',
          color: 'var(--text-muted)',
        }}>
          <b style={{ color: 'var(--text-secondary)' }}>레버리지 ETF 주의</b> —
          2배 상품은 <b>일간</b> 리밸런싱이라 며칠 들고 있으면
          원주 하락률 × 2와 어긋난다(변동성 손실). 원주가 제자리로 돌아와도 손실이 남는다.
          단기 매매 전제로만 쓸 것.
        </div>
      </div>

      {err && <div className="card" style={{ padding: 16, color: 'var(--down)', fontSize: 13 }}>{err}</div>}

      {loading && !data && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          불러오는 중…
        </div>
      )}

      {awaitingScan && (
        <div className="card" style={{ padding: 24, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          <b style={{ color: 'var(--warn)' }}>아직 데이터가 없다.</b>
          <br />
          <code>supabase/add_vwma.sql</code>의 컬럼을 추가하고 스캔을 한 번 돌려야 한다.
        </div>
      )}

      {!awaitingScan && data?.hasVwma && rows.length === 0 && (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.7 }}>
          지금은 해당 종목이 없다.
          <br />
          <span style={{ fontSize: 11 }}>
            인버스 ETF가 있는 {Object.keys(INVERSE_ETF).length}개 종목 중
            정배열이 깨진 게 없다는 뜻이다.
          </span>
        </div>
      )}

      {rows.length > 0 && (
        <div className="card" style={{ overflow: 'hidden' }}>
          {rows.map(r => {
            const inv = INVERSE_ETF[r.symbol]
            const gap = r.price && r.vwma20 ? ((r.price - r.vwma20) / r.vwma20) * 100 : null
            return (
              <div key={r.symbol} style={{
                padding: '10px 12px', borderBottom: '1px solid var(--border)',
              }}>
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 62px 56px',
                  alignItems: 'center', gap: 8,
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="num" style={{ fontSize: 14, fontWeight: 700 }}>
                      <TvLink symbol={r.symbol} />
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {(r.sector || '').slice(0, 22)} · ${(r.marketCap / 1e9).toFixed(0)}B
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>20선 대비</div>
                    <div className="num down" style={{ fontSize: 13, fontWeight: 700 }}>
                      {sgn(gap, 1)}%
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>이탈</div>
                    <div className="num" style={{ fontSize: 13, fontWeight: 700 }}>
                      {r.aboveRun == null ? '—' : `${Math.abs(r.aboveRun)}일`}
                    </div>
                  </div>
                </div>

                {/* 인버스 ETF — 이게 이 화면의 존재 이유다 */}
                <div style={{
                  marginTop: 6, padding: '6px 8px', borderRadius: 6,
                  background: 'var(--bg-base)',
                  display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                }}>
                  <span className="num" style={{ fontSize: 13, fontWeight: 700 }}>
                    <TvLink symbol={inv.etf} />
                  </span>
                  <span className={`pill ${inv.leverage > 1 ? 'pill-stale' : ''}`} style={{ fontSize: 10 }}>
                    {inv.leverage}x 인버스
                  </span>
                  <span className="num" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    ${inv.dollarVolM.toFixed(0)}M/일
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                    20일 {sgn(r.chg20, 0)}% · 수급 {sgn(r.f20, 0)}%
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {rows.length > 0 && (
        <p style={{ marginTop: 10, fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          이탈 폭이 큰 순으로 정렬했다. 티커를 누르면 트레이딩뷰로 열린다 —
          <b> 인버스 ETF 차트도 반드시 직접 확인할 것.</b> 레버리지 상품은
          원주와 움직임이 정확히 비례하지 않는다.
        </p>
      )}
    </div>
  )
}
