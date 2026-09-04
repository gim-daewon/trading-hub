'use client'
import { useCallback, useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import MetricGuide from '../components/MetricGuide'
import { TvLink } from '../components/TvLink'
import {
  TIERS, BREAKOUTS, BREAKOUT_EVIDENCE,
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
  fetchedAt: number
  error?: string
}

const sgn = (v: number | null, d = 0) => v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(d)}`

function StockRow({ r, weekly }: { r: Row; weekly: boolean }) {
  // 종가가 VWMA20에서 얼마나 떨어져 있나. 주봉 탭이면 주봉 값으로 잰다
  const px = weekly ? r.wClose : r.price
  const ma = weekly ? r.wVwma20 : r.vwma20
  const gap = px && ma ? ((px - ma) / ma) * 100 : null
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 58px 54px 54px',
      alignItems: 'center', gap: 8, minHeight: 52,
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
    </div>
  )
}

export default function BreakoutPage() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState<BreakoutKey>('today')

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
            {data.scannedAt && (
              <span className="num">
                {new Date(data.scannedAt).toLocaleString('ko-KR', {
                  timeZone: 'America/New_York', month: 'numeric', day: 'numeric',
                })} 종가 기준
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
        <b style={{ color: 'var(--warn)' }}>성과 근거가 없는 탐색 도구다.</b>{' '}
        VWMA 계열 8가지를 10년·격자 10개로 검증했는데
        <b> 전부 기준선 아래</b>였다 (기준선 = 전체 종목 균등매수, 양수 {BREAKOUT_EVIDENCE.baselinePos}%):
        <div className="num" style={{
          margin: '6px 0', padding: '7px 9px', borderRadius: 6,
          background: 'var(--bg-base)', color: 'var(--text-muted)', fontSize: 10, lineHeight: 1.7,
        }}>
          {BREAKOUTS.map(b => `${b.label} ${b.pos}%`).join(' · ')}
        </div>
        약세 종목 바닥잡기(52%)와 강세 종목 눌림(49~50%)이 모두 기준선에 못 미치고,
        유지일수를 늘려도 좋아지지 않는다(단조성 없음).
        <br />
        <span style={{ color: 'var(--text-muted)' }}>
          그래서 이 목록은 <b>차트를 직접 볼 후보를 좁히는 용도</b>로만 쓴다.
          매수 근거로 쓰지 말 것.
        </span>
      </div>

      {/* 탭 8개라 가로 스크롤 칩으로 둔다. flex:1로 나누면 글자가 다 뭉개진다 */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 8, paddingBottom: 2 }}>
        {BREAKOUTS.map(b => {
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
        조건: {BREAKOUTS.find(b => b.key === tab)?.rule} · 수급 높은 순
      </p>
      <p style={{ margin: '0 0 8px', fontSize: 10, color: 'var(--text-muted)' }}>
        {/* 탭마다 실측치를 붙여둔다. 한 번 읽고 잊는 것보다 매번 보이는 게 낫다 */}
        <span className="num" style={{ color: 'var(--warn)' }}>
          이 조건 실측 양수 {BREAKOUTS.find(b => b.key === tab)?.pos}%
          {' '}(기준선 {BREAKOUT_EVIDENCE.baselinePos}%)
        </span>
        {' · '}
        {tab === 'today'
          ? '매일 통째로 바뀐다 — 오늘 돌파한 종목은 이미 VWMA 위라 내일 다시 돌파할 수 없다 (실측 전날 겹침 0%)'
          : tab.endsWith('W')
            ? '주봉 기준이라 한 주 동안 목록이 거의 그대로다'
            : '조건이 유지되는 동안 며칠간 겹친다'}
      </p>

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
        const rows = data.breakouts![t.id]?.[tab] ?? []
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
