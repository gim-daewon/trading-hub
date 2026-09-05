'use client'
import { useCallback, useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import MetricGuide from '../components/MetricGuide'
import { TvLink } from '../components/TvLink'
import {
  TIERS, BREAKOUTS, RR_EVIDENCE, RR_BASELINE, rrVerdict, roomToVwma60, isWeeklyKey,
  alignStrength,
  type TierId, type BreakoutKey, type Regime,
} from '@/lib/screener-shared'

// VWMA20 돌파 목록.
//
// 이 화면은 성과를 주장하지 않는다. 10년 검증에서 돌파 계열은 전 구간이
// 기준선(전체 종목 균등, 양수 55%) 아래였다. 차트를 직접 볼 때
// 2,000종목을 100여 개로 좁히는 탐색 도구로만 쓴다.
//
// 목록은 매일 통째로 바뀐다. 오늘 돌파한 종목은 이미 VWMA 위에 있어
// 내일 다시 돌파할 수 없기 때문이다(실측 전날 겹침 0%).

interface Row {
  symbol: string; name: string; sector: string; marketCap: number
  f5: number | null; f20: number | null; f60: number | null
  rvol: number | null; chg20: number | null; pctB: number | null
  vwma20?: number | null; vwma60?: number | null; aboveRun?: number | null
  wClose?: number | null; wVwma20?: number | null; wVwma60?: number | null
  price: number | null
}
interface Data {
  regime: Regime
  scanned: number
  source: 'snapshot' | 'live'
  breakouts?: Record<TierId, Record<BreakoutKey, Row[]>>
  /** false면 스냅샷에 VWMA 지표가 아직 없다 (컬럼 추가 + 스캔 필요) */
  hasVwma?: boolean
  scannedAt?: number
  /** 데이터 마지막 봉 날짜 (YYYY-MM-DD). 스캔 시각과 다를 수 있다 */
  barDate?: string | null
  fetchedAt: number
  error?: string
}

const sgn = (v: number | null, d = 0) => v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(d)}`

function StockRow({ r, weekly }: { r: Row; weekly: boolean }) {
  // 종가가 VWMA20에서 얼마나 떨어져 있나. 주봉 탭이면 주봉 값으로 잰다
  const px = weekly ? r.wClose : r.price
  const ma = weekly ? r.wVwma20 : r.vwma20
  const ma60 = weekly ? r.wVwma60 : r.vwma60
  const gap = px && ma ? ((px - ma) / ma) * 100 : null
  // 여력 = VWMA60까지 남은 거리. 역배열에서만 양수다 (60이 위에 있으므로).
  // 손절 -3% 기준으로 손익비를 가늠하는 데 쓴다 — 여력 9%면 3:1이다
  const room = px && ma60 ? ((ma60 - px) / px) * 100 : null
  const rr = room != null ? room / 3 : null
  // 정배열 강도 — 20선과 60선이 벌어진 폭(%). 조건이 아니라 참고용이다
  const align = alignStrength(r, weekly)
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 62px 46px 46px 56px',
      alignItems: 'center', gap: 6, minHeight: 52,
      padding: '8px 12px', borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ minWidth: 0 }}>
        <div className="num" style={{ fontSize: 14, fontWeight: 700 }}>
          <TvLink symbol={r.symbol} />
        </div>
        <div style={{
          fontSize: 10, color: 'var(--text-muted)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {(r.sector || '').slice(0, 20)} · ${(r.marketCap / 1e9).toFixed(1)}B
        </div>
      </div>

      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{weekly ? '주봉' : ''} VWMA 대비</div>
        <div className={`num ${(gap ?? 0) >= 0 ? 'up' : 'down'}`} style={{ fontSize: 12, fontWeight: 700 }}>
          {gap == null ? '—' : `${sgn(gap, 1)}%`}
        </div>
        {/* 정배열 강도 = (VWMA20 - VWMA60) / VWMA60. 부호는 방향, 크기는 벌어진 폭.
            "정배열이냐"만 보면 간신히 붙은 것과 크게 벌어진 것이 같아진다.
            특징 분석에서 클수록 기댓값이 높았지만 살아남은 특징 수가 우연 수준이라
            **거르는 조건으로는 쓰지 않고** 판단 재료로만 보여준다. */}
        {align != null && (
          <div className="num" style={{ fontSize: 8, color: 'var(--text-muted)' }}>
            정배열 {sgn(align, 0)}%
          </div>
        )}
      </div>

      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>20일</div>
        <div className={`num ${(r.chg20 ?? 0) >= 0 ? 'up' : 'down'}`} style={{ fontSize: 12, fontWeight: 700 }}>
          {sgn(r.chg20, 0)}%
        </div>
      </div>

      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>수급</div>
        <div className={`num ${(r.f20 ?? 0) >= 0 ? 'up' : 'down'}`} style={{ fontSize: 12, fontWeight: 700 }}>
          {sgn(r.f20, 0)}%
        </div>
      </div>

      {/* 60선까지 남은 여력과, 손절 -3% 기준 손익비.
          바닥잡기에서 여력이 클수록 손익비가 좋아진다는 게 실측으로 확인됐다
          (여력 15%+ 구간 기댓값 +0.42% vs 기준선 +0.22%).
          다만 도달률이 76%→22%로 떨어지므로 여력만 보고 고르면 안 된다. */}
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>60선 여력</div>
        <div className="num" style={{
          fontSize: 12, fontWeight: 700,
          color: (room ?? 0) >= 9 ? 'var(--up)' : 'var(--text-secondary)',
        }}>
          {room == null ? '—' : `${sgn(room, 0)}%`}
        </div>
        {rr != null && room != null && room > 0 && (
          <div className="num" style={{ fontSize: 8, color: 'var(--text-muted)' }}>
            {rr.toFixed(1)}:1
          </div>
        )}
      </div>
    </div>
  )
}

export default function BreakoutPage() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  // 기본 탭은 기댓값 1위(강세눌림 터치 일봉)
  const [tab, setTab] = useState<BreakoutKey>('touchD')
  // 기본 정렬을 여력순으로. 손절 -3% 기준이면 여력이 곧 손익비다
  const [sort, setSort] = useState<'room' | 'flow'>('room')

  const load = useCallback(() => {
    setLoading(true); setErr('')
    fetch('/api/screener')
      .then(r => r.json())
      .then(j => { setData(j); if (j.error) setErr(j.error) })
      .catch(e => setErr(String(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const total = data?.breakouts
    ? TIERS.reduce((a, t) => a + (data.breakouts![t.id]?.[tab]?.length ?? 0), 0)
    : 0
  // above_run 컬럼 추가 전 스냅샷이면 전부 null이라 후보가 안 나온다.
  // 목록이 비어 보이는 두 상황을 구분해야 한다 —
  // "오늘 돌파한 종목이 없다"와 "지표가 아직 없다"는 할 일이 다르다.
  const awaitingScan = !!data && !loading && data.hasVwma === false

  return (
    <div style={{ padding: 16, maxWidth: 760, margin: '0 auto' }}>
      <PageHeader
        title="VWMA 돌파"
        fetchedAt={data?.fetchedAt}
        onRefresh={load}
        loading={loading}
        sub={data && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span className={`pill ${data.source === 'snapshot' ? 'pill-up' : 'pill-stale'}`}>
              {data.source === 'snapshot' ? `스냅샷 ${data.scanned.toLocaleString()}` : `라이브 ${data.scanned}`}
            </span>
            {/* 스캔 시각이 아니라 '데이터 기준일'을 보여준다.
                야후가 당일 일봉을 늦게 주면 둘이 하루씩 어긋난다 */}
            {data.barDate && (
              <span className="num" title="이 목록을 계산한 마지막 거래일. 스캔 시각과 다를 수 있다">
                {data.barDate.slice(5).replace('-', '/')} 종가 기준
              </span>
            )}
          </span>
        )}
      />

      {/* 성과 근거가 없다는 걸 목록보다 먼저 말한다.
          숫자를 보고 나서 읽으면 이미 늦다. */}
      <div className="card" style={{
        padding: '11px 13px', marginBottom: 12, fontSize: 11, lineHeight: 1.6,
        borderLeft: '3px solid var(--warn)',
      }}>
        <b style={{ color: 'var(--warn)' }}>기준선을 확실히 넘는 조건은 없다.</b>{' '}
        손절 −3% / 익절 +9% 규칙으로 10년·격자 10개를 재측정했다.
        <b> 손익비는 전부 2.5~2.9로 신호와 무관하다</b> — 규칙이 만드는 값이다.
        승률도 26~32%로 거의 같다. <b>차이는 오직 거래당 기댓값에서 난다.</b>
        <div className="num" style={{
          margin: '6px 0', padding: '7px 9px', borderRadius: 6,
          background: 'var(--bg-base)', color: 'var(--text-muted)', fontSize: 10, lineHeight: 1.7,
        }}>
          기준선 {RR_BASELINE.exp}%/거래 · 연환산 {RR_BASELINE.ann}%
          <br />
          {BREAKOUTS.filter(b => b.key !== 'brokeD').map(b => {
            const q = RR_EVIDENCE[b.key]
            return q ? `${b.label} ${q.exp >= 0 ? '+' : ''}${q.exp}%` : ''
          }).filter(Boolean).join(' · ')}
        </div>
        <span style={{ color: 'var(--text-muted)' }}>
          10개 격자 전부에서 기준선을 넘은 조건은 하나도 없다.
          <b> 차트를 직접 볼 후보를 좁히는 용도</b>로 쓴다.
        </span>
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
          <b style={{ color: 'var(--text-secondary)' }}>60선 여력 · 손익비</b>{' '}
          <span style={{ color: 'var(--text-muted)' }}>
            VWMA60까지 남은 거리다. 손절 −3% 기준이면 여력 9%가 3:1이다.
            <b style={{ color: 'var(--warn)' }}> 다만 여력이 클수록 도달률이 76% → 22%로 떨어진다</b> —
            여력만 보고 고르면 목표에 못 닿는다.
          </span>
        </div>
      </div>

      {/* 탭 8개라 가로 스크롤 칩으로 둔다. flex:1로 나누면 글자가 다 뭉개진다 */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 8, paddingBottom: 2 }}>
        {/* 숏 전용(brokeD)은 여기 안 띄운다. /short 메뉴에서 쓴다 */}
        {BREAKOUTS.filter(b => b.key !== 'brokeD').map(b => {
          const n = data?.breakouts
            ? TIERS.reduce((a, t) => a + (data.breakouts![t.id]?.[b.key]?.length ?? 0), 0)
            : 0
          const active = tab === b.key
          return (
            <button key={b.key} onClick={() => setTab(b.key)} style={{
              flexShrink: 0, minHeight: 40, padding: '0 12px', borderRadius: 10, cursor: 'pointer',
              border: `1px solid ${active ? 'var(--info)' : 'var(--border)'}`,
              background: active ? 'rgba(59,130,246,0.15)' : 'var(--bg-card)',
              color: active ? 'var(--text-primary)' : 'var(--text-muted)',
              fontSize: 12, fontWeight: active ? 700 : 400, whiteSpace: 'nowrap',
            }}>
              {b.label}{n > 0 && <span className="num" style={{ marginLeft: 5, opacity: 0.75 }}>{n}</span>}
            </button>
          )
        })}
      </div>

      <p style={{ margin: '0 0 4px', fontSize: 11, color: 'var(--text-muted)' }}>
        조건: {BREAKOUTS.find(b => b.key === tab)?.rule}
      </p>
      <p style={{ margin: '0 0 8px', fontSize: 10, color: 'var(--text-muted)' }}>
        {/* 탭마다 실측치를 붙여둔다. 한 번 읽고 잊는 것보다 매번 보이는 게 낫다 */}
        <span className="num" style={{ color: 'var(--warn)' }}>
          기댓값 {(() => { const q = RR_EVIDENCE[tab]; return q ? `${q.exp >= 0 ? '+' : ''}${q.exp}%/거래 · 연환산 ${q.ann >= 0 ? '+' : ''}${q.ann}%` : '미측정' })()}
          {' '}(기준선 +{RR_BASELINE.exp}% · +{RR_BASELINE.ann}%)
        </span>
        {' · '}
        {tab === 'today'
          ? '매일 통째로 바뀐다 — 오늘 돌파한 종목은 이미 VWMA 위라 내일 다시 돌파할 수 없다 (실측 전날 겹침 0%)'
          : tab.endsWith('W')
            ? '주봉 기준이라 한 주 동안 목록이 거의 그대로다'
            : '조건이 유지되는 동안 며칠간 겹친다'}
      </p>

      {/* 정렬 토글. 여력순이 기본이다 —
          손절 -3% 고정이면 여력이 그대로 손익비가 된다 (여력 9% = 3:1) */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {([['room', '여력순'], ['flow', '수급순']] as const).map(([k, label]) => {
          const active = sort === k
          return (
            <button key={k} onClick={() => setSort(k)} style={{
              minHeight: 34, padding: '0 12px', borderRadius: 8, cursor: 'pointer',
              border: `1px solid ${active ? 'var(--info)' : 'var(--border)'}`,
              background: active ? 'rgba(59,130,246,0.15)' : 'var(--bg-card)',
              color: active ? 'var(--text-primary)' : 'var(--text-muted)',
              fontSize: 11, fontWeight: active ? 700 : 400,
            }}>{label}</button>
          )
        })}
        <span style={{ fontSize: 10, color: 'var(--text-muted)', alignSelf: 'center' }}>
          {sort === 'room' ? '60선까지 여력이 큰 순 (손익비 큰 순)' : '20일 순자금이 큰 순'}
        </span>
      </div>

      <MetricGuide show={['flow', 'pctB']} />

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
          VWMA는 최근 추가한 지표라 <b>DB 컬럼 추가 + 스캔 1회</b>가 필요하다.
          <br /><br />
          1. Supabase SQL Editor에서 <code>supabase/add_vwma.sql</code> 실행
          <br />
          2. GitHub → Actions → Screener Scan → Run workflow
          <br /><br />
          평일이면 다음 자동 스캔(KST 07:30경)에 자동으로 채워진다.
        </div>
      )}

      {!awaitingScan && data?.hasVwma && total === 0 && (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
          이 조건을 만족하는 종목이 없다
        </div>
      )}

      {!awaitingScan && data?.hasVwma && TIERS.map(t => {
        const raw = data.breakouts![t.id]?.[tab] ?? []
        const wk = isWeeklyKey(tab)
        const rows = [...raw].sort((a, b) => sort === 'room'
          ? (roomToVwma60(b, wk) ?? -999) - (roomToVwma60(a, wk) ?? -999)
          : (b.f20 ?? -999) - (a.f20 ?? -999))
        if (!rows.length) return null
        return (
          <section key={t.id} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>{t.label}</h2>
              <span className="num" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{rows.length}종목</span>
            </div>
            <div className="card" style={{ overflow: 'hidden' }}>
              {rows.map(r => <StockRow key={r.symbol} r={r} weekly={tab.endsWith('W')} />)}
            </div>
          </section>
        )
      })}
    </div>
  )
}
