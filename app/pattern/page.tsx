'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import PageHeader from '../components/PageHeader'
import { MarketToggle, useMarket } from '../components/MarketToggle'
import { SymbolLabel } from '../components/SymbolLabel'
import { fmtLevel } from '../components/LevelsLine'
import { fmtCap, type Market } from '@/lib/markets'
import { cupWatchNear, CUP_NOW_FRESH, CUP_WATCH_NEAR_PCT } from '@/lib/cup-fib'
import type { PatternRow } from '../api/pattern/route'

// 컵 + 돌파 실패 + Fib 0.5 반등(2026-11-03 사용자가 준 참고 영상). 판정은 lib/cup-fib.ts, 저장은 매일 스캔.
// 백테스트에서 아무 날에나 들어간 것보다 낫지 않았다(lib/rejected.ts cup-breakout-fail-fib).
// 사용자가 "매수 신호 있는 종목을 확인"하려고 요청해 만들었다 — 그래서 맨 위에 검증 결과를 먼저 둔다.

interface Data { rows: PatternRow[]; barDate: string | null; needsColumn?: boolean; error?: string }

const pct = (a: number, b: number) => { const v = (a / b - 1) * 100; return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` }

function Prices({ r, market }: { r: PatternRow; market: Market }) {
  const c = r.cup
  const cell = (label: string, v: number, color?: string) => (
    <span style={{ whiteSpace: 'nowrap' }}>
      {label} <span className="num" style={{ color: color ?? 'var(--text-secondary)' }}>{fmtLevel(v, market)}</span>
      {r.price != null && <span className="num" style={{ opacity: 0.7 }}> ({pct(v, r.price)})</span>}
    </span>
  )
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
      {cell(c.stage === 'entry' ? '진입' : '0.5 되돌림', c.entry)}
      {cell('손절', c.stop, 'var(--down)')}
      {cell('목표', c.target, 'var(--up)')}
      <span style={{ whiteSpace: 'nowrap' }}>손익비 <span className="num">{c.rr.toFixed(1)}</span></span>
    </div>
  )
}

function Row({ r, market }: { r: PatternRow; market: Market }) {
  const c = r.cup
  const when = c.stage === 'entry'
    ? (c.ago === 0 ? '오늘 종가 신호' : `${c.ago}봉 전 신호`)
    : `돌파 실패 ${c.ago}봉 뒤${c.touched ? ' · 0.5 닿음, 반등 봉 대기' : ''}`
  return (
    <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
      <SymbolLabel
        symbol={r.symbol} display={r.display} name={r.name} market={market}
        trailing={r.price != null ? <span className="num">{fmtLevel(r.price, market)}</span> : undefined}
        sub={<>{when}{r.marketCap ? ` · ${fmtCap(r.marketCap, market)}` : ''}</>}
      />
      <Prices r={r} market={market} />
    </div>
  )
}

function Section({ title, note, rows, market }: { title: string; note: string; rows: PatternRow[]; market: Market }) {
  return (
    <section style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>{title}</h2>
        <span className="num" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{rows.length}종목</span>
      </div>
      <p style={{ margin: '0 0 8px', fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.6 }}>{note}</p>
      {rows.length === 0
        ? <div className="card" style={{ padding: 18, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>없음</div>
        : <div className="card" style={{ overflow: 'hidden' }}>{rows.map(r => <Row key={r.symbol} r={r} market={market} />)}</div>}
    </section>
  )
}

export default function PatternPage() {
  const [market, setMarket, marketReady] = useMarket()
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchedAt, setFetchedAt] = useState<number>()

  // 로딩 켜기는 누른 곳(새로고침·시장 바꾸기)에서 한다. effect 안에서 바로 setState하면 렌더가 연쇄된다
  const fetchData = useCallback(() => {
    fetch(`/api/pattern?market=${market}`)
      .then(r => r.json())
      .then(j => { setData(j); setFetchedAt(Date.now()) })
      .catch(e => setData({ rows: [], barDate: null, error: String(e) }))
      .finally(() => setLoading(false))
  }, [market])
  useEffect(() => { if (marketReady) fetchData() }, [fetchData, marketReady])
  const refresh = () => { setLoading(true); fetchData() }
  const changeMarket = (m: Market) => { setLoading(true); setMarket(m) }

  const rows = data?.rows ?? []
  const entries = rows.filter(r => r.cup.stage === 'entry').sort((a, b) => a.cup.ago - b.cup.ago)
  const watch = rows.filter(r => r.price != null && cupWatchNear(r.cup, r.price))
    .sort((a, b) => Number(b.cup.touched) - Number(a.cup.touched) || (a.price! / a.cup.entry) - (b.price! / b.cup.entry))
  const watchAll = rows.filter(r => r.cup.stage === 'watch').length

  return (
    <div style={{ padding: 16, maxWidth: 760, margin: '0 auto' }}>
      <PageHeader
        title="컵 패턴"
        fetchedAt={fetchedAt}
        onRefresh={refresh}
        loading={loading}
        sub={data?.barDate ? <span className="num">{data.barDate.slice(5).replace('-', '/')} 종가 기준</span> : undefined}
      />
      <MarketToggle value={market} onChange={changeMarket} />

      <div className="card" style={{ padding: '12px 14px', marginBottom: 14, fontSize: 11, lineHeight: 1.6, borderLeft: '3px solid var(--warn)' }}>
        <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700, color: 'var(--warn)' }}>
          검증 결과: 아무 날에나 들어간 것보다 낫지 않았다
        </p>
        <p style={{ margin: 0, color: 'var(--text-muted)' }}>
          미국 10년 10,464건 −0.005R · 코인 일봉 361건 +0.19R(우연과 구분 안 됨) · 코인 4시간봉 −0.004R.
          시장이 200일 평균 위일 때만 봐도 같았다. <b>살펴볼 목록이지 매수 신호가 아니다.</b>{' '}
          <Link href="/rejected" style={{ color: 'var(--info)' }}>기각 기록 보기</Link>
        </p>
        <p style={{ margin: '6px 0 0', color: 'var(--text-muted)' }}>
          규칙(참고 영상): 왼쪽 고점(테두리) → 바닥 → 고가가 테두리를 뚫음 → 종가가 다시 테두리 아래(돌파 실패)
          → 바닥~테두리 0.5까지 되돌림 → 직전 봉 고가 위 종가에 진입. 손절은 테두리 − 깊이×0.7, 목표는 바닥→돌파 고점 1.618 확장.
        </p>
      </div>

      {data?.error && <div className="card" style={{ padding: 16, color: 'var(--down)', fontSize: 13, marginBottom: 12 }}>{data.error}</div>}
      {data?.needsColumn && (
        <div className="card" style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 12 }}>
          <b style={{ color: 'var(--warn)' }}>아직 저장 칸이 없다.</b> Supabase SQL 편집기에서 <code>supabase/add_cup.sql</code>을 실행하면
          다음 스캔부터 채워진다.
        </div>
      )}
      {loading && !data && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>불러오는 중…</div>
      )}

      {data && !data.needsColumn && !data.error && <>
        <Section
          title="진입 신호" rows={entries} market={market}
          note={`최근 ${CUP_NOW_FRESH}봉 안에 0.5 되돌림에서 반등 봉이 나왔고 아직 손절·목표 전. 진입가는 신호 봉 종가, 괄호는 지금 가격 대비.`}
        />
        <Section
          title="진입 준비" rows={watch} market={market}
          note={`돌파 실패 뒤 되돌림을 기다리는 중 ${watchAll}종목 가운데, 0.5에 이미 닿았거나 ${CUP_WATCH_NEAR_PCT}% 안으로 가까운 것만.`}
        />
      </>}
    </div>
  )
}
