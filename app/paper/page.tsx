'use client'
import { useCallback, useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import { MarketToggle, useMarket } from '../components/MarketToggle'
import { SymbolLabel } from '../components/SymbolLabel'
import { fmtLevel } from '../components/LevelsLine'
import type { Market } from '@/lib/markets'
import { failedNote, type PaperResult, type OpenPos, type ClosedTrade } from '@/lib/paper'

// 모의투자(2026-11-03) — 계산은 /api/paper(lib/paper.ts). 이 화면은 그리기만 한다.
// 모양 참고: ric-v/drawdown(자산 곡선 → 보유 → 끝난 매매)

interface Summary { equity: number; pct: number; realized: number; trades: number; winPct: number | null; avgR: number | null }
type Account = PaperResult & { orders: number; summary: Summary }
interface Data {
  market: Market; rules: Record<'A' | 'B', string>; seed?: number; since?: string
  benchPct?: number | null; benchLabel?: string; failed?: number
  needsTable?: boolean; accounts?: Record<'A' | 'B', Account> | null; error?: string
}

const money = (v: number, m: Market) => m === 'kr'
  ? `${Math.round(v).toLocaleString()}원`
  : `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
const pct = (v: number | null | undefined, d = 1) => v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(d)}%`
const tone = (v: number) => v > 0 ? 'up' : v < 0 ? 'down' : ''

/** 자산 곡선. 시드 높이에 점선 */
function Curve({ points, seed }: { points: { date: string; equity: number }[]; seed: number }) {
  if (points.length < 2) return null
  const W = 600, H = 140, P = 6
  const ys = points.map(p => p.equity).concat(seed)
  const lo = Math.min(...ys), hi = Math.max(...ys), span = hi - lo || 1
  const x = (i: number) => P + (i / (points.length - 1)) * (W - 2 * P)
  const y = (v: number) => H - P - ((v - lo) / span) * (H - 2 * P)
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.equity).toFixed(1)}`).join(' ')
  const up = points.at(-1)!.equity >= seed
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="자산 곡선" style={{ display: 'block' }}>
      <line x1={P} x2={W - P} y1={y(seed)} y2={y(seed)} stroke="var(--text-muted)" strokeDasharray="4 4" strokeWidth={1} opacity={0.6} />
      <polyline points={line} fill="none" stroke={up ? 'var(--up)' : 'var(--down)'} strokeWidth={2} />
    </svg>
  )
}

function OpenRow({ p, market }: { p: OpenPos; market: Market }) {
  const ch = (p.last / p.entry - 1) * 100
  return (
    <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
      <SymbolLabel symbol={p.symbol} name={p.name} market={market}
        trailing={<span className={`num ${tone(ch)}`} style={{ fontSize: 13, fontWeight: 700 }}>{pct(ch)}</span>}
        sub={<span className="num">{p.date.slice(5).replace('-', '/')} 매수 · {fmtLevel(p.entry, market)} → {fmtLevel(p.last, market)} · {p.held}일째</span>} />
      <div className="num" style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
        손절 {fmtLevel(p.stop, market)} · 목표 {fmtLevel(p.target, market)} · 평가손익 <span className={tone(p.pnl)}>{money(p.pnl, market)}</span>
      </div>
    </div>
  )
}

const EXIT = { stop: '손절', target: '목표', time: '기간 만료' } as const
function ClosedRow({ t, market }: { t: ClosedTrade; market: Market }) {
  return (
    <div className="num" style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '6px 12px', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
      <span style={{ fontWeight: 700, minWidth: 56 }}>{t.symbol}</span>
      <span style={{ color: 'var(--text-muted)', flex: 1, minWidth: 0 }}>{t.date.slice(5)}→{t.exitDate.slice(5)} {EXIT[t.exit]}</span>
      <span className={tone(t.pnl)}>{money(t.pnl, market)}</span>
      <span className={tone(t.r)} style={{ minWidth: 44, textAlign: 'right' }}>{t.r >= 0 ? '+' : ''}{t.r.toFixed(1)}R</span>
    </div>
  )
}

function AccountCard({ rule, desc, a, data }: { rule: 'A' | 'B'; desc: string; a: Account; data: Data }) {
  const m = data.market, s = a.summary
  return (
    <section style={{ marginBottom: 20 }}>
      <h2 style={{ margin: '0 0 2px', fontSize: 15, fontWeight: 800 }}>계좌 {rule}</h2>
      <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{desc}</p>
      <div className="card" style={{ padding: 12, marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span className="num" style={{ fontSize: 22, fontWeight: 800 }}>{money(s.equity, m)}</span>
          <span className={`num ${tone(s.pct)}`} style={{ fontSize: 14, fontWeight: 700 }}>{pct(s.pct, 2)}</span>
          {data.benchPct != null && (
            <span className="num" style={{ fontSize: 11, color: 'var(--text-muted)' }}>같은 기간 {data.benchLabel} {pct(data.benchPct)}</span>
          )}
        </div>
        <Curve points={a.equity} seed={data.seed ?? s.equity} />
        <div className="num" style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', fontSize: 11, color: 'var(--text-secondary)' }}>
          <span>끝난 매매 {s.trades}건</span>
          <span>이긴 비율 {s.winPct == null ? '—' : `${s.winPct.toFixed(0)}%`}</span>
          <span>평균 {s.avgR == null ? '—' : `${s.avgR >= 0 ? '+' : ''}${s.avgR.toFixed(2)}R`}</span>
          <span>실현 <span className={tone(s.realized)}>{money(s.realized, m)}</span></span>
          <span>현금 {money(a.cash, m)}</span>
        </div>
      </div>
      <h3 style={{ margin: '10px 0 4px', fontSize: 13, fontWeight: 700 }}>보유 {a.open.length}종목</h3>
      {a.open.length ? (
        <div className="card" style={{ overflow: 'hidden' }}>{a.open.map(p => <OpenRow key={p.symbol} p={p} market={m} />)}</div>
      ) : <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>없음</p>}
      {a.closed.length > 0 && (
        <>
          <h3 style={{ margin: '10px 0 4px', fontSize: 13, fontWeight: 700 }}>끝난 매매</h3>
          <div className="card" style={{ overflow: 'hidden' }}>
            {[...a.closed].reverse().slice(0, 30).map(t => <ClosedRow key={`${t.symbol}-${t.date}`} t={t} market={m} />)}
          </div>
        </>
      )}
    </section>
  )
}

export default function PaperPage() {
  const [market, setMarket, ready] = useMarket()
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = useCallback(() => {
    setLoading(true); setErr('')
    fetch(`/api/paper?market=${market}`)
      .then(r => r.json())
      .then((j: Data) => { setData(j); if (j.error) setErr(j.error) })
      .catch(e => setErr(String(e)))
      .finally(() => setLoading(false))
  }, [market])
  useEffect(() => { if (ready) load() }, [load, ready])

  return (
    <div style={{ padding: 16, maxWidth: 760, margin: '0 auto' }}>
      <PageHeader title="모의투자" onRefresh={load} loading={loading}
        sub={data?.since ? <span className="num">{data.since} 시작</span> : undefined} />
      <MarketToggle value={market} onChange={setMarket} />
      <p style={{ margin: '0 0 12px', fontSize: 11, lineHeight: 1.6, color: 'var(--text-muted)' }}>
        매일 스캔이 끝나면 규칙마다 최대 10종목을 그날 종가에 산 것으로 친다. 한 매매 위험은 자산의 1%,
        현금이 모자라면 살 수 있는 만큼만, 동시에 10종목까지, 40일이 지나면 판다. 실제 돈은 들어가지 않는다.
        계좌 A의 기법은 10년 백테스트에서 기각됐다 — 이 화면은 지금 시장에서 어떻게 움직이는지 보는 용도다.
      </p>
      {err && <div className="card" style={{ padding: 16, color: 'var(--down)', fontSize: 13, marginBottom: 12 }}>{err}</div>}
      {loading && !data && <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>계좌 계산 중…</div>}
      {data?.needsTable && (
        <div className="card" style={{ padding: 20, fontSize: 12, lineHeight: 1.7, color: 'var(--text-muted)' }}>
          <b style={{ color: 'var(--warn)' }}>준비 중.</b> 모의투자 기록을 담을 표가 아직 없다(supabase/add_paper.sql).
          표가 생기면 다음 스캔부터 매수가 쌓인다.
        </div>
      )}
      {data && !data.needsTable && !data.error && !data.accounts && (
        <div className="card" style={{ padding: 20, fontSize: 12, color: 'var(--text-muted)' }}>
          아직 모의 매수가 없다. 다음 스캔이 끝나면 첫 매수가 들어온다.
        </div>
      )}
      {data?.accounts && failedNote(data.failed) && (
        <div className="card" style={{ padding: 12, color: 'var(--warn)', fontSize: 12, lineHeight: 1.6, marginBottom: 12 }}>{failedNote(data.failed)}</div>
      )}
      {data?.accounts && (['A', 'B'] as const).map(r => (
        <AccountCard key={r} rule={r} desc={data.rules[r]} a={data.accounts![r]} data={data} />
      ))}
    </div>
  )
}
