'use client'
import { useCallback, useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import { MarketToggle, useMarket } from '../components/MarketToggle'
import { useLiveQuotes, type LiveQuote } from '../components/useLiveQuotes'
import { LivePct, LiveCaveat } from '../components/LivePct'
import { MARKETS, tiersFor, fmtCap, fmtPrice, type Market } from '@/lib/markets'
import { SymbolLabel } from '../components/SymbolLabel'
import { ExitPrices } from '../components/ExitPrices'
import { fmtSector } from '@/lib/format'
import SectorMix from '../components/SectorMix'
import { REBOUND_MARKETS, REBOUNDS, type ReboundKey, type TierId, type Regime } from '@/lib/screener-shared'

/**
 * 낙폭 반등 — 저가는 크게 뚫렸는데 종가는 올라온 종목.
 *
 * 이 화면은 **이 프로젝트에서 아웃오브샘플을 통과한 첫 미국 신호**다.
 * 아이디어는 워뇨띠 체결 기록에서 왔지만 수치는 전부 우리가 다시 쟀다.
 * 근거는 lib/screener-shared.ts의 buildRebound 주석에 적어뒀다.
 */
interface Row {
  display?: string | null
  symbol: string; name: string; sector: string; marketCap: number
  price: number | null; low?: number | null; chg1?: number | null
  atr14?: number | null; dollarVol?: number | null
  f20: number | null; chg20: number | null
}
interface Data {
  regime: Regime
  scanned: number
  source: 'snapshot' | 'live'
  rebound?: Record<ReboundKey, Record<TierId, Row[]>>
  scannedAt?: number
  barDate?: string | null
  fetchedAt: number
  error?: string
}

/** 측정치 — buildRebound 주석과 같은 값이다 */
const EVIDENCE: Record<ReboundKey, {
  exp: number; excess: number; t: number; train: number; tTrain: number; test: number; tTest: number
}> = {
  wick:  { exp: 0.257, excess: 0.092, t: 6.8, train: 0.073, tTrain: 3.7, test: 0.109, tTest: 5.9 },
  drop1: { exp: 0.229, excess: 0.064, t: 4.4, train: 0.061, tTrain: 2.6, test: 0.066, tTest: 3.8 },
}
const BASE = 0.167

function Card({ r, market, live }: { r: Row; market: Market; live?: LiveQuote }) {
  // 밑꼬리 깊이 = 저가가 종가보다 몇 % 아래였나. 이 신호의 순위 기준이다
  const wick = r.low != null && r.price ? ((r.low - r.price) / r.price) * 100 : null
  const Cell = ({ label, value, cls }: { label: string; value: string; cls?: string }) => (
    <div style={{ textAlign: 'right', minWidth: 0 }}>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{label}</div>
      <div className={`num ${cls ?? ''}`} style={{ fontSize: 12, fontWeight: 700 }}>{value}</div>
    </div>
  )
  return (
    <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
      <SymbolLabel
        symbol={r.symbol} display={r.display} name={r.name} market={market}
        trailing={live ? <LivePct live={live} market={market} /> : fmtCap(r.marketCap, market)}
        sub={<>
          {r.sector ? `${fmtSector(r.sector)} · ` : ''}{fmtCap(r.marketCap, market)}
          {live && <> · 현재 <span className="num">{fmtPrice(live.price, market)}</span></>}
        </>}
      />
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, margin: '6px 0 4px',
      }}>
        <Cell label="밑꼬리" value={wick == null ? '—' : `${wick.toFixed(1)}%`} cls="down" />
        <Cell label="전일 대비" value={r.chg1 == null ? '—' : `${r.chg1 >= 0 ? '+' : ''}${r.chg1.toFixed(1)}%`}
          cls={(r.chg1 ?? 0) >= 0 ? 'up' : 'down'} />
        <Cell label="20일 등락" value={r.chg20 == null ? '—' : `${r.chg20 >= 0 ? '+' : ''}${r.chg20.toFixed(0)}%`}
          cls={(r.chg20 ?? 0) >= 0 ? 'up' : 'down'} />
        <Cell label="수급" value={r.f20 == null ? '—' : `${r.f20 >= 0 ? '+' : ''}${r.f20.toFixed(0)}%`}
          cls={(r.f20 ?? 0) >= 0 ? 'up' : 'down'} />
      </div>
      <ExitPrices price={r.price} atr14={r.atr14} market={market} dollarVol={r.dollarVol} />
    </div>
  )
}

export default function ReboundPage() {
  const [market, setMarket, marketReady] = useMarket()
  const [tab, setTab] = useState<ReboundKey>('wick')
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = useCallback(() => {
    setLoading(true); setErr('')
    fetch(`/api/screener?market=${market}`)
      .then(r => r.json())
      .then(j => { setData(j); if (j.error) setErr(j.error) })
      .catch(e => setErr(String(e)))
      .finally(() => setLoading(false))
  }, [market])
  useEffect(() => { if (marketReady) load() }, [load, marketReady])

  const tiers = tiersFor(market)
  const all = tiers.flatMap(t => data?.rebound?.[tab]?.[t.id] ?? [])
  const ev = EVIDENCE[tab]
  const live = useLiveQuotes(market, all.map(r => r.symbol))
  const supported = REBOUND_MARKETS.includes(market)

  return (
    <div style={{ padding: 16, maxWidth: 860, margin: '0 auto' }}>
      <PageHeader
        title="낙폭 반등"
        fetchedAt={data?.fetchedAt}
        onRefresh={load}
        loading={loading}
        sub={data && <span>{data.barDate ?? ''} 종가 기준 · {data.scanned.toLocaleString()}종목</span>}
      />

      <MarketToggle value={market} onChange={setMarket} />

      {supported && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {REBOUNDS.map(r => (
            <button key={r.key} onClick={() => setTab(r.key)} style={{
              flex: 1, minHeight: 38, borderRadius: 10, fontSize: 12, cursor: 'pointer',
              border: `1px solid ${tab === r.key ? 'var(--info)' : 'var(--border)'}`,
              background: tab === r.key ? 'rgba(59,130,246,0.15)' : 'var(--bg-card)',
              color: tab === r.key ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: tab === r.key ? 700 : 400,
            }}>{r.label}</button>
          ))}
        </div>
      )}

      {supported ? (
        <div className="card" style={{
          padding: '11px 13px', marginBottom: 12, fontSize: 11, lineHeight: 1.7,
          borderLeft: '3px solid var(--up)',
        }}>
          <b>조건: {REBOUNDS.find(r => r.key === tab)!.rule}</b>
          <div style={{ marginTop: 6, color: 'var(--text-secondary)' }}>
            거래당 기댓값 <b className="num up">+{ev.exp}R</b> (기준선 +{BASE}R의{' '}
            {(ev.exp / BASE).toFixed(2)}배) · 같은 날 평균 대비 +{ev.excess}R (t +{ev.t})
          </div>
          <div style={{ marginTop: 4, color: 'var(--text-muted)' }}>
            10년을 앞뒤로 갈라도 양쪽 다 플러스다 — 앞 +{ev.train}R(t +{ev.tTrain}) ·
            뒤 +{ev.test}R(t +{ev.tTest}). <b>이 프로젝트에서 미국 신호가
            아웃오브샘플을 통과한 첫 사례다.</b>
          </div>
          <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            아이디어 출처는 워뇨띠 체결 기록 148만 건이다. 그의 방향 전환 2,073회를 분석하니
            직전 1시간이 평균 −0.30%일 때 매수로 돌아섰다. <b>그의 신호를 복제한 게 아니라</b>
            {' '}그 발상을 우리 유니버스·우리 규칙으로 새로 검증한 결과다.
          </div>
        </div>
      ) : (
        <div className="card" style={{
          padding: '11px 13px', marginBottom: 12, fontSize: 11, lineHeight: 1.7,
          borderLeft: '3px solid var(--down)',
        }}>
          <b style={{ color: 'var(--down)' }}>{MARKETS[market].label}에서는 이 신호가 해롭다.</b>
          {market === 'kr' ? (
            <div style={{ marginTop: 4, color: 'var(--text-secondary)' }}>
              10년 측정에서 앞뒤 절반 모두 마이너스였다 (뒤절반 20일 −0.167R, t −7.8).
              한국은 떨어진 걸 사는 게 아니라 <b>오르는 것의 되돌림</b>을 사는 시장이다 —
              VWMA 돌파 탭의 강세눌림(+0.318R)을 보라.
            </div>
          ) : (
            <div style={{ marginTop: 4, color: 'var(--text-secondary)' }}>
              크립토는 히스토리가 짧아 앞절반 거래일이 0개다. <b>검증 자체가 불가능</b>해서
              목록을 띄우지 않는다. 표본이 쌓이면 다시 잰다.
            </div>
          )}
        </div>
      )}

      {supported && <LiveCaveat />}

      {err && <div className="card" style={{ padding: 16, color: 'var(--down)', fontSize: 13 }}>{err}</div>}

      {loading && !data && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          불러오는 중…
        </div>
      )}

      {supported && data && !loading && all.length === 0 && (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
          {tab === 'drop1'
            ? '전일 대비(chg1) 컬럼이 아직 없다. SQL 실행 + 다음 스캔이면 채워진다.'
            : '아직 스냅샷에 저가(low)가 없다. 다음 스캔에 채워진다.'}
        </div>
      )}

      {supported && all.length > 0 && (
        <>
          <SectorMix rows={all} />
          {tiers.map(t => {
            const rows = data?.rebound?.[tab]?.[t.id] ?? []
            if (!rows.length) return null
            return (
              <section key={t.id} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                  <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>{t.label}</h2>
                  <span className="num" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{rows.length}종목</span>
                </div>
                <div className="card" style={{ overflow: 'hidden' }}>
                  {rows.map(r => <Card key={r.symbol} r={r} market={market} live={live.quotes[r.symbol]} />)}
                </div>
              </section>
            )
          })}
          <p style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.7, marginTop: 10 }}>
            · 순위는 <b>시장 전체에서</b> 매긴다. 측정도 그렇게 했다 — 구간별로 25개씩 뽑으면 다른 신호가 된다<br />
            · 밑꼬리 = 저가가 종가보다 몇 % 아래였나. 이 값이 큰 순서다<br />
            · ATR로 나누지 않는다. 변동성으로 보정한 변형은 우위가 0이었다(−0.009R) —
            <b> 변동성 대비가 아니라 절대적으로 많이 빠진 것</b>이 통한다<br />
            · 기존 신호와 겹치지 않는다 (밑꼬리 일봉과 평균 3.7%, 수급 눌림목과 0%)
          </p>
        </>
      )}
    </div>
  )
}
