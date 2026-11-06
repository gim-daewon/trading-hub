'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import RiskGauge from '../components/RiskGauge'
import { MarketToggle, MicroToggle, useMarket } from '../components/MarketToggle'
import { SymbolLabel } from '../components/SymbolLabel'
import { ExitPrices } from '../components/ExitPrices'
import { LevelsLine, useLevels, useLevelsStatus } from '../components/LevelsLine'
import { tiersFor, fmtCap, type Market } from '@/lib/markets'
import { fmtSector } from '@/lib/format'
import { CATS, BREAKOUTS, REBOUNDS } from '@/lib/screener-shared'
import {
  gather, checksFor, earningsSoon, rank, withSignals, preselect, pickTop, levelsWait, EARNINGS_WARN_DAYS, PICK, MIN_SIGNALS,
  type ScreenerPayload, type TodayItem, type Check, type Pick,
} from '@/lib/today'
import { fmtLevel } from '../components/LevelsLine'

// 오늘 후보 — 신호마다 흩어진 화면(눌림목·수급·돌파·낙폭 반등)을 종목 카드 하나로 모은다.
// 계산·정렬 규칙은 lib/today.ts. 이 화면은 그리기만 한다.

/** 한 화면에 그리는 카드 수. 지지·저항 API 한 번 한도(80) 안. 11-03 "후보가 왜 이렇게 많아"로 40 → 30 */
const MAX_CARDS = 30

interface Data extends ScreenerPayload {
  regime?: 'up' | 'down'; spyChg20?: number | null
  barDate?: string | null; fetchedAt?: number
  tierCounts?: Record<string, number>; error?: string
}

const sgn = (v: number | null | undefined, d = 0) => v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(d)}`
const localToday = () => new Date().toLocaleDateString('sv-SE')   // YYYY-MM-DD, 기기 시간대

/** 미국 실적 일정 이번 주·다음 주 → 종목별 가장 가까운 날짜. 실패하면 빈 표(경고만 안 뜬다) */
function useEarnings(market: Market) {
  const [cal, setCal] = useState<Record<string, string>>({})
  useEffect(() => {
    if (market !== 'us') return
    let alive = true
    Promise.all([0, 1].map(w => fetch(`/api/earnings-calendar?week=${w}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))))
      .then(js => {
        const today = localToday()
        const out: Record<string, string> = {}
        for (const j of js) for (const e of (j.entries ?? []) as { symbol: string; date: string }[]) {
          if (e.date >= today && (!out[e.symbol] || e.date < out[e.symbol])) out[e.symbol] = e.date
        }
        if (alive) setCal(out)
      })
      .catch(e => console.error('[today earnings]', e))
    return () => { alive = false }
  }, [market])
  // 실적 일정은 미국만 있다. 다른 시장으로 바꾸면 미국 표를 쓰지 않는다
  return market === 'us' ? cal : NO_EARNINGS
}
const NO_EARNINGS: Record<string, string> = {}

function CheckChip({ c }: { c: Check }) {
  const mark = c.ok === true ? '✓' : c.ok === false ? '✗' : '–'
  const color = c.ok === true ? 'var(--up)' : c.ok === false ? 'var(--text-muted)' : 'var(--text-muted)'
  return (
    <span style={{ fontSize: 11, color, opacity: c.ok === null ? 0.6 : 1, whiteSpace: 'nowrap' }}
      title={c.ok === null ? '값 없음' : undefined}>
      {mark} {c.label}
    </span>
  )
}

function Card({ it, market, lv, barDate }: {
  it: TodayItem; market: Market; lv?: Parameters<typeof LevelsLine>[0]['lv']; barDate?: string | null
}) {
  const r = it.row
  const n = it.checks.filter(c => c.ok === true).length
  return (
    <article style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>
      <SymbolLabel
        symbol={r.symbol} display={r.display} name={r.name} market={market}
        trailing={<span className="num" style={{ fontSize: 11, color: 'var(--text-muted)' }}>체크 {n}/{it.checks.length}</span>}
        sub={<>{r.sector ? `${fmtSector(r.sector)} · ` : ''}{fmtCap(r.marketCap, market)}</>}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
        {it.tags.map(t => <span key={t} className="pill pill-up" style={{ fontSize: 10 }}>{t}</span>)}
        {it.earnings && (
          <span className="pill pill-warn" style={{ fontSize: 10 }}>
            실적 {it.earnings.slice(5).replace('-', '/')}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', marginTop: 8 }}>
        {it.checks.map(c => <CheckChip key={c.label} c={c} />)}
      </div>

      <div className="num" style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', marginTop: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
        <span>20일 등락 <b className={(r.chg20 ?? 0) >= 0 ? 'up' : 'down'}>{sgn(r.chg20, 1)}%</b></span>
        <span>%B {r.pctB == null ? '—' : (r.pctB * 100).toFixed(0)}</span>
        <span>20일 수급 {sgn(r.f20)}</span>
      </div>

      <ExitPrices price={r.price} atr14={r.atr14} dollarVol={r.dollarVol} market={market} compact />
      <LevelsLine lv={lv} market={market} snapshotDate={barDate} />
    </article>
  )
}

/** 위험 신호 경보 수. 2개 이상이면 추천 위에 크기 줄이라는 줄을 단다(RiskGauge '위험 신호 다수'와 같은 기준) */
function useRiskAlerts() {
  const [alerts, setAlerts] = useState<number | null>(null)
  useEffect(() => {
    fetch('/api/risk').then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(j => setAlerts(typeof j.alerts === 'number' ? j.alerts : null))
      .catch(e => console.error('[today risk]', e))
  }, [])
  return alerts
}

function PickCard({ p, n, market }: { p: Pick; n: number; market: Market }) {
  const r = p.item.row
  return (
    <article style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
      <SymbolLabel
        symbol={r.symbol} display={r.display} name={r.name} market={market}
        trailing={<span className="num" style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-muted)' }}>{n}</span>}
        sub={<>{r.sector ? `${fmtSector(r.sector)} · ` : ''}{fmtCap(r.marketCap, market)}</>}
      />
      <ol style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
        {p.reasons.map(s => <li key={s}>{s}</li>)}
      </ol>
      <div className="num" style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', marginTop: 6, fontSize: 11 }}>
        {r.price != null && <span>지금 {fmtLevel(r.price, market)}</span>}
        {p.stop != null && <span className="down">손절 {fmtLevel(p.stop, market)}</span>}
        {p.target != null && <span className="up">목표 {fmtLevel(p.target, market)}</span>}
      </div>
    </article>
  )
}

export default function TodayPage() {
  const [market, setMarket, marketReady] = useMarket()
  const [includeMicro, setIncludeMicro] = useState(false)
  // 기본은 신호가 MIN_SIGNALS개 이상 겹친 종목만. 켜면 신호 하나짜리까지
  const [singles, setSingles] = useState(false)
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = useCallback(() => {
    setLoading(true); setErr('')
    fetch(`/api/screener?market=${market}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((j: Data) => { setData(j); if (j.error) setErr(j.error) })
      .catch(e => setErr(String(e)))
      .finally(() => setLoading(false))
  }, [market])
  useEffect(() => { if (marketReady) load() }, [load, marketReady])

  const cal = useEarnings(market)
  // 배열은 매번 새로 만들어져 useMemo가 늘 다시 돈다 — 문자열로 비교한다
  const tierKey = tiersFor(market).map(t => t.id)
    .filter(id => includeMicro || (id !== 'micro' && id !== 'unknown')).join(',')

  const { items, total, all: allCount, pre } = useMemo(() => {
    if (!data) return { items: [] as TodayItem[], total: 0, all: 0, pre: [] as TodayItem[] }
    const today = localToday()
    const all = gather(data, tierKey.split(','), { cats: CATS, breakouts: BREAKOUTS, rebounds: REBOUNDS })
      .map(g => ({ ...g, checks: checksFor(g.row), earnings: earningsSoon(g.row.symbol, cal, today) }))
    const shown = withSignals(all, singles ? 1 : MIN_SIGNALS)
    return { items: rank(shown).slice(0, MAX_CARDS), total: shown.length, all: all.length, pre: preselect(all).slice(0, PICK.prefetch) }
  }, [data, cal, tierKey, singles])

  // 추천 예선과 아래 목록을 따로 받는다 — 합치면 /api/levels 한도(80)를 넘어 뒤쪽이 잘린다
  const { levels: preLevels, done: preDone } = useLevelsStatus(market, pre.map(i => i.row.symbol))
  const levels = useLevels(market, items.map(i => i.row.symbol))
  const picks = useMemo(() => pickTop(pre, preLevels), [pre, preLevels])
  const alerts = useRiskAlerts()
  // 시장을 바꾼 직후엔 앞 시장 값이 남아 있어 지금 예선 종목에 맞는 것만 센다
  const levelsNote = levelsWait(pre.length, { done: preDone, got: pre.filter(i => preLevels[i.row.symbol]).length })

  return (
    <div style={{ padding: 16, maxWidth: 760, margin: '0 auto' }}>
      <PageHeader
        title="오늘 후보"
        fetchedAt={data?.fetchedAt}
        onRefresh={load}
        loading={loading}
        sub={data && (
          <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
            {data.barDate && <span className="num">{data.barDate.slice(5).replace('-', '/')} 종가 기준</span>}
            <span>{data.regime === 'down' ? '하락 국면' : '상승 국면'} (SPY 20일 {sgn(data.spyChg20, 1)}%)</span>
          </span>
        )}
      />

      <div style={{ marginBottom: 12 }}><RiskGauge compact /></div>

      <MarketToggle value={market} onChange={setMarket} />
      <MicroToggle
        on={includeMicro} onChange={setIncludeMicro}
        counts={(data?.tierCounts?.micro ?? 0) + (data?.tierCounts?.unknown ?? 0)}
      />

      <p style={{ margin: '0 0 12px', fontSize: 11, lineHeight: 1.6, color: 'var(--text-muted)' }}>
        신호(눌림목·모멘텀·정체·돌파·낙폭 반등)에 걸린 종목을 한 장씩 모았다. 신호가 여럿 겹친 종목과
        체크를 많이 통과한 종목이 위로 온다. 실적이 {EARNINGS_WARN_DAYS}일 안인 종목은 맨 아래로 보낸다.
        <br />
        체크는 거르는 조건이 아니라 보는 칸이다. 기준끼리 서로 싸우는 경우가 있어 전부 통과를 요구하지 않는다.
        어느 신호도 10년 검증에서 통계적으로 유의하지 않았다 — <b>살 종목이 아니라 살펴볼 후보</b>다.
      </p>

      {err && <div className="card" style={{ padding: 16, color: 'var(--down)', fontSize: 13, marginBottom: 12 }}>{err}</div>}

      {loading && !data && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>불러오는 중…</div>
      )}

      {data && !loading && allCount === 0 && (
        <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          오늘 신호에 걸린 종목이 없다
        </div>
      )}

      {data && (pre.length > 0 || !loading) && (
        <section style={{ marginBottom: 20 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800 }}>
            추세 눌림 기법 통과 <span className="num">{picks.length}</span>
            <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}> / 최대 {PICK.count}</span>
          </h2>
          {/* 2026-11-03 10년 백테스트 기각(lib/rejected.ts today-pick-trend-pullback). 추천이라 부르지 않는다 */}
          <div className="card" style={{ padding: '10px 12px', marginBottom: 8, fontSize: 12, lineHeight: 1.6, borderLeft: '3px solid var(--warn)' }}>
            <b style={{ color: 'var(--warn)' }}>10년 검증에서 기각된 기법이다.</b> 미국 2,609종목 5만 건에서
            아무 날에나 같은 손절·목표로 산 것보다 거래당 0.09R 나빴다(z −9.6). 시장이 좋을 때도, 신고가권만 봐도 같다.
            추천이 아니라 이 기법에 걸린 종목을 보여 줄 뿐이다 — 기각기록 메뉴에 숫자가 있다.
          </div>
          <p style={{ margin: '0 0 8px', fontSize: 11, lineHeight: 1.6, color: 'var(--text-muted)' }}>
            기법: 정배열 추세 안에서 20일선 근처로 눌린 종목 → 아래 지지에 손절, 위 저항까지 목표.
            손익비 1:{PICK.minRR} 아래, 20일선 +{PICK.maxAbove20}% 넘게 오른 것, 저항이 +{PICK.minRoomToResist}% 안인 것, 실적 임박은 뺐고
            같은 업종은 {PICK.perSector}개까지.
          </p>
          {alerts != null && alerts >= 2 && (
            <div className="card" style={{ padding: '10px 12px', marginBottom: 8, fontSize: 12, lineHeight: 1.6, borderLeft: '3px solid var(--down)' }}>
              <b style={{ color: 'var(--down)' }}>시장 위험 신호 {alerts}개 경보.</b> 추세 종목도 시장과 같이 빠진다 — 오늘은 평소 크기의 절반 이하로.
            </div>
          )}
          {levelsNote ? (
            <div className="card" style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>{levelsNote}</div>
          ) : picks.length === 0 ? (
            <div className="card" style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
              오늘은 조건(정배열 · 20일선 근처 · 위로 여유)을 맞는 종목이 없다
            </div>
          ) : (
            <div className="card" style={{ overflow: 'hidden' }}>
              {picks.map((p, i) => <PickCard key={p.item.row.symbol} p={p} n={i + 1} market={market} />)}
            </div>
          )}
        </section>
      )}

      {data && (
        <h2 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 800 }}>
          {singles ? '신호 걸린 전체' : `신호 ${MIN_SIGNALS}개 이상 겹친 종목`}
        </h2>
      )}
      {data && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
          <span className="num" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {total > items.length ? `${total}종목 중 위 ${items.length}개` : `${items.length}종목`}
            {!singles && ` (전체 ${allCount})`}
          </span>
          <button
            onClick={() => setSingles(v => !v)}
            className={singles ? 'pill pill-up' : 'pill'}
            style={{ cursor: 'pointer', border: 'none', fontSize: 10 }}
          >
            신호 1개짜리도 보기 {singles ? '켜짐' : '꺼짐'}
          </button>
        </div>
      )}
      {items.length > 0 && (
        <>
          <div className="card" style={{ overflow: 'hidden' }}>
            {items.map(it => (
              <Card key={it.row.symbol} it={it} market={market} lv={levels[it.row.symbol]} barDate={data?.barDate} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
